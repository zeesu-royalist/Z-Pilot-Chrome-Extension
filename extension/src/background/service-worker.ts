/**
 * Z-Pilot Background Service Worker
 * Manages Side Panel behavior, passive network media sniffing,
 * download orchestration, and tab lifecycle.
 */

import { inspectNetworkMedia, TabMediaStore } from '../services/media-sniffer.js';
import {
  autoFillY2matePage,
  Y2MATE_YOUTUBE_URL,
} from '../services/y2mate-autofill.js';
import { StorageService } from '../services/storage.js';
import { AdBlockerService } from '../services/ad-blocker.js';

const SESSION_MEDIA_KEY = 'zpilot_sniffed_media_v2';
const mediaStore = new TabMediaStore(30, 60);
const tabUrlMap = new Map<number, string>();
const activeDownloadToVideoId = new Map<number, string>();
const activeDownloadToFilename = new Map<number, string>();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let isHydrated = false;

async function hydrateMediaStore(): Promise<void> {
  if (isHydrated) return;
  isHydrated = true;
  try {
    if (chrome.storage?.session) {
      const data = await chrome.storage.session.get(SESSION_MEDIA_KEY);
      mediaStore.hydrate(data?.[SESSION_MEDIA_KEY]);
    }
  } catch {
    // Ignore storage.session errors on unsupported environments
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      if (chrome.storage?.session) {
        chrome.storage.session
          .set({
            [SESSION_MEDIA_KEY]: mediaStore.serialize(),
          })
          .catch(() => {});
      }
    } catch {
      // Ignore
    }
  }, 400);
}

function broadcastMessage(payload: Record<string, unknown>): void {
  chrome.runtime.sendMessage(payload).catch(() => {
    // Side panel might be closed
  });
}

function stripUrlHash(rawUrl: string): string {
  const idx = rawUrl.indexOf('#');
  return idx >= 0 ? rawUrl.slice(0, idx) : rawUrl;
}

const ANDROID_UA =
  'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip';
const DNR_YT_ANDROID_PLAYER_RULE_ID = 102;
const DNR_GOOGLEVIDEO_ANDROID_RULE_ID = 103;
const DNR_CDN_REFERER_RULE_ID = 106;

let dnrRulesReady = false;

/**
 * Installs minimal MV3 header rules:
 * - Allows reliable YouTube 360p muxed MP4 playback URLs (?__zp_client=android / c=ANDROID)
 */
async function ensureYouTubeDnrRules(): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateSessionRules) return;
  try {
    const extId = chrome.runtime.id;
    const allRuleIds = [101, 102, 103, 104, 105];
    const rules: chrome.declarativeNetRequest.Rule[] = [
      {
        id: DNR_YT_ANDROID_PLAYER_RULE_ID,
        priority: 2,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'Origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'https://www.youtube.com',
            },
            {
              header: 'Referer',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'https://www.youtube.com/',
            },
            {
              header: 'User-Agent',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: ANDROID_UA,
            },
            {
              header: 'Sec-Ch-Ua',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'Sec-Ch-Ua-Mobile',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'Sec-Ch-Ua-Platform',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'X-Client-Data',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
          ],
        },
        condition: {
          urlFilter: '||youtube.com/youtubei/v1/player*__zp_client=android',
          initiatorDomains: [extId],
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
            chrome.declarativeNetRequest.ResourceType.OTHER,
          ],
        },
      },
      {
        id: DNR_GOOGLEVIDEO_ANDROID_RULE_ID,
        priority: 2,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'Origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'Referer',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'User-Agent',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: ANDROID_UA,
            },
            {
              header: 'Sec-Ch-Ua',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'Sec-Ch-Ua-Mobile',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'Sec-Ch-Ua-Platform',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
            {
              header: 'X-Client-Data',
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
            },
          ],
        },
        condition: {
          urlFilter: '||googlevideo.com/videoplayback*c=ANDROID*',
          initiatorDomains: [extId],
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
            chrome.declarativeNetRequest.ResourceType.OTHER,
            chrome.declarativeNetRequest.ResourceType.MEDIA,
          ],
        },
      },
    ];

    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: allRuleIds,
      addRules: rules,
    });
    dnrRulesReady = true;
  } catch (err) {
    console.warn('[Z-Pilot] Failed to install YouTube DNR rules:', err);
  }
}

