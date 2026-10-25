import React from 'react';
import { Settings, X, User, Home } from 'lucide-react';
import { BrandMark } from './BrandLogo.js';

interface HeaderProps {
  isApiKeyConfigured?: boolean;
  geminiModel?: string;
  onOpenSettings: () => void;
  onNewChat: () => void;
  hasMessages?: boolean;
  websiteUrl?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onNewChat,
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

        {/* Right Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings & API Key"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/15 text-white/80 hover:text-white backdrop-blur-md transition-all cursor-pointer active:scale-95"
        >
          <Settings className="w-4 h-4 stroke-[1.75]" />
        </button>
      </header>
    );
  }

  // Home view top bar (from Screenshot 1)
  return (
    <header className="flex items-center justify-between px-4 py-3 sticky top-0 z-20">
      {/* Brand logo & "Z-Pilot, Welcome back" (No circle border wrapper) */}
      <div className="flex items-center space-x-2.5">
        <BrandMark size={32} className="object-contain shrink-0" />
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight text-white leading-tight">
            Z-Pilot,
          </span>
          <span className="text-xs text-white/70 font-normal">
            Browser Agent
          </span>
        </div>
      </div>

      {/* Right Circular Frosted Buttons */}
      <div className="flex items-center space-x-2">
        {/* User Website button (next to Settings) */}
        <button
          onClick={handleOpenWebsite}
          title="Visit Creator Website (zeesu-royalist.vercel.app)"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <User className="w-4 h-4 stroke-[1.75]" />
        </button>

        {/* Menu / Settings Button */}
        <button
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
