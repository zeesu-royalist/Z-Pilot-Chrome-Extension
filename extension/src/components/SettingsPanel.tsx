import React from 'react';
import {
  X,
  Server,
  Sparkles,
  User,
  Trash2,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { BackendHealth, UserSettings } from '../types/index.js';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  health: BackendHealth | null;
  checkingHealth: boolean;
  onRefreshHealth: () => void;
  settings: UserSettings;
  onUpdateSettings: (settings: UserSettings) => void;
  onClearHistory: () => void;
  onOpenProfile: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  health,
  checkingHealth,
  onRefreshHealth,
  settings,
  onUpdateSettings,
  onClearHistory,
  onOpenProfile,
}) => {
  if (!isOpen) return null;

  const isConnected = !!health;
  const isGeminiReady = health?.gemini.configured ?? false;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-pilot-bg animate-fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pilot-border bg-pilot-panel">
        <h2 className="text-sm font-semibold text-white tracking-wide">
          Settings & Status
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-pilot-text-secondary hover:text-white hover:bg-pilot-card transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content scroll area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Backend & AI Status Card */}
        <div className="p-3.5 rounded-xl bg-pilot-card border border-pilot-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-pilot-primary" />
              <span className="text-xs font-semibold text-white">Backend Connection</span>
            </div>
            <button
              onClick={onRefreshHealth}
              disabled={checkingHealth}
              title="Refresh connection status"
              className="p-1 rounded text-pilot-text-muted hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin text-pilot-primary' : ''}`} />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-pilot-panel border border-pilot-border/50">
              <span className="text-pilot-text-secondary">Server Status:</span>
              <div className="flex items-center space-x-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-pilot-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-pilot-danger'
                  }`}
                />
                <span className="font-medium text-white">
                  {isConnected ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-pilot-panel border border-pilot-border/50">
              <span className="text-pilot-text-secondary">Gemini AI Model:</span>
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span className="font-mono text-[11px] text-white">
                  {health?.gemini.model || 'gemini-2.5-flash'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-pilot-panel border border-pilot-border/50">
              <span className="text-pilot-text-secondary">API Key Configured:</span>
              <span
                className={`font-medium ${
                  isGeminiReady ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isGeminiReady ? 'Yes' : 'Missing in backend/.env'}
              </span>
            </div>
          </div>

          {!isGeminiReady && (
            <div className="mt-3 p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-200 leading-relaxed">
              To enable AI planning, get a free Gemini API key from{' '}
              <a
                href="https://aistudio.google.com/"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-white inline-flex items-center space-x-0.5"
              >
                <span>Google AI Studio</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>{' '}
              and add it to <code className="bg-black/40 px-1 py-0.5 rounded">backend/.env</code>.
            </div>
          )}
        </div>

        {/* Backend URL Configuration */}
        <div className="p-3.5 rounded-xl bg-pilot-card border border-pilot-border">
          <label className="block text-xs font-semibold text-white mb-1.5">
            Backend Endpoint
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={settings.backendUrl}
              onChange={(e) =>
                onUpdateSettings({ ...settings, backendUrl: e.target.value })
              }
              placeholder="http://localhost:3000"
              className="flex-1 px-3 py-1.5 rounded-lg bg-pilot-panel border border-pilot-border text-xs text-white focus:outline-none focus:border-pilot-primary font-mono text-[11px]"
            />
          </div>
          <p className="text-[10px] text-pilot-text-muted mt-1.5">
            Default local development server runs on port 3000.
          </p>
        </div>

        {/* Local Profile Management */}
        <div className="p-3.5 rounded-xl bg-pilot-card border border-pilot-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Form Autofill Profile</div>
              <div className="text-[11px] text-pilot-text-muted mt-0.5">
                Manage your name, email, and details for safe form filling
              </div>
            </div>
            <button
              onClick={onOpenProfile}
              className="px-3 py-1.5 rounded-lg bg-pilot-primary hover:bg-pilot-primaryHover text-xs text-white font-medium transition-colors flex items-center space-x-1.5"
            >
              <User className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>

        {/* Chat History Management */}
        <div className="p-3.5 rounded-xl bg-pilot-card border border-pilot-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Clear Chat History</div>
              <div className="text-[11px] text-pilot-text-muted mt-0.5">
                Remove all saved messages from local browser storage
              </div>
            </div>
            <button
              onClick={onClearHistory}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors flex items-center space-x-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Privacy & Security Architecture */}
        <div className="p-3.5 rounded-xl bg-pilot-card border border-pilot-border text-xs space-y-2">
          <div className="flex items-center space-x-1.5 text-white font-semibold">
            <ShieldCheck className="w-4 h-4 text-pilot-success" />
            <span>Security & Privacy Architecture</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-pilot-text-muted text-[11px] leading-relaxed">
            <li>
              <strong className="text-pilot-text-secondary">Secret Isolation:</strong> Your Gemini API key never leaves the backend environment.
            </li>
            <li>
              <strong className="text-pilot-text-secondary">Untrusted Web Data:</strong> Webpage content is treated as untrusted text to prevent prompt injection.
            </li>
            <li>
              <strong className="text-pilot-text-secondary">User Approval:</strong> Sensitive actions (such as filling form details) always require your explicit preview and approval.
            </li>
            <li>
              <strong className="text-pilot-text-secondary">Local Storage:</strong> Conversation logs and autofill details are stored strictly in your browser's local sandbox.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
