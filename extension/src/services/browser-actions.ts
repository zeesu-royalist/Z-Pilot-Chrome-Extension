import {
  BrowserAction,
  PageContext,
  ActionResult,
} from '../types/index.js';

// Restricted protocols and domains where extensions cannot run content scripts
const RESTRICTED_PATTERNS = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'brave://',
  'about:',
  'view-source:',
  'chrome.google.com/webstore',
  'chromewebstore.google.com',
];

export function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  return RESTRICTED_PATTERNS.some((pattern) => url.startsWith(pattern) || url.includes(pattern));
}

export const BrowserActionService = {
  /**
   * Get the current active tab in the focused window
   */
  async getActiveTab(): Promise<chrome.tabs.Tab | null> {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return null;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (err) {
      console.warn('[BrowserActions] Error querying active tab:', err);
      return null;
    }
  },

  /**
   * Ensure the content script is active in the specified tab
   */
  async ensureContentScript(tabId: number, url?: string): Promise<boolean> {
    if (isRestrictedUrl(url)) {
      return false;
    }

    try {
      // Test ping
      const res = await new Promise<{ status: string }>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
      if (res && res.status === 'ok') return true;
    } catch {
      // Not yet injected, attempt dynamic injection
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
        // Small delay for script initialization
        await new Promise((r) => setTimeout(r, 200));
        return true;
      } catch (injectErr) {
        console.warn('[BrowserActions] Script injection failed:', injectErr);
        return false;
      }
    }
    return false;
  },

  /**
   * Retrieve page context from active tab
   */
  async getPageContext(tab?: chrome.tabs.Tab): Promise<PageContext | null> {
    const activeTab = tab || (await this.getActiveTab());
    if (!activeTab || !activeTab.id || !activeTab.url) return null;

    if (isRestrictedUrl(activeTab.url)) {
      return {
        url: activeTab.url,
        title: activeTab.title || 'Protected Browser Tab',
        extractedText:
          'This is a protected browser internal page (e.g., settings or extension store). Automated content reading is restricted for security.',
      };
    }

    const scriptReady = await this.ensureContentScript(activeTab.id, activeTab.url);
    if (!scriptReady) {
      return {
        url: activeTab.url,
        title: activeTab.title || 'Page',
        extractedText: 'Could not access the page contents. The page may still be loading or restricted.',
      };
    }

    try {
      const response = await new Promise<PageContext>((resolve, reject) => {
        chrome.tabs.sendMessage(
          activeTab.id!,
          { type: 'GET_PAGE_CONTEXT' },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(res);
            }
          }
        );
      });
      return response;
    } catch (err) {
      console.warn('[BrowserActions] Error requesting page context:', err);
      return {
        url: activeTab.url,
        title: activeTab.title || 'Page',
        extractedText: 'Could not extract page context.',
      };
    }
  },

  /**
   * Helper to wait until a tab finishes loading
   */
  async waitForTabLoaded(tabId: number, timeoutMs = 8000): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          cleanup();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(cleanup, timeoutMs);
    });
  },

  /**
   * Execute a single validated action on the browser
   */
  async executeSingleAction(action: BrowserAction, tabId: number): Promise<ActionResult> {
    try {
      switch (action.type) {
        case 'NAVIGATE': {
          let target = action.targetUrl?.trim();
          if (!target) {
            return { actionId: action.id, type: action.type, success: false, message: 'Target URL is missing' };
          }

          // Immediate security restriction on dangerous or non-web protocols
          const lower = target.toLowerCase();
          if (
            lower.startsWith('javascript:') ||
            lower.startsWith('data:') ||
            lower.startsWith('file:') ||
            lower.startsWith('about:') ||
            lower.startsWith('chrome:') ||
            lower.startsWith('edge:') ||
            lower.startsWith('brave:') ||
            isRestrictedUrl(target)
          ) {
            return {
              actionId: action.id,
              type: action.type,
              success: false,
              message: `Security restriction: Blocked dangerous or internal URL: ${target}`,
            };
          }

          // Auto-prepend https:// only if domain specified without protocol
          if (!target.startsWith('http://') && !target.startsWith('https://')) {
            target = `https://${target}`;
          }

          if (typeof chrome === 'undefined' || !chrome.tabs) {
            return {
              actionId: action.id,
              type: action.type,
              success: false,
              message: 'Chrome Tabs API is unavailable in this environment',
            };
          }

          await chrome.tabs.update(tabId, { url: target });
          await this.waitForTabLoaded(tabId);

          return {
            actionId: action.id,
            type: action.type,
            success: true,
            message: `Navigated to ${target}`,
          };
        }

        case 'SEARCH_WEB': {
          const query = action.query?.trim() || '';
          const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          await chrome.tabs.update(tabId, { url });
          await this.waitForTabLoaded(tabId);

          return {
            actionId: action.id,
            type: action.type,
            success: true,
            message: `Searched Google for "${query}"`,
          };
        }

        case 'SEARCH_YOUTUBE': {
          const query = action.query?.trim() || '';
          const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
          await chrome.tabs.update(tabId, { url });

          // Wait for YouTube results page to finish loading
          await this.waitForTabLoaded(tabId, 5000);
          await new Promise((r) => setTimeout(r, 1000)); // Allow hydration of dynamic items

          // Attempt to find top video and play
          const tab = await chrome.tabs.get(tabId);
          await this.ensureContentScript(tabId, tab.url);

          const ytResult = await new Promise<{ success: boolean; message: string }>((resolve) => {
            chrome.tabs.sendMessage(tabId, { type: 'YOUTUBE_PLAY' }, (res) => {
              if (chrome.runtime.lastError || !res) {
                resolve({ success: true, message: `Opened YouTube search results for "${query}"` });
              } else {
                resolve(res);
              }
            });
          });

          return {
            actionId: action.id,
            type: action.type,
            success: true,
            message: ytResult.message,
          };
        }

        case 'FILL_FORM': {
          if (!action.fields || action.fields.length === 0) {
            return {
              actionId: action.id,
              type: action.type,
              success: false,
              message: 'No form field values provided to fill.',
            };
          }

          const tab = await chrome.tabs.get(tabId);
          await this.ensureContentScript(tabId, tab.url);

          const fillResponse = await new Promise<{
            success: boolean;
            filledCount: number;
            failedFields: Array<{ name: string; reason: string }>;
          }>((resolve, reject) => {
            chrome.tabs.sendMessage(
              tabId,
              { type: 'FILL_FIELDS', fields: action.fields },
              (res) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(res);
                }
              }
            );
          });

          if (fillResponse.success) {
            const summary = `Successfully filled ${fillResponse.filledCount} field(s).${
              fillResponse.failedFields.length > 0
                ? ` (${fillResponse.failedFields.length} field(s) could not be matched)`
                : ''
            }`;
            return {
              actionId: action.id,
              type: action.type,
              success: true,
              message: summary,
              data: fillResponse,
            };
          } else {
            return {
              actionId: action.id,
              type: action.type,
              success: false,
              message: `Could not fill form fields: ${
                fillResponse.failedFields.map((f) => `${f.name} (${f.reason})`).join(', ') || 'No fields matched'
              }`,
              data: fillResponse,
            };
          }
        }

        case 'WAIT_FOR_PAGE': {
          const ms = Math.min(action.milliseconds || 1500, 10000);
          await new Promise((r) => setTimeout(r, ms));
          return {
            actionId: action.id,
            type: action.type,
            success: true,
            message: `Waited ${ms / 1000}s for page`,
          };
        }

        case 'READ_CURRENT_PAGE':
        case 'SUMMARIZE_PAGE': {
          const tab = await chrome.tabs.get(tabId);
          const ctx = await this.getPageContext(tab);
          return {
            actionId: action.id,
            type: action.type,
            success: true,
            message: `Read page: "${ctx?.title || 'Current page'}"`,
            data: ctx,
          };
        }

        case 'REPORT_RESULT': {
          return {
            actionId: action.id,
            type: action.type,
            success: action.success ?? true,
            message: action.message || 'Action sequence completed',
          };
        }

        case 'ASK_USER': {
          return {
            actionId: action.id,
            type: action.type,
            success: true,
            message: action.question || 'Awaiting user input',
          };
        }

        default:
          return {
            actionId: action.id,
            type: action.type,
            success: false,
            message: `Unsupported action type: ${(action as any).type}`,
          };
      }
    } catch (err: unknown) {
      return {
        actionId: action.id,
        type: action.type,
        success: false,
        message: (err as Error).message || 'Action failed unexpectedly',
      };
    }
  },
};
