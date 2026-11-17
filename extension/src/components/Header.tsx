import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  X,
  User,
  Film,
  NotebookPen,
  Languages,
  CheckSquare,
  Calculator,
  ClipboardList,
  MessageCircle,
  Shield,
  MoreVertical,
  ArrowRightLeft,
  ScanText,
  EyeOff,
  ShoppingBag,
} from 'lucide-react';
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
  onOpenConverter?: () => void;
  onOpenCleanCopyOcr?: () => void;
  onOpenPrivacyBlur?: () => void;
  onOpenShopping?: () => void;
  onOpenClipboard?: () => void;
  onOpenClipBot?: () => void;
  clipsCount?: number;
  onOpenChat?: () => void;
  unreadChatCount?: number;
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
  onOpenConverter,
  onOpenCleanCopyOcr,
  onOpenPrivacyBlur,
  onOpenShopping,
  onOpenClipboard,
  onOpenClipBot,
  clipsCount = 0,
  onOpenChat,
  unreadChatCount = 0,
  onOpenAdBlocker,
  blockedAdsCount = 0,
  hasMessages = false,
  websiteUrl = 'https://zeesu-royalist.vercel.app',
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleOpenWebsite = () => {
    if (websiteUrl) {
      window.open(websiteUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const menuTools = [
    {
      label: 'Notes',
      icon: NotebookPen,
      onClick: onOpenQuickNotes,
      badge: notesCount > 0 ? (notesCount > 9 ? '9+' : String(notesCount)) : null,
      available: !!onOpenQuickNotes,
    },
    {
      label: 'Translator',
      icon: Languages,
      onClick: onOpenTranslator,
      badge: translationsCount > 0 ? (translationsCount > 9 ? '9+' : String(translationsCount)) : null,
      available: !!onOpenTranslator,
    },
    {
      label: 'Tasks',
      icon: CheckSquare,
      onClick: onOpenTodoList,
      badge: todosCount > 0 ? (todosCount > 9 ? '9+' : String(todosCount)) : null,
      available: !!onOpenTodoList,
    },
    {
      label: 'Calculator',
      icon: Calculator,
      onClick: onOpenCalculator,
      badge: null,
      available: !!onOpenCalculator,
    },
    {
      label: 'Converter',
      icon: ArrowRightLeft,
      onClick: onOpenConverter,
      badge: null,
      available: !!onOpenConverter,
    },
    {
      label: 'Clean & OCR',
      icon: ScanText,
      onClick: onOpenCleanCopyOcr,
      badge: null,
      available: !!onOpenCleanCopyOcr,
    },
    {
      label: 'Privacy Blur',
      icon: EyeOff,
      onClick: onOpenPrivacyBlur,
      badge: null,
      available: !!onOpenPrivacyBlur,
    },
    {
      label: 'Shopping',
      icon: ShoppingBag,
      onClick: onOpenShopping,
      badge: 'DEALS',
      available: !!onOpenShopping,
    },
    {
      label: 'Clipboard',
      icon: ClipboardList,
      onClick: onOpenClipboard || onOpenClipBot,
      badge: clipsCount > 0 ? (clipsCount > 9 ? '9+' : String(clipsCount)) : null,
      available: !!(onOpenClipboard || onOpenClipBot),
    },
    {
      label: 'Chat',
      icon: MessageCircle,
      onClick: onOpenChat,
      badge: unreadChatCount > 0 ? (unreadChatCount > 9 ? '9+' : String(unreadChatCount)) : null,
      available: !!onOpenChat,
    },
    {
      label: 'Ad Blocker',
      icon: Shield,
      onClick: onOpenAdBlocker,
      badge: blockedAdsCount > 0 ? (blockedAdsCount > 99 ? '99+' : String(blockedAdsCount)) : null,
      available: !!onOpenAdBlocker,
    },
    {
      label: 'Videos',
      icon: Film,
      onClick: onOpenVideoScanner,
      badge: detectedVideoCount > 0 ? (detectedVideoCount > 9 ? '9+' : String(detectedVideoCount)) : null,
      available: !!onOpenVideoScanner,
    },
  ].filter((t) => t.available);

  // If active chat is open, show Logo + Brand text on left, Close chat + 3-dot menu on right
  if (hasMessages) {
    return (
      <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sticky top-0 z-30">
        {/* Brand — logo + stacked text matching reference image */}
        <div className="flex items-center space-x-2.5">
          <BrandMark size={32} className="object-contain shrink-0" />
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-base tracking-tight text-white leading-tight drop-shadow-sm">
              Z-Pilot,
            </span>
            <span className="text-xs text-white/80 font-normal leading-tight mt-0.5">
              Browser Agent
            </span>
          </div>
        </div>

        {/* Right: Close chat pill + Single round 3-dot menu button */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onNewChat}
            title="Close chat and return home"
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white/90 hover:text-white flex items-center space-x-1.5 backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <X className="w-3.5 h-3.5 text-white/70 stroke-[2.2]" />
            <span>Close chat</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              title="Tools & Settings"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 border backdrop-blur-md ${isMenuOpen
                  ? 'bg-orange-500 text-white border-orange-400 shadow-orange-500/30'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-white/90 hover:text-white'
                }`}
            >
              <MoreVertical className="w-4 h-4 stroke-[2]" />
            </button>

            {/* Floating Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-[#120804]/95 border border-white/15 p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-fade-in text-white divide-y divide-white/10">
                <div className="space-y-0.5">
                  {menuTools.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <button
                        key={tool.label}
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          tool.onClick?.();
                        }}
                        className="w-full px-2.5 py-2 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors text-left group cursor-pointer"
                      >
                        <div className="flex items-center space-x-2.5">
                          <div className="w-6 h-6 rounded-lg bg-white/5 group-hover:bg-orange-500/20 text-white/80 group-hover:text-orange-300 flex items-center justify-center transition-colors">
                            <Icon className="w-3.5 h-3.5 stroke-[1.8]" />
                          </div>
                          <span className="text-xs font-medium text-white/90 group-hover:text-white">
                            {tool.label}
                          </span>
                        </div>
                        {tool.badge && (
                          <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-orange-500 text-white">
                            {tool.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl flex items-center space-x-2.5 hover:bg-white/10 transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-white/5 group-hover:bg-orange-500/20 text-white/80 group-hover:text-orange-300 flex items-center justify-center transition-colors">
                      <Settings className="w-3.5 h-3.5 stroke-[1.8]" />
                    </div>
                    <span className="text-xs font-medium text-white/90 group-hover:text-white">
                      Settings & API Key
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    );
  }

  // Home view — premium minimal header
  return (
    <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sticky top-0 z-20">
      {/* Brand — logo + stacked text matching reference image */}
      <div className="flex items-center space-x-2.5">
        <BrandMark size={32} className="object-contain shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-base tracking-tight text-white leading-tight drop-shadow-sm">
            Z-Pilot,
          </span>
          <span className="text-xs text-white/80 font-normal leading-tight mt-0.5">
            Browser Agent
          </span>
        </div>
      </div>

      {/* Right: Individual circular frosted buttons matching reference image */}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={handleOpenWebsite}
          title="Visit Creator Website (zeesu-royalist.vercel.app)"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <User className="w-4 h-4 stroke-[1.75]" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings & API Key"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <Settings className="w-4 h-4 stroke-[1.75]" />
        </button>
      </div>
    </header>
  );
};
