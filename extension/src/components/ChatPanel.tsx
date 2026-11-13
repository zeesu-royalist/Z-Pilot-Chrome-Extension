import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Send,
  Copy,
  Check,
  CheckCheck,
  UserCheck,
  LogOut,
  Wifi,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import {
  InstantChatSession,
  InstantChatMessage,
  generateRoomPin,
  getSavedDisplayName,
  saveDisplayName,
} from '../services/instant-chat.js';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const [activePin, setActivePin] = useState<string | null>(null);
  const [joinInputPin, setJoinInputPin] = useState('');
  const [displayName, setDisplayName] = useState(() => getSavedDisplayName());
  const [messages, setMessages] = useState<InstantChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isCopiedPin, setIsCopiedPin] = useState(false);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const sessionRef = useRef<InstantChatSession | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when connected
  useEffect(() => {
    if (activePin) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [activePin]);

  // Clean exit & wipe all messages on close
  const cleanupSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.destroy();
      sessionRef.current = null;
    }
    setActivePin(null);
    setMessages([]);
    setPartnerName(null);
    setIsPartnerOnline(false);
    setStatusNotice(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      cleanupSession();
    }
  }, [isOpen, cleanupSession]);

  // Start or Join a Session with a 4-digit PIN
  const startSessionWithPin = (pinToUse: string) => {
    cleanupSession();
    setStatusNotice('Connecting room...');

    const cleanPin = pinToUse.trim();
    setActivePin(cleanPin);

    const session = new InstantChatSession(cleanPin, displayName);
    sessionRef.current = session;

    session.connect(
      (newMsg) => {
        setMessages((prev) => [...prev, newMsg]);
        setIsPartnerOnline(true);
      },
      (msgId) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, delivered: true } : m))
        );
      },
      (name, isOnline) => {
        setPartnerName(name);
        setIsPartnerOnline(isOnline);
        if (isOnline) {
          setStatusNotice(`${name} connected!`);
          setTimeout(() => setStatusNotice(null), 3500);
        }
      },
      (reason) => {
        setIsPartnerOnline(false);
        setStatusNotice(reason);
      }
    );
  };

  // 1-Click Generate & Start
  const handleGenerateAndStart = () => {
    const pin = generateRoomPin();
    startSessionWithPin(pin);
  };

  // Join existing 4-digit PIN
  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = joinInputPin.replace(/\D/g, '').slice(0, 4);
    if (clean.length !== 4) return;
    startSessionWithPin(clean);
    setJoinInputPin('');
  };

  // Send message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || !sessionRef.current) return;

    setInputText('');
    try {
      const sentMsg = await sessionRef.current.sendTextMessage(text);
      setMessages((prev) => [...prev, sentMsg]);
    } catch (err) {
      console.warn('[InstantChat] Send error:', err);
    }
  };

  // Copy PIN
  const handleCopyPin = async () => {
    if (!activePin) return;
    try {
      await navigator.clipboard.writeText(activePin);
      setIsCopiedPin(true);
      setTimeout(() => setIsCopiedPin(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Update display name
  const handleNameChange = (name: string) => {
    setDisplayName(name);
    saveDisplayName(name);
    if (sessionRef.current) {
      sessionRef.current.updateName(name);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080402] overflow-hidden font-sans select-none animate-fade-in">
      {/* ── TOP HEADER ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/85 via-[#160a04]/90 to-black/85 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-white tracking-tight">
              Friend Chat
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500/15 border border-orange-500/30 text-orange-300 tracking-wider">
              ZERO SETUP
            </span>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center space-x-2">
          {activePin && (
            <button
              onClick={cleanupSession}
              title="Leave Room & Clear Chat"
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-[11px] text-white/60 hover:text-red-300 transition-all flex items-center space-x-1 cursor-pointer active:scale-95"
            >
              <LogOut className="w-3 h-3" />
              <span>Leave</span>
            </button>
          )}

          <button
            onClick={onClose}
            title="Close Chat"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      {!activePin ? (
        /* ════════ SETUP / LOBBY VIEW ════════ */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
          {/* Display Name Input Pill */}
          <div className="p-3 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
              Your Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={24}
              placeholder="Enter your name (e.g. Rahul, Zeesu)..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          {/* Action 1: Create New Room */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-600/25 via-amber-600/15 to-black/60 border border-orange-500/35 shadow-xl shadow-orange-950/25 space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-600/30 shrink-0">
                <Flame className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Start a New Chat</p>
                <p className="text-[11px] text-white/60">
                  Generate a 4-digit code &amp; share with your friend
                </p>
              </div>
            </div>

            <button
              onClick={handleGenerateAndStart}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-lg shadow-orange-600/30 cursor-pointer active:scale-95"
            >
              <UserCheck className="w-4 h-4 stroke-[2.2]" />
              <span>Generate 4-Digit PIN &amp; Chat</span>
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center space-x-3 py-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] text-white/40 font-medium">or join friend</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Action 2: Join Existing Room with PIN */}
          <form
            onSubmit={handleJoin}
            className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3"
          >
            <div>
              <p className="text-xs font-bold text-white/80">Enter Friend&apos;s 4-Digit PIN</p>
              <p className="text-[11px] text-white/50">
                Ask your friend for their code and enter it below
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={joinInputPin}
                onChange={(e) =>
                  setJoinInputPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                maxLength={4}
                placeholder="• • • •"
                className="flex-1 bg-black/60 border border-white/15 focus:border-orange-500/60 rounded-xl px-4 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-amber-300 placeholder:text-white/20 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={joinInputPin.trim().length !== 4}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider disabled:opacity-40 transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-md shadow-orange-600/25"
              >
                Join
              </button>
            </div>
          </form>

          {/* Zero-Config Guarantee Banner */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-[11px] text-white/60 leading-relaxed">
            <div className="flex items-center space-x-2 text-white/80 font-bold">
              <ShieldCheck className="w-4 h-4 text-orange-400" />
              <span>How it works:</span>
            </div>
            <ul className="space-y-1 text-white/55 list-none pl-1">
              <li className="flex items-start space-x-1.5">
                <span className="text-orange-400 font-bold">•</span>
                <span>Works on same Wi-Fi or any internet connection instantly.</span>
              </li>
              <li className="flex items-start space-x-1.5">
                <span className="text-orange-400 font-bold">•</span>
                <span>
                  <strong>100% Zero Accounts:</strong> No signups, no logins, no API keys needed.
                </span>
              </li>
              <li className="flex items-start space-x-1.5">
                <span className="text-orange-400 font-bold">•</span>
                <span>
                  <strong>Self-Destruct / Vanishing:</strong> Closing this window completely wipes all messages. Nothing is saved on any server or disk.
                </span>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        /* ════════ ACTIVE CHAT ROOM VIEW ════════ */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Room PIN Banner */}
          <div className="px-3.5 py-2.5 bg-gradient-to-r from-[#1b0d05] via-[#140903] to-[#1b0d05] border-b border-orange-500/25 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-white/60">Room PIN:</span>
              <button
                onClick={handleCopyPin}
                title="Click to copy 4-digit PIN"
                className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-xs font-mono font-bold text-amber-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <span className="tracking-widest">{activePin}</span>
                {isCopiedPin ? (
                  <CheckCheck className="w-3.5 h-3.5 text-amber-300" />
                ) : (
                  <Copy className="w-3 h-3 text-orange-300" />
                )}
              </button>
              {isCopiedPin && (
                <span className="text-[10px] text-amber-300 font-medium">Copied!</span>
              )}
            </div>

            {/* Online Status Pill */}
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isPartnerOnline ? 'bg-amber-400 animate-pulse' : 'bg-white/30'
                }`}
              />
              <span className="text-[11px] text-white/70 font-medium truncate max-w-[140px]">
                {isPartnerOnline
                  ? `${partnerName || 'Friend'} online`
                  : 'Waiting for friend...'}
              </span>
            </div>
          </div>

          {/* Notice banner if partner joins/leaves */}
          {statusNotice && (
            <div className="px-3 py-1 bg-orange-500/10 border-b border-orange-500/20 text-[11px] text-center text-orange-300 font-medium animate-fade-in shrink-0">
              {statusNotice}
            </div>
          )}

          {/* Messages Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar select-text">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 px-4 text-center space-y-2.5 opacity-65">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-md">
                  <Wifi className="w-6 h-6 stroke-[1.8]" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">Room {activePin} is Live</p>
                  <p className="text-[11px] text-white/60 max-w-[240px] leading-relaxed">
                    Tell your friend to enter <strong className="text-amber-300">{activePin}</strong> in Z-Pilot Friend Chat to join!
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.isMine ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Sender Name */}
                  {!msg.isMine && (
                    <span className="text-[10px] font-bold text-orange-300/80 mb-0.5 ml-1">
                      {msg.senderName}
                    </span>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm text-xs leading-relaxed break-words whitespace-pre-wrap select-text ${
                      msg.isMine
                        ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-tr-xs'
                        : 'bg-black/60 border border-white/15 text-white/95 rounded-tl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Timestamp & Delivery Check */}
                  <div className="flex items-center space-x-1 mt-0.5 px-1 font-mono text-[9px] text-white/35">
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {msg.isMine && (
                      msg.delivered ? (
                        <CheckCheck className="w-3 h-3 text-amber-300" />
                      ) : (
                        <Check className="w-2.5 h-2.5 text-white/40" />
                      )
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Ephemeral Notice Footer */}
          <div className="px-3 py-1 bg-black/40 border-t border-white/5 flex items-center justify-between text-[9px] text-white/35 shrink-0">
            <span className="flex items-center space-x-1">
              <span>Messages auto-vanish when you leave</span>
            </span>
            <span>Room #{activePin}</span>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="p-2.5 border-t border-white/10 bg-black/60 backdrop-blur-xl flex items-center space-x-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message & hit Enter..."
              className="flex-1 bg-white/5 border border-white/15 focus:border-orange-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/35 focus:outline-none transition-colors select-text font-sans"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-9 h-9 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white flex items-center justify-center disabled:opacity-30 transition-all shadow-md shadow-orange-600/30 cursor-pointer active:scale-95 shrink-0"
            >
              <Send className="w-4 h-4 stroke-[2.2]" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
