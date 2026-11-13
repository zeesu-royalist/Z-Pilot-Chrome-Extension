/**
 * Z-Pilot Ad Shield (Content Script Component)
 * - Cosmetic ad hiding via high-priority CSS rules
 * - Dynamic iframe, banner, and popup ad element removal
 * - YouTube & HTML5 video ad instant fast-forward & auto-skip
 * - Anti-adblock overlay neutralization & scroll unlocking
 * - Real-time ad counter reporting
 */

const COSMETIC_AD_SELECTORS = [
  // Google / AdSense / DoubleClick
  '.adsbygoogle',
  'ins.adsbygoogle',
  '[id^="google_ads_iframe"]',
  '[id^="aswift_"]',
  '[name^="google_ads_iframe"]',
  'div[id^="div-gpt-ad"]',

  // Common Ad Class Names & IDs
  '.ad-container',
  '.ad-wrapper',
  '.ad-banner',
  '.ad-slot',
  '.ad-unit',
  '.advertisement',
  '.sponsor-container',
  '.sponsored-post',
  '.native-ad',
  '[data-ad-unit]',
  '[data-ad-slot]',
  '[data-ad-client]',
  '[data-ad-format]',
  '[class*="-ad-banner"]',
  '[id*="-ad-banner"]',
  '.top-ad',
  '.bottom-ad',
  '.sidebar-ad',
  '.sticky-ad',
  '.floating-ad',
  '.ad-holder',
  '.banner-ad',

  // Content Recommendation Widgets (Taboola, Outbrain, MGID, Revcontent)
  '.taboola-placeholder',
  '#taboola-below-article-thumbnails',
  '.outbrain_widget',
  '.trc_related_container',
  '.mgid_placeholder',
  '.revcontent-container',

  // YouTube Specific Ad Units & Promos
  '#player-ads',
  'ytd-ad-slot-renderer',
  'ytd-banner-promo-renderer',
  'ytd-in-feed-ad-layout-renderer',
  'ytd-statement-banner-renderer',
  'ytd-action-companion-ad-renderer',
  'ytd-promoted-sparkles-web-renderer',
  '.ytp-ad-module',
  '.ytp-ad-overlay-container',
  '.ytp-ad-image-overlay',
  '.ytp-ad-text',
  '.video-ads:not(:empty)',
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',

  // Intrusive Anti-AdBlock Overlays & Backdrops
  '.fc-ab-root',
  '.sp_veil',
  '[class*="adblock-modal"]',
  '[class*="adblock-backdrop"]',
  '[id*="adblock-modal"]',
  '[class*="adblock-overlay"]',
  '[id*="adblock-overlay"]',
  '[class*="ad-blocker-notice"]',
];

const STYLE_TAG_ID = 'zpilot-shield-styles';

let isShieldActive = true;
let totalBlockedThisPage = 0;
let observer: MutationObserver | null = null;
let videoSkipTimer: ReturnType<typeof setInterval> | null = null;

// Track previous video playback state so we cleanly restore normal speed & audio after ad
let wasAdPlaying = false;
let userPlaybackRate = 1.0;
let userMutedState = false;

/**
 * Injects global stylesheet to instantly collapse all ad containers
 */
export function injectCosmeticShieldStyles(): void {
  if (document.getElementById(STYLE_TAG_ID)) return;

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_TAG_ID;
  styleEl.textContent = `
    ${COSMETIC_AD_SELECTORS.join(',\n')} {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      width: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      overflow: hidden !important;
    }
  `;
  (document.head || document.documentElement).appendChild(styleEl);
}

/**
 * Removes cosmetic stylesheet if user pauses Ad Blocker
 */
export function removeCosmeticShieldStyles(): void {
  const el = document.getElementById(STYLE_TAG_ID);
  if (el) el.remove();
}

/**
 * Sweeps the DOM and counts / neutralizes matching ad elements
 */
