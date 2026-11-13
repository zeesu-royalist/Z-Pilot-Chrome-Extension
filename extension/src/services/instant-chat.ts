/**
 * Z-Pilot Instant Peer Chat Service
 * - 100% Zero-Config: No accounts, no setup, no API keys, no server costs.
 * - 4-Digit Room PIN (e.g. 7823)
 * - Ephemeral & Vanishing: Messages exist ONLY in memory during the active session.
 * - Auto-vanish: Window close / panel close = completely wiped.
 * - Live real-time stream (ntfy public relay with X-Cache: no) + BroadcastChannel.
 */

export interface InstantChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  isMine: boolean;
  delivered?: boolean;
}

export type ChatSignalType = 'JOIN' | 'ACK' | 'MESSAGE' | 'ACK_MSG' | 'PING' | 'LEAVE';

interface SignalPayload {
  type: ChatSignalType;
  id?: string;
  senderId: string;
  senderName: string;
  text?: string;
  timestamp: number;
}

const NTFY_BASE = 'https://ntfy.sh';

// Pleasant, subtle sound chime when message arrives (pure Web Audio API, 0 assets)
export function playChatChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
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
  } catch {
    // Audio might be restricted without user interaction
  }
}

// Generate a random 4-digit PIN (1000 - 9999)
export function generateRoomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Generate / get ephemeral session user ID (stored only in sessionStorage, wiped on browser close)
export function getSessionUserId(): string {
  const key = 'zpilot_chat_session_uid';
  let uid = '';
  try {
    uid = sessionStorage.getItem(key) || '';
  } catch {
    // Ignore
  }
  if (!uid) {
    uid = 'user_' + Math.random().toString(36).slice(2, 9);
    try {
      sessionStorage.setItem(key, uid);
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

// Room topic naming pattern (namespaced to avoid accidental collisions)
export function getTopicName(pin: string): string {
  return `zpilot_chat_v2_${pin.trim()}`;
}

/**
 * InstantChatSession manages the live connection for a 4-digit PIN room.
 */
export class InstantChatSession {
  private pin: string;
  private topic: string;
  private myId: string;
  private myName: string;
  private eventSource: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private lastPartnerActivity = 0;
  private seenMessageIds: Set<string> = new Set();
  private onMessageCallback: ((msg: InstantChatMessage) => void) | null = null;
  private onMessageDeliveredCallback: ((msgId: string) => void) | null = null;
  private onPartnerPresenceCallback: ((partnerName: string, isOnline: boolean) => void) | null = null;
  private onClosedCallback: ((reason: string) => void) | null = null;
  private isDestroyed = false;

  constructor(pin: string, myName: string) {
    this.pin = pin.trim();
    this.topic = getTopicName(this.pin);
    this.myId = getSessionUserId();
    this.myName = myName.trim() || 'Friend';
  }

  /**
   * Connect to the room via live SSE stream + local BroadcastChannel
   */
  public connect(
    onMessage: (msg: InstantChatMessage) => void,
    onDelivered: (msgId: string) => void,
    onPresence: (partnerName: string, isOnline: boolean) => void,
    onClosed: (reason: string) => void
  ): void {
    this.onMessageCallback = onMessage;
    this.onMessageDeliveredCallback = onDelivered;
    this.onPartnerPresenceCallback = onPresence;
    this.onClosedCallback = onClosed;

    // 1. Local BroadcastChannel for same-browser / multi-window instant sync
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(`zpilot_bc_${this.pin}`);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingPayload(event.data);
        };
      }
    } catch (err) {
      console.warn('[InstantChat] BroadcastChannel not supported:', err);
    }

    // 2. Public SSE relay (EventSource) for cross-machine / Wi-Fi real-time streaming
    try {
      const sseUrl = `${NTFY_BASE}/${this.topic}/sse`;
      this.eventSource = new EventSource(sseUrl);

      // Trigger presence as soon as socket connects
      this.eventSource.onopen = () => {
        this.broadcastSignal({
          type: 'JOIN',
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
        });
      };

      this.eventSource.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw.event === 'message' && raw.message) {
            const payload: SignalPayload = JSON.parse(raw.message);
            this.handleIncomingPayload(payload);
          }
        } catch {
          // Ignore non-chat packets
        }
      };

      this.eventSource.onerror = () => {
        // SSE automatically reconnects on transient disconnects
      };
    } catch (err) {
      console.warn('[InstantChat] SSE connection failed:', err);
    }

    // Fast initial handshakes (immediate, at 300ms, and at 1000ms)
    const sendJoin = () => {
      if (!this.isDestroyed) {
        this.broadcastSignal({
          type: 'JOIN',
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
        });
      }
    };
    setTimeout(sendJoin, 300);
    setTimeout(sendJoin, 1200);

    // Regular Heartbeat every 4.5 seconds
    this.pingInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.broadcastSignal({
          type: 'PING',
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
        });
      }
    }, 4500);

    // Watchdog: If partner sent no heartbeat in 12s, switch to waiting
    this.watchdogInterval = setInterval(() => {
      if (!this.isDestroyed && this.lastPartnerActivity > 0) {
        if (Date.now() - this.lastPartnerActivity > 12000) {
          this.onPartnerPresenceCallback?.('Friend', false);
        }
      }
    }, 3000);
  }

  /**
   * Send a chat text message
   */
  public async sendTextMessage(text: string): Promise<InstantChatMessage> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Message cannot be empty');
    }

    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    this.seenMessageIds.add(msgId);

    const message: InstantChatMessage = {
      id: msgId,
      text: trimmed,
      senderId: this.myId,
      senderName: this.myName,
      timestamp: Date.now(),
      isMine: true,
      delivered: false,
    };

    const payload: SignalPayload = {
      type: 'MESSAGE',
      id: msgId,
      senderId: this.myId,
      senderName: this.myName,
      text: trimmed,
      timestamp: message.timestamp,
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
    });
  }

  /**
   * Disconnect and wipe session
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Send departure notice to peer
    this.broadcastSignal({
      type: 'LEAVE',
      senderId: this.myId,
      senderName: this.myName,
      timestamp: Date.now(),
    }).catch(() => {});

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // Ignore
      }
      this.broadcastChannel = null;
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
  }

  /**
   * Internal dispatcher for incoming packets from SSE or BroadcastChannel
   */
  private handleIncomingPayload(payload: SignalPayload): void {
    if (!payload || typeof payload !== 'object') return;
    // Discard our own echoes
    if (payload.senderId === this.myId) return;

    this.lastPartnerActivity = Date.now();

    switch (payload.type) {
      case 'JOIN': {
        this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', true);
        // Reply with ACK so joiner immediately knows we are active
        this.broadcastSignal({
          type: 'ACK',
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
        }).catch(() => {});
        break;
      }

      case 'ACK':
      case 'PING': {
        this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', true);
        break;
      }

      case 'LEAVE': {
        this.lastPartnerActivity = 0;
        this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', false);
        this.onClosedCallback?.(`${payload.senderName || 'Friend'} left the chat.`);
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
        this.seenMessageIds.add(payload.id);

        const incomingMsg: InstantChatMessage = {
          id: payload.id,
          text: payload.text || '',
          senderId: payload.senderId,
          senderName: payload.senderName || 'Friend',
          timestamp: payload.timestamp || Date.now(),
          isMine: false,
          delivered: true,
        };

        // Play subtle sound chime
        playChatChime();

        // Acknowledge receipt back to sender (double-check ✓✓)
        this.broadcastSignal({
          type: 'ACK_MSG',
          id: payload.id,
          senderId: this.myId,
          senderName: this.myName,
          timestamp: Date.now(),
        }).catch(() => {});

        this.onPartnerPresenceCallback?.(payload.senderName || 'Friend', true);
        this.onMessageCallback?.(incomingMsg);
        break;
      }
    }
  }

  /**
   * Broadcast signal payload to both local BroadcastChannel and remote ntfy stream
   */
  private async broadcastSignal(payload: SignalPayload): Promise<void> {
    // 1. Same-device local BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch {
        // Ignore
      }
    }

    // 2. Wi-Fi / Remote cross-machine relay with zero caching (X-Cache: no)
    try {
      await fetch(`${NTFY_BASE}/${this.topic}`, {
        method: 'POST',
        headers: {
          'Title': 'Z-Pilot Chat',
          'X-Cache': 'no', // NEVER cache or save on server — pure live relay!
          'X-Priority': 'urgent',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Ignore network errors on non-essential signals
    }
  }
}
