/**
 * Z-Pilot Instant Peer Chat Service
 * - 100% Zero-Config: Same Wi-Fi / Local Network / Internet.
 * - 2 Chat Modes:
 *   1) Person to Person (PtoP): Single 1-on-1 direct chat with a 4-Digit PIN (e.g. 7823)
 *   2) Group Chat: Multi-person group room with a 3-Digit PIN (e.g. 482)
 * - Persistent across panel/window closes: Connection stays active, chats persist in browser storage until explicitly cleared.
 * - Native Chrome & Web Notifications for incoming messages.
 * - Live real-time stream (ntfy public relay with X-Cache: no) + BroadcastChannel.
 */

import { FriendChatMessage, FriendChatMode, FriendChatSessionState } from '../types/index.js';
import { StorageService } from './storage.js';

export type ChatMode = FriendChatMode;
export type InstantChatMessage = FriendChatMessage;

export type ChatSignalType = 'JOIN' | 'ACK' | 'MESSAGE' | 'ACK_MSG' | 'PING' | 'LEAVE';

export interface ParticipantInfo {
  id: string;
  name: string;
  lastSeen: number;
  isOnline: boolean;
}

interface SignalPayload {
  type: ChatSignalType;
  id?: string;
  senderId: string;
  senderName: string;
  text?: string;
  timestamp: number;
  mode?: ChatMode;
  roomPin?: string;
}

// High-capacity, zero-signup public relays with multi-instance redundancy.
// ntfy.envs.net & ntfy.adminforge.de provide 17,280 msgs/day quota each with full SSE streaming.
export const RELAY_SERVERS = [
  'https://ntfy.envs.net',
  'https://ntfy.adminforge.de',
  'https://ntfy.sh',
];

// Pleasant, subtle sound chime when message arrives (pure Web Audio API, 0 assets)
export function playChatChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Audio might be restricted without user interaction
  }
}

