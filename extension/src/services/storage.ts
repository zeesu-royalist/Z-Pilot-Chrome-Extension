import { ChatMessage, UserProfile, UserSettings } from '../types/index.js';

const STORAGE_KEYS = {
  MESSAGES: 'zpilot_messages',
  PROFILE: 'zpilot_user_profile',
  SETTINGS: 'zpilot_settings',
};

const DEFAULT_SETTINGS: UserSettings = {
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash-lite',
  theme: 'dark',
  autoReadContext: true,
};

const DEFAULT_PROFILE: UserProfile = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  zipCode: '',
  country: '',
  company: '',
  jobTitle: '',
  website: '',
};

function isExtensionEnvironment(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
}

export const StorageService = {
  async getMessages(): Promise<ChatMessage[]> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.MESSAGES);
        return Array.isArray(result[STORAGE_KEYS.MESSAGES])
          ? result[STORAGE_KEYS.MESSAGES]
          : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.MESSAGES);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      console.warn('[StorageService] Error loading messages, returning empty list:', err);
      return [];
    }
  },

  async saveMessages(messages: ChatMessage[]): Promise<void> {
    try {
      // Sensible limit: keep latest 40 messages to save space
      const capped = messages.slice(-40);
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.MESSAGES]: capped });
      } else {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(capped));
      }
    } catch (err) {
      console.error('[StorageService] Failed to save messages:', err);
    }
  },

  async clearMessages(): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.remove(STORAGE_KEYS.MESSAGES);
      } else {
        localStorage.removeItem(STORAGE_KEYS.MESSAGES);
      }
    } catch (err) {
      console.error('[StorageService] Failed to clear messages:', err);
    }
  },

  async getProfile(): Promise<UserProfile> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.PROFILE);
        return result[STORAGE_KEYS.PROFILE] || DEFAULT_PROFILE;
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.PROFILE);
        return item ? JSON.parse(item) : DEFAULT_PROFILE;
      }
    } catch (err) {
      console.warn('[StorageService] Error loading profile:', err);
      return DEFAULT_PROFILE;
    }
  },

  async saveProfile(profile: UserProfile): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.PROFILE]: profile });
      } else {
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
      }
    } catch (err) {
      console.error('[StorageService] Failed to save profile:', err);
    }
  },

  async getSettings(): Promise<UserSettings> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return item ? { ...DEFAULT_SETTINGS, ...JSON.parse(item) } : DEFAULT_SETTINGS;
      }
    } catch (err) {
      console.warn('[StorageService] Error loading settings:', err);
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
      } else {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      }
    } catch (err) {
      console.error('[StorageService] Failed to save settings:', err);
    }
  },
};
