import { CalculationRecord, ChatMessage, ClipItem, FriendChatMessage, FriendChatSessionState, QuickNote, SavedTranslation, TodoItem, TodoPriority, UserProfile, UserSettings } from '../types/index.js';

const STORAGE_KEYS = {
  MESSAGES: 'zpilot_messages',
  PROFILE: 'zpilot_user_profile',
  SETTINGS: 'zpilot_settings',
  NOTES: 'zpilot_quick_notes',
  TRANSLATIONS: 'zpilot_translations',
  TODOS: 'zpilot_todos',
  CALC_HISTORY: 'zpilot_calc_history',
  Clipboard: 'zpilot_Clipboard_items',
  FRIEND_CHAT_SESSION: 'zpilot_friend_chat_session',
  FRIEND_CHAT_ROOMS_PREFIX: 'zpilot_friend_chat_room_',
  FRIEND_CHAT_ROOMS_LIST: 'zpilot_friend_chat_room_list',
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
  try {
    return (
      typeof chrome !== 'undefined' &&
      !!chrome.runtime &&
      !!chrome.runtime.id &&
      !!chrome.storage &&
      !!chrome.storage.local
    );
  } catch {
    return false;
  }
}

function isContextInvalidatedError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Extension context invalidated') || msg.includes('context invalidated');
}

function logStorageError(action: string, err: unknown): void {
  if (isContextInvalidatedError(err)) {
    // Expected when extension is reloaded/updated while older tabs remain open
    return;
  }
  console.error(`[StorageService] ${action}:`, err);
}

