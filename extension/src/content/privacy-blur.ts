/**
 * Z-Pilot Web Privacy & Screen Blur Shield (Content Script Component)
 * - Click-to-Blur any element with live hover inspector
 * - Drag-to-Draw custom floating blur boxes (freely movable & resizable)
 * - Smart auto-obfuscation for Financials, Balances, Emails, and Media
 * - Full-page Privacy Curtain / Screen Shield
 * - Live blur intensity slider & stealth blackout styles
 */

import { BlurStyle, PrivacyBlurStats } from '../types/index.js';

class PrivacyBlurManager {
  private blurIntensity = 12;
  private blurStyle: BlurStyle = 'blur';
  private hoverToReveal = true;

  private isClickToBlurActive = false;
  private isDrawBoxActive = false;
  private privacyScreenActive = false;

  private autoFinancialsActive = false;
  private autoPiiActive = false;
  private autoMediaActive = false;

  private blurredElements = new Set<HTMLElement>();
  private customBlurBoxes = new Map<string, HTMLElement>();
  private highlightedElement: HTMLElement | null = null;

  private inspectorOverlay: HTMLElement | null = null;
  private drawingOverlay: HTMLElement | null = null;
  private privacyScreenOverlay: HTMLElement | null = null;

  private boundMouseMoveInspector: ((e: MouseEvent) => void) | null = null;
  private boundClickInspector: ((e: MouseEvent) => void) | null = null;
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.injectStyles();
    this.setupGlobalKeyListener();
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. INJECT DYNAMIC PRIVACY STYLES
  // ═══════════════════════════════════════════════════════════════

  public injectStyles(): void {
    if (typeof document === 'undefined') return;

    let styleEl = document.getElementById('zpilot-privacy-blur-styles') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'zpilot-privacy-blur-styles';
      (document.head || document.documentElement).appendChild(styleEl);
    }

