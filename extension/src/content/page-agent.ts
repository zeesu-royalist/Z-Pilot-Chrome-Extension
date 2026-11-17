/**
 * Z-Pilot Page Agent (Content Script)
 * Executes DOM inspection, text extraction, form discovery, form filling,
 * media playback, and deep DOM video scanning on the active webpage.
 */

import { scanDocumentVideos, extractBestPageVideoTitle } from './dom-video-scanner.js';
import { StorageService } from '../services/storage.js';
import { initAdShield, getPageBlockedCount } from './ad-shield.js';
import { privacyBlurManager } from './privacy-blur.js';

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
        try {
          const product = extractPageProductData();
          sendResponse({ ok: true, product });
        } catch (err: unknown) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
        return false;
      }

      case 'EXTRACT_PAGE_COUPONS': {
        try {
          const coupons = extractOnPageCoupons();
          sendResponse({ ok: true, coupons });
        } catch {
          sendResponse({ ok: true, coupons: [] });
        }
        return false;
      }

      default:
        sendResponse({ error: 'Unknown action type in page agent' });
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
  function extractPageProductData() {
    const url = window.location.href;
    const domain = window.location.hostname.replace(/^www\./, '');

    let title = '';
    let rawPriceText = '';
    let imageUrl = '';
    let rating: number | undefined;
    let reviewCount: number | undefined;
    const pageReviews: string[] = [];

    // 1. Try structured JSON-LD first
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of Array.from(scripts)) {
        try {
          const json = JSON.parse(s.textContent || '');
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item['@type'] === 'Product' || item.offers || item.aggregateRating) {
              if (item.name && !title) title = item.name;
              if (item.image && !imageUrl) {
                imageUrl = Array.isArray(item.image)
                  ? item.image[0]
                  : typeof item.image === 'string'
                  ? item.image
                  : item.image.url || '';
              }
              if (item.offers && !rawPriceText) {
                const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                if (offer?.price) {
                  rawPriceText = `${offer.priceCurrency || '$'} ${offer.price}`;
                }
              }
              if (item.aggregateRating) {
                if (item.aggregateRating.ratingValue && !rating) {
                  rating = parseFloat(item.aggregateRating.ratingValue);
                }
                if (item.aggregateRating.reviewCount && !reviewCount) {
                  reviewCount = parseInt(item.aggregateRating.reviewCount, 10);
                }
              }
              if (item.review && Array.isArray(item.review)) {
                item.review.slice(0, 10).forEach((r: any) => {
                  const body = r.reviewBody || r.description;
                  if (body && typeof body === 'string') pageReviews.push(body.trim());
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

    // 2. OpenGraph Meta Tags
    if (!title) {
      title =
        (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content || '';
    }
    if (!imageUrl) {
      imageUrl =
        (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content || '';
    }
    if (!rawPriceText) {
      const ogPrice = (
        document.querySelector(
          'meta[property="og:price:amount"], meta[property="product:price:amount"]'
        ) as HTMLMetaElement
      )?.content;
      const ogCurrency =
        (
          document.querySelector(
            'meta[property="og:price:currency"], meta[property="product:price:currency"]'
          ) as HTMLMetaElement
        )?.content || '$';
      if (ogPrice) rawPriceText = `${ogCurrency} ${ogPrice}`;
    }

    // 3. Retailer-Specific Selectors
    if (!title) {
      const el = document.querySelector(
        '#productTitle, .product-title, h1[itemprop="name"], .B_NuCI, .x-item-title__mainTitle, .pdp-title'
      );
      if (el) title = el.textContent?.trim() || '';
    }
    if (!title) {
      const h1 = document.querySelector('h1');
      if (h1?.textContent) title = h1.textContent.trim();
    }
    if (!title) title = document.title;

    if (!rawPriceText) {
      const priceEl = document.querySelector(
        '.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, ._30jeq3._16Jk6d, [data-seo-id="hero-price"], .x-price-primary, .price-item--regular, .pdp-price, .product__price, span[itemprop="price"]'
      );
      if (priceEl) rawPriceText = priceEl.textContent?.trim() || '';
    }

    if (!rawPriceText) {
      // Generic currency regex search in small leaf nodes
      const priceCandidates = Array.from(document.querySelectorAll('span, div, p')).filter(
        (el) => {
          const txt = el.textContent?.trim() || '';
          return /^[\$€£₹¥]\s?[0-9,]+(?:\.[0-9]{2})?$/.test(txt) && el.children.length === 0;
        }
      );
      if (priceCandidates.length > 0) {
        rawPriceText = priceCandidates[0].textContent?.trim() || '';
      }
    }

    if (!imageUrl) {
      const imgEl = document.querySelector(
        '#landingImage, #imgBlkFront, .product-image img, [data-hook="main-image"], ._396cs4, .x-photos-min-view img'
      ) as HTMLImageElement | null;
      if (imgEl) imageUrl = imgEl.src || imgEl.currentSrc || '';
    }

    // Reviews extraction
    if (pageReviews.length === 0) {
      const reviewEls = document.querySelectorAll(
        '[data-hook="review-body"], .review-text, ._6K-7Co, .customer-review, .user-review, [class*="review-content"]'
      );
      reviewEls.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 15 && pageReviews.length < 15) {
          pageReviews.push(text.slice(0, 500));
        }
      });
    }

    // Rating extraction
    if (!rating) {
      const ratingEl = document.querySelector(
        '#acrPopover, [data-hook="rating-out-of-text"], ._3LWZlK, [class*="rating-stars"]'
      );
      if (ratingEl) {
        const match = ratingEl.textContent?.match(/([0-9]+(?:\.[0-9]+)?)/);
        if (match) rating = parseFloat(match[1]);
      }
    }

    return {
      title: title.slice(0, 150),
      url,
      domain,
      imageUrl: imageUrl || undefined,
      rawPriceText,
      rating: rating || undefined,
      reviewCount: reviewCount || undefined,
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
}