// Show native Chrome notification or Web Notification when chat message arrives
export function showChatNotification(
  senderName: string,
  text: string,
  roomPin: string,
  mode: ChatMode = 'ptop'
): void {
  const isGroup = mode === 'group' || roomPin.trim().length === 3;
  const title = isGroup
    ? `💬 Group Chat #${roomPin} - ${senderName}`
    : `💬 ${senderName} (Friend Chat)`;

  // 1. Chrome extension native notification
  try {
    if (typeof chrome !== 'undefined') {
      if (chrome.notifications && chrome.notifications.create) {
        const iconUrl =
          typeof chrome.runtime?.getURL === 'function'
            ? chrome.runtime.getURL('icons/icon128.png')
            : 'icons/icon128.png';

        chrome.notifications.create(
          `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          {
            type: 'basic',
            iconUrl,
            title,
            message: text.slice(0, 160),
            priority: 2,
          },
          () => {
            if (chrome.runtime?.lastError && chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage({
                type: 'SHOW_CHAT_NOTIFICATION',
                title,
                message: text.slice(0, 160),
              }).catch(() => {});
            }
          }
        );
        return;
      } else if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SHOW_CHAT_NOTIFICATION',
          title,
          message: text.slice(0, 160),
        }).catch(() => {});
        return;
      }
    }
  } catch {
    // Fallback
  }

  // 2. Web Notification fallback
  try {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body: text.slice(0, 160),
          icon: 'icons/icon128.png',
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          if (perm === 'granted') {
            new Notification(title, {
              body: text.slice(0, 160),
              icon: 'icons/icon128.png',
            });
          }
        });
      }
    }
  } catch {
    // Ignore
  }
}

// Generate a random PIN: 4-digit for PtoP (1000 - 9999), 3-digit for Group (100 - 999)
export function generateRoomPin(mode: ChatMode = 'ptop'): string {
  if (mode === 'group') {
    return String(Math.floor(100 + Math.random() * 900));
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Generate / get persistent session user ID (stored in localStorage across sessions)
export function getSessionUserId(): string {
  const key = 'zpilot_chat_persistent_uid';
  let uid = '';
  try {
    uid = localStorage.getItem(key) || '';
  } catch {
    // Ignore
  }
  if (!uid) {
    uid = 'user_' + Math.random().toString(36).slice(2, 9);
    try {
      localStorage.setItem(key, uid);
    } catch {
      // Ignore
    }
  }
  return uid;
}

// Get or set default display name
export function getSavedDisplayName(): string {
  try {
    return localStorage.getItem('zpilot_chat_display_name') || 'Friend';
  } catch {
    return 'Friend';
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem('zpilot_chat_display_name', name.trim() || 'Friend');
  } catch {
    // Ignore
  }
}

// Room topic naming pattern (namespaced for PtoP vs Group)
export function getTopicName(pin: string, mode?: ChatMode): string {
  const clean = pin.trim();
  const isGroup = mode ? mode === 'group' : clean.length === 3;
  if (isGroup) {
    return `zpilot_chat_grp_${clean}`;
  }
  return `zpilot_chat_v2_${clean}`;
}

/**
 * InstantChatSession manages the live connection for a room.
 */
export class InstantChatSession {
  private pin: string;
  private mode: ChatMode;
  private topic: string;
  private myId: string;
  private myName: string;
  private eventSource: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private lastPartnerActivity = 0;
  private lastOutgoingActivity = 0;
  private seenMessageIds: Set<string> = new Set();
  private participantsMap: Map<string, ParticipantInfo> = new Map();
  private activeRelayIndex = 0;

  private onMessageCallback: ((msg: InstantChatMessage) => void) | null = null;
  private onMessageDeliveredCallback: ((msgId: string) => void) | null = null;
  private onPartnerPresenceCallback: ((partnerName: string, isOnline: boolean) => void) | null = null;
  private onParticipantsUpdateCallback: ((participants: ParticipantInfo[]) => void) | null = null;
  private onClosedCallback: ((reason: string) => void) | null = null;
  private isDestroyed = false;

  constructor(pin: string, myName: string, mode?: ChatMode) {
    this.pin = pin.trim();
    this.mode = mode || (this.pin.length === 3 ? 'group' : 'ptop');
    this.topic = getTopicName(this.pin, this.mode);
    // Base persistent user ID + randomized instance suffix so multiple windows/tabs on the SAME computer can chat!
    this.myId = `${getSessionUserId()}_${Math.random().toString(36).slice(2, 7)}`;
    this.myName = myName.trim() || 'Friend';
  }

  public getPin(): string {
    return this.pin;
  }

  public getMode(): ChatMode {
    return this.mode;
  }

  /**
   * Connect to the room via live SSE stream + local BroadcastChannel
   */
  public connect(
    onMessage: (msg: InstantChatMessage) => void,
    onDelivered: (msgId: string) => void,
    onPresence: (partnerName: string, isOnline: boolean) => void,
    onClosed: (reason: string) => void,
    onParticipantsUpdate?: (participants: ParticipantInfo[]) => void
  ): void {
    this.onMessageCallback = onMessage;
    this.onMessageDeliveredCallback = onDelivered;
    this.onPartnerPresenceCallback = onPresence;
    this.onClosedCallback = onClosed;
    this.onParticipantsUpdateCallback = onParticipantsUpdate || null;

    // 1. Local BroadcastChannel for same-browser / multi-window instant sync
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(`zpilot_bc_${this.mode}_${this.pin}`);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingPayload(event.data);
        };
      }
    } catch (err) {
      console.warn('[InstantChat] BroadcastChannel not supported:', err);
    }

    // 2. High-capacity SSE relay for cross-machine / Wi-Fi real-time streaming
    this.connectEventSource(0);

    // Initial handshake retry: if no partner response after 1.5s, send one retry JOIN
    setTimeout(() => {
      if (!this.isDestroyed && this.lastPartnerActivity === 0) {
        this.sendJoinHandshake();
      }
    }, 1500);

    // Smart Heartbeat: Every 30s, ONLY if no outgoing activity in last 25s (prevents quota burn)
    this.pingInterval = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();
      if (now - this.lastOutgoingActivity < 25000 && this.lastPartnerActivity > 0) {
        return; // Presence already kept active by recent message
      }
      this.broadcastSignal({
        type: 'PING',
        senderId: this.myId,
        senderName: this.myName,
        timestamp: now,
        mode: this.mode,
        roomPin: this.pin,
      });
    }, 30000);

    // Watchdog: 60s timeout for partner activity
    this.watchdogInterval = setInterval(() => {
      if (this.isDestroyed) return;
      const now = Date.now();

      // Check PtoP partner activity (60s timeout)
      if (this.lastPartnerActivity > 0 && now - this.lastPartnerActivity > 60000) {
        this.onPartnerPresenceCallback?.('Friend', false);
      }

      // Check Group participants activity
      let updatedParticipants = false;
      this.participantsMap.forEach((info) => {
        if (info.isOnline && now - info.lastSeen > 60000) {
          info.isOnline = false;
          updatedParticipants = true;
        }
      });
      if (updatedParticipants) {
        this.emitParticipants();
      }
    }, 5000);
  }

  private sendJoinHandshake(): void {
    if (this.isDestroyed) return;
    this.broadcastSignal({
      type: 'JOIN',
      senderId: this.myId,
      senderName: this.myName,
      timestamp: Date.now(),
      mode: this.mode,
      roomPin: this.pin,
    });
  }

  private connectEventSource(serverIndex = 0): void {
    if (this.isDestroyed || typeof EventSource === 'undefined') return;
    this.activeRelayIndex = serverIndex % RELAY_SERVERS.length;
    const currentServer = RELAY_SERVERS[this.activeRelayIndex];
    const sseUrl = `${currentServer}/${this.topic}/sse`;

    try {
      if (this.eventSource) {
        try {
          this.eventSource.close();
        } catch {
          // Ignore
        }
        this.eventSource = null;
      }

      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.sendJoinHandshake();
      };

      this.eventSource.onmessage = (event) => {
        try {
          if (!event.data || event.data === '') return;
          const raw = JSON.parse(event.data);
          if (!raw || raw.event === 'open' || !raw.message) return;

          let payload: SignalPayload;
          if (typeof raw.message === 'string') {
            payload = JSON.parse(raw.message);
          } else if (typeof raw.message === 'object') {
            payload = raw.message as SignalPayload;
          } else {
            return;
          }

          if (payload && typeof payload === 'object' && payload.type && payload.senderId) {
            this.handleIncomingPayload(payload);
          }
        } catch {
          // Ignore malformed packets
        }
      };

      this.eventSource.onerror = () => {
        if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
          try {
            this.eventSource.close();
          } catch {
            // Ignore
          }
          this.eventSource = null;
          if (!this.isDestroyed) {
            setTimeout(() => {
              if (!this.isDestroyed && !this.eventSource) {
                this.connectEventSource(serverIndex + 1);
              }
            }, 2000);
          }
        }
      };
    } catch (err) {
      console.warn('[InstantChat] SSE connect error on', sseUrl, err);
      if (!this.isDestroyed) {
        setTimeout(() => this.connectEventSource(serverIndex + 1), 2000);
      }
    }
  }

  /**
   * Send a chat text message
   */
  public async sendTextMessage(text: string): Promise<InstantChatMessage> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Message cannot be empty');
    }
    if (trimmed.length > 2000) {
      throw new Error('Message too long (max 2000 characters)');
    }

    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    if (this.seenMessageIds.size > 2000) {
      this.seenMessageIds.clear();
    }
    this.seenMessageIds.add(msgId);

    const message: InstantChatMessage = {
      id: msgId,
      text: trimmed,
      senderId: this.myId,
      senderName: this.myName,
      timestamp: Date.now(),
      isMine: true,
      delivered: false,
      mode: this.mode,
      roomPin: this.pin,
    };

    const payload: SignalPayload = {
      type: 'MESSAGE',
      id: msgId,
      senderId: this.myId,
      senderName: this.myName,
      text: trimmed,
      timestamp: message.timestamp,
      mode: this.mode,
      roomPin: this.pin,
    };

    // Broadcast across both channels
    await this.broadcastSignal(payload);

    return message;
  }

  /**
   * Update current user's display name
   */
  public updateName(newName: string): void {
    this.myName = newName.trim() || 'Friend';
    saveDisplayName(this.myName);
    this.broadcastSignal({
      type: 'PING',
      senderId: this.myId,
      senderName: this.myName,
      timestamp: Date.now(),
      mode: this.mode,
      roomPin: this.pin,
    });
  }

  /**
   * Disconnect and wipe session
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Send departure notice to local windows immediately before closing channel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'LEAVE',
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
          mode: this.mode,
          roomPin: this.pin,
        });
        this.broadcastChannel.close();
      } catch {
        // Ignore
      }
      this.broadcastChannel = null;
    }

    // Send departure notice to peers over network
    this.broadcastSignal({
      type: 'LEAVE',
      senderId: this.myId,
      senderName: this.myName,
      timestamp: Date.now(),
      mode: this.mode,
      roomPin: this.pin,
    }).catch(() => {});

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // Ignore
      }
      this.eventSource = null;
    }

    this.seenMessageIds.clear();
    this.participantsMap.clear();
  }

  private recordParticipantActivity(senderId: string, senderName: string): void {
    if (!senderId || senderId === this.myId) return;
    const existing = this.participantsMap.get(senderId);
    if (!existing) {
      this.participantsMap.set(senderId, {
        id: senderId,
        name: senderName || 'Friend',
        lastSeen: Date.now(),
        isOnline: true,
      });
      this.emitParticipants();
    } else {
      const nameChanged = Boolean(senderName && senderName !== existing.name);
      if (senderName) existing.name = senderName;
      existing.lastSeen = Date.now();
      if (!existing.isOnline || nameChanged) {
        existing.isOnline = true;
        this.emitParticipants();
      }
    }
  }

  private emitParticipants(): void {
    if (this.onParticipantsUpdateCallback) {
      this.onParticipantsUpdateCallback(Array.from(this.participantsMap.values()));
    }
  }

  /**
   * Internal dispatcher for incoming packets from SSE or BroadcastChannel
   */
  private handleIncomingPayload(payload: SignalPayload): void {
    if (!payload || typeof payload !== 'object') return;
    // Discard our own echoes
    if (payload.senderId === this.myId) return;

    this.lastPartnerActivity = Date.now();
    this.recordParticipantActivity(payload.senderId, payload.senderName || 'Friend');

    switch (payload.type) {
      case 'JOIN': {
        this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', true);
        // Reply with ACK so joiner immediately knows we are active
        this.broadcastSignal({
          type: 'ACK',
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
          mode: this.mode,
          roomPin: this.pin,
        }).catch(() => {});
        break;
      }

      case 'ACK':
      case 'PING': {
        this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', true);
        break;
      }

      case 'LEAVE': {
        const participant = this.participantsMap.get(payload.senderId);
        if (participant) {
          participant.isOnline = false;
          this.emitParticipants();
        }
        if (this.mode === 'ptop') {
          this.lastPartnerActivity = 0;
          this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', false);
          this.onClosedCallback?.(`${payload.senderName || 'Friend'} left the chat.`);
        } else {
          this.onClosedCallback?.(`${payload.senderName || 'Friend'} left the group.`);
        }
        break;
      }

      case 'ACK_MSG': {
        if (payload.id) {
          this.onMessageDeliveredCallback?.(payload.id);
        }
        break;
      }

      case 'MESSAGE': {
        if (!payload.id || this.seenMessageIds.has(payload.id)) return;
        if (this.seenMessageIds.size > 2000) {
          this.seenMessageIds.clear();
        }
        this.seenMessageIds.add(payload.id);

        const incomingMsg: InstantChatMessage = {
          id: payload.id,
          text: payload.text || '',
          senderId: payload.senderId,
          senderName: payload.senderName || 'Friend',
          timestamp: payload.timestamp || Date.now(),
          isMine: false,
          delivered: true,
          mode: this.mode,
          roomPin: this.pin,
        };

        // Play subtle sound chime
        playChatChime();

        // Show system / browser notification if panel is not actively open & focused
        const shouldNotify =
          !friendChatManager.getState().isPanelOpen ||
          (typeof document !== 'undefined' && document.hidden);

        if (shouldNotify) {
          showChatNotification(incomingMsg.senderName, incomingMsg.text, this.pin, this.mode);
        }

        // Acknowledge receipt back to sender (double-check ✓✓)
        this.broadcastSignal({
          type: 'ACK_MSG',
          id: payload.id,
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
          mode: this.mode,
          roomPin: this.pin,
        }).catch(() => {});

        this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', true);
        this.onMessageCallback?.(incomingMsg);
        break;
      }
    }
  }

  /**
   * Broadcast signal payload to both local BroadcastChannel and remote relay pool.
   * Features automatic relay server failover.
   */
  private async broadcastSignal(payload: SignalPayload): Promise<void> {
    this.lastOutgoingActivity = Date.now();

    // 1. Same-device local BroadcastChannel (instant, zero latency between windows)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch {
        // Ignore closed/invalid channel errors
      }
    }

    // Guard: don't send over network after session is destroyed unless sending departure notice
    if (this.isDestroyed && payload.type !== 'LEAVE') return;

    // 2. Wi-Fi / Remote cross-machine relay via public high-capacity ntfy pool.
    // Broadcast concurrently to top 2 high-capacity relays (17,280 msgs/day each)
    // so peers connected to either relay receive messages with 0 sync delay.
    const body = JSON.stringify(payload);
    const postToRelay = async (relayBase: string): Promise<boolean> => {
      try {
        const resp = await fetch(`${relayBase}/${this.topic}`, {
          method: 'POST',
          headers: {
            'Title': 'Z-Pilot Chat',
            'X-Cache': 'no', // NEVER cache on server — pure live relay!
            'X-Priority': 'urgent',
            'Content-Type': 'text/plain',
          },
          body,
        });
        return resp.ok;
      } catch {
        return false;
      }
    };

    const results = await Promise.allSettled([
      postToRelay(RELAY_SERVERS[0]),
      postToRelay(RELAY_SERVERS[1]),
    ]);

    const anySuccess = results.some(
      (r) => r.status === 'fulfilled' && r.value === true
    );

    // If both high-capacity servers were unreachable, fallback to tertiary relay
    if (!anySuccess && RELAY_SERVERS.length > 2) {
      await postToRelay(RELAY_SERVERS[2]);
    }
  }
}

/**
 * FriendChatManager:
 * Global Singleton that orchestrates connection state, persistent browser storage,
 * unread badges, notifications, and background connectivity.
 */
class FriendChatManager {
  private activePin: string | null = null;
  private mode: ChatMode = 'ptop';
  private displayName: string = getSavedDisplayName();
  private messages: FriendChatMessage[] = [];
  private isPartnerOnline = false;
  private partnerName: string | null = null;
  private participants: ParticipantInfo[] = [];
  private unreadCount = 0;
  private statusNotice: string | null = null;
  private isPanelOpen = false;

  private session: InstantChatSession | null = null;
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[FriendChatManager] Listener error:', err);
      }
    });
  }

  public getState() {
    return {
      activePin: this.activePin,
      mode: this.mode,
      displayName: this.displayName,
      messages: this.messages,
      isPartnerOnline: this.isPartnerOnline,
      partnerName: this.partnerName,
      participants: this.participants,
      unreadCount: this.unreadCount,
      statusNotice: this.statusNotice,
      isPanelOpen: this.isPanelOpen,
    };
  }

  public setPanelOpen(open: boolean): void {
    this.isPanelOpen = open;
    if (open) {
      this.unreadCount = 0;
      this.notify();
    }
    // No notify when closing — avoids spurious re-renders
  }

  public updateDisplayName(name: string): void {
    const clean = name.trim() || 'Friend';
    this.displayName = clean;
    saveDisplayName(clean);
    if (this.session) {
      this.session.updateName(clean);
    }
    if (this.activePin) {
      StorageService.saveFriendChatSession({
        activePin: this.activePin,
        mode: this.mode,
        displayName: this.displayName,
        connectedAt: Date.now(),
      }).catch(() => {});
    }
    this.notify();
  }

  /**
   * Restore previous session and messages from browser storage
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      this.displayName = getSavedDisplayName();
      const savedSession = await StorageService.getFriendChatSession();
      if (savedSession && savedSession.activePin) {
        this.activePin = savedSession.activePin;
        this.mode = savedSession.mode || (savedSession.activePin.length === 3 ? 'group' : 'ptop');
        if (savedSession.displayName) {
          this.displayName = savedSession.displayName;
        }

        // Restore messages from storage
        this.messages = await StorageService.getFriendChatMessages(this.activePin);
        this.statusNotice = `Reconnected to ${this.mode === 'group' ? 'Group' : 'PtoP'} #${this.activePin}`;
        setTimeout(() => {
          if (this.statusNotice?.startsWith('Reconnected')) {
            this.statusNotice = null;
            this.notify();
          }
        }, 3000);

        // Connect the session in background
        this.connectSessionInternal(this.activePin, this.mode, this.displayName);
        this.notify();
      }
    } catch (err) {
      console.warn('[FriendChatManager] Error initializing session:', err);
    }
  }

  /**
   * Start or Join a room with PIN and mode
   */
  public async startRoom(pin: string, mode: ChatMode, customName?: string): Promise<void> {
    const cleanPin = pin.trim();
    if (!cleanPin) return;

    // If already in the same room, skip re-connection (prevents double-connect race)
    if (this.activePin === cleanPin && this.mode === mode && this.session) {
      return;
    }

    if (customName) {
      const cleanName = customName.trim();
      if (cleanName) {
        this.displayName = cleanName;
        saveDisplayName(this.displayName);
      }
    }

    // Clean up previous active session without clearing other room messages
    if (this.session) {
      this.session.destroy();
      this.session = null;
    }

    this.activePin = cleanPin;
    this.mode = mode;
    this.isPartnerOnline = false;
    this.partnerName = null;
    this.participants = [];
    this.statusNotice = `Connecting to ${mode === 'group' ? 'Group' : 'PtoP'} #${cleanPin}...`;

    // Persist active session in browser storage
    const sessionState: FriendChatSessionState = {
      activePin: this.activePin,
      mode: this.mode,
      displayName: this.displayName,
      connectedAt: Date.now(),
    };
    await StorageService.saveFriendChatSession(sessionState);

    // Load past messages for this room
    this.messages = await StorageService.getFriendChatMessages(cleanPin);

    // Connect session
    this.connectSessionInternal(cleanPin, mode, this.displayName);
    this.notify();
  }

  private connectSessionInternal(pin: string, mode: ChatMode, displayName: string): void {
    if (this.session) {
      this.session.destroy();
      this.session = null;
    }

    const session = new InstantChatSession(pin, displayName, mode);
    this.session = session;

    session.connect(
      (newMsg) => {
        // Check duplicate
        if (!this.messages.some((m) => m.id === newMsg.id)) {
          this.messages = [...this.messages, newMsg];
          StorageService.appendFriendChatMessage(pin, newMsg).catch(() => {});
        }
        this.isPartnerOnline = true;
        if (!this.isPanelOpen) {
          this.unreadCount += 1;
        }
        this.notify();
      },
      (msgId) => {
        this.messages = this.messages.map((m) =>
          m.id === msgId ? { ...m, delivered: true } : m
        );
        StorageService.saveFriendChatMessages(pin, this.messages).catch(() => {});
        this.notify();
      },
      (name, isOnline) => {
        const wasOnline = this.isPartnerOnline;
        this.partnerName = name;
        this.isPartnerOnline = isOnline;
        if (isOnline && !wasOnline) {
          this.statusNotice = `${name} connected!`;
          setTimeout(() => {
            if (this.statusNotice === `${name} connected!`) {
              this.statusNotice = null;
              this.notify();
            }
          }, 3500);
        }
        this.notify();
      },
      (reason) => {
        if (mode === 'ptop') {
          this.isPartnerOnline = false;
        }
        this.statusNotice = reason;
        this.notify();
        setTimeout(() => {
          if (this.statusNotice === reason) {
            this.statusNotice = null;
            this.notify();
          }
        }, 4000);
      },
      (participants) => {
        this.participants = participants;
        this.notify();
      }
    );
  }

  /**
   * Send text message in active room
   */
  public async sendMessage(text: string): Promise<void> {
    if (!this.activePin || !this.session) {
      throw new Error('No active chat session');
    }

    const sentMsg = await this.session.sendTextMessage(text);
    this.messages = [...this.messages, sentMsg];
    await StorageService.appendFriendChatMessage(this.activePin, sentMsg);
    this.notify();
  }

  /**
   * Leave the active room and return to Lobby.
   * Chats are preserved in browser storage.
   */
  public async leaveRoom(): Promise<void> {
    if (this.session) {
      this.session.destroy();
      this.session = null;
    }

    this.activePin = null;
    this.messages = [];
    this.isPartnerOnline = false;
    this.partnerName = null;
    this.participants = [];
    this.statusNotice = null;
    this.unreadCount = 0;

    await StorageService.saveFriendChatSession(null);
    this.notify();
  }

  /**
   * Delete messages for current room from browser storage
   */
  public async deleteCurrentChatMessages(): Promise<void> {
    if (!this.activePin) return;
    await StorageService.clearFriendChatMessages(this.activePin);
    this.messages = [];
    this.statusNotice = 'Chat history deleted.';
    setTimeout(() => {
      if (this.statusNotice === 'Chat history deleted.') {
        this.statusNotice = null;
        this.notify();
      }
    }, 2500);
    this.notify();
  }

  /**
   * Delete ALL friend chats across all rooms and leave room
   */
  public async deleteAllChats(): Promise<void> {
    if (this.session) {
      this.session.destroy();
      this.session = null;
    }
    this.activePin = null;
    this.messages = [];
    this.isPartnerOnline = false;
    this.partnerName = null;
    this.participants = [];
    this.statusNotice = 'All chat history wiped from browser.';
    this.unreadCount = 0;

    await StorageService.clearAllFriendChat();
    this.notify();
    // Auto-clear status notice after 3 seconds
    setTimeout(() => {
      if (this.statusNotice === 'All chat history wiped from browser.') {
        this.statusNotice = null;
        this.notify();
      }
    }, 3000);
  }
}

export const friendChatManager = new FriendChatManager();