    styleEl.textContent = `
      :root {
        --zpilot-blur-radius: ${this.blurIntensity}px;
      }

      /* Base Blurred Element */
      .zpilot-blurred-element {
        filter: blur(var(--zpilot-blur-radius, 12px)) !important;
        -webkit-filter: blur(var(--zpilot-blur-radius, 12px)) !important;
        user-select: none !important;
        transition: filter 0.2s ease, opacity 0.2s ease, background 0.2s ease !important;
        pointer-events: auto !important;
      }

      /* Blackout Redaction Style */
      .zpilot-blurred-element.zpilot-style-blackout {
        filter: none !important;
        -webkit-filter: none !important;
        background: #000000 !important;
        color: transparent !important;
        border-radius: 4px !important;
      }
      .zpilot-blurred-element.zpilot-style-blackout * {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      /* Stealth Matrix Style */
      .zpilot-blurred-element.zpilot-style-stealth {
        filter: blur(calc(var(--zpilot-blur-radius, 12px) * 0.7)) !important;
        background: rgba(8, 24, 16, 0.92) !important;
        border: 1px dashed rgba(0, 255, 136, 0.4) !important;
      }

      /* Hover to Peek / Reveal */
      .zpilot-hover-peek.zpilot-blurred-element:hover {
        filter: none !important;
        -webkit-filter: none !important;
        background: transparent !important;
        color: inherit !important;
      }
      .zpilot-hover-peek.zpilot-blurred-element:hover * {
        opacity: 1 !important;
        visibility: visible !important;
      }

      /* Interactive Inspector Outline */
      .zpilot-inspect-highlight {
        outline: 2px dashed #f97316 !important;
        outline-offset: 3px !important;
        cursor: crosshair !important;
      }

      /* Drag-and-Drop Floating Blur Box */
      .zpilot-custom-blur-box {
        position: absolute;
        z-index: 2147483640;
        backdrop-filter: blur(var(--zpilot-blur-radius, 12px)) saturate(120%);
        -webkit-backdrop-filter: blur(var(--zpilot-blur-radius, 12px)) saturate(120%);
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(249, 115, 22, 0.45);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        user-select: none;
        box-sizing: border-box;
        cursor: move;
        transition: border-color 0.15s ease, opacity 0.2s ease;
      }
      .zpilot-custom-blur-box:hover {
        border-color: #f97316;
        box-shadow: 0 6px 24px rgba(249, 115, 22, 0.3);
      }
      .zpilot-custom-blur-box.zpilot-style-blackout {
        background: #000000 !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .zpilot-custom-blur-box.zpilot-style-stealth {
        background: rgba(8, 24, 16, 0.95) !important;
        border-color: #00ff88 !important;
      }

      /* Box Floating Controls Bar */
      .zpilot-box-controls {
        position: absolute;
        top: -14px;
        right: 8px;
        display: none;
        align-items: center;
        gap: 4px;
        z-index: 2147483646;
      }
      .zpilot-custom-blur-box:hover .zpilot-box-controls {
        display: flex;
      }
      .zpilot-box-btn {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        background: #1a0a03;
        border: 1px solid rgba(249, 115, 22, 0.5);
        color: #ffedd5;
        font-size: 11px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.6);
        transition: all 0.15s ease;
      }
      .zpilot-box-btn:hover {
        background: #ea580c;
        color: #ffffff;
        transform: scale(1.05);
      }

      /* Corner Resize Handle */
      .zpilot-box-resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 14px;
        height: 14px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, #f97316 50%);
        border-bottom-right-radius: 7px;
      }

      /* Top Guidance Notification Pill */
      .zpilot-guidance-banner {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: rgba(20, 10, 4, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(249, 115, 22, 0.6);
        color: #ffffff;
        padding: 8px 16px;
        border-radius: 9999px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
        animation: zpilot-fade-down 0.2s ease-out;
      }
      @keyframes zpilot-fade-down {
        from { opacity: 0; transform: translate(-50%, -10px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      .zpilot-guidance-btn {
        background: #f97316;
        color: white;
        border: none;
        border-radius: 9999px;
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s;
      }
      .zpilot-guidance-btn:hover {
        background: #ea580c;
      }

      /* Full Page Privacy Curtain Overlay */
      .zpilot-privacy-curtain {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        backdrop-filter: blur(24px) brightness(40%);
        -webkit-backdrop-filter: blur(24px) brightness(40%);
        background: rgba(5, 2, 1, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: pointer;
        animation: zpilot-fade-in 0.25s ease-out;
      }
      @keyframes zpilot-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
  }

  private setupGlobalKeyListener(): void {
    if (typeof window === 'undefined') return;
    this.boundKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.isClickToBlurActive) this.disableClickToBlur();
        if (this.isDrawBoxActive) this.disableDrawBlurBox();
        if (this.privacyScreenActive) this.togglePrivacyScreen(false);
      }
    };
    window.addEventListener('keydown', this.boundKeyDown);
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. CLICK-TO-BLUR ELEMENT INSPECTOR
  // ═══════════════════════════════════════════════════════════════

  public enableClickToBlur(onStateChange?: () => void): void {
    if (this.isClickToBlurActive) return;
    this.isClickToBlurActive = true;
    if (this.isDrawBoxActive) this.disableDrawBlurBox();

    this.showGuidanceBanner(
      '🛡️ Click any element to blur / unblur • Press Esc or click Done when finished',
      () => {
        this.disableClickToBlur();
        onStateChange?.();
      }
    );

    this.boundMouseMoveInspector = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('.zpilot-guidance-banner') || target.closest('.zpilot-custom-blur-box')) {
        return;
      }

      if (this.highlightedElement && this.highlightedElement !== target) {
        this.highlightedElement.classList.remove('zpilot-inspect-highlight');
      }
      this.highlightedElement = target;
      target.classList.add('zpilot-inspect-highlight');
    };

    this.boundClickInspector = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('.zpilot-guidance-banner') || target.closest('.zpilot-custom-blur-box')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      this.toggleElementBlur(target);
      onStateChange?.();
    };

    document.addEventListener('mouseover', this.boundMouseMoveInspector, true);
    document.addEventListener('click', this.boundClickInspector, true);
  }

  public disableClickToBlur(): void {
    if (!this.isClickToBlurActive) return;
    this.isClickToBlurActive = false;

    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('zpilot-inspect-highlight');
      this.highlightedElement = null;
    }

    document.querySelectorAll('.zpilot-inspect-highlight').forEach((el) => {
      el.classList.remove('zpilot-inspect-highlight');
    });

    if (this.boundMouseMoveInspector) {
      document.removeEventListener('mouseover', this.boundMouseMoveInspector, true);
      this.boundMouseMoveInspector = null;
    }

    if (this.boundClickInspector) {
      document.removeEventListener('click', this.boundClickInspector, true);
      this.boundClickInspector = null;
    }

    this.removeGuidanceBanner();
  }

  public toggleElementBlur(el: HTMLElement): void {
    if (this.blurredElements.has(el) || el.classList.contains('zpilot-blurred-element')) {
      // Unblur
      el.classList.remove(
        'zpilot-blurred-element',
        'zpilot-style-blackout',
        'zpilot-style-stealth',
        'zpilot-hover-peek',
        'zpilot-inspect-highlight'
      );
      this.blurredElements.delete(el);
      el.removeAttribute('data-zpilot-blurred');
    } else {
      // Apply blur
      el.classList.add('zpilot-blurred-element');
      this.applyStyleClassesToElement(el);
      el.setAttribute('data-zpilot-blurred', 'true');
      this.blurredElements.add(el);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. DRAG-AND-DROP CUSTOM BLUR BOX (DRAW & RESIZE)
  // ═══════════════════════════════════════════════════════════════

  public enableDrawBlurBox(onBoxCreated?: () => void): void {
    if (this.isDrawBoxActive) return;
    this.isDrawBoxActive = true;
    if (this.isClickToBlurActive) this.disableClickToBlur();

    this.showGuidanceBanner(
      '📐 Drag anywhere on the page to draw a blur mask • You can move & resize it anytime!',
      () => {
        this.disableDrawBlurBox();
      }
    );

    // Create transparent drawing canvas overlay
    const overlay = document.createElement('div');
    overlay.className = 'zpilot-drawing-canvas-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483642;
      cursor: crosshair;
      user-select: none;
    `;
    document.body.appendChild(overlay);
    this.drawingOverlay = overlay;

