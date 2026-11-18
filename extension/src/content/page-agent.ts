/**
 * Z-Pilot Page Agent (Content Script)
 * Executes DOM inspection, text extraction, form discovery, form filling,
 * media playback, and deep DOM video scanning on the active webpage.
 */

import { scanDocumentVideos, extractBestPageVideoTitle } from './dom-video-scanner.js';
import { StorageService } from '../services/storage.js';
import { initAdShield, getPageBlockedCount } from './ad-shield.js';
import { privacyBlurManager } from './privacy-blur.js';
import { AutofillService } from '../services/autofill-service.js';
import { UserProfile, AutofillResult } from '../types/index.js';

// Prevent duplicate execution if re-injected
if (!(window as unknown as { __Z_PILOT_PAGE_AGENT_LOADED?: boolean }).__Z_PILOT_PAGE_AGENT_LOADED) {
  (window as unknown as { __Z_PILOT_PAGE_AGENT_LOADED: boolean }).__Z_PILOT_PAGE_AGENT_LOADED = true;

  console.log('[Z-Pilot] Page Agent active on:', window.location.href);

  // ── Auto-initialize Add Blocker Ad Blocker (Defaults to enabled) ──
  try {
    const currentHost = window.location.hostname.toLowerCase().replace(/^www\./, '');
    if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.storage?.local) {
      chrome.storage.local.get('zpilot_adblocker_settings', (res) => {
        const settings = res?.['zpilot_adblocker_settings'];
        const isEnabled = settings ? settings.enabled !== false : true;
        const isWhitelisted =
          Array.isArray(settings?.whitelistedDomains) &&
          settings.whitelistedDomains.includes(currentHost);
        if (isEnabled && !isWhitelisted) {
          initAdShield(true);
        }
      });
    } else {
      initAdShield(true);
    }
  } catch {
    initAdShield(true);
  }

  // ── Auto-initialize Privacy Blur preferences for domain ──
  try {
    const currentHost = window.location.hostname.toLowerCase().replace(/^www\./, '');
    StorageService.getPrivacyBlurPreferences(currentHost).then((prefs) => {
      if (prefs) {
        privacyBlurManager.updateConfig({
          blurIntensity: prefs.blurIntensity,
          blurStyle: prefs.blurStyle,
          hoverToReveal: prefs.hoverToReveal,
        });
        if (prefs.autoBlurFinancials) privacyBlurManager.toggleAutoBlurFinancials(true);
        if (prefs.autoBlurPii) privacyBlurManager.toggleAutoBlurPii(true);
        if (prefs.autoBlurMedia) privacyBlurManager.toggleAutoBlurMedia(true);
      }
    }).catch(() => {});
  } catch {
    // Ignore
  }

  /**
   * Extract clean, readable text from the active webpage
   */
  function extractPageText(): string {
    try {
      const clone = document.body.cloneNode(true) as HTMLElement;

      // Remove non-content elements
      const elementsToRemove = clone.querySelectorAll(
        'script, style, noscript, svg, iframe, canvas, nav, footer, [aria-hidden="true"]'
      );
      elementsToRemove.forEach((el) => el.remove());

      // Get readable text, normalize whitespace
      const text = clone.innerText || clone.textContent || '';
      return text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim()
        .slice(0, 15000);
    } catch (err) {
      console.warn('[Z-Pilot] Error extracting page text:', err);
      return '';
    }
  }

  /**
   * Find field label using associated <label> element, placeholder, or aria attributes
   */
  function findFieldLabel(input: HTMLElement): string {
    const inputType = (input.getAttribute('type') || '').toLowerCase();
    const isChoiceInput = inputType === 'radio' || inputType === 'checkbox';

    // 1. For radio/checkbox, prioritize fieldset legend or parent question container
    if (isChoiceInput) {
      const fieldset = input.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend && legend.textContent?.trim()) {
          const optionText = input.closest('label')?.textContent?.trim() || '';
          return `${legend.textContent.trim()} ${optionText}`.trim();
        }
      }

      const questionContainer = input.closest(
        '[class*="question"], [class*="form-group"], [class*="field-group"], [data-qa*="question"], .field'
      );
      if (questionContainer) {
        const qLabel = questionContainer.querySelector('label, [class*="label"], [class*="title"], legend');
        if (qLabel && qLabel !== input.closest('label') && qLabel.textContent?.trim()) {
          const optionText = input.closest('label')?.textContent?.trim() || '';
          return `${qLabel.textContent.trim()} ${optionText}`.trim();
        }
      }
    }

    // 1b. For file upload inputs, check surrounding container / dropzone / headings
    if (inputType === 'file') {
      const container = input.closest(
        '[class*="resume"], [id*="resume"], [class*="upload"], [id*="upload"], [class*="drop"], [class*="file"], [data-automation-id*="file"], [data-qa*="resume"], .field, .form-group, section'
      );
      if (container) {
        const heading = container.querySelector(
          'h1, h2, h3, h4, h5, h6, label, [class*="title"], [class*="label"], [class*="header"], [class*="prompt"]'
        );
        if (heading && heading.textContent?.trim()) {
          return heading.textContent.trim();
        }
        const containerText = (container.textContent?.trim() || '').slice(0, 300);
        if (/(resume|cv\b|curriculum|biodata)/i.test(containerText)) {
          return 'Resume';
        }
      }

      const prevEl = input.previousElementSibling || input.parentElement?.previousElementSibling;
      if (prevEl && prevEl.textContent?.trim()) {
        const txt = prevEl.textContent.trim();
        if (/(resume|cv\b|upload|file)/i.test(txt)) {
          return txt.slice(0, 50);
        }
      }
    }

    // 2. Label with 'for' attribute
    if (input.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (labelEl && labelEl.textContent?.trim()) {
        return labelEl.textContent.trim();
      }
    }

    // 3. Enclosing <label>
    const parentLabel = input.closest('label');
    if (parentLabel && parentLabel.textContent?.trim()) {
      return parentLabel.textContent.trim();
    }

    // 4. Fieldset legend fallback
    const fieldset = input.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && legend.textContent?.trim()) {
        return legend.textContent.trim();
      }
    }

    // 5. aria-label or aria-labelledby
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const ariaLabelledby = input.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const target = document.getElementById(ariaLabelledby);
      if (target && target.textContent?.trim()) return target.textContent.trim();
    }

    // 6. Common ATS data attributes (data-qa, data-automation-id, data-testid)
    const qaAttr =
      input.getAttribute('data-qa') ||
      input.getAttribute('data-automation-id') ||
      input.getAttribute('data-testid');
    if (qaAttr) return qaAttr.replace(/[-_]/g, ' ').trim();

    // 7. Preceding sibling label or text container
    const prev = input.previousElementSibling;
    if (prev && (prev.tagName === 'LABEL' || prev.className.includes('label'))) {
      if (prev.textContent?.trim()) return prev.textContent.trim();
    }

    // 8. Placeholder
    const placeholder = input.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();

    // 9. Name or id fallback
    return input.getAttribute('name') || input.id || '';
  }

  /**
   * Checks whether an input element is genuinely visible and not a hidden honeypot
   */
  function isElementVisible(el: HTMLElement): boolean {
    if ((el.getAttribute('type') || '').toLowerCase() === 'hidden') return false;
    if (el.hasAttribute('disabled') || el.hasAttribute('readonly')) return false;

    if (el.style) {
      if (
        el.style.display === 'none' ||
        el.style.visibility === 'hidden' ||
        el.style.opacity === '0'
      ) {
        return false;
      }
    }

    try {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.pointerEvents === 'none'
      ) {
        return false;
      }
      if (el.offsetParent === null && style.position !== 'fixed') {
        return false;
      }
    } catch {
      // Ignore in happy-dom or unit tests
    }

    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const nameOrClass = `${el.getAttribute('name') || ''} ${el.className || ''}`.toLowerCase();
    if (
      nameOrClass.includes('honeypot') ||
      nameOrClass.includes('bot-field') ||
      nameOrClass.includes('hp-field') ||
      el.getAttribute('data-honeypot')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Discovers form inputs across the current page
   */
  function discoverForms(): Array<{
    id?: string;
    name?: string;
    action?: string;
    fields: Array<{
      id?: string;
      name?: string;
      type: string;
      label?: string;
      placeholder?: string;
      required?: boolean;
      selector?: string;
    }>;
  }> {
    const discovered: Array<any> = [];

    const forms = Array.from(document.querySelectorAll('form'));

    // Also inspect standalone input controls outside <form>
    const allInputs = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
      )
    ) as HTMLElement[];

    const processedInputs = new Set<HTMLElement>();

    // Process explicit forms
    forms.forEach((form, fIdx) => {
      const formFields: Array<any> = [];
      const formInputs = Array.from(
        form.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
        )
      ) as HTMLElement[];

      formInputs.forEach((el) => {
        processedInputs.add(el);
        const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
        const id = el.id || undefined;
        const name = el.getAttribute('name') || undefined;
        const label = findFieldLabel(el);
        const placeholder = el.getAttribute('placeholder') || undefined;
        const required = el.hasAttribute('required');

        let selector = '';
        if (id) {
          selector = `#${CSS.escape(id)}`;
        } else if (name) {
          selector = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
        }

        formFields.push({ id, name, type, label, placeholder, required, selector });
      });

      if (formFields.length > 0) {
        discovered.push({
          id: form.id || `form_${fIdx + 1}`,
          name: form.getAttribute('name') || undefined,
          action: form.getAttribute('action') || undefined,
          fields: formFields,
        });
      }
    });

    // Unwrapped inputs
    const standaloneFields: Array<any> = [];
    allInputs.forEach((el) => {
      if (!processedInputs.has(el)) {
        const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
        const id = el.id || undefined;
        const name = el.getAttribute('name') || undefined;
        const label = findFieldLabel(el);
        const placeholder = el.getAttribute('placeholder') || undefined;
        const required = el.hasAttribute('required');

        let selector = '';
        if (id) {
          selector = `#${CSS.escape(id)}`;
        } else if (name) {
          selector = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
        }

        standaloneFields.push({ id, name, type, label, placeholder, required, selector });
      }
    });

    if (standaloneFields.length > 0) {
      discovered.push({
        id: 'standalone_fields',
        name: 'Page Inputs',
        fields: standaloneFields,
      });
    }

    return discovered;
  }

  /**
   * Safely fill form fields with verification and event triggers
   */
  function fillFormFields(
    fieldsToFill: Array<{
      fieldId?: string;
      selector?: string;
      name?: string;
      label?: string;
      value: string;
    }>
  ): {
    success: boolean;
    filledCount: number;
    failedFields: Array<{ name: string; reason: string }>;
  } {
    let filledCount = 0;
    const failedFields: Array<{ name: string; reason: string }> = [];

    for (const field of fieldsToFill) {
      let element: HTMLElement | null = null;

      // 1. Selector search
      if (field.selector) {
        try {
          element = document.querySelector(field.selector) as HTMLElement | null;
        } catch {
          // Ignore invalid selector syntax
        }
      }

      // 2. ID search
      if (!element && field.fieldId) {
        element = document.getElementById(field.fieldId);
      }

      // 3. Name attribute search
      if (!element && field.name) {
        element = document.querySelector(`[name="${CSS.escape(field.name)}"]`) as HTMLElement | null;
      }

      // 4. Fuzzy label / placeholder search
      if (!element && field.label) {
        const lowerLabel = field.label.toLowerCase();
        const inputs = Array.from(document.querySelectorAll('input, textarea, select')) as HTMLElement[];
        for (const input of inputs) {
          const l = findFieldLabel(input).toLowerCase();
          if (l.includes(lowerLabel) || lowerLabel.includes(l)) {
            element = input;
            break;
          }
        }
      }

      if (!element) {
        failedFields.push({
          name: field.label || field.name || field.selector || 'unknown',
          reason: 'Element not found on page',
        });
        continue;
      }

      // Safety check: Avoid writing to password fields unless explicitly permitted
      const inputType = (element.getAttribute('type') || '').toLowerCase();
      if (inputType === 'password') {
        failedFields.push({
          name: field.label || field.name || 'password',
          reason: 'Security policy: Automatic filling of password fields is restricted',
        });
        continue;
      }

      try {
        element.focus();

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          const inputType = (element.getAttribute('type') || '').toLowerCase();

          if (inputType === 'radio') {
            const radioEl = element as HTMLInputElement;
            const rLabel = findFieldLabel(radioEl).toLowerCase();
            const rVal = radioEl.value.toLowerCase();
            const targetVal = field.value.toLowerCase().trim();

            const isYes =
              /^(yes|true|authorized)$/i.test(targetVal) &&
              (rLabel.startsWith('yes') || rVal === '1' || rVal === 'yes' || rVal === 'true');
            const isNo =
              /^(no|false|unauthorized)$/i.test(targetVal) &&
              (rLabel.startsWith('no') || rVal === '0' || rVal === 'no' || rVal === 'false');

            if (isYes || isNo || rVal === targetVal || rLabel.includes(targetVal)) {
              radioEl.checked = true;
              radioEl.dispatchEvent(new Event('input', { bubbles: true }));
              radioEl.dispatchEvent(new Event('change', { bubbles: true }));
              radioEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              filledCount++;
            }
          } else if (inputType === 'checkbox') {
            const checkEl = element as HTMLInputElement;
            checkEl.checked = /^(yes|true|1|agree)$/i.test(field.value.trim());
            checkEl.dispatchEvent(new Event('input', { bubbles: true }));
            checkEl.dispatchEvent(new Event('change', { bubbles: true }));
            filledCount++;
          } else {
            // React 16+ controlled component compatibility: invoke native prototype setter
            const prototype =
              element instanceof HTMLInputElement
                ? HTMLInputElement.prototype
                : HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(element, field.value);
            } else {
              element.value = field.value;
            }

            // Dispatch standard input events
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));

            // Verify value was applied
            if (element.value === field.value) {
              filledCount++;
            } else {
              failedFields.push({
                name: field.label || field.name || 'field',
                reason: 'Value verification failed after dispatching events',
              });
            }
          }
        } else if (element instanceof HTMLSelectElement) {
          const options = Array.from(element.options).map((opt) => ({
            value: opt.value,
            text: opt.text,
          }));
          const bestIndex = AutofillService.resolveSelectOptionIndex(options, field.value);
          if (bestIndex >= 0) {
            element.selectedIndex = bestIndex;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));
            filledCount++;
          } else {
            failedFields.push({
              name: field.label || field.name || 'select',
              reason: `No matching select option for "${field.value}"`,
            });
          }
        }
      } catch (err: unknown) {
        failedFields.push({
          name: field.label || field.name || 'field',
          reason: (err as Error).message,
        });
      }
    }

    return {
      success: filledCount > 0,
      filledCount,
      failedFields,
    };
  }

  function base64ToBlob(base64Data: string, contentType: string = 'application/pdf'): Blob {
    try {
      if (!base64Data || typeof base64Data !== 'string') {
        return new Blob([], { type: contentType });
      }

      const parts = base64Data.split(';base64,');
      const raw = parts.length > 1 ? parts[1] : parts[0];
      
      // Clean up whitespace, linebreaks, and URL-safe base64 characters
      let cleanRaw = raw.replace(/[\r\n\s]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      while (cleanRaw.length % 4 !== 0) {
        cleanRaw += '=';
      }

      const mimeMatch = base64Data.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : contentType || 'application/pdf';

      const byteCharacters = atob(cleanRaw);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      return new Blob([byteNumbers], { type: mimeType });
    } catch (err) {
      console.warn('[Z-Pilot] Error converting base64 to blob:', err);
      return new Blob([], { type: contentType });
    }
  }

  function attachResumeToFileInput(input: HTMLInputElement, resume: UserProfile['resume']): boolean {
    try {
      if (!resume || !resume.base64Data) return false;
      const mimeType = resume.fileType || 'application/pdf';
      const blob = base64ToBlob(resume.base64Data, mimeType);
      if (!blob || blob.size === 0) {
        console.warn('[Z-Pilot] Resume file blob is empty (0 bytes).');
        return false;
      }

      const inputWin = input.ownerDocument?.defaultView || window;
      const FileCtor = inputWin.File || File;
      const DataTransferCtor = inputWin.DataTransfer || DataTransfer;

      const fileName = resume.fileName || 'Resume.pdf';
      const file = new FileCtor([blob], fileName, {
        type: mimeType,
        lastModified: resume.uploadedAt || Date.now(),
      });

      const dataTransfer = new DataTransferCtor();
      dataTransfer.items.add(file);

      // 1. Assign to input.files using native prototype setter of the input's own realm
      let setFilesSuccess = false;
      try {
        const proto = inputWin.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'files');
        if (descriptor && descriptor.set) {
          descriptor.set.call(input, dataTransfer.files);
          setFilesSuccess = true;
        } else {
          input.files = dataTransfer.files;
          setFilesSuccess = true;
        }
      } catch {
        try {
          input.files = dataTransfer.files;
          setFilesSuccess = true;
        } catch {}
      }

      // Fallback defineProperty if files not yet reflected
      if (!input.files || input.files.length === 0) {
        try {
          Object.defineProperty(input, 'files', {
            value: dataTransfer.files,
            writable: true,
            configurable: true,
          });
        } catch {}
      }

      // 2. Dispatch events ONLY on the file input itself (no focus stealing, no foreign container pollution)
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      
      // Direct onchange call if assigned as DOM property
      try {
        if (typeof (input as any).onchange === 'function') {
          (input as any).onchange(new Event('change', { bubbles: true }));
        }
      } catch {}

      // 3. If an immediate dropzone wrapper directly encloses this input, notify it without bubbling to other form elements
      const dropzone = input.closest(
        '[class*="drop"], [class*="upload"], [data-automation-id*="drop"], .dropzone'
      ) as HTMLElement | null;

      if (dropzone && dropzone !== document.body && dropzone !== input.form) {
        try {
          let dropEvt: any;
          try {
            dropEvt = new DragEvent('drop', { bubbles: false, cancelable: true, dataTransfer });
            if (!dropEvt.dataTransfer) {
              Object.defineProperty(dropEvt, 'dataTransfer', { value: dataTransfer, configurable: true });
            }
          } catch {
            dropEvt = new Event('drop', { bubbles: false, cancelable: true });
            Object.defineProperty(dropEvt, 'dataTransfer', { value: dataTransfer, configurable: true });
          }
          dropzone.dispatchEvent(dropEvt);
        } catch {}
      }

      return (input.files && input.files.length > 0) || setFilesSuccess;
    } catch (err) {
      console.warn('[Z-Pilot] Failed to attach resume to file input:', err);
      return false;
    }
  }

  function attachPhotoToFileInput(input: HTMLInputElement, photo: UserProfile['photo']): boolean {
    try {
      if (!photo || !photo.base64Data) return false;
      const mimeType = photo.fileType || 'image/jpeg';
      const blob = base64ToBlob(photo.base64Data, mimeType);
      if (!blob || blob.size === 0) {
        console.warn('[Z-Pilot] Passport photo blob is empty (0 bytes).');
        return false;
      }

      const inputWin = input.ownerDocument?.defaultView || window;
      const FileCtor = inputWin.File || File;
      const DataTransferCtor = inputWin.DataTransfer || DataTransfer;

      const fileName = photo.fileName || 'Passport_Photo.jpg';
      const file = new FileCtor([blob], fileName, {
        type: mimeType,
        lastModified: photo.uploadedAt || Date.now(),
      });

      const dataTransfer = new DataTransferCtor();
      dataTransfer.items.add(file);

      // 1. Assign to input.files using native prototype setter
      let setFilesSuccess = false;
      try {
        const proto = inputWin.HTMLInputElement?.prototype || HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'files');
        if (descriptor && descriptor.set) {
          descriptor.set.call(input, dataTransfer.files);
          setFilesSuccess = true;
        } else {
          input.files = dataTransfer.files;
          setFilesSuccess = true;
        }
      } catch {
        try {
          input.files = dataTransfer.files;
          setFilesSuccess = true;
        } catch {}
      }

      // Fallback defineProperty if files not yet reflected
      if (!input.files || input.files.length === 0) {
        try {
          Object.defineProperty(input, 'files', {
            value: dataTransfer.files,
            writable: true,
            configurable: true,
          });
        } catch {}
      }

      // 2. Dispatch events ONLY on the file input itself
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      // Direct onchange call if assigned as DOM property
      try {
        if (typeof (input as any).onchange === 'function') {
          (input as any).onchange(new Event('change', { bubbles: true }));
        }
      } catch {}

      // 3. Notify immediate dropzone wrapper if present without bubbling
      const dropzone = input.closest(
        '[class*="drop"], [class*="upload"], [data-automation-id*="drop"], .dropzone'
      ) as HTMLElement | null;

      if (dropzone && dropzone !== document.body && dropzone !== input.form) {
        try {
          let dropEvt: any;
          try {
            dropEvt = new DragEvent('drop', { bubbles: false, cancelable: true, dataTransfer });
            if (!dropEvt.dataTransfer) {
              Object.defineProperty(dropEvt, 'dataTransfer', { value: dataTransfer, configurable: true });
            }
          } catch {
            dropEvt = new Event('drop', { bubbles: false, cancelable: true });
            Object.defineProperty(dropEvt, 'dataTransfer', { value: dataTransfer, configurable: true });
          }
          dropzone.dispatchEvent(dropEvt);
        } catch {}
      }

      return (input.files && input.files.length > 0) || setFilesSuccess;
    } catch (err) {
      console.warn('[Z-Pilot] Failed to attach passport photo to file input:', err);
      return false;
    }
  }

  function findBestPhotoFileInput(
    root: Document = document,
    excludeInput?: HTMLInputElement | null
  ): HTMLInputElement | null {
    const fileInputs: HTMLInputElement[] = [];

    function collectFromNode(node: Document | ShadowRoot) {
      const inputs = Array.from(node.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
      fileInputs.push(...inputs);

      // Recursive Shadow DOM traversal
      const allEls = Array.from(node.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.shadowRoot) {
          collectFromNode(el.shadowRoot);
        }
      }
    }

    collectFromNode(root);

    // Also check accessible same-origin iframes
    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (const f of iframes) {
      try {
        if (f.contentDocument) {
          collectFromNode(f.contentDocument);
        }
      } catch {}
    }

    const available = fileInputs.filter((inp) => !inp.disabled && inp !== excludeInput);
    if (available.length === 0) return null;

    let bestInput: HTMLInputElement | null = null;
    let highestScore = -999;

    for (const input of available) {
      let score = 0;
      const id = (input.id || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      const aria = (input.getAttribute('aria-label') || '').toLowerCase();
      const dataQa = (
        input.getAttribute('data-qa') ||
        input.getAttribute('data-automation-id') ||
        input.getAttribute('data-testid') ||
        ''
      ).toLowerCase();

      const label = findFieldLabel(input).toLowerCase();
      const container = input.closest(
        '[class*="photo"], [id*="photo"], [class*="avatar"], [id*="avatar"], [class*="picture"], [id*="picture"], [class*="headshot"], [id*="headshot"], [class*="passport"], [id*="passport"], .form-group, .field, section'
      );
      const containerText = (container?.textContent || '').slice(0, 300).toLowerCase();

      // Strong positive indicators for photo / avatar / headshot / passport photo
      if (/\b(photo|avatar|picture|headshot|passport|photograph|profile[_-]?pic|applicant[_-]?pic)\b/i.test(id)) score += 60;
      if (/\b(photo|avatar|picture|headshot|passport|photograph|profile[_-]?pic|applicant[_-]?pic)\b/i.test(name)) score += 60;
      if (/\b(photo|avatar|picture|headshot|passport|photograph|profile[_-]?pic|applicant[_-]?pic)\b/i.test(label)) score += 70;
      if (/\b(photo|avatar|picture|headshot|passport|photograph|profile[_-]?pic|applicant[_-]?pic)\b/i.test(aria)) score += 60;
      if (/\b(photo|avatar|picture|headshot|passport|photograph|profile[_-]?pic|applicant[_-]?pic)\b/i.test(dataQa)) score += 60;
      if (/\b(photo|avatar|picture|headshot|passport|photograph|profile[_-]?pic|applicant[_-]?pic)\b/i.test(containerText)) score += 40;

      // Accept attribute matches image types
      if (/\b(image\/|jpg|jpeg|png|webp)\b/i.test(accept)) score += 30;

      // Heavy negative penalties for resume / cover letter / document inputs (NEVER touch resume or cover letter)
      if (/\b(resume|cv\b|curriculum[_-]?vitae|biodata)\b/i.test(id + ' ' + name + ' ' + label + ' ' + aria + ' ' + dataQa + ' ' + containerText)) {
        score -= 250;
      }
      if (/\b(cover[_-]?letter|coverletter)\b/i.test(id + ' ' + name + ' ' + label + ' ' + aria + ' ' + dataQa + ' ' + containerText)) {
        score -= 200;
      }
      if (/\b(transcript|certificate|reference|sample|portfolio|document)\b/i.test(id + ' ' + name + ' ' + label + ' ' + aria)) {
        score -= 100;
      }

      if (score > highestScore) {
        highestScore = score;
        bestInput = input;
      }
    }

    if (highestScore > 0) return bestInput;
    return null;
  }

  function findBestResumeFileInput(root: Document = document): HTMLInputElement | null {
    const fileInputs: HTMLInputElement[] = [];

    function collectFromNode(node: Document | ShadowRoot) {
      const inputs = Array.from(node.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
      fileInputs.push(...inputs);

      // Recursive Shadow DOM traversal (Workday Web Components)
      const allEls = Array.from(node.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.shadowRoot) {
          collectFromNode(el.shadowRoot);
        }
      }
    }

    collectFromNode(root);

    // Also check accessible same-origin iframes (Greenhouse embeds, Lever embeds)
    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (const f of iframes) {
      try {
        if (f.contentDocument) {
          collectFromNode(f.contentDocument);
        }
      } catch {}
    }

    if (fileInputs.length === 0) return null;

    // Filter out disabled inputs
    const available = fileInputs.filter((inp) => !inp.disabled);
    if (available.length === 0) return null;

    let bestInput: HTMLInputElement | null = null;
    let highestScore = -999;

    for (const input of available) {
      let score = 0;
      const id = (input.id || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      const aria = (input.getAttribute('aria-label') || '').toLowerCase();
      const dataQa = (
        input.getAttribute('data-qa') ||
        input.getAttribute('data-automation-id') ||
        input.getAttribute('data-testid') ||
        ''
      ).toLowerCase();

      const label = findFieldLabel(input).toLowerCase();
      const container = input.closest(
        '[class*="resume"], [id*="resume"], [class*="upload"], [id*="upload"], [class*="drop"], [data-qa*="resume"], .form-group, .field, section'
      );
      const containerText = (container?.textContent || '').slice(0, 300).toLowerCase();

      // Strong positive indicators for Resume / CV
      if (/\b(resume|cv\b|curriculum[_-]?vitae|biodata|bio[_-]?data)\b/i.test(id)) score += 60;
      if (/\b(resume|cv\b|curriculum[_-]?vitae|biodata|bio[_-]?data)\b/i.test(name)) score += 60;
      if (/\b(resume|cv\b|curriculum[_-]?vitae|biodata|bio[_-]?data)\b/i.test(label)) score += 70;
      if (/\b(resume|cv\b|curriculum[_-]?vitae|biodata|bio[_-]?data)\b/i.test(aria)) score += 60;
      if (/\b(resume|cv\b|curriculum[_-]?vitae|biodata|bio[_-]?data)\b/i.test(dataQa)) score += 60;
      if (/\b(resume|cv\b|curriculum[_-]?vitae|biodata|bio[_-]?data)\b/i.test(containerText)) score += 40;

      // Accept attribute matches PDF / DOCX
      if (/\b(pdf|docx?|msword)\b/i.test(accept)) score += 20;

      // Heavy negative penalties for non-resume file inputs (NEVER touch cover letters, photos, or other files)
      if (/\b(cover[_-]?letter|coverletter)\b/i.test(id + ' ' + name + ' ' + label + ' ' + aria + ' ' + dataQa + ' ' + containerText)) {
        score -= 200;
      }
      if (/\b(photo|avatar|profile[_-]?pic|picture|headshot|image|passport|photograph)\b/i.test(id + ' ' + name + ' ' + label + ' ' + aria + ' ' + dataQa + ' ' + containerText)) {
        score -= 200;
      }
      if (/\b(transcript|certificate|reference|sample|portfolio|additional|other)\b/i.test(id + ' ' + name + ' ' + label + ' ' + aria)) {
        score -= 100;
      }

      if (score > highestScore) {
        highestScore = score;
        bestInput = input;
      }
    }

    if (highestScore > 0) return bestInput;
    if (available.length === 1 && highestScore >= 0) return available[0];

    return null;
  }

  /**
   * One-Click Smart Autofill for Job Applications & Web Forms
   * Inspects all active inputs, matches against user profile using semantic heuristics,
   * respects already-filled fields to prevent overwriting user edits, and populates fields safely.
   */
  function runPageAutofill(
    profile: UserProfile,
    options?: { overwriteExisting?: boolean; resumeOnly?: boolean; photoOnly?: boolean }
  ): AutofillResult {
    const overwrite = options?.overwriteExisting === true;
    const resumeOnly = options?.resumeOnly === true;
    const photoOnly = options?.photoOnly === true;
    const filledDetails: Array<{ label: string; fieldName: string; valueSnippet: string }> = [];
    const failedFields: Array<{ name: string; reason: string }> = [];
    let filledCount = 0;

    // ── STEP 1a: Intelligent Resume / CV Attachment (EXACTLY 1 RESUME INPUT) ──
    let resumeAttachedInput: HTMLInputElement | null = null;
    if (!photoOnly && profile.resume && profile.resume.base64Data) {
      const bestInput = findBestResumeFileInput();
      if (bestInput) {
        // If resumeOnly is true, user explicitly requested upload, so we attach even if input had prior file
        const shouldAttach = resumeOnly || overwrite || !bestInput.files || bestInput.files.length === 0;
        if (shouldAttach) {
          const attached = attachResumeToFileInput(bestInput, profile.resume);
          if (attached) {
            resumeAttachedInput = bestInput;
            filledCount++;
            filledDetails.push({
              label: findFieldLabel(bestInput) || bestInput.name || 'Resume Upload',
              fieldName: 'Resume / CV File',
              valueSnippet: profile.resume.fileName || 'Resume.pdf',
            });
          } else if (resumeOnly) {
            failedFields.push({
              name: 'resume',
              reason: 'Found resume upload field, but the page rejected file attachment.',
            });
          }
        } else if (resumeOnly) {
          filledCount++;
          filledDetails.push({
            label: findFieldLabel(bestInput) || bestInput.name || 'Resume Upload',
            fieldName: 'Resume / CV File',
            valueSnippet: 'Already attached',
          });
        }
      } else if (resumeOnly) {
        failedFields.push({
          name: 'resume',
          reason: 'No resume upload field or dropzone detected on this webpage. Ensure the form is open and visible.',
        });
      }
    } else if (resumeOnly) {
      return {
        success: false,
        filledCount: 0,
        totalScanned: 0,
        filledDetails: [],
        failedFields: [{ name: 'resume', reason: 'No resume file stored in your Z-Pilot profile. Please upload one in the Resume tab first.' }],
      };
    }

    // If requested only resume upload, return right away with clear result
    if (resumeOnly) {
      return {
        success: filledCount > 0,
        filledCount,
        totalScanned: resumeAttachedInput ? 1 : 0,
        filledDetails,
        failedFields,
      };
    }

    // ── STEP 1b: Intelligent Passport Size Photo Attachment (EXACTLY 1 PHOTO INPUT) ──
    let photoAttachedInput: HTMLInputElement | null = null;
    if (!resumeOnly && profile.photo && profile.photo.base64Data) {
      const bestPhotoInput = findBestPhotoFileInput(document, resumeAttachedInput);
      if (bestPhotoInput) {
        const shouldAttachPhoto = photoOnly || overwrite || !bestPhotoInput.files || bestPhotoInput.files.length === 0;
        if (shouldAttachPhoto) {
          const attached = attachPhotoToFileInput(bestPhotoInput, profile.photo);
          if (attached) {
            photoAttachedInput = bestPhotoInput;
            filledCount++;
            filledDetails.push({
              label: findFieldLabel(bestPhotoInput) || bestPhotoInput.name || 'Passport Photo Upload',
              fieldName: 'Passport Size Photo',
              valueSnippet: profile.photo.fileName || 'Passport_Photo.jpg',
            });
          } else if (photoOnly) {
            failedFields.push({
              name: 'photo',
              reason: 'Found photo upload field, but the page rejected file attachment.',
            });
          }
        } else if (photoOnly) {
          filledCount++;
          filledDetails.push({
            label: findFieldLabel(bestPhotoInput) || bestPhotoInput.name || 'Passport Photo Upload',
            fieldName: 'Passport Size Photo',
            valueSnippet: 'Already attached',
          });
        }
      } else if (photoOnly) {
        failedFields.push({
          name: 'photo',
          reason: 'No passport photo or avatar upload field detected on this webpage. Ensure the form is open and visible.',
        });
      }
    } else if (photoOnly) {
      return {
        success: false,
        filledCount: 0,
        totalScanned: 0,
        filledDetails: [],
        failedFields: [{ name: 'photo', reason: 'No passport photo stored in your Z-Pilot profile. Please upload one in the Resume & Photo tab first.' }],
      };
    }

    // If requested only photo upload, return right away with clear result
    if (photoOnly) {
      return {
        success: filledCount > 0,
        filledCount,
        totalScanned: photoAttachedInput ? 1 : 0,
        filledDetails,
        failedFields,
      };
    }

    // ── STEP 2: Full Form Field Autofill (Text, Dropdowns, Radios, Checkboxes, Textareas) ──
    // File inputs are strictly excluded here so they are NEVER disturbed or overwritten
    function collectFormElements(node: Document | ShadowRoot): HTMLElement[] {
      const elements = Array.from(
        node.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]), textarea, select'
        )
      ) as HTMLElement[];

      const allEls = Array.from(node.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.shadowRoot) {
          elements.push(...collectFormElements(el.shadowRoot));
        }
      }
      return elements;
    }

    const allInputs = collectFormElements(document);

    const processedRadioGroups = new Set<string>();

    for (const el of allInputs) {
      const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
      if (type === 'password' || type === 'search' || type === 'file') continue;

      // 1. Skip invisible elements, honeypots, disabled/readonly fields
      if (!isElementVisible(el)) continue;

      const id = el.id || undefined;
      const name = el.getAttribute('name') || undefined;
      const role = el.getAttribute('role') || undefined;
      if (role === 'searchbox') continue;

      // 2. Protect existing inputs from unwanted overwriting (Safe Mode)
      if (!overwrite) {
        if (type === 'radio' && name) {
          const groupRadios = Array.from(
            document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
          ) as HTMLInputElement[];
          if (groupRadios.some((r) => r.checked)) {
            processedRadioGroups.add(name);
            continue;
          }
        } else if (el instanceof HTMLSelectElement) {
          if (el.selectedIndex > 0 && el.value !== '') continue;
        } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (type !== 'checkbox' && el.value && el.value.trim().length > 0) {
            continue;
          }
        }
      }

      const label = findFieldLabel(el);
      const placeholder = el.getAttribute('placeholder') || undefined;
      const ariaLabel = el.getAttribute('aria-label') || undefined;
      const autocomplete = el.getAttribute('autocomplete') || undefined;

      if (type === 'radio' && name && processedRadioGroups.has(name)) {
        continue;
      }

      let optionsList: Array<{ value: string; text: string }> | undefined;
      if (el instanceof HTMLSelectElement) {
        optionsList = Array.from(el.options).map((o) => ({ value: o.value, text: o.text }));
      }

      const matched = AutofillService.matchField(
        {
          id,
          name,
          type,
          label,
          placeholder,
          ariaLabel,
          autocomplete,
          role,
          options: optionsList,
        },
        profile
      );

      if (!matched || !matched.value) continue;

      // Sanitize numeric fields (strip currency symbols or 'years' if input type="number")
      const finalValue = AutofillService.sanitizeValueForField(matched.value, type);
      if (!finalValue && type === 'number') continue;

      try {
        if (type === 'radio' && name) {
          const radios = Array.from(
            document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
          ) as HTMLInputElement[];
          let radioFilled = false;
          for (const r of radios) {
            const rLabel = findFieldLabel(r).toLowerCase();
            const rVal = r.value.toLowerCase();
            const targetVal = matched.value.toLowerCase().trim();

            const isYes =
              /^(yes|true|authorized)$/i.test(targetVal) &&
              (rLabel.startsWith('yes') || rVal === '1' || rVal === 'yes' || rVal === 'true');
            const isNo =
              /^(no|false|unauthorized)$/i.test(targetVal) &&
              (rLabel.startsWith('no') || rVal === '0' || rVal === 'no' || rVal === 'false');

            if (isYes || isNo || rVal === targetVal || rLabel.includes(targetVal)) {
              r.checked = true;
              r.dispatchEvent(new Event('input', { bubbles: true }));
              r.dispatchEvent(new Event('change', { bubbles: true }));
              r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              radioFilled = true;
              break;
            }
          }
          if (radioFilled) {
            processedRadioGroups.add(name);
            filledCount++;
            filledDetails.push({
              label: label || name,
              fieldName: matched.label,
              valueSnippet: matched.value.slice(0, 30),
            });
          }
        } else if (el instanceof HTMLSelectElement) {
          const options = Array.from(el.options).map((o) => ({ value: o.value, text: o.text }));
          const bestIndex = AutofillService.resolveSelectOptionIndex(options, matched.value);
          if (bestIndex >= 0) {
            el.selectedIndex = bestIndex;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            filledCount++;
            filledDetails.push({
              label: label || name || 'Dropdown',
              fieldName: matched.label,
              valueSnippet: el.options[bestIndex].text.slice(0, 30),
            });
          }
        } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (type === 'checkbox') {
            const checkEl = el as HTMLInputElement;
            checkEl.checked = /^(yes|true|1|agree)$/i.test(matched.value.trim());
            checkEl.dispatchEvent(new Event('input', { bubbles: true }));
            checkEl.dispatchEvent(new Event('change', { bubbles: true }));
            filledCount++;
            filledDetails.push({
              label: label || name || 'Checkbox',
              fieldName: matched.label,
              valueSnippet: checkEl.checked ? 'Checked' : 'Unchecked',
            });
          } else {
            const prototype =
              el instanceof HTMLInputElement
                ? HTMLInputElement.prototype
                : HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (nativeSetter) {
              nativeSetter.call(el, finalValue);
            } else {
              el.value = finalValue;
            }

            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));

            filledCount++;
            filledDetails.push({
              label: label || name || 'Field',
              fieldName: matched.label,
              valueSnippet: finalValue.slice(0, 30),
            });
          }
        }
      } catch (err: unknown) {
        failedFields.push({
          name: label || name || 'field',
          reason: (err as Error).message,
        });
      }
    }

    return {
      success: filledCount > 0,
      filledCount,
      totalScanned: allInputs.length,
      filledDetails,
      failedFields,
    };
  }

  /**
   * YouTube video navigation and playback helper
   */
  async function handleYouTubePlayback(): Promise<{
    success: boolean;
    message: string;
  }> {
    // Check if we are on a YouTube watch page
    if (window.location.pathname.includes('/watch')) {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video) {
        try {
          if (video.paused) {
            await video.play();
          }
          return {
            success: true,
            message: 'Video is currently playing on YouTube.',
          };
        } catch {
          return {
            success: false,
            message:
              'Autoplay was restricted by the browser. Please click the video to start playback.',
          };
        }
      }
    }

    // If on search results page, click the first video result
    if (window.location.pathname.includes('/results')) {
      const firstVideoLink = document.querySelector(
        'ytd-video-renderer a#video-title, ytd-rich-item-renderer a#video-title, #video-title'
      ) as HTMLAnchorElement | null;

      if (firstVideoLink) {
        const title = firstVideoLink.textContent?.trim() || 'video';
        firstVideoLink.click();
        return {
          success: true,
          message: `Opened video "${title}". Attempting playback...`,
        };
      } else {
        return {
          success: false,
          message: 'Could not find a video result link on the current YouTube page.',
        };
      }
    }

    return {
      success: false,
      message: 'Not on an active YouTube search or watch page.',
    };
  }

  // Expose global runner for multi-frame scripting calls
  (window as unknown as { __zPilotAutofill?: typeof runPageAutofill }).__zPilotAutofill = runPageAutofill;

  // Runtime message listener
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    switch (request.type) {
      case 'GET_PAGE_CONTEXT': {
        const text = extractPageText();
        const forms = discoverForms();
        const selection = window.getSelection()?.toString()?.trim() || '';

        sendResponse({
          url: window.location.href,
          title: document.title,
          selectedText: selection,
          extractedText: text,
          forms,
        });
        return false;
      }

      case 'SCAN_VIDEOS': {
        const videos = scanDocumentVideos(document, window.location.href);
        const bestTitle = extractBestPageVideoTitle(document, window.location.href);
        sendResponse({
          url: window.location.href,
          title: bestTitle || document.title,
          videos,
        });
        return false;
      }

      case 'GET_FORMS': {
        const forms = discoverForms();
        sendResponse({ forms });
        return false;
      }

      case 'FILL_FIELDS': {
        const result = fillFormFields(request.fields || []);
        sendResponse(result);
        return false;
      }

      case 'AUTOFILL_JOB_FORM': {
        const result = runPageAutofill(request.profile || {}, request.options);
        sendResponse(result);
        return false;
      }

      case 'YOUTUBE_PLAY': {
        handleYouTubePlayback().then(sendResponse);
        return true; // Keep channel open for async response
      }

      case 'PING': {
        sendResponse({ status: 'ok', url: window.location.href });
        return false;
      }

      case 'GET_AD_BLOCK_STATS': {
        sendResponse({
          pageCount: getPageBlockedCount(),
          url: window.location.href,
        });
        return false;
      }

      case 'TOGGLE_AD_SHIELD': {
        initAdShield(!!request.enabled);
        sendResponse({ success: true, enabled: !!request.enabled });
        return false;
      }

      case 'CAPTURE_VIDEO_FRAME': {
        try {
          const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
          const targetVideo =
            videos.find((v) => !v.paused && v.currentTime > 0) ||
            videos.find((v) => v.currentTime > 0) ||
            videos[0];

          if (!targetVideo) {
            sendResponse({ ok: false, error: 'No active video found on this webpage.' });
            return false;
          }

          const w = targetVideo.videoWidth || targetVideo.clientWidth || 640;
          const h = targetVideo.videoHeight || targetVideo.clientHeight || 360;

          const canvas = document.createElement('canvas');
          canvas.width = Math.min(1920, w);
          canvas.height = Math.min(1080, h);
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            sendResponse({ ok: false, error: 'Canvas 2D context not supported' });
            return false;
          }

          ctx.drawImage(targetVideo, 0, 0, canvas.width, canvas.height);
          let dataUrl = '';
          try {
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          } catch {
            sendResponse({
              ok: false,
              error: 'Cross-origin video frame protected. Use "Capture Screen / Tab Snip" instead.',
            });
            return false;
          }

          const domSubtitles: string[] = [];
          const captionNodes = document.querySelectorAll(
            '.ytp-caption-segment, .caption-window, .vjs-text-track-display'
          );
          captionNodes.forEach((node) => {
            const txt = node.textContent?.trim();
            if (txt && !domSubtitles.includes(txt)) {
              domSubtitles.push(txt);
            }
          });

          sendResponse({
            ok: true,
            dataUrl,
            videoTitle: document.title,
            currentTime: targetVideo.currentTime,
            duration: targetVideo.duration,
            width: canvas.width,
            height: canvas.height,
            domSubtitles,
          });
          return false;
        } catch (err: unknown) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
          return false;
        }
      }

      case 'GET_PAGE_IMAGES': {
        try {
          const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
          const detected = imgs
            .filter((img) => {
              const src = img.currentSrc || img.src;
              if (
                !src ||
                src.startsWith('data:image/svg') ||
                src.includes('data:image/gif;base64,R0lGODlhAQAB')
              ) {
                return false;
              }
              const w = img.naturalWidth || img.clientWidth;
              const h = img.naturalHeight || img.clientHeight;
              return w >= 40 && h >= 40;
            })
            .slice(0, 30)
            .map((img) => ({
              src: img.currentSrc || img.src,
              alt: img.alt?.trim() || undefined,
              title: img.title?.trim() || undefined,
              width: img.naturalWidth || img.clientWidth,
              height: img.naturalHeight || img.clientHeight,
            }));

          sendResponse({ ok: true, images: detected });
          return false;
        } catch {
          sendResponse({ ok: true, images: [] });
          return false;
        }
      }

      // ── Web Privacy & Blur Shield Handlers ──
      case 'START_ELEMENT_BLUR_MODE': {
        privacyBlurManager.enableClickToBlur(() => {
          chrome.runtime.sendMessage({
            type: 'PRIVACY_BLUR_STATS_UPDATED',
            stats: privacyBlurManager.getStats(),
          }).catch(() => {});
        });
        sendResponse({ ok: true, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'STOP_ELEMENT_BLUR_MODE': {
        privacyBlurManager.disableClickToBlur();
        sendResponse({ ok: true, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'START_DRAW_BLUR_BOX_MODE': {
        privacyBlurManager.enableDrawBlurBox(() => {
          chrome.runtime.sendMessage({
            type: 'PRIVACY_BLUR_STATS_UPDATED',
            stats: privacyBlurManager.getStats(),
          }).catch(() => {});
        });
        sendResponse({ ok: true, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'STOP_DRAW_BLUR_BOX_MODE': {
        privacyBlurManager.disableDrawBlurBox();
        sendResponse({ ok: true, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'TOGGLE_AUTO_BLUR_FINANCIALS': {
        const active = privacyBlurManager.toggleAutoBlurFinancials(request.enabled);
        sendResponse({ ok: true, active, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'TOGGLE_AUTO_BLUR_PII': {
        const active = privacyBlurManager.toggleAutoBlurPii(request.enabled);
        sendResponse({ ok: true, active, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'TOGGLE_AUTO_BLUR_MEDIA': {
        const active = privacyBlurManager.toggleAutoBlurMedia(request.enabled);
        sendResponse({ ok: true, active, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'TOGGLE_PRIVACY_SCREEN': {
        const active = privacyBlurManager.togglePrivacyScreen(request.enabled);
        sendResponse({ ok: true, active, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'UPDATE_BLUR_CONFIG': {
        privacyBlurManager.updateConfig(request.config || {});
        sendResponse({ ok: true, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'GET_BLUR_STATS': {
        sendResponse({ ok: true, stats: privacyBlurManager.getStats() });
        return false;
      }

      case 'CLEAR_ALL_BLUR': {
        privacyBlurManager.clearAllBlur();
        sendResponse({ ok: true, stats: privacyBlurManager.getStats() });
        return false;
      }

      // ── E-Commerce Product & Review Detection ──
      case 'DETECT_ECOMMERCE_PRODUCT': {
        // Only the top-level main window should respond to product scans (ignore ad/sub-iframes)
        if (window !== window.top) {
          return false;
        }
        try {
          const product = extractPageProductData();
          sendResponse({ ok: true, product });
        } catch (err: unknown) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        return false;
      }

      case 'SCROLL_TO_REVIEWS': {
        if (window !== window.top) {
          return false;
        }
        scrollToReviewsAndExtract()
          .then((product) => {
            sendResponse({ ok: true, product });
          })
          .catch((err: unknown) => {
            sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
          });
        return true; // asynchronous response
      }

      case 'EXTRACT_PAGE_COUPONS': {
        if (window !== window.top) {
          return false;
        }
        try {
          const coupons = extractOnPageCoupons();
          sendResponse({ ok: true, coupons });
        } catch {
          sendResponse({ ok: true, coupons: [] });
        }
        return false;
      }

      case 'SHOW_REMINDER_TOAST': {
        const { todo } = request as {
          todo: { id: string; title: string; description?: string; dueDate?: number };
        };
        if (todo && window === window.top) {
          showInPageReminderToast(todo);
          sendResponse({ ok: true });
        }
        return false;
      }

      default:
        // Do not call sendResponse here to avoid prematurely closing the message port for other handlers
        return false;
    }
  });

  // --------------------------------------------------------------------------
  // Clipboard: Automatic Browser Clipboard Capture (Max 10 clips)
  // --------------------------------------------------------------------------
  let captureDebounce: ReturnType<typeof setTimeout> | null = null;

  function isContextValid(): boolean {
    try {
      return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    } catch {
      return false;
    }
  }

  function detachCopyListeners(): void {
    try {
      window.removeEventListener('copy', handleCopyAction, true);
      document.removeEventListener('copy', handleCopyAction, true);
      window.removeEventListener('keydown', handleKeydownCopy, true);
      document.removeEventListener('keydown', handleKeydownCopy, true);
    } catch {
      // Ignore
    }
  }

  function dispatchClipboardText(rawText: string): void {
    if (!isContextValid()) {
      detachCopyListeners();
      return;
    }

    const text = rawText.trim();
    if (!text) return;

    // Direct local storage write for 100% reliability
    StorageService.addClipboardItem(text, window.location.href, document.title).catch(() => { });

    // Also send runtime message to notify active extension views
    try {
      if (chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({
            type: 'Clipboard_COPY',
            text,
            sourceUrl: window.location.href,
            sourceTitle: document.title,
          })
          .catch(() => { });
      }
    } catch {
      // Ignore
    }
  }

  function getSelectedTextFromDOM(): string {
    try {
      // 1. Regular window selection
      const sel = window.getSelection();
      const str = sel?.toString()?.trim();
      if (str) return str;

      // 2. Active input / textarea element selection
      if (document.activeElement) {
        const el = document.activeElement;
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          const start = el.selectionStart || 0;
          const end = el.selectionEnd || 0;
          if (end > start) {
            return el.value.substring(start, end).trim();
          }
        }
      }
    } catch {
      // Ignore
    }
    return '';
  }

  function handleCopyAction(): void {
    if (!isContextValid()) {
      detachCopyListeners();
      return;
    }

    // 1. Immediate synchronous check from DOM selection
    const immediateText = getSelectedTextFromDOM();
    if (immediateText) {
      dispatchClipboardText(immediateText);
    }

    // 2. Fallback check with short delay for clipboard APIs / custom page scripts
    if (captureDebounce) clearTimeout(captureDebounce);
    captureDebounce = setTimeout(() => {
      if (!isContextValid()) {
        detachCopyListeners();
        return;
      }
      const delayedText = getSelectedTextFromDOM();
      if (delayedText) {
        dispatchClipboardText(delayedText);
      } else if (navigator.clipboard?.readText) {
        navigator.clipboard
          .readText()
          .then((clip) => {
            if (clip && clip.trim()) {
              dispatchClipboardText(clip.trim());
            }
          })
          .catch(() => {
            // Ignore permission error
          });
      }
    }, 80);
  }

  // Capture on macOS (Cmd+C) and Windows/Linux (Ctrl+C) keydown
  const handleKeydownCopy = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
      handleCopyAction();
    }
  };

  // Capture on standard DOM 'copy' event (capturing phase on window & document)
  window.addEventListener('copy', handleCopyAction, true);
  document.addEventListener('copy', handleCopyAction, true);
  window.addEventListener('keydown', handleKeydownCopy, true);
  document.addEventListener('keydown', handleKeydownCopy, true);

  // --------------------------------------------------------------------------
  // E-Commerce Product & Review Extractor
  // --------------------------------------------------------------------------
  async function scrollToReviewsAndExtract() {
    const reviewTarget = document.querySelector(
      '#customer-reviews, #reviews, #reviews-medley-footer, [data-hook="reviews-medley-footer"], #customerReviews, .reviews-section, .customer-reviews, [id*="customer-review"], [id*="review-section"], div._2w5Brp, div.ZmyHeo, div.user-review-reviewTextWrapper'
    );
    if (reviewTarget) {
      reviewTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Scroll down ~50% where reviews usually load
      window.scrollTo({ top: document.body.scrollHeight * 0.52, behavior: 'smooth' });
    }
    // Wait for lazy-loaded review components to populate
    await new Promise((resolve) => setTimeout(resolve, 750));
    return extractPageProductData();
  }

  function extractPageProductData() {
    const url = window.location.href;
    const domain = window.location.hostname.replace(/^www\./, '');

    let title = '';
    let rawPriceText = '';
    let rawListPriceText = '';
    let rawLowPriceText = '';
    let imageUrl = '';
    let rating: number | undefined;
    let reviewCount: number | undefined;
    const pageReviews: string[] = [];

    // Helper: Flatten structured data from JSON-LD (@graph, arrays, nested objects)
    const flattenEntities = (obj: any): any[] => {
      if (!obj || typeof obj !== 'object') return [];
      if (Array.isArray(obj)) return obj.flatMap(flattenEntities);
      let list = [obj];
      if (obj['@graph'] && Array.isArray(obj['@graph'])) {
        list = list.concat(obj['@graph'].flatMap(flattenEntities));
      }
      return list;
    };

    // 1. Try structured JSON-LD first
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of Array.from(scripts)) {
        try {
          const json = JSON.parse(s.textContent || '');
          const entities = flattenEntities(json);
          for (const item of entities) {
            const typeStr = Array.isArray(item['@type'])
              ? item['@type'].join(' ')
              : String(item['@type'] || '');
            const isProduct =
              /Product|ItemPage|IndividualProduct/i.test(typeStr) ||
              item.offers ||
              item.aggregateRating;

            if (isProduct) {
              if (item.name && !title) title = String(item.name).trim();

              if (item.image && !imageUrl) {
                if (Array.isArray(item.image)) {
                  imageUrl =
                    typeof item.image[0] === 'string'
                      ? item.image[0]
                      : item.image[0]?.url || '';
                } else if (typeof item.image === 'string') {
                  imageUrl = item.image;
                } else if (item.image?.url) {
                  imageUrl = item.image.url;
                }
              }

              if (item.offers && (!rawPriceText || !rawListPriceText || !rawLowPriceText)) {
                const offerList = Array.isArray(item.offers) ? item.offers : [item.offers];
                for (const off of offerList) {
                  const currency = off.priceCurrency || item.priceCurrency || '$';
                  const priceVal = off.price ?? off.priceSpecification?.price;
                  const lowVal = off.lowPrice ?? off.priceSpecification?.minPrice;
                  const highVal = off.highPrice ?? off.priceSpecification?.maxPrice;

                  if (priceVal !== undefined && !rawPriceText) {
                    rawPriceText = `${currency} ${priceVal}`;
                  } else if (lowVal !== undefined && !rawPriceText) {
                    rawPriceText = `${currency} ${lowVal}`;
                  }

                  if (lowVal !== undefined && (!priceVal || Number(lowVal) < Number(priceVal)) && !rawLowPriceText) {
                    rawLowPriceText = `${currency} ${lowVal}`;
                  }

                  if (highVal !== undefined && !rawListPriceText) {
                    rawListPriceText = `${currency} ${highVal}`;
                  }
                }
              }

              if (item.aggregateRating) {
                if (item.aggregateRating.ratingValue && !rating) {
                  const rv = parseFloat(item.aggregateRating.ratingValue);
                  if (!isNaN(rv) && rv > 0 && rv <= 5) rating = rv;
                }
                if (!reviewCount) {
                  const rc = parseInt(
                    item.aggregateRating.reviewCount || item.aggregateRating.ratingCount,
                    10
                  );
                  if (!isNaN(rc) && rc > 0) reviewCount = rc;
                }
              }

              if (item.review) {
                const revList = Array.isArray(item.review) ? item.review : [item.review];
                revList.slice(0, 15).forEach((r: any) => {
                  const body = r.reviewBody || r.description;
                  if (body && typeof body === 'string' && body.trim().length > 15) {
                    const cleaned = body.replace(/\s+/g, ' ').trim();
                    if (!pageReviews.includes(cleaned)) pageReviews.push(cleaned.slice(0, 500));
                  }
                });
              }
            }
          }
        } catch {
          // Continue
        }
      }
    } catch {
      // Continue
    }

    // 2. OpenGraph & Microdata Tags
    if (!title) {
      title =
        (document.querySelector('meta[property="og:title"], meta[name="twitter:title"]') as HTMLMetaElement)?.content || '';
    }
    if (!imageUrl) {
      imageUrl =
        (document.querySelector('meta[property="og:image"], meta[name="twitter:image"], meta[itemprop="image"]') as HTMLMetaElement)?.content || '';
    }
    if (!rawPriceText) {
      const ogPrice = document.querySelector(
        'meta[property="product:sale_price:amount"], meta[property="product:price:amount"], meta[property="og:price:amount"], meta[itemprop="price"]'
      ) as HTMLElement | null;
      if (ogPrice) {
        const pVal = ogPrice.getAttribute('content') || ogPrice.textContent?.trim();
        const cVal =
          (
            document.querySelector(
              'meta[property="product:price:currency"], meta[property="og:price:currency"], meta[itemprop="priceCurrency"]'
            ) as HTMLElement | null
          )?.getAttribute('content') || '$';
        if (pVal) rawPriceText = `${cVal} ${pVal}`;
      }
    }
    if (!rawListPriceText) {
      const listPriceMeta = document.querySelector(
        'meta[property="product:original_price:amount"], meta[property="product:regular_price:amount"]'
      ) as HTMLElement | null;
      if (listPriceMeta) {
        const lpVal = listPriceMeta.getAttribute('content') || listPriceMeta.textContent?.trim();
        if (lpVal) rawListPriceText = `$ ${lpVal}`;
      }
    }

    // 3. Retailer-Specific Title Selectors
    if (!title) {
      const titleSelectors = [
        '#productTitle',
        'span#productTitle',
        '.product-title',
        'h1[itemprop="name"]',
        'h1#main-title',
        'span.VU-ZEz',
        'span.B_NuCI',
        'h1._6EBuvT',
        'h1.yhB1nd',
        '._2NKhZn',
        '.x-item-title__mainTitle',
        '.pdp-title',
        'h1.pdp-name',
        'h1.prod-title',
        '[data-testid="product-title"]',
        'h1[data-test="product-title"]',
        '.product__title',
        '.product-name',
        'h1',
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          title = el.textContent.trim();
          break;
        }
      }
    }
    if (!title) title = document.title;

    // Clean up store brand clutter from title
    title = title
      .replace(/^Amazon\.[a-z.]+\s*:\s*/i, '')
      .replace(/\s*:\s*Amazon\.[a-z.]+.*$/i, '')
      .replace(/\s*-\s*Flipkart\.com.*$/i, '')
      .replace(/\s*\|\s*Flipkart.*$/i, '')
      .replace(/\s*\|\s*Walmart\.com.*$/i, '')
      .replace(/\s*\|\s*eBay.*$/i, '')
      .replace(/\s*\|\s*Target.*$/i, '')
      .replace(/\s*\|\s*Myntra.*$/i, '')
      .replace(/\s*\|\s*Meesho.*$/i, '')
      .trim();

    // 4. Reliable Selling Price Extraction (Excluding Struck-Through MRP/List Prices)
    if (!rawPriceText) {
      const prioritySellingPriceSelectors = [
        '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
        '#corePriceDisplay_desktop_feature_div .priceToPay span.a-price-whole',
        '.priceToPay .a-offscreen',
        '#corePrice_desktop .a-price:not(.a-text-price) .a-offscreen',
        '.apexPriceToPay .a-offscreen',
        '#priceblock_dealprice',
        '#priceblock_ourprice',
        '#priceblock_saleprice',
        '#price_inside_buybox',
        'div.Nx9bqj.CxhGGd',
        'div.Nx9bqj',
        'div._30jeq3._16Jk6d',
        'div._30jeq3',
        'div._25b18c div:first-child',
        'span.pdp-price strong',
        'span.pdp-price',
        'span.pdp-selling-price',
        'h4[class*="Price"]',
        'span.prod-sp',
        '.prod-sp',
        'span[data-seo-id="hero-price"]',
        '[data-testid="price-wrap"] [itemprop="price"]',
        '[data-testid="x-price-primary"] .ux-textspans',
        '.x-price-primary',
        '#prcIsum',
        'span[data-test="product-price"]',
        '[data-test="product-price-reduced"]',
        '.price--on-sale .price-item--sale',
        '.price-item--sale',
        '.product-price',
        '.price__regular .price-item--regular',
        'span[itemprop="price"]',
        '.product__price',
        '[data-product-price]',
        'span.money',
      ];

      for (const sel of prioritySellingPriceSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          if (el.closest('.a-text-price, del, s, strike, [class*="strike"], [class*="was-price"], [class*="list-price"]')) {
            continue;
          }
          let txt = el.getAttribute('content') || el.textContent?.trim() || '';
          if (el.classList.contains('a-price-whole')) {
            const frac = el.parentElement?.querySelector('.a-price-fraction')?.textContent?.trim() || '';
            const symbol = el.parentElement?.querySelector('.a-price-symbol')?.textContent?.trim() || '';
            txt = `${symbol} ${txt.replace(/\.$/, '')}${frac ? '.' + frac : ''}`;
          }
          if (txt && /[\$€£₹¥]|(?:INR|USD|EUR|GBP|Rs\.?)/i.test(txt) && /[0-9]/.test(txt)) {
            rawPriceText = txt;
            break;
          } else if (txt && /^[0-9,]+(?:\.[0-9]{2})?$/.test(txt) && parseFloat(txt.replace(/,/g, '')) > 0) {
            rawPriceText = txt;
            break;
          }
        }
        if (rawPriceText) break;
      }
    }

    if (!rawPriceText) {
      // General price elements, strictly avoiding strikethrough classes
      const candidate = document.querySelector(
        '.a-price .a-offscreen:not(.a-text-price .a-offscreen), span[itemprop="price"]'
      );
      if (candidate) {
        rawPriceText = candidate.getAttribute('content') || candidate.textContent?.trim() || '';
      }
    }

    if (!rawPriceText) {
      // Fallback search in main container allowing elements with 0-3 children
      const container = document.querySelector('#centerCol, #dp-container, main, [role="main"]') || document.body;
      const candidates = container.querySelectorAll('span, div, p, strong, b');
      for (const el of Array.from(candidates)) {
        if (el.closest('.a-text-price, del, s, strike, [class*="strike"], [class*="was-price"], [class*="list-price"]')) {
          continue;
        }
        if (el.querySelectorAll('*').length > 3) continue;
        const txt = el.textContent?.trim() || '';
        if (txt.length < 35 && /(?:[\$€£₹¥]|(?:INR|USD|EUR|GBP|Rs\.?))\s?[0-9,]+(?:\.[0-9]{2})?/i.test(txt)) {
          const match = txt.match(/(?:[\$€£₹¥]|(?:INR|USD|EUR|GBP|Rs\.?))\s?[0-9,]+(?:\.[0-9]{2})?/i);
          if (match) {
            rawPriceText = match[0];
            break;
          }
        }
      }
    }

    // 5. Original MRP / List Price Extraction (Strikethrough / Was-Price)
    if (!rawListPriceText) {
      const listPriceSelectors = [
        '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
        '#corePriceDisplay_desktop_feature_div span.a-text-price .a-offscreen',
        '#corePrice_desktop .basisPrice .a-offscreen',
        'span[data-a-strike="true"] .a-offscreen',
        'span.a-text-price .a-offscreen',
        '#priceblock_retailprice',
        'div.yRaY8j.A68aKn',
        'div.yRaY8j',
        'div._3I9_wc._2p6lqe',
        'div._3I9_wc',
        'div._25b18c div._3I9_wc',
        'span.pdp-mrp',
        'span.pdp-mrp s',
        'p[class*="MutedPrice"]',
        'span.prod-cp',
        '.prod-cp',
        '[data-testid="price-wrap"] [class*="was-price"]',
        'span[data-test="product-regular-price"]',
        '.x-additional-info .ux-textspans--STRIKETHROUGH',
        '.x-text-strike',
        '.price-item--regular',
        '.compare-at-price',
        's.price-item--regular',
        '.was-price',
        'del',
      ];

      for (const sel of listPriceSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          const txt = el.getAttribute('content') || el.textContent?.trim() || '';
          if (txt && /[0-9]/.test(txt)) {
            rawListPriceText = txt;
            break;
          }
        }
        if (rawListPriceText) break;
      }
    }

    // 5b. Check store 30-day low / historic lowest price mentioned on page
    if (!rawLowPriceText) {
      try {
        const containerEl = document.querySelector('#centerCol, #dp-container, main') as HTMLElement | null;
        const pageTextSnippet = (containerEl?.innerText || document.body?.innerText || '').slice(0, 8000);
        const lowMatch = pageTextSnippet.match(/(?:lowest price in (?:the last |last |past )?30 days|lowest price in 30 days was|30-day low)[^0-9₹$€£\n]*([₹$€£]?\s?[0-9,]+(?:\.[0-9]{2})?)/i);
        if (lowMatch && lowMatch[1] && /[0-9]/.test(lowMatch[1])) {
          rawLowPriceText = lowMatch[1].trim();
        }
      } catch {
        // Continue
      }
    }

    // 6. Image Extraction
    if (!imageUrl) {
      const imgSelectors = [
        '#landingImage',
        '#imgBlkFront',
        'img.DByuf4',
        'img._396cs4',
        'img._2r_T1I',
        'img._53G40d',
        '.product-image img',
        '[data-hook="main-image"]',
        '.x-photos-min-view img',
        '.pdp-image img',
        '.product-single__photo',
        'img[itemprop="image"]',
      ];
      for (const sel of imgSelectors) {
        const imgEl = document.querySelector(sel) as HTMLImageElement | null;
        if (imgEl) {
          const src =
            imgEl.getAttribute('data-old-hires') ||
            imgEl.src ||
            imgEl.currentSrc ||
            imgEl.getAttribute('data-src') ||
            '';
          if (src && !src.startsWith('data:image/svg')) {
            imageUrl = src;
            break;
          }
        }
      }
    }

    // 7. Authentic Customer Reviews Extraction (Top visible buyer reviews)
    if (pageReviews.length === 0) {
      const reviewEls = document.querySelectorAll(
        'div[data-hook="review"] span[data-hook="review-body"] span, span[data-hook="review-body"] span, div[data-hook="review-collapsed"] span, .review-text-content span, [data-hook="review-body"], div.ZmyHeo div, div.EPCmJX, div._6K-7Co, div.row div.col div.text, div[class*="review-description"], div.user-review-reviewTextWrapper, div.user-review-reviewText, [data-automation-id="review-text"], [data-testid="review-text"], .spr-review-content-body, .jdgm-rev__body, .stamped-review-body, .yotpo-review-wrapper .content-review, .loox-review-content, [itemprop="reviewBody"], [class*="review-content"], [class*="review-text"], [class*="ReviewText"], .customer-review, .user-review'
      );
      reviewEls.forEach((el) => {
        const text = el.textContent?.replace(/\s+/g, ' ')?.trim();
        if (text && text.length > 20 && !pageReviews.includes(text) && pageReviews.length < 20) {
          pageReviews.push(text.slice(0, 500));
        }
      });
    }

    // 8. Rating Extraction (DOM + Attributes: title, content, aria-label)
    if (!rating) {
      const ratingSelectors = [
        '#acrPopover',
        'i.a-icon-star span.a-icon-alt',
        'span.a-icon-alt',
        '[data-hook="rating-out-of-text"]',
        '#averageCustomerReviews .a-color-base',
        'div.XQDdHH',
        'div._3LWZlK',
        'div._2d4LTz',
        'span._1lRcqv',
        '[id*="productRating"]',
        'div.index-overallRating div',
        'span[class*="RatingValue"]',
        'div[class*="RatingBadge"]',
        'span[itemprop="ratingValue"]',
        'span.rating-number',
        '[data-testid="reviews-and-ratings"] span',
        'span[data-test="rating-value"]',
        '.x-star-rating .ux-textspans',
        '[data-testid="x-star-rating"]',
        'strong.overview-rating-average',
        '[data-rating]',
        '[data-star-rating]',
      ];

      for (const sel of ratingSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          const rawVal =
            el.getAttribute('data-star-rating') ||
            el.getAttribute('data-rating') ||
            el.getAttribute('title') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('content') ||
            el.textContent ||
            '';
          const match = rawVal.match(/([0-5](?:\.[0-9]+)?)(?:\s*(?:out of|\/)\s*5|\s*stars?)?/i);
          if (match) {
            const parsed = parseFloat(match[1]);
            if (parsed >= 1 && parsed <= 5) {
              rating = parsed;
              break;
            }
          }
        }
        if (rating) break;
      }
    }

    // 9. Review Count Extraction (Numbers, Commas & 'k' notation e.g. 1.2k)
    if (!reviewCount) {
      const countSelectors = [
        '#acrCustomerReviewText',
        '[data-hook="total-review-count"]',
        'span.Wphh3K',
        'span._2_R_DZ',
        'div.index-ratingsCount',
        'span[class*="ReviewsCount"]',
        'span[itemprop="reviewCount"]',
        'span[itemprop="ratingCount"]',
        'a[data-testid="item-review-section-link"]',
        'span[data-test="ratings-and-reviews-count"]',
        '.ebay-review-count',
        'span.reviewer--reviews--',
        '[data-review-count]',
      ];

      for (const sel of countSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          const rawVal =
            el.getAttribute('data-review-count') ||
            el.getAttribute('content') ||
            el.getAttribute('aria-label') ||
            el.textContent ||
            '';
          if (!rawVal.trim()) continue;
          const kMatch = rawVal.match(/([0-9]+(?:\.[0-9]+)?)\s*k\b/i);
          if (kMatch) {
            reviewCount = Math.round(parseFloat(kMatch[1]) * 1000);
            break;
          }
          const numMatch = rawVal.replace(/,/g, '').match(/([0-9]+)/);
          if (numMatch) {
            const parsed = parseInt(numMatch[1], 10);
            if (parsed > 0) {
              reviewCount = parsed;
              break;
            }
          }
        }
        if (reviewCount) break;
      }
    }

    // 10. On-page Deal Badges (e.g. "Lowest price in 30 days", "Limited time deal")
    let dealBadge: string | undefined;
    const badgeSelectors = [
      'span.a-badge-text',
      '[data-a-badge-type="deal"] span',
      '.dealBadgeSupportingText',
      'div._3Ay6Sb span',
      'span.pdp-offers-offerDesc',
      '[data-test="badge"]',
      '.badge--sale',
      'span[class*="deal-badge"]',
      'span[class*="discount"]',
    ];
    for (const sel of badgeSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const bText = el.textContent?.trim() || '';
        if (bText && bText.length < 50) {
          dealBadge = bText;
          break;
        }
      }
    }

    if (!dealBadge) {
      try {
        const snippet = document.body.innerText.slice(0, 8000);
        const lowDealMatch = snippet.match(/(lowest price in (?:the last |last |past )?30 days|limited time deal|deal of the day)/i);
        if (lowDealMatch) {
          dealBadge = lowDealMatch[1].trim();
        }
      } catch {
        // Continue
      }
    }

    return {
      title: title.slice(0, 150),
      url,
      domain,
      imageUrl: imageUrl || undefined,
      rawPriceText,
      rawListPriceText: rawListPriceText || undefined,
      rawLowPriceText: rawLowPriceText || undefined,
      rating: rating || undefined,
      reviewCount: reviewCount || undefined,
      dealBadge: dealBadge || undefined,
      pageReviews,
    };
  }

  function extractOnPageCoupons() {
    const coupons: Array<{
      code: string;
      discount: string;
      description: string;
      store: string;
      verified: boolean;
      source: 'page_found';
    }> = [];
    const domain = window.location.hostname.replace(/^www\./, '');

    const promoEls = document.querySelectorAll(
      '[class*="coupon"], [class*="promo"], [class*="voucher"], [data-coupon], .promo-banner, .discount-badge'
    );

    promoEls.forEach((el) => {
      const txt = el.textContent?.trim() || '';
      const match = txt.match(/\b([A-Z0-9]{4,15})\b/);
      const discountMatch = txt.match(/(\d+%\s*OFF|\$\d+\s*OFF|₹\d+\s*OFF|FREE\s*SHIPPING)/i);
      if (match && discountMatch && !coupons.some((c) => c.code === match[1])) {
        coupons.push({
          code: match[1],
          discount: discountMatch[1].toUpperCase(),
          description: txt.slice(0, 80),
          store: domain,
          verified: true,
          source: 'page_found',
        });
      }
    });

    return coupons;
  }

  // --------------------------------------------------------------------------
  // In-Page Tasks & Reminders Alert Banner
  // --------------------------------------------------------------------------

  function playInPageReminderChime(): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.75);
    } catch {
      // Audio context may require user interaction on some pages
    }
  }

  function showInPageReminderToast(todo: {
    id: string;
    title: string;
    description?: string;
    dueDate?: number;
  }): void {
    playInPageReminderChime();

    const existingToast = document.getElementById('zpilot-reminder-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const container = document.createElement('div');
    container.id = 'zpilot-reminder-toast';
    container.setAttribute('role', 'alert');
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 340px;
      max-width: calc(100vw - 48px);
      background: linear-gradient(135deg, rgba(16, 8, 4, 0.98), rgba(28, 14, 7, 0.98));
      border: 1.5px solid rgba(249, 115, 22, 0.6);
      border-radius: 14px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7), 0 0 24px rgba(249, 115, 22, 0.25);
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 14px 16px;
      box-sizing: border-box;
      animation: zpilotSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    if (!document.getElementById('zpilot-reminder-toast-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'zpilot-reminder-toast-style';
      styleEl.textContent = `
        @keyframes zpilotSlideIn {
          from { transform: translateX(40px) scale(0.95); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes zpilotPulseBell {
          0%, 100% { transform: rotate(0deg); }
          20%, 60% { transform: rotate(-15deg); }
          40%, 80% { transform: rotate(15deg); }
        }
      `;
      document.head.appendChild(styleEl);
    }

    const escapeHtml = (str: string) =>
      str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m));

    const safeTitle = escapeHtml(todo.title);
    const safeDesc = todo.description ? escapeHtml(todo.description) : '';

    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="display:inline-block; font-size:18px; animation: zpilotPulseBell 1.5s ease-in-out infinite;">⏰</span>
          <span style="font-size:11px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#fb923c;">
            Z-Pilot Reminder
          </span>
        </div>
        <button id="zpilot-toast-close" style="background:transparent; border:none; color:rgba(255,255,255,0.6); font-size:16px; cursor:pointer; line-height:1; padding:2px 4px; border-radius:4px;">✕</button>
      </div>
      <div style="font-size:14px; font-weight:700; color:#ffffff; line-height:1.35; margin-bottom:${safeDesc ? '4px' : '10px'}; word-break:break-word;">
        ${safeTitle}
      </div>
      ${
        safeDesc
          ? `<div style="font-size:12px; color:rgba(255,255,255,0.7); line-height:1.3; margin-bottom:12px; max-height:48px; overflow:hidden; text-overflow:ellipsis; word-break:break-word;">${safeDesc}</div>`
          : ''
      }
      <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
        <button id="zpilot-toast-done" style="flex:1; background:linear-gradient(135deg, #16a34a, #15803d); color:#ffffff; border:none; border-radius:8px; padding:7px 10px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; box-shadow:0 2px 8px rgba(22,163,74,0.3);">
          ✓ Mark Done
        </button>
        <button id="zpilot-toast-snooze" style="flex:1; background:rgba(255,255,255,0.1); color:#ffedd5; border:1px solid rgba(249,115,22,0.4); border-radius:8px; padding:7px 10px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
          💤 Snooze 10m
        </button>
      </div>
    `;

    document.body.appendChild(container);

    let dismissTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      container.style.opacity = '0';
      container.style.transform = 'translateY(-10px)';
      container.style.transition = 'all 0.3s ease';
      setTimeout(() => container.remove(), 300);
    }, 25000);

    const closeToast = () => {
      if (dismissTimeout) clearTimeout(dismissTimeout);
      container.style.opacity = '0';
      container.style.transform = 'translateY(-10px)';
      container.style.transition = 'all 0.3s ease';
      setTimeout(() => container.remove(), 300);
    };

    container.addEventListener('mouseenter', () => {
      if (dismissTimeout) {
        clearTimeout(dismissTimeout);
        dismissTimeout = null;
      }
    });

    container.addEventListener('mouseleave', () => {
      if (!dismissTimeout) {
        dismissTimeout = setTimeout(closeToast, 10000);
      }
    });

    const closeBtn = container.querySelector('#zpilot-toast-close');
    closeBtn?.addEventListener('click', closeToast);

    const doneBtn = container.querySelector('#zpilot-toast-done');
    doneBtn?.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'TOGGLE_TODO_DONE', todoId: todo.id });
      } catch {
        // Ignore
      }
      if (doneBtn instanceof HTMLElement) {
        doneBtn.innerText = '✓ Completed!';
        doneBtn.style.background = '#15803d';
      }
      setTimeout(closeToast, 600);
    });

    const snoozeBtn = container.querySelector('#zpilot-toast-snooze');
    snoozeBtn?.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'SNOOZE_TODO', todoId: todo.id, minutes: 10 });
      } catch {
        // Ignore
      }
      if (snoozeBtn instanceof HTMLElement) {
        snoozeBtn.innerText = '💤 Snoozed!';
      }
      setTimeout(closeToast, 600);
    });
  }
}