function logStorageWarn(action: string, err: unknown): void {
  if (isContextInvalidatedError(err)) {
    return;
  }
  console.warn(`[StorageService] ${action}:`, err);
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
      logStorageWarn('Error loading messages, returning empty list', err);
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
      logStorageError('Failed to save messages', err);
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
      logStorageError('Failed to clear messages', err);
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
      logStorageWarn('Error loading profile', err);
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
      logStorageError('Failed to save profile', err);
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
      logStorageWarn('Error loading settings', err);
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
      logStorageError('Failed to save settings', err);
    }
  },

  async getNotes(): Promise<QuickNote[]> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.NOTES);
        return Array.isArray(result[STORAGE_KEYS.NOTES]) ? result[STORAGE_KEYS.NOTES] : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.NOTES);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      logStorageWarn('Error loading notes', err);
      return [];
    }
  },

  async saveNotes(notes: QuickNote[]): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: notes });
      } else {
        localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
      }
    } catch (err) {
      logStorageError('Failed to save notes', err);
    }
  },

  async addNote(params: {
    title?: string;
    content: string;
    pageUrl?: string;
    pageTitle?: string;
  }): Promise<QuickNote> {
    const existing = await this.getNotes();
    const now = Date.now();
    const cleanContent = params.content || '';
    const derivedTitle =
      params.title?.trim() ||
      cleanContent.split('\n')[0]?.trim().slice(0, 50) ||
      'Untitled Note';

    const newNote: QuickNote = {
      id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: derivedTitle,
      content: cleanContent,
      createdAt: now,
      updatedAt: now,
      pageUrl: params.pageUrl,
      pageTitle: params.pageTitle,
    };

    const updated = [newNote, ...existing];
    await this.saveNotes(updated);
    return newNote;
  },

  async updateNote(id: string, updates: Partial<QuickNote>): Promise<QuickNote[]> {
    const existing = await this.getNotes();
    const updated = existing.map((n) => {
      if (n.id === id) {
        return {
          ...n,
          ...updates,
          updatedAt: Date.now(),
        };
      }
      return n;
    });
    await this.saveNotes(updated);
    return updated;
  },

  async deleteNote(id: string): Promise<QuickNote[]> {
    const existing = await this.getNotes();
    const updated = existing.filter((n) => n.id !== id);
    await this.saveNotes(updated);
    return updated;
  },

  async getTranslations(): Promise<SavedTranslation[]> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.TRANSLATIONS);
        return Array.isArray(result[STORAGE_KEYS.TRANSLATIONS]) ? result[STORAGE_KEYS.TRANSLATIONS] : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.TRANSLATIONS);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      logStorageWarn('Error loading translations', err);
      return [];
    }
  },

  async saveTranslation(entry: Omit<SavedTranslation, 'id' | 'timestamp'>): Promise<SavedTranslation> {
    const existing = await this.getTranslations();
    const newEntry: SavedTranslation = {
      ...entry,
      id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    const updated = [newEntry, ...existing].slice(0, 200);
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.TRANSLATIONS]: updated });
      } else {
        localStorage.setItem(STORAGE_KEYS.TRANSLATIONS, JSON.stringify(updated));
      }
    } catch (err) {
      logStorageError('Failed to save translation', err);
    }
    return newEntry;
  },

  async deleteTranslation(id: string): Promise<SavedTranslation[]> {
    const existing = await this.getTranslations();
    const updated = existing.filter((t) => t.id !== id);
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.TRANSLATIONS]: updated });
      } else {
        localStorage.setItem(STORAGE_KEYS.TRANSLATIONS, JSON.stringify(updated));
      }
    } catch (err) {
      logStorageError('Failed to delete translation', err);
    }
    return updated;
  },

  async toggleFavTranslation(id: string): Promise<SavedTranslation[]> {
    const existing = await this.getTranslations();
    const updated = existing.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t));
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.TRANSLATIONS]: updated });
      } else {
        localStorage.setItem(STORAGE_KEYS.TRANSLATIONS, JSON.stringify(updated));
      }
    } catch (err) {
      logStorageError('Failed to toggle favorite', err);
    }
    return updated;
  },

  async clearTranslations(): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.remove(STORAGE_KEYS.TRANSLATIONS);
      } else {
        localStorage.removeItem(STORAGE_KEYS.TRANSLATIONS);
      }
    } catch (err) {
      logStorageError('Failed to clear translations', err);
    }
  },

  async getTodos(): Promise<TodoItem[]> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.TODOS);
        return Array.isArray(result[STORAGE_KEYS.TODOS]) ? result[STORAGE_KEYS.TODOS] : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.TODOS);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      logStorageWarn('Error loading todos', err);
      return [];
    }
  },

  async saveTodos(todos: TodoItem[]): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.TODOS]: todos });
      } else {
        localStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(todos));
      }
    } catch (err) {
      logStorageError('Failed to save todos', err);
    }
  },

  async addTodo(params: {
    title: string;
    description?: string;
    dueDate?: number;
    reminderSet?: boolean;
    priority?: TodoPriority;
    pageUrl?: string;
    pageTitle?: string;
  }): Promise<TodoItem> {
    const existing = await this.getTodos();
    const now = Date.now();
    const newTodo: TodoItem = {
      id: `todo_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title: params.title.trim(),
      description: params.description?.trim(),
      completed: false,
      createdAt: now,
      dueDate: params.dueDate,
      reminderSet: !!params.reminderSet && !!params.dueDate,
      notified: false,
      priority: params.priority || 'medium',
      pageUrl: params.pageUrl,
      pageTitle: params.pageTitle,
    };

    const updated = [newTodo, ...existing];
    await this.saveTodos(updated);

    if (newTodo.reminderSet && newTodo.dueDate && newTodo.dueDate > now) {
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        try {
          chrome.alarms.create(`todo_${newTodo.id}`, { when: newTodo.dueDate });
        } catch {
          // ignore
        }
      }
    }

    return newTodo;
  },

  async updateTodo(id: string, updates: Partial<TodoItem>): Promise<TodoItem[]> {
    const existing = await this.getTodos();
    const updated = existing.map((t) => {
      if (t.id === id) {
        const next = { ...t, ...updates };
        if (typeof chrome !== 'undefined' && chrome.alarms) {
          try {
            if (next.completed || !next.reminderSet || !next.dueDate || next.dueDate <= Date.now()) {
              chrome.alarms.clear(`todo_${id}`);
            } else if (next.reminderSet && next.dueDate > Date.now()) {
              chrome.alarms.create(`todo_${id}`, { when: next.dueDate });
            }
          } catch {
            // ignore
          }
        }
        return next;
      }
      return t;
    });

    await this.saveTodos(updated);
    return updated;
  },

  async deleteTodo(id: string): Promise<TodoItem[]> {
    const existing = await this.getTodos();
    const updated = existing.filter((t) => t.id !== id);
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      try {
        chrome.alarms.clear(`todo_${id}`);
      } catch {
        // ignore
      }
    }
    await this.saveTodos(updated);
    return updated;
  },

  async toggleTodo(id: string): Promise<TodoItem[]> {
    const existing = await this.getTodos();
    const target = existing.find((t) => t.id === id);
    if (!target) return existing;
    return this.updateTodo(id, { completed: !target.completed });
  },

  async clearCompletedTodos(): Promise<TodoItem[]> {
    const existing = await this.getTodos();
    const updated = existing.filter((t) => !t.completed);
    await this.saveTodos(updated);
    return updated;
  },

  async getCalculationHistory(): Promise<CalculationRecord[]> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.CALC_HISTORY);
        return Array.isArray(result[STORAGE_KEYS.CALC_HISTORY])
          ? result[STORAGE_KEYS.CALC_HISTORY]
          : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.CALC_HISTORY);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      logStorageWarn('Error loading calculation history', err);
      return [];
    }
  },

  async saveCalculation(
    item: Omit<CalculationRecord, 'id' | 'timestamp'>
  ): Promise<CalculationRecord> {
    const existing = await this.getCalculationHistory();
    const newRecord: CalculationRecord = {
      ...item,
      id: `calc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    const updated = [newRecord, ...existing].slice(0, 100);
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.CALC_HISTORY]: updated });
      } else {
        localStorage.setItem(STORAGE_KEYS.CALC_HISTORY, JSON.stringify(updated));
      }
    } catch (err) {
      logStorageError('Failed to save calculation', err);
    }
    return newRecord;
  },

  async clearCalculationHistory(): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.remove(STORAGE_KEYS.CALC_HISTORY);
      } else {
        localStorage.removeItem(STORAGE_KEYS.CALC_HISTORY);
      }
    } catch (err) {
      logStorageError('Failed to clear calculation history', err);
    }
  },

  // --------------------------------------------------------------------------
  // Clipboard (Automatic Clipboard Capture - Max 10 items)
  // --------------------------------------------------------------------------

  async getClipboardItems(): Promise<ClipItem[]> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.Clipboard);
        const data = result[STORAGE_KEYS.Clipboard];
        return Array.isArray(data) ? data.slice(0, 10) : [];
      } else {
        const raw = localStorage.getItem(STORAGE_KEYS.Clipboard);
        return raw ? (JSON.parse(raw) as ClipItem[]).slice(0, 10) : [];
      }
    } catch (err) {
      logStorageWarn('Failed to get Clipboard items', err);
      return [];
    }
  },

  async saveClipboardItems(items: ClipItem[]): Promise<void> {
    const capped = items.slice(0, 10);
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.Clipboard]: capped });
      } else {
        localStorage.setItem(STORAGE_KEYS.Clipboard, JSON.stringify(capped));
      }
    } catch (err) {
      logStorageError('Failed to save Clipboard items', err);
    }
  },

  async addClipboardItem(
    text: string,
    sourceUrl?: string,
    sourceTitle?: string
  ): Promise<ClipItem[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      return this.getClipboardItems();
    }

    // Limit single clip length to 50,000 characters
    const cleanText = trimmed.length > 50000 ? trimmed.slice(0, 50000) : trimmed;
    const existing = await this.getClipboardItems();

    // Check if item with identical text already exists (MRU deduplication)
    const existingIndex = existing.findIndex((item) => item.text === cleanText);
    let wasPinned = false;

    let filtered = existing;
    if (existingIndex >= 0) {
      wasPinned = !!existing[existingIndex].pinned;
      // Remove previous occurrence so it gets bumped to the top
      filtered = existing.filter((_, idx) => idx !== existingIndex);
    }

    const newItem: ClipItem = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: cleanText,
      timestamp: Date.now(),
      sourceUrl,
      sourceTitle,
      pinned: wasPinned,
    };

    // Newest first, capped strictly at 10 items
    const updated = [newItem, ...filtered].slice(0, 10);
    await this.saveClipboardItems(updated);
    return updated;
  },

  async deleteClipboardItem(id: string): Promise<ClipItem[]> {
    const existing = await this.getClipboardItems();
    const updated = existing.filter((item) => item.id !== id);
    await this.saveClipboardItems(updated);
    return updated;
  },

  async togglePinClipboardItem(id: string): Promise<ClipItem[]> {
    const existing = await this.getClipboardItems();
    const updated = existing.map((item) =>
      item.id === id ? { ...item, pinned: !item.pinned } : item
    );
    await this.saveClipboardItems(updated);
    return updated;
  },

  async clearClipboardItems(preservePinned = false): Promise<void> {
    if (preservePinned) {
      const existing = await this.getClipboardItems();
      const pinnedOnly = existing.filter((item) => item.pinned);
      await this.saveClipboardItems(pinnedOnly);
    } else {
      await this.saveClipboardItems([]);
    }
  },

  // Backwards-compatible aliases for Clipbot
  async getClipbotItems(): Promise<ClipItem[]> {
    return this.getClipboardItems();
  },

  async saveClipbotItems(items: ClipItem[]): Promise<void> {
    return this.saveClipboardItems(items);
  },

  async addClipbotItem(text: string, sourceUrl?: string, sourceTitle?: string): Promise<ClipItem[]> {
    return this.addClipboardItem(text, sourceUrl, sourceTitle);
  },

  async deleteClipbotItem(id: string): Promise<ClipItem[]> {
    return this.deleteClipboardItem(id);
  },

  async togglePinClipbotItem(id: string): Promise<ClipItem[]> {
    return this.togglePinClipboardItem(id);
  },

  async clearClipbotItems(preservePinned = false): Promise<void> {
    return this.clearClipboardItems(preservePinned);
  },

  // ============================================================================
  // Friend Chat (PtoP 4-Digit & Group 3-Digit) Persistent Storage
  // ============================================================================

  async getFriendChatSession(): Promise<FriendChatSessionState | null> {
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(STORAGE_KEYS.FRIEND_CHAT_SESSION);
        return result[STORAGE_KEYS.FRIEND_CHAT_SESSION] || null;
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.FRIEND_CHAT_SESSION);
        return item ? JSON.parse(item) : null;
      }
    } catch (err) {
      logStorageWarn('Error getting friend chat session', err);
      return null;
    }
  },

  async saveFriendChatSession(session: FriendChatSessionState | null): Promise<void> {
    try {
      if (isExtensionEnvironment()) {
        if (session) {
          await chrome.storage.local.set({ [STORAGE_KEYS.FRIEND_CHAT_SESSION]: session });
        } else {
          await chrome.storage.local.remove(STORAGE_KEYS.FRIEND_CHAT_SESSION);
        }
      } else {
        if (session) {
          localStorage.setItem(STORAGE_KEYS.FRIEND_CHAT_SESSION, JSON.stringify(session));
        } else {
          localStorage.removeItem(STORAGE_KEYS.FRIEND_CHAT_SESSION);
        }
      }
    } catch (err) {
      logStorageError('Failed to save friend chat session', err);
    }
  },

  async getFriendChatMessages(pin: string): Promise<FriendChatMessage[]> {
    const cleanPin = pin.trim();
    if (!cleanPin) return [];
    const key = `${STORAGE_KEYS.FRIEND_CHAT_ROOMS_PREFIX}${cleanPin}`;
    try {
      if (isExtensionEnvironment()) {
        const result = await chrome.storage.local.get(key);
        return Array.isArray(result[key]) ? result[key] : [];
      } else {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      logStorageWarn('Error getting friend chat messages for room ' + cleanPin, err);
      return [];
    }
  },

  async saveFriendChatMessages(pin: string, messages: FriendChatMessage[]): Promise<void> {
    const cleanPin = pin.trim();
    if (!cleanPin) return;
    const key = `${STORAGE_KEYS.FRIEND_CHAT_ROOMS_PREFIX}${cleanPin}`;
    // Keep reasonable history: up to latest 500 messages per room
    const capped = messages.slice(-500);
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [key]: capped });
      } else {
        localStorage.setItem(key, JSON.stringify(capped));
      }
      await this.recordRoomPinInList(cleanPin);
    } catch (err) {
      logStorageError('Failed to save friend chat messages for room ' + cleanPin, err);
    }
  },

  async appendFriendChatMessage(pin: string, message: FriendChatMessage): Promise<FriendChatMessage[]> {
    const existing = await this.getFriendChatMessages(pin);
    if (existing.some((m) => m.id === message.id)) {
      return existing;
    }
    const updated = [...existing, message];
    await this.saveFriendChatMessages(pin, updated);
    return updated;
  },

  async getSavedRoomsList(): Promise<string[]> {
    try {
      if (isExtensionEnvironment()) {
        const res = await chrome.storage.local.get(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST);
        return Array.isArray(res[STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST])
          ? res[STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST]
          : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST);
        return item ? JSON.parse(item) : [];
      }
    } catch {
      return [];
    }
  },

  async clearFriendChatMessages(pin: string): Promise<void> {
    const cleanPin = pin.trim();
    if (!cleanPin) return;
    const key = `${STORAGE_KEYS.FRIEND_CHAT_ROOMS_PREFIX}${cleanPin}`;
    try {
      if (isExtensionEnvironment()) {
        await chrome.storage.local.remove(key);
      } else {
        localStorage.removeItem(key);
      }
      // Also remove from saved room list
      let rooms = await this.getSavedRoomsList();
      rooms = rooms.filter((r) => r !== cleanPin);
      if (isExtensionEnvironment()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST]: rooms });
      } else {
        localStorage.setItem(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST, JSON.stringify(rooms));
      }
    } catch (err) {
      logStorageError('Failed to clear room messages', err);
    }
  },

  async recordRoomPinInList(pin: string): Promise<void> {
    try {
      let rooms: string[] = [];
      if (isExtensionEnvironment()) {
        const res = await chrome.storage.local.get(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST);
        rooms = Array.isArray(res[STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST])
          ? res[STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST]
          : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST);
        rooms = item ? JSON.parse(item) : [];
      }
      if (!rooms.includes(pin)) {
        rooms.push(pin);
        if (isExtensionEnvironment()) {
          await chrome.storage.local.set({ [STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST]: rooms });
        } else {
          localStorage.setItem(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST, JSON.stringify(rooms));
        }
      }
    } catch {
      // Ignore
    }
  },

  async clearAllFriendChat(): Promise<void> {
    try {
      let rooms: string[] = [];
      if (isExtensionEnvironment()) {
        const res = await chrome.storage.local.get(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST);
        rooms = Array.isArray(res[STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST])
          ? res[STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST]
          : [];
        const keysToRemove = [
          STORAGE_KEYS.FRIEND_CHAT_SESSION,
          STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST,
          ...rooms.map((r) => `${STORAGE_KEYS.FRIEND_CHAT_ROOMS_PREFIX}${r}`),
        ];
        await chrome.storage.local.remove(keysToRemove);
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST);
        rooms = item ? JSON.parse(item) : [];
        localStorage.removeItem(STORAGE_KEYS.FRIEND_CHAT_SESSION);
        localStorage.removeItem(STORAGE_KEYS.FRIEND_CHAT_ROOMS_LIST);
        rooms.forEach((r) =>
          localStorage.removeItem(`${STORAGE_KEYS.FRIEND_CHAT_ROOMS_PREFIX}${r}`)
        );
      }
    } catch (err) {
      logStorageError('Failed to clear all friend chat data', err);
    }
  },
};
