import React from 'react';
import { Sparkles, Settings, Plus } from 'lucide-react';
import { BackendHealth } from '../types/index.js';

interface HeaderProps {
  health: BackendHealth | null;
  checkingHealth: boolean;
  onOpenSettings: () => void;
  onNewChat: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  checkingHealth,
  onOpenSettings,
  onNewChat,
}) => {
  const isConnected = !!health;
  const isGeminiReady = health?.gemini.configured ?? false;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-pilot-border/80 bg-pilot-panel/90 backdrop-blur-md sticky top-0 z-20">
      {/* Brand logo & name */}
      <div className="flex items-center space-x-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-pilot-primary to-pilot-accent flex items-center justify-center shadow-lg shadow-pilot-primary/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-sm tracking-wide text-pilot-text-primary">
              Z-Pilot
            </span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-pilot-border text-pilot-text-secondary">
              AI Agent
            </span>
          </div>
        </div>
      </div>

      {/* Status indicator & Actions */}
      <div className="flex items-center space-x-2">
        {/* Connection status badge */}
        <div
          title={
            checkingHealth
              ? 'Checking backend...'
              : !isConnected
              ? 'Backend disconnected'
              : !isGeminiReady
              ? 'Gemini API key missing in backend/.env'
              : `Connected (${health?.gemini.model})`
          }
          className="flex items-center space-x-1.5 px-2 py-1 rounded-full bg-pilot-card border border-pilot-border text-[11px]"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              checkingHealth
                ? 'bg-pilot-warning animate-pulse'
                : isConnected && isGeminiReady
                ? 'bg-pilot-success shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                : 'bg-pilot-danger'
            }`}
          />
          <span className="text-pilot-text-secondary text-[11px] hidden sm:inline">
            {checkingHealth
              ? 'Checking...'
              : isConnected && isGeminiReady
              ? 'Ready'
              : !isConnected
              ? 'Offline'
              : 'Config Key'}
          </span>
        </div>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          title="Start new conversation"
          className="p-1.5 rounded-lg text-pilot-text-secondary hover:text-pilot-text-primary hover:bg-pilot-card transition-colors border border-transparent hover:border-pilot-border"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Open settings"
          className="p-1.5 rounded-lg text-pilot-text-secondary hover:text-pilot-text-primary hover:bg-pilot-card transition-colors border border-transparent hover:border-pilot-border"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
