import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Send,
  Copy,
  Check,
  CheckCheck,
  UserCheck,
  Users,
  User,
  LogOut,
  Wifi,
  ShieldCheck,
  Flame,
  Trash2,
  AlertTriangle,
  MessageSquare,
  Clock,
  Edit2,
  ChevronDown,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import {
  friendChatManager,
  generateRoomPin,
  ChatMode,
} from '../services/instant-chat.js';
import { StorageService } from '../services/storage.js';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SavedRoomCard {
  pin: string;
  mode: ChatMode;
  count: number;
  lastText: string;
  lastTime: number;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose }) => {
  const [chatState, setChatState] = useState(() => friendChatManager.getState());
  const [selectedLobbyMode, setSelectedLobbyMode] = useState<ChatMode>('ptop');
  const [ptopInputPin, setPtopInputPin] = useState('');
  const [groupInputPin, setGroupInputPin] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState(() => chatState.displayName);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCopiedPin, setIsCopiedPin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showWipeAllConfirm, setShowWipeAllConfirm] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(false);
  const [isEditingNameInRoom, setIsEditingNameInRoom] = useState(false);
  const [inRoomNameInput, setInRoomNameInput] = useState('');
  const [savedRooms, setSavedRooms] = useState<SavedRoomCard[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load saved rooms summary for lobby
  const loadSavedRooms = useCallback(async () => {
    try {
      const roomPins = await StorageService.getSavedRoomsList();
      const cards: SavedRoomCard[] = [];
      for (const pin of roomPins) {
        const msgs = await StorageService.getFriendChatMessages(pin);
        if (msgs.length > 0) {
          const lastMsg = msgs[msgs.length - 1];
          cards.push({
            pin,
            mode: pin.length === 3 ? 'group' : 'ptop',
            count: msgs.length,
            lastText: lastMsg.text,
            lastTime: lastMsg.timestamp,
          });
        }
      }
      cards.sort((a, b) => b.lastTime - a.lastTime);
      setSavedRooms(cards);
    } catch {
      // Ignore
    }
  }, []);

  // Subscribe to reactive updates from friendChatManager
  // Note: friendChatManager.initialize() is idempotent (guarded by isInitialized flag),
  // so calling it from both App.tsx and here is safe.
  useEffect(() => {
    friendChatManager.initialize();
    const unsubscribe = friendChatManager.subscribe(() => {
      setChatState({ ...friendChatManager.getState() });
    });
    return unsubscribe;
  }, []);

  // Tell manager whether the panel view is currently open
  useEffect(() => {
    friendChatManager.setPanelOpen(isOpen);
    if (isOpen) {
      setDisplayNameInput(friendChatManager.getState().displayName);
      loadSavedRooms();
    }
  }, [isOpen, loadSavedRooms]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatState.messages]);

  // Focus input when connected
  useEffect(() => {
    if (chatState.activePin) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [chatState.activePin]);

  // Close confirmation modals or popups on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) setShowDeleteConfirm(false);
        if (showWipeAllConfirm) setShowWipeAllConfirm(false);
        if (showParticipantsList) setShowParticipantsList(false);
        if (isEditingNameInRoom) setIsEditingNameInRoom(false);
      }
    };
    if (showDeleteConfirm || showWipeAllConfirm || showParticipantsList || isEditingNameInRoom) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showDeleteConfirm, showWipeAllConfirm, showParticipantsList, isEditingNameInRoom]);

  // 1-Click Generate PIN & Start Room
  const handleGenerateAndStart = (mode: ChatMode) => {
    const pin = generateRoomPin(mode);
    void friendChatManager.startRoom(pin, mode, displayNameInput);
  };

  // Join PtoP Room
  const handleJoinPtop = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = ptopInputPin.replace(/\D/g, '').slice(0, 4);
    if (clean.length === 3) {
      // Smart routing: 3-digit code entered on PtoP tab -> connect as group
      void friendChatManager.startRoom(clean, 'group', displayNameInput);
      setPtopInputPin('');
      return;
    }
    if (clean.length !== 4) return;
    void friendChatManager.startRoom(clean, 'ptop', displayNameInput);
    setPtopInputPin('');
  };

  // Join Group Room
  const handleJoinGroup = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = groupInputPin.replace(/\D/g, '').slice(0, 4);
    if (clean.length === 4) {
      // Smart routing: 4-digit code entered on Group tab -> connect as PtoP
      void friendChatManager.startRoom(clean, 'ptop', displayNameInput);
      setGroupInputPin('');
      return;
    }
    if (clean.length !== 3) return;
    void friendChatManager.startRoom(clean, 'group', displayNameInput);
    setGroupInputPin('');
  };

  // Resume a saved room from history
  const handleResumeSavedRoom = (pin: string, mode: ChatMode) => {
    void friendChatManager.startRoom(pin, mode, displayNameInput);
  };

  // Delete a saved room from history in Lobby
  const handleDeleteSavedRoom = async (pin: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await StorageService.clearFriendChatMessages(pin);
    loadSavedRooms();
  };

  // Send message — with isSending guard to prevent double-send on rapid Enter
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || !chatState.activePin || isSending) return;

    setInputText('');
    setIsSending(true);
    try {
      await friendChatManager.sendMessage(text);
    } catch (err) {
      console.warn('[ChatPanel] Send error:', err);
      // Restore input text on failure so user can retry
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  };

  // Send quick icebreaker message
  const handleSendIcebreaker = async (text: string) => {
    try {
      await friendChatManager.sendMessage(text);
    } catch {
      // Ignore
    }
  };

  // Copy PIN
  const handleCopyPin = async () => {
    if (!chatState.activePin) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(chatState.activePin);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setIsCopiedPin(true);
      setTimeout(() => setIsCopiedPin(false), 2000);
    } catch {
      // Robust textarea copy fallback
      try {
        const el = document.createElement('textarea');
        el.value = chatState.activePin;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setIsCopiedPin(true);
        setTimeout(() => setIsCopiedPin(false), 2000);
      } catch {
        // Fallback
      }
    }
  };

  // Update display name from Lobby
  const handleNameChange = (name: string) => {
    setDisplayNameInput(name);
    friendChatManager.updateDisplayName(name);
  };

  // Save display name edit inside active room
  const handleSaveInRoomName = () => {
    if (inRoomNameInput.trim()) {
      friendChatManager.updateDisplayName(inRoomNameInput.trim());
    }
    setIsEditingNameInRoom(false);
  };

  // Confirm Delete Current Room Chats
  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await friendChatManager.deleteCurrentChatMessages();
      loadSavedRooms();
    } catch (err) {
      console.error('[ChatPanel] Error deleting room chats:', err);
    }
  };

  // Confirm Wipe All Chats Across All Rooms
  const handleConfirmWipeAll = async () => {
    setShowWipeAllConfirm(false);
    try {
      await friendChatManager.deleteAllChats();
      loadSavedRooms();
    } catch (err) {
      console.error('[ChatPanel] Error wiping all chats:', err);
    }
  };

  // Palette generator for sender names in group chat
  const getSenderColor = (name: string): string => {
    const colors = [
      'text-orange-400',
      'text-amber-300',
      'text-emerald-400',
      'text-cyan-400',
      'text-pink-400',
      'text-purple-400',
      'text-lime-400',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Safe clickable link parser for message contents
  const renderMessageText = (text: string) => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlPattern);
    return parts.map((part, index) => {
      if (part.match(urlPattern)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 hover:text-amber-200 underline underline-offset-2 break-all font-medium transition-colors cursor-pointer"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  if (!isOpen) return null;

  const { activePin, mode, messages, isPartnerOnline, partnerName, participants, statusNotice, displayName } =
    chatState;

  const isGroup = mode === 'group' || (activePin ? activePin.length === 3 : false);
  const onlineCount = isGroup
    ? participants.filter((p) => p.isOnline).length + 1 // include self
    : isPartnerOnline
    ? 2
    : 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080402] overflow-hidden font-sans select-none animate-fade-in">
      {/* ── TOP HEADER ── */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/85 via-[#160a04]/90 to-black/85 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex items-center space-x-1.5">
            <span className="text-sm font-bold text-white tracking-tight">
              Friend Chat
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500/15 border border-orange-500/30 text-orange-300 tracking-wider">
              {activePin ? (isGroup ? 'GROUP 3-DIGIT' : 'PtoP 4-DIGIT') : 'ZERO SETUP'}
            </span>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center space-x-1.5">
          {activePin && (
            <>
              {/* Delete All Chat Button */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete All Chat History in this Room"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300 transition-all cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Leave Room Button */}
              <button
                onClick={() => {
                  void friendChatManager.leaveRoom().then(() => loadSavedRooms());
                }}
                title="Leave Room & Disconnect"
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-[11px] text-white/70 hover:text-orange-300 transition-all flex items-center space-x-1 cursor-pointer active:scale-95"
              >
                <LogOut className="w-3 h-3" />
                <span>Leave</span>
              </button>
            </>
          )}

          {/* Close Panel Button (Keeps connection & chats alive in background!) */}
          <button
            onClick={onClose}
            title="Close view (Connection & chats stay saved in background)"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer ml-1"
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
              value={displayNameInput}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={24}
              placeholder="Enter your name (e.g. Rahul, Zeesu)..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          {/* Mode Selector Tabs: PtoP vs Group */}
          <div className="p-1 rounded-2xl bg-black/60 border border-white/10 flex">
            <button
              type="button"
              onClick={() => setSelectedLobbyMode('ptop')}
              className={`flex-1 py-2 rounded-xl font-semibold text-[11px] flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                selectedLobbyMode === 'ptop'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <User className="w-3 h-3" />
              <span>Person to Person (4-Digit)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedLobbyMode('group')}
              className={`flex-1 py-2 rounded-xl font-semibold text-[11px] flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                selectedLobbyMode === 'group'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Group Chat (3-Digit)</span>
            </button>
          </div>

          {/* Mode Card View */}
          {selectedLobbyMode === 'ptop' ? (
            /* ── Person to Person (PtoP) Tab ── */
            <div className="space-y-3 animate-fade-in">
              {/* Create 4-Digit Room */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-600/25 via-amber-600/15 to-black/60 border border-orange-500/35 shadow-xl shadow-orange-950/25 space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-600/30 shrink-0">
                    <UserCheck className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Start 1-on-1 Chat</p>
                    <p className="text-[11px] text-white/60">
                      Generate a 4-digit code &amp; chat single person to person
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleGenerateAndStart('ptop')}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-lg shadow-orange-600/30 cursor-pointer active:scale-95"
                >
                  <Flame className="w-4 h-4 stroke-[2.2]" />
                  <span>Generate 4-Digit PIN &amp; Chat</span>
                </button>
              </div>

              {/* Join with 4-Digit PIN */}
              <form
                onSubmit={handleJoinPtop}
                className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3"
              >
                <div>
                  <p className="text-xs font-bold text-white/80">Enter Friend&apos;s 4-Digit PIN</p>
                  <p className="text-[11px] text-white/50">
                    Ask your friend for their 4-digit code and enter below
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={ptopInputPin}
                    onChange={(e) =>
                      setPtopInputPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    maxLength={4}
                    placeholder="• • • •"
                    className="flex-1 bg-black/60 border border-white/15 focus:border-orange-500/60 rounded-xl px-4 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-amber-300 placeholder:text-white/20 focus:outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={ptopInputPin.trim().length !== 4 && ptopInputPin.trim().length !== 3}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider disabled:opacity-40 transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-md shadow-orange-600/25"
                  >
                    Join
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ── Group Chat Tab ── */
            <div className="space-y-3 animate-fade-in">
              {/* Create 3-Digit Group Room */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-600/25 via-orange-600/15 to-black/60 border border-amber-500/35 shadow-xl shadow-amber-950/25 space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-600/30 shrink-0">
                    <Users className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Create Group Chat</p>
                    <p className="text-[11px] text-white/60">
                      Generate a 3-digit code for multiple friends to chat together
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleGenerateAndStart('group')}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-lg shadow-amber-600/30 cursor-pointer active:scale-95"
                >
                  <Users className="w-4 h-4 stroke-[2.2]" />
                  <span>Generate 3-Digit PIN &amp; Start Group</span>
                </button>
              </div>

              {/* Join with 3-Digit Group PIN */}
              <form
                onSubmit={handleJoinGroup}
                className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3"
              >
                <div>
                  <p className="text-xs font-bold text-white/80">Enter Group 3-Digit PIN</p>
                  <p className="text-[11px] text-white/50">
                    Enter the 3-digit group code to join the room
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={groupInputPin}
                    onChange={(e) =>
                      setGroupInputPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    maxLength={4}
                    placeholder="• • •"
                    className="flex-1 bg-black/60 border border-white/15 focus:border-amber-500/60 rounded-xl px-4 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-amber-300 placeholder:text-white/20 focus:outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={groupInputPin.trim().length !== 3 && groupInputPin.trim().length !== 4}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-500 text-white font-bold text-xs uppercase tracking-wider disabled:opacity-40 transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-md shadow-amber-600/25"
                  >
                    Join Group
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Saved Chat History in Browser Card */}
          {savedRooms.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-white/80 font-bold text-xs">
                  <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
                  <span>Saved Chats in Browser ({savedRooms.length})</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowWipeAllConfirm(true)}
                    className="text-[10px] text-red-400/80 hover:text-red-300 font-medium transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                  <span className="text-[10px] text-white/40">1-Click Resume</span>
                </div>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                {savedRooms.map((room) => (
                  <div
                    key={room.pin}
                    onClick={() => handleResumeSavedRoom(room.pin, room.mode)}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/40 flex items-center justify-between gap-2 transition-all cursor-pointer group active:scale-[0.99]"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-300 font-mono font-bold text-xs shrink-0">
                        {room.pin}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-semibold text-white">
                            {room.mode === 'group' ? 'Group Chat' : 'PtoP Chat'} #{room.pin}
                          </span>
                          <span className="text-[10px] text-white/40 font-mono">
                            ({room.count} msgs)
                          </span>
                        </div>
                        <p className="text-[11px] text-white/50 truncate max-w-[180px]">
                          {room.lastText}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSavedRoom(room.pin, e)}
                        title="Delete this room history"
                        className="p-1 rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Persistent Guarantee Banner */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-[11px] text-white/60 leading-relaxed">
            <div className="flex items-center space-x-2 text-white/80 font-bold">
              <ShieldCheck className="w-4 h-4 text-orange-400" />
              <span>Persistent &amp; Realtime Guarantee:</span>
            </div>
            <ul className="space-y-1 text-white/55 list-none pl-1">
              <li className="flex items-start space-x-1.5">
                <span className="text-orange-400 font-bold">•</span>
                <span>
                  <strong>Persistent Connection:</strong> Closing this window will NOT disconnect you. Your connection and chats stay saved in browser until you click &quot;Delete All&quot;.
                </span>
              </li>
              <li className="flex items-start space-x-1.5">
                <span className="text-orange-400 font-bold">•</span>
                <span>
                  <strong>Native Notifications:</strong> Receive desktop notifications and sound alerts when friends message you.
                </span>
              </li>
              <li className="flex items-start space-x-1.5">
                <span className="text-orange-400 font-bold">•</span>
                <span>
                  <strong>100% Zero-Config:</strong> No signups, no phone numbers, no servers.
                </span>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        /* ════════ ACTIVE CHAT ROOM VIEW ════════ */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Room PIN Banner */}
          <div className="px-3.5 py-2 bg-gradient-to-r from-[#1b0d05] via-[#140903] to-[#1b0d05] border-b border-orange-500/25 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
                {isGroup ? 'Group' : 'PtoP'}:
              </span>
              <button
                onClick={handleCopyPin}
                title="Click to copy room code"
                className="px-2 py-0.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-xs font-mono font-bold text-amber-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
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

            {/* Online Status Pill / Clickable Group Participants */}
            <div className="relative">
              <button
                onClick={() => isGroup && setShowParticipantsList(!showParticipantsList)}
                className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-lg transition-colors ${
                  isGroup ? 'hover:bg-white/10 cursor-pointer' : 'cursor-default'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    onlineCount > 1 ? 'bg-amber-400 animate-pulse' : 'bg-white/30'
                  }`}
                />
                <span className="text-[11px] text-white/70 font-medium truncate max-w-[140px]">
                  {isGroup
                    ? `${onlineCount} member${onlineCount > 1 ? 's' : ''} live`
                    : isPartnerOnline
                    ? `${partnerName || 'Friend'} online`
                    : 'Waiting for friend...'}
                </span>
                {isGroup && <ChevronDown className="w-3 h-3 text-white/40" />}
              </button>

              {/* Group participants dropdown */}
              {isGroup && showParticipantsList && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowParticipantsList(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-xl bg-[#140803] border border-orange-500/30 shadow-xl p-2 space-y-1.5 animate-fade-in text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 px-1">
                      Room Members
                    </p>
                    <div className="flex items-center space-x-1.5 px-1 py-0.5 text-white/90">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{displayName} (You)</span>
                    </div>
                    {participants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center space-x-1.5 px-1 py-0.5 text-white/70"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            p.isOnline ? 'bg-amber-400' : 'bg-white/20'
                          }`}
                        />
                        <span>{p.name}</span>
                        {!p.isOnline && (
                          <span className="text-[9px] text-white/30 ml-auto">offline</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* In-Room Display Name bar */}
          <div className="px-3.5 py-1 bg-black/40 border-b border-white/5 flex items-center justify-between text-[10px] text-white/50 shrink-0">
            {isEditingNameInRoom ? (
              <div className="flex items-center space-x-1 w-full py-0.5">
                <input
                  type="text"
                  value={inRoomNameInput}
                  onChange={(e) => setInRoomNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveInRoomName();
                    if (e.key === 'Escape') setIsEditingNameInRoom(false);
                  }}
                  maxLength={24}
                  placeholder="New display name..."
                  className="flex-1 bg-white/10 border border-orange-500/40 rounded px-2 py-0.5 text-[11px] text-white focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={handleSaveInRoomName}
                  className="px-2 py-0.5 rounded bg-orange-600 text-white font-bold text-[10px]"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditingNameInRoom(false)}
                  className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[10px]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-1">
                  <span>Chatting as:</span>
                  <span className="font-bold text-orange-300">{displayName}</span>
                  <button
                    onClick={() => {
                      setInRoomNameInput(displayName);
                      setIsEditingNameInRoom(true);
                    }}
                    title="Change your display name"
                    className="p-0.5 hover:text-white transition-colors"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                </div>
                <div className="flex items-center space-x-1 text-white/35">
                  <Clock className="w-2.5 h-2.5" />
                  <span>Auto-saved in browser</span>
                </div>
              </>
            )}
          </div>

          {/* Status notice banner */}
          {statusNotice && (
            <div className="px-3 py-1 bg-orange-500/10 border-b border-orange-500/20 text-[11px] text-center text-orange-300 font-medium animate-fade-in shrink-0">
              {statusNotice}
            </div>
          )}

          {/* Messages Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar select-text">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-6 px-4 text-center space-y-3 opacity-80">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-md">
                  <Wifi className="w-6 h-6 stroke-[1.8]" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">
                    {isGroup ? 'Group Room' : 'PtoP Room'} #{activePin} is Live!
                  </p>
                  <p className="text-[11px] text-white/60 max-w-[250px] leading-relaxed">
                    Share PIN <strong className="text-amber-300">{activePin}</strong> with your{' '}
                    {isGroup ? 'friends' : 'friend'} on the same Wi-Fi. Messages will stay saved in your browser!
                  </p>
                </div>

                {/* Quick Icebreaker Chips */}
                <div className="pt-2 flex flex-wrap justify-center gap-1.5 max-w-[260px]">
                  <button
                    onClick={() => handleSendIcebreaker("👋 Hey! I'm on Z-Pilot.")}
                    className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/30 text-[10px] text-white/70 hover:text-orange-200 transition-colors cursor-pointer flex items-center space-x-1"
                  >
                    <span>Say Hello 👋</span>
                  </button>
                  <button
                    onClick={() => handleSendIcebreaker("Connected on same Wi-Fi 🚀")}
                    className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/30 text-[10px] text-white/70 hover:text-orange-200 transition-colors cursor-pointer"
                  >
                    <span>Connected on Wi-Fi 📶</span>
                  </button>
                  <button
                    onClick={handleCopyPin}
                    className="px-2.5 py-1 rounded-full bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-[10px] text-amber-300 transition-colors cursor-pointer"
                  >
                    <span>Copy PIN {activePin} 📋</span>
                  </button>
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
                  {/* Sender Name in Group/PtoP */}
                  {!msg.isMine && (
                    <span
                      className={`text-[10px] font-bold mb-0.5 ml-1 ${getSenderColor(
                        msg.senderName
                      )}`}
                    >
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
                    {renderMessageText(msg.text)}
                  </div>

                  {/* Timestamp & Delivery Check */}
                  <div className="flex items-center space-x-1 mt-0.5 px-1 font-mono text-[9px] text-white/35">
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {msg.isMine &&
                      (msg.delivered ? (
                        <CheckCheck className="w-3 h-3 text-amber-300" />
                      ) : (
                        <Check className="w-2.5 h-2.5 text-white/40" />
                      ))}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Browser Persistence Notice Footer */}
          <div className="px-3 py-1 bg-black/40 border-t border-white/5 flex items-center justify-between text-[9px] text-white/35 shrink-0">
            <span className="flex items-center space-x-1">
              <span>Saved in browser • Connection active</span>
            </span>
            <span>Room #{activePin} ({mode.toUpperCase()})</span>
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
              maxLength={2000}
              placeholder={isGroup ? 'Message group & hit Enter...' : 'Message friend & hit Enter...'}
              className="flex-1 bg-white/5 border border-white/15 focus:border-orange-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-white/35 focus:outline-none transition-colors select-text font-sans"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="w-9 h-9 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white flex items-center justify-center disabled:opacity-30 transition-all shadow-md shadow-orange-600/30 cursor-pointer active:scale-95 shrink-0"
            >
              <Send className={`w-4 h-4 stroke-[2.2] ${isSending ? 'opacity-50' : ''}`} />
            </button>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          onClick={() => setShowDeleteConfirm(false)}
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#160803] border border-orange-500/50 rounded-2xl p-4 max-w-xs w-full shadow-2xl space-y-3 animate-fade-in"
          >
            <div className="flex items-center space-x-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-xs font-bold text-white">Delete Room Messages?</h4>
            </div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              This will permanently delete all saved chat messages for Room #{activePin} from this browser.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white/80 font-medium transition-colors cursor-pointer active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs text-white font-bold transition-all shadow-md shadow-red-950 cursor-pointer active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe All Chats Confirmation Modal */}
      {showWipeAllConfirm && (
        <div
          onClick={() => setShowWipeAllConfirm(false)}
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#160803] border border-red-500/50 rounded-2xl p-4 max-w-xs w-full shadow-2xl space-y-3 animate-fade-in"
          >
            <div className="flex items-center space-x-2.5 text-red-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-xs font-bold text-white">Wipe All Saved Chats?</h4>
            </div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              This will permanently delete all chat history across ALL saved rooms from this browser storage.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setShowWipeAllConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white/80 font-medium transition-colors cursor-pointer active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWipeAll}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs text-white font-bold transition-all shadow-md shadow-red-950 cursor-pointer active:scale-95"
              >
                Wipe All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
