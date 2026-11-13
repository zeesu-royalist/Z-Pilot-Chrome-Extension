/**
 * Z-Pilot Ad Blocker Service (Z-Shield)
 * Manages declarative network blocking, cosmetic element hiding rules,
 * site whitelisting, and block count statistics.
 */

import { AdBlockerSettings } from '../types/index.js';
import { buildAdBlockerDnrRules, AD_BLOCKER_RULE_ID_START, AD_DOMAINS_BLOCKLIST } from './ad-blocker-rules.js';

const STORAGE_KEY = 'zpilot_adblocker_settings';

export const DEFAULT_AD_BLOCKER_SETTINGS: AdBlockerSettings = {
  enabled: true,
  blockCosmetic: true,
  skipVideoAds: true,
  whitelistedDomains: [],
  totalBlockedCount: 0,
};

function isExtensionEnvironment(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

export const AdBlockerService = {
  /**
   * Load current Ad Blocker settings
   */
  async getSettings(): Promise<AdBlockerSettings> {
    try {
      if (isExtensionEnvironment()) {
        const res = await chrome.storage.local.get(STORAGE_KEY);
        return {
          ...DEFAULT_AD_BLOCKER_SETTINGS,
          ...(res[STORAGE_KEY] || {}),
        };
      } else {
        const item = localStorage.getItem(STORAGE_KEY);
        return item ? { ...DEFAULT_AD_BLOCKER_SETTINGS, ...JSON.parse(item) } : DEFAULT_AD_BLOCKER_SETTINGS;
      }
    } catch (err) {
      console.warn('[AdBlocker] Failed to load settings:', err);
      return DEFAULT_AD_BLOCKER_SETTINGS;
    }
  },

  /**
   * Save Ad Blocker settings and sync DNR rules
   */
  async saveSettings(settings: AdBlockerSettings): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEY]: settings });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      }
      await this.syncDnrRules(settings);
    } catch (err) {
      console.error('[AdBlocker] Failed to save settings:', err);
    }
  },

  /**
   * Toggle global Ad Blocker on / off
   */
  async toggleEnabled(): Promise<boolean> {
    const current = await this.getSettings();
    const nextState = !current.enabled;
    current.enabled = nextState;
    await this.saveSettings(current);
    return nextState;
  },

  /**
   * Check if a specific hostname is whitelisted
   */
  async isDomainWhitelisted(domain: string): Promise<boolean> {
    if (!domain) return false;
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    const settings = await this.getSettings();
    return settings.whitelistedDomains.includes(cleanDomain);
  },

  /**
   * Toggle whitelist status for a specific hostname
   */
  async toggleDomainWhitelist(domain: string): Promise<boolean> {
    if (!domain) return false;
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    const settings = await this.getSettings();
    const list = new Set(settings.whitelistedDomains);

    let isNowWhitelisted = false;
    if (list.has(cleanDomain)) {
      list.delete(cleanDomain);
      isNowWhitelisted = false;
    } else {
      list.add(cleanDomain);
      isNowWhitelisted = true;
    }

    settings.whitelistedDomains = Array.from(list);
    await this.saveSettings(settings);
    return isNowWhitelisted;
  },

  /**
   * Increment all-time blocked ad count
   */
  async incrementBlockedCount(count = 1): Promise<number> {
    const settings = await this.getSettings();
    settings.totalBlockedCount = (settings.totalBlockedCount || 0) + count;
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEY]: settings });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      }
    } catch {
      // Ignore
    }
    return settings.totalBlockedCount;
  },

  /**
   * Synchronize Chrome Declarative Net Request rules based on current settings
   */
  async syncDnrRules(settings?: AdBlockerSettings): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest?.updateDynamicRules) {
      return;
    }

    const currentSettings = settings || (await this.getSettings());

    try {
      let ruleIdsToRemove: number[] = [];
      if (chrome.declarativeNetRequest.getDynamicRules) {
        const existing = await chrome.declarativeNetRequest.getDynamicRules();
        ruleIdsToRemove = existing
          .map((r) => r.id)
          .filter((id) => id >= AD_BLOCKER_RULE_ID_START && id < AD_BLOCKER_RULE_ID_START + 5000);
      } else {
        ruleIdsToRemove = AD_DOMAINS_BLOCKLIST.map((_, i) => AD_BLOCKER_RULE_ID_START + i);
      }

      if (!currentSettings.enabled) {
        // Disabled: remove all rules
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: ruleIdsToRemove,
        });
        return;
      }

      // Enabled: construct rules with initiator domain exclusions (whitelisted domains)
      const rules = buildAdBlockerDnrRules();

      if (currentSettings.whitelistedDomains.length > 0) {
        rules.forEach((r) => {
          r.condition.excludedInitiatorDomains = currentSettings.whitelistedDomains;
        });
      }

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIdsToRemove,
        addRules: rules,
      });
    } catch (err) {
      console.warn('[AdBlocker] Error syncing DNR dynamic rules:', err);
    }
  },
};