export function sweepAdElements(): number {
  if (!isShieldActive) return 0;
  let blockedCount = 0;

  try {
    const combinedSelector = COSMETIC_AD_SELECTORS.join(',');
    const foundElements = document.querySelectorAll(combinedSelector);

    foundElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (!htmlEl.dataset.zpilotBlocked) {
        htmlEl.dataset.zpilotBlocked = 'true';
        htmlEl.style.setProperty('display', 'none', 'important');
        htmlEl.style.setProperty('height', '0', 'important');
        blockedCount++;
      }
    });

    // Neutralize intrusive ad iframes
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((ifr) => {
      const src = (ifr.src || ifr.dataset.src || '').toLowerCase();
      if (
        (src.includes('doubleclick') ||
          src.includes('googlesyndication') ||
          src.includes('adnxs') ||
          src.includes('taboola') ||
          src.includes('outbrain') ||
          src.includes('/ads/') ||
          src.includes('adservice') ||
          src.includes('popads')) &&
        !ifr.dataset.zpilotBlocked
      ) {
        ifr.dataset.zpilotBlocked = 'true';
        ifr.style.setProperty('display', 'none', 'important');
        blockedCount++;
      }
    });

    // Neutralize anti-adblock scroll locking
    if (document.body && document.body.style.overflow === 'hidden') {
      const modalShowing = document.querySelector(
        '.fc-ab-root, [class*="adblock-modal"], [class*="adblock-overlay"]'
      );
      if (modalShowing) {
        document.body.style.setProperty('overflow', 'auto', 'important');
      }
    }
  } catch {
    // Ignore DOM query errors on protected nodes
  }

  if (blockedCount > 0) {
    totalBlockedThisPage += blockedCount;
    reportBlockedCount(blockedCount);
  }

  return blockedCount;
}

/**
 * Video Ad Skipper (YouTube / HTML5 video ads)
 * - Detects video pre-roll / mid-roll ad
 * - Mutes audio during the ad
 * - Speeds up video playback to 16x
 * - Immediately jumps to the end of the ad duration
 * - Auto-clicks skip button
 * - Cleanly restores user's normal speed and audio when the real video resumes
 */
export function checkAndSkipVideoAds(): void {
  if (!isShieldActive) return;

  try {
    // 1. YouTube specific player check
    const ytPlayer = document.querySelector('.html5-video-player');
    const isYtAdShowing = ytPlayer && ytPlayer.classList.contains('ad-showing');
    const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');

    if (isYtAdShowing && video) {
      // Ad started playing
      if (!wasAdPlaying) {
        // Save user's playback rate & mute preference before accelerating
        userPlaybackRate = video.playbackRate > 0 && video.playbackRate <= 2.0 ? video.playbackRate : 1.0;
        userMutedState = video.muted;
        wasAdPlaying = true;
      }

      // Mute ad and fast-forward to 16x
      video.muted = true;
      video.playbackRate = 16.0;

      // Skip to the end if duration is valid
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration - 0.1;
      }

      // Auto-click any available skip button
      const skipButtons = document.querySelectorAll<HTMLElement>(
        '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .videoAdUiSkipButton, button.ytp-ad-skip-button-text'
      );
      skipButtons.forEach((btn) => {
        try {
          btn.click();
        } catch {
          // Ignore
        }
      });
    } else if (wasAdPlaying && video) {
      // Ad has finished! Restore user's normal speed & audio
      wasAdPlaying = false;
      video.playbackRate = userPlaybackRate || 1.0;
      video.muted = userMutedState;
    }

    // 2. Also close ad overlay banners on video player
    const overlayCloseButtons = document.querySelectorAll<HTMLElement>(
      '.ytp-ad-overlay-close-button, .ytp-ad-image-overlay button'
    );
    overlayCloseButtons.forEach((btn) => {
      try {
        btn.click();
      } catch {
        // Ignore
      }
    });
  } catch {
    // Ignore
  }
}

/**
 * Report blocked count back to extension storage and sidepanel
 */
function reportBlockedCount(count: number): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({
          type: 'AD_ELEMENTS_BLOCKED',
          count,
          domain: window.location.hostname,
        })
        .catch(() => {});
    }
  } catch {
    // Ignore
  }
}

/**
 * Initialize Z-Shield on the active webpage
 */
export function initAdShield(enabled = true): void {
  isShieldActive = enabled;
  if (!isShieldActive) {
    removeCosmeticShieldStyles();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (videoSkipTimer) {
      clearInterval(videoSkipTimer);
      videoSkipTimer = null;
    }
    return;
  }

  // 1. Inject styles immediately
  injectCosmeticShieldStyles();

  // 2. Initial DOM sweep
  sweepAdElements();

  // 3. Observe dynamic elements (lazy ads)
  if (!observer) {
    observer = new MutationObserver(() => {
      sweepAdElements();
      checkAndSkipVideoAds();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  }

  // 4. Video ad polling interval (every 350ms on video sites)
  if (!videoSkipTimer) {
    videoSkipTimer = setInterval(() => {
      checkAndSkipVideoAds();
    }, 350);
  }
}

export function getPageBlockedCount(): number {
  return totalBlockedThisPage;
}
