/**
 * Z-Pilot Page Agent (Content Script)
 * Executes DOM inspection, text extraction, form discovery, form filling,
 * and media playback on the active webpage.
 */

// Prevent duplicate execution if re-injected
if (!(window as unknown as { __Z_PILOT_PAGE_AGENT_LOADED?: boolean }).__Z_PILOT_PAGE_AGENT_LOADED) {
  (window as unknown as { __Z_PILOT_PAGE_AGENT_LOADED: boolean }).__Z_PILOT_PAGE_AGENT_LOADED = true;

  console.log('[Z-Pilot] Page Agent active on:', window.location.href);

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
    // 1. Label with 'for' attribute
    if (input.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (labelEl && labelEl.textContent?.trim()) {
        return labelEl.textContent.trim();
      }
    }

    // 2. Enclosing <label>
    const parentLabel = input.closest('label');
    if (parentLabel && parentLabel.textContent?.trim()) {
      return parentLabel.textContent.trim();
    }

    // 3. aria-label or aria-labelledby
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    const ariaLabelledby = input.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const target = document.getElementById(ariaLabelledby);
      if (target && target.textContent?.trim()) return target.textContent.trim();
    }

    // 4. Placeholder
    const placeholder = input.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();

    // 5. Name or id fallback
    return input.getAttribute('name') || input.id || '';
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
        } else if (element instanceof HTMLSelectElement) {
          let matched = false;
          for (let i = 0; i < element.options.length; i++) {
            const opt = element.options[i];
            if (
              opt.value.toLowerCase() === field.value.toLowerCase() ||
              opt.text.toLowerCase().includes(field.value.toLowerCase())
            ) {
              element.selectedIndex = i;
              matched = true;
              break;
            }
          }
          element.dispatchEvent(new Event('change', { bubbles: true }));
          if (matched) {
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

      case 'YOUTUBE_PLAY': {
        handleYouTubePlayback().then(sendResponse);
        return true; // Keep channel open for async response
      }

      case 'PING': {
        sendResponse({ status: 'ok', url: window.location.href });
        return false;
      }

      default:
        sendResponse({ error: 'Unknown action type in page agent' });
        return false;
    }
  });
}