    let startX = 0;
    let startY = 0;
    let isDrawing = false;
    let previewBox: HTMLElement | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.target !== overlay) return;
      isDrawing = true;
      startX = e.pageX;
      startY = e.pageY;

      previewBox = document.createElement('div');
      previewBox.className = 'zpilot-preview-drawing-box';
      previewBox.style.cssText = `
        position: absolute;
        left: ${startX}px;
        top: ${startY}px;
        width: 0px;
        height: 0px;
        border: 2px dashed #f97316;
        background: rgba(249, 115, 22, 0.15);
        border-radius: 6px;
        z-index: 2147483643;
        pointer-events: none;
      `;
      document.body.appendChild(previewBox);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !previewBox) return;
      const currentX = e.pageX;
      const currentY = e.pageY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      previewBox.style.left = `${left}px`;
      previewBox.style.top = `${top}px`;
      previewBox.style.width = `${width}px`;
      previewBox.style.height = `${height}px`;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDrawing) return;
      isDrawing = false;

      if (previewBox) {
        previewBox.remove();
        previewBox = null;
      }

      const endX = e.pageX;
      const endY = e.pageY;
      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);

      // Only create if dragged size is at least 15x15px
      if (width >= 15 && height >= 15) {
        this.createFloatingBlurBox(left, top, width, height);
        onBoxCreated?.();
      }

      this.disableDrawBlurBox();
    };

    overlay.addEventListener('mousedown', handleMouseDown);
    overlay.addEventListener('mousemove', handleMouseMove);
    overlay.addEventListener('mouseup', handleMouseUp);
  }

  public disableDrawBlurBox(): void {
    if (!this.isDrawBoxActive) return;
    this.isDrawBoxActive = false;

    document.querySelectorAll('.zpilot-preview-drawing-box').forEach((el) => el.remove());

    if (this.drawingOverlay) {
      this.drawingOverlay.remove();
      this.drawingOverlay = null;
    }
    this.removeGuidanceBanner();
  }

  public createFloatingBlurBox(
    left: number,
    top: number,
    width: number,
    height: number,
    id?: string
  ): HTMLElement {
    const boxId = id || `zpilot_box_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const box = document.createElement('div');
    box.className = 'zpilot-custom-blur-box';
    box.id = boxId;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    this.applyStyleClassesToBox(box);

    // Floating action controls (Close & Peek)
    const controls = document.createElement('div');
    controls.className = 'zpilot-box-controls';

    const peekBtn = document.createElement('button');
    peekBtn.className = 'zpilot-box-btn';
    peekBtn.title = 'Peek / Toggle Blur';
    peekBtn.textContent = '👁';
    peekBtn.onclick = (e) => {
      e.stopPropagation();
      const currentOpacity = box.style.opacity;
      box.style.opacity = currentOpacity === '0.1' ? '1' : '0.1';
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'zpilot-box-btn';
    deleteBtn.title = 'Remove Blur Box';
    deleteBtn.textContent = '✕';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.removeBlurBox(boxId);
    };

    controls.appendChild(peekBtn);
    controls.appendChild(deleteBtn);
    box.appendChild(controls);

    // Corner Resize Handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'zpilot-box-resize-handle';
    resizeHandle.title = 'Drag to Resize';
    box.appendChild(resizeHandle);

    // Drag-to-Move Listener
    this.attachDragToMove(box);
    // Resize Listener
    this.attachResizeHandle(box, resizeHandle);

    document.body.appendChild(box);
    this.customBlurBoxes.set(boxId, box);
    return box;
  }

  private attachDragToMove(box: HTMLElement): void {
    let isDragging = false;
    let initialMouseX = 0;
    let initialMouseY = 0;
    let initialBoxLeft = 0;
    let initialBoxTop = 0;

    box.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.zpilot-box-controls') || (e.target as HTMLElement).closest('.zpilot-box-resize-handle')) {
        return;
      }
      isDragging = true;
      initialMouseX = e.pageX;
      initialMouseY = e.pageY;
      initialBoxLeft = parseFloat(box.style.left) || 0;
      initialBoxTop = parseFloat(box.style.top) || 0;
      e.preventDefault();

      const handleMouseMove = (moveEv: MouseEvent) => {
        if (!isDragging) return;
        const deltaX = moveEv.pageX - initialMouseX;
        const deltaY = moveEv.pageY - initialMouseY;
        box.style.left = `${Math.max(0, initialBoxLeft + deltaX)}px`;
        box.style.top = `${Math.max(0, initialBoxTop + deltaY)}px`;
      };

      const handleMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  private attachResizeHandle(box: HTMLElement, handle: HTMLElement): void {
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.pageX;
      startY = e.pageY;
      startWidth = parseFloat(box.style.width) || box.offsetWidth;
      startHeight = parseFloat(box.style.height) || box.offsetHeight;
      e.preventDefault();
      e.stopPropagation();

      const handleMouseMove = (moveEv: MouseEvent) => {
        if (!isResizing) return;
        const newWidth = Math.max(30, startWidth + (moveEv.pageX - startX));
        const newHeight = Math.max(20, startHeight + (moveEv.pageY - startY));
        box.style.width = `${newWidth}px`;
        box.style.height = `${newHeight}px`;
      };

      const handleMouseUp = () => {
        isResizing = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  public removeBlurBox(id: string): void {
    const box = this.customBlurBoxes.get(id);
    if (box) {
      box.remove();
      this.customBlurBoxes.delete(id);
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime
            .sendMessage({
              type: 'PRIVACY_BLUR_STATS_UPDATED',
              stats: this.getStats(),
            })
            .catch(() => {});
        }
      } catch {
        // Ignore
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. SMART AUTO-BLUR PRESETS (FINANCIALS, PII, MEDIA)
  // ═══════════════════════════════════════════════════════════════

  public toggleAutoBlurFinancials(enable?: boolean): boolean {
    const nextState = enable !== undefined ? enable : !this.autoFinancialsActive;
    this.autoFinancialsActive = nextState;

    if (nextState) {
      // Currency regex for balances, figures, prices
      const currencyRegex = /(?:[\$€£₹¥]|BTC|ETH|USD|INR|EUR|GBP)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:[\$€£₹¥]|BTC|ETH|USD|INR|EUR|GBP)/gi;
      this.wrapMatchingTextNodes(currencyRegex, 'zpilot-auto-financial');
    } else {
      this.unwrapMatchingTextNodes('zpilot-auto-financial');
    }
    return this.autoFinancialsActive;
  }

  public toggleAutoBlurPii(enable?: boolean): boolean {
    const nextState = enable !== undefined ? enable : !this.autoPiiActive;
    this.autoPiiActive = nextState;

    if (nextState) {
      // Email and phone regex
      const piiRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/gi;
      this.wrapMatchingTextNodes(piiRegex, 'zpilot-auto-pii');
    } else {
      this.unwrapMatchingTextNodes('zpilot-auto-pii');
    }
    return this.autoPiiActive;
  }

  public toggleAutoBlurMedia(enable?: boolean): boolean {
    const nextState = enable !== undefined ? enable : !this.autoMediaActive;
    this.autoMediaActive = nextState;

    const mediaElements = document.querySelectorAll<HTMLElement>(
      'img, video, canvas, svg, [style*="background-image"], .avatar, [class*="avatar"], [class*="profile-pic"]'
    );

    mediaElements.forEach((el) => {
      if (el.closest('.zpilot-custom-blur-box') || el.closest('.zpilot-guidance-banner')) return;
      if (nextState) {
        el.classList.add('zpilot-blurred-element', 'zpilot-auto-media');
        this.applyStyleClassesToElement(el);
        this.blurredElements.add(el);
      } else {
        el.classList.remove('zpilot-blurred-element', 'zpilot-auto-media');
        this.blurredElements.delete(el);
      }
    });

    return this.autoMediaActive;
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. FULL-PAGE PRIVACY SCREEN CURTAIN
  // ═══════════════════════════════════════════════════════════════

  public togglePrivacyScreen(enable?: boolean): boolean {
    const nextState = enable !== undefined ? enable : !this.privacyScreenActive;
    this.privacyScreenActive = nextState;

    if (nextState) {
      if (!this.privacyScreenOverlay) {
        const curtain = document.createElement('div');
        curtain.className = 'zpilot-privacy-curtain';
        curtain.innerHTML = `
          <div style="text-align: center; max-width: 320px; padding: 24px; border-radius: 20px; background: rgba(20, 10, 4, 0.95); border: 1px solid rgba(249, 115, 22, 0.5); box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
            <div style="font-size: 38px; margin-bottom: 8px;">🔒</div>
            <div style="font-size: 15px; font-weight: bold; color: white; margin-bottom: 4px;">Privacy Screen Active</div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.5; margin-bottom: 16px;">
              Screen contents are hidden from prying eyes. Click anywhere or press [Esc] to unveil.
            </div>
            <button style="padding: 7px 16px; border-radius: 9999px; background: linear-gradient(to right, #f97316, #d97706); color: white; font-size: 11px; font-weight: bold; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(249,115,22,0.4);">
              Unveil Screen
            </button>
          </div>
        `;
        curtain.onclick = () => this.togglePrivacyScreen(false);
        document.body.appendChild(curtain);
        this.privacyScreenOverlay = curtain;
      }
    } else {
      if (this.privacyScreenOverlay) {
        this.privacyScreenOverlay.remove();
        this.privacyScreenOverlay = null;
      }
    }
    return this.privacyScreenActive;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. BLUR CONTROLS: INTENSITY, STYLES, HOVER-PEEK
  // ═══════════════════════════════════════════════════════════════

  public updateConfig(config: {
    blurIntensity?: number;
    blurStyle?: BlurStyle;
    hoverToReveal?: boolean;
  }): void {
    if (config.blurIntensity !== undefined) {
      this.blurIntensity = Math.max(2, Math.min(40, config.blurIntensity));
      document.documentElement.style.setProperty(
        '--zpilot-blur-radius',
        `${this.blurIntensity}px`
      );
    }

    if (config.blurStyle !== undefined) {
      this.blurStyle = config.blurStyle;
    }

    if (config.hoverToReveal !== undefined) {
      this.hoverToReveal = config.hoverToReveal;
    }

    // Refresh classes across all active blurred elements
    this.blurredElements.forEach((el) => this.applyStyleClassesToElement(el));
    this.customBlurBoxes.forEach((box) => this.applyStyleClassesToBox(box));
    this.injectStyles();
  }

  private applyStyleClassesToElement(el: HTMLElement): void {
    el.classList.remove('zpilot-style-blackout', 'zpilot-style-stealth', 'zpilot-hover-peek');
    if (this.blurStyle === 'blackout') {
      el.classList.add('zpilot-style-blackout');
    } else if (this.blurStyle === 'stealth') {
      el.classList.add('zpilot-style-stealth');
    }

    if (this.hoverToReveal) {
      el.classList.add('zpilot-hover-peek');
    }
  }

  private applyStyleClassesToBox(box: HTMLElement): void {
    box.classList.remove('zpilot-style-blackout', 'zpilot-style-stealth');
    if (this.blurStyle === 'blackout') {
      box.classList.add('zpilot-style-blackout');
    } else if (this.blurStyle === 'stealth') {
      box.classList.add('zpilot-style-stealth');
    }
  }

  public clearAllBlur(): void {
    this.disableClickToBlur();
    this.disableDrawBlurBox();
    this.togglePrivacyScreen(false);

    // Remove all blurred elements
    this.blurredElements.forEach((el) => {
      el.classList.remove(
        'zpilot-blurred-element',
        'zpilot-style-blackout',
        'zpilot-style-stealth',
        'zpilot-hover-peek',
        'zpilot-auto-financial',
        'zpilot-auto-pii',
        'zpilot-auto-media'
      );
      el.removeAttribute('data-zpilot-blurred');
    });
    this.blurredElements.clear();

    // Remove text node wrap marks
    this.unwrapMatchingTextNodes('zpilot-auto-financial');
    this.unwrapMatchingTextNodes('zpilot-auto-pii');

    // Remove custom boxes
    this.customBlurBoxes.forEach((box) => box.remove());
    this.customBlurBoxes.clear();

    this.autoFinancialsActive = false;
    this.autoPiiActive = false;
    this.autoMediaActive = false;
  }

  public getStats(): PrivacyBlurStats {
    return {
      blurredElementCount: this.blurredElements.size,
      customBoxCount: this.customBlurBoxes.size,
      financialsBlurred: this.autoFinancialsActive,
      piiBlurred: this.autoPiiActive,
      mediaBlurred: this.autoMediaActive,
      privacyScreenActive: this.privacyScreenActive,
      blurIntensity: this.blurIntensity,
      blurStyle: this.blurStyle,
      hoverToReveal: this.hoverToReveal,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. HELPER UTILITIES: GUIDANCE BANNER & TEXT NODE DOM WALKERS
  // ═══════════════════════════════════════════════════════════════

  private showGuidanceBanner(message: string, onDone: () => void): void {
    this.removeGuidanceBanner();

    const banner = document.createElement('div');
    banner.className = 'zpilot-guidance-banner';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    banner.appendChild(textSpan);

    const doneBtn = document.createElement('button');
    doneBtn.className = 'zpilot-guidance-btn';
    doneBtn.textContent = 'Done ✓';
    doneBtn.onclick = onDone;
    banner.appendChild(doneBtn);

    document.body.appendChild(banner);
    this.inspectorOverlay = banner;
  }

  private removeGuidanceBanner(): void {
    if (this.inspectorOverlay) {
      this.inspectorOverlay.remove();
      this.inspectorOverlay = null;
    }
  }

  private wrapMatchingTextNodes(regex: RegExp, className: string): void {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (
            tag === 'script' ||
            tag === 'style' ||
            tag === 'noscript' ||
            tag === 'textarea' ||
            tag === 'input' ||
            parent.closest('.zpilot-custom-blur-box') ||
            parent.closest('.zpilot-guidance-banner')
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return regex.test(node.nodeValue || '')
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      }
    );

    const nodesToReplace: Text[] = [];
    while (walker.nextNode()) {
      nodesToReplace.push(walker.currentNode as Text);
    }

    nodesToReplace.forEach((node) => {
      const text = node.nodeValue || '';
      regex.lastIndex = 0;
      if (!regex.test(text)) return;
      regex.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex, match.index))
          );
        }

        const mark = document.createElement('span');
        mark.className = `zpilot-blurred-element ${className}`;
        mark.textContent = match[0];
        this.applyStyleClassesToElement(mark);
        this.blurredElements.add(mark);
        fragment.appendChild(mark);

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      node.parentNode?.replaceChild(fragment, node);
    });
  }

  private unwrapMatchingTextNodes(className: string): void {
    const marks = document.querySelectorAll(`span.${className}`);
    marks.forEach((mark) => {
      this.blurredElements.delete(mark as HTMLElement);
      const textNode = document.createTextNode(mark.textContent || '');
      mark.parentNode?.replaceChild(textNode, mark);
    });
  }
}

export const privacyBlurManager = new PrivacyBlurManager();