const SHARED_CDN_SUFFIXES = [
  'cloudfront.net',
  'amazonaws.com',
  'akamaized.net',
  'fastly.net',
  'edgecastcdn.net',
  'cdn77.org',
  'b-cdn.net',
];

function getCdnHostFilter(mediaHost: string): string {
  const parts = mediaHost.split('.').filter(Boolean);
  if (parts.length >= 3) {
    const rootDomain = parts.slice(-2).join('.');
    if (!SHARED_CDN_SUFFIXES.includes(rootDomain)) {
      return `||${rootDomain}/`;
    }
  }
  return `||${mediaHost}/`;
}

function getRefererRuleIdForFilter(urlFilter: string): number {
  let hash = 0;
  for (let i = 0; i < urlFilter.length; i++) {
    hash = (hash * 31 + urlFilter.charCodeAt(i)) >>> 0;
  }
  return 200 + (hash % 50);
}

async function setDownloadRefererRule(mediaUrl: string, pageUrl: string): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateSessionRules) return;
  try {
    const mediaHost = new URL(mediaUrl).hostname;
    const pageOrigin = new URL(pageUrl).origin;
    if (!mediaHost || mediaHost.includes('googlevideo.com')) return;

    const urlFilter = getCdnHostFilter(mediaHost);
    const ruleId = getRefererRuleIdForFilter(urlFilter);

    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_CDN_REFERER_RULE_ID, ruleId],
      addRules: [
        {
          id: ruleId,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
              {
                header: 'Referer',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: pageUrl,
              },
              {
                header: 'Origin',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: pageOrigin,
              },
            ],
          },
          condition: {
            urlFilter,
            initiatorDomains: [chrome.runtime.id],
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
              chrome.declarativeNetRequest.ResourceType.OTHER,
              chrome.declarativeNetRequest.ResourceType.MEDIA,
            ],
          },
        },
      ],
    });
  } catch {
    // Ignore invalid URLs
  }
}

// Hydrate immediately when worker wakes up
hydrateMediaStore();
ensureYouTubeDnrRules();
AdBlockerService.syncDnrRules();

// Configure the side panel to open on action button click
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Z-Pilot] Extension installed / updated.');
  ensureYouTubeDnrRules();
  AdBlockerService.syncDnrRules();

  // Auto-inject content script into open tabs so user doesn't have to reload existing tabs
  if (chrome.tabs && chrome.scripting) {
    chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.scripting
            .executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            })
            .catch(() => {});
        }
      }
    }).catch(() => {});
  }

  if (chrome.sidePanel && 'setPanelBehavior' in chrome.sidePanel) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => {
        console.warn('[Z-Pilot] Could not set sidePanel behavior:', err);
      });
  }
});

// Fallback click handler if setPanelBehavior is not available
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && 'open' in chrome.sidePanel && tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn('[Z-Pilot] Error opening side panel on click:', err);
    }
  }
});

// ============================================================================
// Passive Network Media Sniffer (Zero-overhead O(1) header & URL inspection)
// ============================================================================

