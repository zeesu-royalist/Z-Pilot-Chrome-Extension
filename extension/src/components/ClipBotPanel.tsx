import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  ClipboardList,
  Copy,
  CheckCheck,
  Trash2,
  Search,
  ExternalLink,
  Pin,
  PinOff,
  ClipboardPaste,
  Clock,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { StorageService } from '../services/storage.js';
import { ClipItem } from '../types/index.js';

interface ClipBotPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClipBotPanel: React.FC<ClipBotPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pastedStatus, setPastedStatus] = useState<string | null>(null);

  // Load clips on open
  const loadClips = useCallback(async () => {
    const items = await StorageService.getClipbotItems();
    setClips(items);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadClips();
    }
  }, [isOpen, loadClips]);

  // Auto-sync with system clipboard when panel is open or sidepanel gets focus
  const checkSystemClipboard = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text ? text.trim() : '';
      if (!trimmed) return;

      const current = await StorageService.getClipbotItems();
      if (current.length > 0 && current[0].text === trimmed) {
        return; // Already the latest clip
      }

      const updated = await StorageService.addClipbotItem(
        trimmed,
        'Mac / Browser Clipboard',
        'Auto-Captured'
      );
      setClips(updated);
    } catch {
      // Ignore if document not focused or permission denied
    }
  }, []);

  // Check clipboard on open, window focus, pointer interaction, and active interval
  useEffect(() => {
    if (!isOpen) return;

    checkSystemClipboard();

    const handleInteraction = () => {
      checkSystemClipboard();
    };

    window.addEventListener('focus', handleInteraction);
    window.addEventListener('mouseenter', handleInteraction);
    window.addEventListener('pointerdown', handleInteraction);
    document.addEventListener('visibilitychange', handleInteraction);

    const interval = setInterval(() => {
      if (document.hasFocus()) {
        checkSystemClipboard();
      }
    }, 1500);

    return () => {
      window.removeEventListener('focus', handleInteraction);
      window.removeEventListener('mouseenter', handleInteraction);
      window.removeEventListener('pointerdown', handleInteraction);
      document.removeEventListener('visibilitychange', handleInteraction);
      clearInterval(interval);
    };
  }, [isOpen, checkSystemClipboard]);

  // Real-time listener for clipboard updates from background or other tabs
  useEffect(() => {
    if (!isOpen) return;

    // Listen to storage changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes['zpilot_clipbot_items']) {
        const newItems = changes['zpilot_clipbot_items'].newValue;
        if (Array.isArray(newItems)) {
          setClips(newItems.slice(0, 10));
        }
      }
    };

    // Listen to runtime message broadcast
    const handleRuntimeMessage = (message: { type?: string; items?: ClipItem[] }) => {
      if (message?.type === 'CLIPBOT_UPDATED' && Array.isArray(message.items)) {
        setClips(message.items.slice(0, 10));
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      }
    };
  }, [isOpen]);

  // 1-Click Copy to Clipboard
  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Fallback if needed
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  // Manual Paste from Clipboard
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setPastedStatus('Clipboard is empty!');
        setTimeout(() => setPastedStatus(null), 2000);
        return;
      }
      const updated = await StorageService.addClipbotItem(text.trim(), window.location.href, 'Manual Paste');
      setClips(updated);
      setPastedStatus('Clip added!');
      setTimeout(() => setPastedStatus(null), 2000);
    } catch {
      setPastedStatus('Cannot read clipboard');
      setTimeout(() => setPastedStatus(null), 2000);
    }
  };

  // Delete clip
  const handleDelete = async (id: string) => {
    const updated = await StorageService.deleteClipbotItem(id);
    setClips(updated);
  };

  // Toggle pin
  const handleTogglePin = async (id: string) => {
    const updated = await StorageService.togglePinClipbotItem(id);
    setClips(updated);
  };

  // Relative time helper
  const formatTimeAgo = (ts: number): string => {
    const diff = Math.max(0, Date.now() - ts);
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'Just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Extract hostname for clean source pill
  const formatHost = (url?: string): string => {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  // Filtered clips
  const filteredClips = useMemo(() => {
    let list = [...clips];
    // Sort pinned on top, then newest
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp - a.timestamp;
    });

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        c.sourceTitle?.toLowerCase().includes(q) ||
        c.sourceUrl?.toLowerCase().includes(q)
    );
  }, [clips, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0502] overflow-hidden font-sans select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/80 via-[#180a04]/90 to-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-white tracking-tight">
              ClipBot
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 border border-orange-500/30 text-orange-300 font-mono">
              {clips.length}/10
            </span>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={onClose}
            title="Close ClipBot"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col p-3 overflow-hidden space-y-2.5">
        {/* Quick Toolbar: Search & Manual Paste */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex-1 relative flex items-center">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search copied clips..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/40 font-sans"
            />
          </div>

          <button
            onClick={handlePasteFromClipboard}
            title="Paste current system clipboard into ClipBot"
            className="h-8 px-2.5 rounded-xl bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-xs text-white/70 hover:text-orange-200 transition-all flex items-center space-x-1 cursor-pointer shrink-0 active:scale-95"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-orange-400" />
            <span>{pastedStatus || 'Paste'}</span>
          </button>
        </div>

        {/* Auto-listening Banner */}
        <div className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent border border-orange-500/20 flex items-center justify-between text-[11px] shrink-0">
          <div className="flex items-center space-x-1.5 text-orange-300">
            <span className="font-medium">Auto-captures any text you copy in browser</span>
          </div>
          <span className="text-[10px] text-white/40 font-mono">Max 10</span>
        </div>

        {/* Clips List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 no-scrollbar">
          {filteredClips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-lg shadow-orange-500/10">
                <ClipboardList className="w-6 h-6 stroke-[1.8]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">ClipBot is Ready</p>
                <p className="text-xs text-white/50 max-w-[260px] leading-relaxed">
                  Select and copy (Ctrl+C / Cmd+C) any text on any webpage. Your 10 latest clips will automatically appear here!
                </p>
              </div>
              <button
                onClick={handlePasteFromClipboard}
                className="mt-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white text-xs font-bold transition-all active:scale-95 shadow-md shadow-orange-600/30 flex items-center space-x-1.5 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste Current Clipboard</span>
              </button>
            </div>
          ) : (
            filteredClips.map((clip) => {
              const isCopied = copiedId === clip.id;
              const host = formatHost(clip.sourceUrl);
              const isUrl = /^https?:\/\/[^\s]+$/.test(clip.text.trim());

              return (
                <div
                  key={clip.id}
                  className={`p-3 rounded-2xl border transition-all space-y-2 group shadow-sm ${
                    clip.pinned
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-amber-500/5'
                      : 'bg-black/50 hover:bg-black/70 border-white/10 hover:border-orange-500/35'
                  }`}
                >
                  {/* Card Header: Badges & Controls */}
                  <div className="flex items-center justify-between gap-1 text-[10px]">
                    <div className="flex items-center space-x-1.5 overflow-hidden">
                      {/* Time */}
                      <span className="flex items-center space-x-1 text-white/40 shrink-0">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatTimeAgo(clip.timestamp)}</span>
                      </span>

                      {/* Source Domain */}
                      {host && (
                        <span
                          title={clip.sourceTitle || clip.sourceUrl}
                          className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/60 truncate max-w-[120px]"
                        >
                          {host}
                        </span>
                      )}

                      {/* Character Count */}
                      <span className="text-white/30 font-mono shrink-0">
                        {clip.text.length} chars
                      </span>
                    </div>

                    {/* Actions: Pin & Delete */}
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleTogglePin(clip.id)}
                        title={clip.pinned ? 'Unpin clip' : 'Pin clip'}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                          clip.pinned
                            ? 'bg-amber-500/25 border-amber-500/50 text-amber-300'
                            : 'bg-white/5 hover:bg-white/15 border-white/10 text-white/40 hover:text-white'
                        }`}
                      >
                        {clip.pinned ? (
                          <PinOff className="w-3 h-3" />
                        ) : (
                          <Pin className="w-3 h-3" />
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(clip.id)}
                        title="Delete clip"
                        className="w-6 h-6 rounded-lg flex items-center justify-center bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-white/40 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Card Body: Text Content */}
                  <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 max-h-36 overflow-y-auto no-scrollbar font-mono text-xs text-white/90 whitespace-pre-wrap select-text break-words">
                    {clip.text}
                  </div>

                  {/* Card Footer: 1-Click Copy & Open Link if URL */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    {isUrl ? (
                      <a
                        href={clip.text.trim()}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-orange-400 hover:text-orange-300 underline underline-offset-2 flex items-center space-x-1 cursor-pointer truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">Open Link</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-white/30">1-click restore</span>
                    )}

                    <button
                      onClick={() => handleCopy(clip.id, clip.text)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0 active:scale-95 shadow-sm ${
                        isCopied
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-emerald-500/20'
                          : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 border-orange-400/40 text-white shadow-orange-600/30'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

