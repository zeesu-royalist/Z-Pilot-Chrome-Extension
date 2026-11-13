import React from 'react';
import { Settings, X, User, Home, Film, NotebookPen, Languages, CheckSquare, Calculator, ClipboardList, MessageCircle, Shield } from 'lucide-react';
import { BrandMark } from './BrandLogo.js';

interface HeaderProps {
  isApiKeyConfigured?: boolean;
  geminiModel?: string;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onOpenVideoScanner: () => void;
  detectedVideoCount?: number;
  onOpenQuickNotes?: () => void;
  notesCount?: number;
  onOpenTranslator?: () => void;
  translationsCount?: number;
  onOpenTodoList?: () => void;
  todosCount?: number;
  onOpenCalculator?: () => void;
  onOpenClipBot?: () => void;
  clipsCount?: number;
  onOpenChat?: () => void;
  onOpenAdBlocker?: () => void;
  blockedAdsCount?: number;
  hasMessages?: boolean;
  websiteUrl?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onNewChat,
  onOpenVideoScanner,
  detectedVideoCount = 0,
  onOpenQuickNotes,
  notesCount = 0,
  onOpenTranslator,
  translationsCount = 0,
  onOpenTodoList,
  todosCount = 0,
  onOpenCalculator,
  onOpenClipBot,
  clipsCount = 0,
  onOpenChat,
  onOpenAdBlocker,
  blockedAdsCount = 0,
  hasMessages = false,
  websiteUrl = 'https://zeesu-royalist.vercel.app',
}) => {
  const handleOpenWebsite = () => {
    if (websiteUrl) {
      window.open(websiteUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // If active chat is open, show Home button on left, Close chat in center, Settings on right
  if (hasMessages) {
    return (
      <header className="flex items-center justify-between px-4 py-3 sticky top-0 z-20 backdrop-blur-sm">
        {/* Left Home Button */}
        <button
          onClick={onNewChat}
          title="Back to Home"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/15 text-white/80 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <Home className="w-4 h-4 stroke-[1.75]" />
        </button>

        {/* Centered "✕ Close chat" pill */}
        <button
          onClick={onNewChat}
          title="Close chat and return home"
          className="px-4 py-1.5 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-xs text-white/90 hover:text-white flex items-center space-x-1.5 backdrop-blur-md transition-all cursor-pointer shadow-lg shadow-black/40 active:scale-95"
        >
          <X className="w-3.5 h-3.5 text-white/70" />
          <span className="font-medium">Close chat</span>
        </button>

        {/* Right Video Scan + Notes + Settings Buttons */}
        <div className="flex items-center space-x-1.5">
          {onOpenQuickNotes && (
            <button
              onClick={onOpenQuickNotes}
              title="Quick Notes"
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-amber-600/30 border border-white/15 hover:border-amber-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <NotebookPen className="w-4 h-4 stroke-[1.75]" />
              {notesCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-[8px] font-bold text-white flex items-center justify-center shadow">
                  {notesCount > 9 ? '9+' : notesCount}
                </span>
              )}
            </button>
          )}

          {onOpenTranslator && (
            <button
              onClick={onOpenTranslator}
              title="Translator"
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-amber-600/30 border border-white/15 hover:border-amber-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <Languages className="w-4 h-4 stroke-[1.75]" />
              {translationsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-[8px] font-bold text-white flex items-center justify-center shadow">
                  {translationsCount > 9 ? '9+' : translationsCount}
                </span>
              )}
            </button>
          )}

          {onOpenTodoList && (
            <button
              onClick={onOpenTodoList}
              title="Tasks & Reminders"
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-amber-600/30 border border-white/15 hover:border-amber-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <CheckSquare className="w-4 h-4 stroke-[1.75]" />
              {todosCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-[8px] font-bold text-white flex items-center justify-center shadow">
                  {todosCount > 9 ? '9+' : todosCount}
                </span>
              )}
            </button>
          )}

          {onOpenCalculator && (
            <button
              onClick={onOpenCalculator}
              title="Advanced Calculator"
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-amber-600/30 border border-white/15 hover:border-amber-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <Calculator className="w-4 h-4 stroke-[1.75]" />
            </button>
          )}

          {onOpenClipBot && (
            <button
              onClick={onOpenClipBot}
              title="ClipBot (Auto Clipboard Capture)"
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-orange-600/30 border border-white/15 hover:border-orange-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <ClipboardList className="w-4 h-4 stroke-[1.75]" />
              {clipsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-[9px] font-bold text-white flex items-center justify-center shadow">
                  {clipsCount > 9 ? '9+' : clipsCount}
                </span>
              )}
            </button>
          )}

          {onOpenChat && (
            <button
              onClick={onOpenChat}
              title="Friend Chat (Real-time)"
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-orange-600/30 border border-white/15 hover:border-orange-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <MessageCircle className="w-4 h-4 stroke-[1.75]" />
            </button>
          )}

          {onOpenAdBlocker && (
            <button
              onClick={onOpenAdBlocker}
              title="Add Blocker Ad Blocker"
              className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-orange-600/30 border border-white/15 hover:border-orange-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
            >
              <Shield className="w-4 h-4 stroke-[1.75]" />
              {blockedAdsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-3.5 px-0.5 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-[8px] font-bold text-white flex items-center justify-center shadow">
                  {blockedAdsCount > 99 ? '99+' : blockedAdsCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={onOpenVideoScanner}
            title="Scan & Download Webpage Videos (1-Click)"
            className="relative w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-orange-600/30 border border-white/15 hover:border-orange-500/50 text-white/85 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
          >
            <Film className="w-4 h-4 stroke-[1.75]" />
            {detectedVideoCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-[9px] font-bold text-white flex items-center justify-center shadow">
                {detectedVideoCount > 9 ? '9+' : detectedVideoCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenSettings}
            title="Settings & API Key"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/15 text-white/80 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
          >
            <Settings className="w-4 h-4 stroke-[1.75]" />
          </button>
        </div>
      </header>
    );
  }

  // Home view — premium minimal header
  return (
    <header className="flex items-center justify-between px-4 py-3 sticky top-0 z-20 backdrop-blur-md border-b border-white/[0.04]">
      {/* Brand — logo + badge */}
      <div className="flex items-center space-x-2.5">
        <BrandMark size={26} className="object-contain shrink-0" />
        <div className="flex items-center space-x-2">
          <span className="font-bold text-sm tracking-tight text-white">
            Z-Pilot
          </span>
          <span className="text-[10px] font-medium text-zinc-400 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full">
            Browser Agent
          </span>
        </div>
      </div>

      {/* Right: User + Settings — sleek minimal pill */}
      <div className="flex items-center space-x-1 bg-white/[0.04] border border-white/[0.08] p-1 rounded-xl">
        <button
          type="button"
          onClick={handleOpenWebsite}
          title="Visit Creator Website"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer active:scale-95"
        >
          <User className="w-3.5 h-3.5 stroke-[1.8]" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings & API Key"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer active:scale-95"
        >
          <Settings className="w-3.5 h-3.5 stroke-[1.8]" />
        </button>
      </div>
    </header>
  );
};