if (chrome.webRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId < 0) return;
      if (details.initiator?.startsWith('chrome-extension://')) return;
      if (details.method && details.method !== 'GET') return;
      const lower = details.url.toLowerCase();
      // Fast pre-check before URL parsing for streaming manifests (.m3u8 / .mpd)
      if (!lower.includes('.m3u8') && !lower.includes('.mpd')) {
        return;
      }

      const entry = inspectNetworkMedia({
        url: details.url,
        tabId: details.tabId,
      });

      if (entry) {
        const added = mediaStore.add(entry);
        schedulePersist();
        if (added) {
          broadcastMessage({
            type: 'SNIFFED_MEDIA_UPDATED',
            tabId: details.tabId,
            count: mediaStore.count(details.tabId),
          });
        }
      }
    },
    {
      urls: ['<all_urls>'],
      types: ['media', 'xmlhttprequest', 'other', 'sub_frame'],
    }
  );

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId < 0 || !details.responseHeaders) return;
      if (details.initiator?.startsWith('chrome-extension://')) return;
      if (details.method && details.method !== 'GET') return;
      if (details.statusCode && details.statusCode >= 400) return;

      let contentType: string | undefined;
      let contentLength: number | undefined;

      for (let i = 0; i < details.responseHeaders.length; i++) {
        const header = details.responseHeaders[i];
        const name = header.name.toLowerCase();
        if (name === 'content-type' && header.value) {
          contentType = header.value;
        } else if (name === 'content-length' && header.value) {
          const parsed = Number(header.value);
          if (Number.isFinite(parsed)) contentLength = parsed;
        }
      }

      const entry = inspectNetworkMedia({
        url: details.url,
        tabId: details.tabId,
        contentType,
        contentLength,
      });

      if (entry) {
        const added = mediaStore.add(entry);
        schedulePersist();
        if (added) {
          broadcastMessage({
            type: 'SNIFFED_MEDIA_UPDATED',
            tabId: details.tabId,
            count: mediaStore.count(details.tabId),
          });
        }
      }
    },
    {
      urls: ['<all_urls>'],
      types: ['media', 'xmlhttprequest', 'other', 'sub_frame'],
    },
    ['responseHeaders']
  );
}

// ============================================================================
// Tab Lifecycle Management
// ============================================================================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      tabUrlMap.set(activeInfo.tabId, stripUrlHash(tab.url));
      broadcastMessage({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      });
    }
  } catch {
    // Tab might have been closed immediately
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const cleanNew = stripUrlHash(changeInfo.url);
    const prev = tabUrlMap.get(tabId);
    if (prev && prev !== cleanNew) {
      // Clear stale sniffed streams when navigating to a new page
      mediaStore.clearTab(tabId);
      schedulePersist();
      broadcastMessage({
        type: 'SNIFFED_MEDIA_UPDATED',
        tabId,
        count: 0,
      });
    }
    tabUrlMap.set(tabId, cleanNew);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabUrlMap.delete(tabId);
  mediaStore.clearTab(tabId);
  schedulePersist();
});

// ============================================================================
// Native Chrome Downloads Progress Tracking
// ============================================================================

if (chrome.downloads?.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const intended = activeDownloadToFilename.get(item.id);
    if (intended) {
      suggest({ filename: intended, conflictAction: 'uniquify' });
      return true;
    }
  });
}

if (chrome.downloads?.onChanged) {
  chrome.downloads.onChanged.addListener((delta) => {
    const videoId = activeDownloadToVideoId.get(delta.id);
    if (!videoId) return;

    chrome.downloads.search({ id: delta.id }, (items) => {
      const item = items?.[0];
      if (!item) return;

      const bytesDownloaded = item.bytesReceived || 0;
      const totalBytes = item.totalBytes > 0 ? item.totalBytes : undefined;
      const percent = totalBytes
        ? Math.min(100, Math.round((bytesDownloaded / totalBytes) * 100))
        : -1;

      let status: 'downloading' | 'completed' | 'failed' | 'cancelled' = 'downloading';
      let message: string | undefined;

      if (item.state === 'complete') {
        const isInvalidText = item.mime?.startsWith('text/') || item.filename?.endsWith('.txt');
        const isTooSmall = item.fileSize > 0 && item.fileSize < 512;
        if (isInvalidText || isTooSmall) {
          status = 'failed';
          message = 'Server returned an invalid/restricted response instead of video';
        } else {
          status = 'completed';
        }
        activeDownloadToVideoId.delete(delta.id);
        activeDownloadToFilename.delete(delta.id);
      } else if (item.state === 'interrupted') {
        if (item.error === 'USER_CANCELED') {
          status = 'cancelled';
          message = 'Download cancelled';
        } else {
          status = 'failed';
          message = item.error || 'Download interrupted';
        }
        activeDownloadToVideoId.delete(delta.id);
        activeDownloadToFilename.delete(delta.id);
      }

      broadcastMessage({
        type: 'DOWNLOAD_PROGRESS',
        progress: {
          videoId,
          status,
          percent: status === 'completed' ? 100 : percent,
          bytesDownloaded,
          totalBytes,
          message,
          chromeDownloadId: delta.id,
        },
      });
    });
  });
}

// ============================================================================
// Runtime Message API for Side Panel
// ============================================================================

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.type) {
    case 'CLIPBOT_COPY': {
      const { text, sourceUrl, sourceTitle } = request as {
        text?: string;
        sourceUrl?: string;
        sourceTitle?: string;
      };
      if (text && typeof text === 'string' && text.trim().length > 0) {
        StorageService.addClipbotItem(text, sourceUrl, sourceTitle)
          .then((items) => {
            broadcastMessage({ type: 'CLIPBOT_UPDATED', items });
            sendResponse({ ok: true, count: items.length });
          })
          .catch(() => sendResponse({ ok: false }));
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }

    case 'ENSURE_YT_DNR_RULES': {
      if (dnrRulesReady) {
        sendResponse({ ok: true });
        return false;
      }
      ensureYouTubeDnrRules().then(() => sendResponse({ ok: true }));
      return true;
    }

    case 'SET_DOWNLOAD_REFERER_RULE': {
      const { mediaUrl, pageUrl } = request as { mediaUrl?: string; pageUrl?: string };
      if (mediaUrl && pageUrl) {
        setDownloadRefererRule(mediaUrl, pageUrl).then(() => sendResponse({ ok: true }));
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }

    case 'GET_SNIFFED_MEDIA': {
      hydrateMediaStore().then(() => {
        const tabId = Number(request.tabId);
        sendResponse({
          entries: Number.isFinite(tabId) ? mediaStore.get(tabId) : [],
        });
      });
      return true;
    }

    case 'GET_SNIFFED_COUNT': {
      hydrateMediaStore().then(() => {
        const tabId = Number(request.tabId);
        sendResponse({
          count: Number.isFinite(tabId) ? mediaStore.count(tabId) : 0,
        });
      });
      return true;
    }

    case 'CLEAR_SNIFFED_MEDIA': {
      const tabId = Number(request.tabId);
      if (Number.isFinite(tabId)) {
        mediaStore.clearTab(tabId);
        schedulePersist();
      }
      sendResponse({ ok: true });
      return false;
    }

    case 'START_VIDEO_DOWNLOAD': {
      const { url, filename, videoId } = request as {
        url: string;
        filename: string;
        videoId: string;
      };

      if (!chrome.downloads) {
        sendResponse({ success: false, error: 'Chrome downloads API is unavailable.' });
        return false;
      }

      const cleanFilename = (filename || 'video.mp4')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\//, '')
        .trim();

      chrome.downloads.download(
        {
          url,
          filename: cleanFilename,
          conflictAction: 'uniquify',
          saveAs: false,
        },
        (downloadId) => {
          if (chrome.runtime.lastError || !downloadId) {
            // If Chrome rejected nested folder path, retry with flat filename
            const flatFilename = cleanFilename.split('/').pop() || 'video.mp4';
            if (flatFilename !== cleanFilename) {
              chrome.downloads.download(
                { url, filename: flatFilename, conflictAction: 'uniquify', saveAs: false },
                (retryId) => {
                  if (chrome.runtime.lastError || !retryId) {
                    sendResponse({
                      success: false,
                      error: chrome.runtime.lastError?.message || 'Failed to initiate download',
                    });
                  } else {
                    if (videoId) activeDownloadToVideoId.set(retryId, videoId);
                    activeDownloadToFilename.set(retryId, flatFilename);
                    sendResponse({ success: true, downloadId: retryId });
                  }
                }
              );
              return;
            }

            sendResponse({
              success: false,
              error: chrome.runtime.lastError?.message || 'Failed to initiate download',
            });
            return;
          }
          if (videoId) {
            activeDownloadToVideoId.set(downloadId, videoId);
          }
          activeDownloadToFilename.set(downloadId, cleanFilename);
          sendResponse({ success: true, downloadId });
        }
      );
      return true;
    }

    case 'OPEN_Y2MATE_WITH_URL':
    case 'OPEN_SAVEFROM_WITH_URL': {
      const { targetVideoUrl } = request as { targetVideoUrl?: string };
      if (!targetVideoUrl || !/^https?:\/\//i.test(targetVideoUrl)) {
        sendResponse({ success: false, error: 'Invalid video URL' });
        return false;
      }

      const destinationUrl = `${Y2MATE_YOUTUBE_URL}#url=${encodeURIComponent(targetVideoUrl)}`;

      (async () => {
        try {
          const createdTab = await chrome.tabs.create({ url: destinationUrl, active: true });
          const targetTabId = createdTab.id;
          if (!targetTabId) {
            sendResponse({ success: false, error: 'Failed to open Y2mate tab' });
            return;
          }

          let settled = false;
          let timerId: ReturnType<typeof setTimeout> | null = null;

          const cleanup = () => {
            if (timerId) {
              clearTimeout(timerId);
              timerId = null;
            }
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onRemoved.removeListener(onRemoved);
          };

          const runAutofill = async () => {
            if (settled) return;
            settled = true;
            cleanup();
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                func: autoFillY2matePage,
                args: [targetVideoUrl],
              });
              const res = results?.[0]?.result as
                | { filled?: boolean; submitted?: boolean }
                | undefined;
              sendResponse({
                success: true,
                filled: Boolean(res?.filled),
                submitted: Boolean(res?.submitted),
              });
            } catch (err) {
              sendResponse({
                success: true,
                filled: false,
                submitted: false,
                error: err instanceof Error ? err.message : 'Autofill skipped',
              });
            }
          };

          const onUpdated = (
            updatedTabId: number,
            changeInfo: chrome.tabs.TabChangeInfo
          ) => {
            if (updatedTabId === targetTabId && changeInfo.status === 'complete') {
              void runAutofill();
            }
          };

          const onRemoved = (removedTabId: number) => {
            if (removedTabId === targetTabId && !settled) {
              settled = true;
              cleanup();
              sendResponse({ success: false, error: 'Tab closed before loading' });
            }
          };

          chrome.tabs.onUpdated.addListener(onUpdated);
          chrome.tabs.onRemoved.addListener(onRemoved);

          timerId = setTimeout(() => {
            if (!settled) {
              settled = true;
              cleanup();
              sendResponse({ success: true, filled: false, submitted: false });
            }
          }, 20000);

          const latestTab = await chrome.tabs.get(targetTabId).catch(() => null);
          if (latestTab?.status === 'complete') {
            void runAutofill();
          }
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : 'Failed to open Y2mate',
          });
        }
      })();

      return true;
    }

    case 'CANCEL_VIDEO_DOWNLOAD': {
      const { downloadId } = request as { downloadId: number };
      if (chrome.downloads && downloadId) {
        chrome.downloads.cancel(downloadId, () => {
          activeDownloadToVideoId.delete(downloadId);
          activeDownloadToFilename.delete(downloadId);
          sendResponse({ ok: true });
        });
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }

    case 'AD_ELEMENTS_BLOCKED': {
      const { count } = request as { count: number };
      if (typeof count === 'number' && count > 0) {
        AdBlockerService.incrementBlockedCount(count);
      }
      sendResponse({ ok: true });
      return false;
    }

    default:
      return false;
  }
});

// ============================================================================
// TODO & REMINDER NOTIFICATIONS (chrome.alarms + chrome.notifications)
// ============================================================================

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith('todo_')) {
      const todoId = alarm.name.replace('todo_', '');
      try {
        const result = await chrome.storage.local.get('zpilot_todos');
        const todos = Array.isArray(result.zpilot_todos) ? result.zpilot_todos : [];
        const todo = todos.find((t: { id: string }) => t.id === todoId);
        if (todo && !todo.completed && !todo.notified) {
          if (chrome.notifications) {
            chrome.notifications.create(`notif_${todo.id}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: '⏰ Z-Pilot Task Reminder',
              message: todo.title + (todo.description ? ` - ${todo.description}` : ''),
              priority: 2,
              requireInteraction: true,
            });
          }
          const updated = todos.map((t: { id: string }) =>
            t.id === todoId ? { ...t, notified: true } : t
          );
          await chrome.storage.local.set({ zpilot_todos: updated });
          broadcastMessage({ type: 'TODO_REMINDER_ALERT', todo });
        }
      } catch (err) {
        console.error('[ServiceWorker] Alarm handling error:', err);
      }
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId.startsWith('notif_')) {
      chrome.notifications.clear(notifId);
    }
  });
}
