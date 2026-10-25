import React, { useState } from 'react';
import {
  X,
  Key,
  User,
  Trash2,
  ShieldCheck,
  ExternalLink,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  ChevronRight,
  Info,
} from 'lucide-react';
import { UserSettings, UserProfile } from '../types/index.js';
import { GeminiClient, sanitizeApiKey } from '../services/gemini-client.js';
import { BrandMark } from './BrandLogo.js';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  userProfile?: UserProfile;
  onUpdateSettings: (settings: UserSettings) => void;
  onClearHistory: () => void;
  onOpenProfile: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  settings,
  userProfile,
  onUpdateSettings,
  onClearHistory,
  onOpenProfile,
}) => {
  const [apiKey, setApiKey] = useState(settings.geminiApiKey || '');
  const [model, setModel] = useState(settings.geminiModel || 'gemini-3.5-flash-lite');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showApiGuide, setShowApiGuide] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    const cleanKey = sanitizeApiKey(apiKey);
    setApiKey(cleanKey);
    onUpdateSettings({
      ...settings,
      geminiApiKey: cleanKey,
      geminiModel: model,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2200);
  };

  const handleTestKey = async () => {
    const cleanKey = sanitizeApiKey(apiKey);
    if (!cleanKey) {
      setTestResult({ success: false, message: 'Please enter an API key first.' });
      return;
    }
    setApiKey(cleanKey);
    setIsTesting(true);
    setTestResult(null);
    const result = await GeminiClient.testApiKey(cleanKey);
    setTestResult(result);
    setIsTesting(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#080201] animate-fade-in font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#120502]">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={22} className="object-contain shrink-0" />
          <h2 className="text-sm font-semibold text-white tracking-wide">
            Settings & API Key
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content scroll area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Gemini API Key Configuration Card */}
        <div className="p-4 rounded-2xl bg-black/60 border border-white/10 space-y-3 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-semibold text-white tracking-wide">
                Google Gemini API Key
              </span>
            </div>
            {settings.geminiApiKey ? (
              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-orange-950/40 text-orange-300 border border-orange-500/30">
                Connected
              </span>
            ) : (
              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-amber-950/40 text-amber-300 border border-amber-500/30">
                Required
              </span>
            )}
          </div>

          <p className="text-[11px] text-white/60 leading-relaxed">
            Your key connects your browser directly to Google Gemini. Zero servers, zero tracking, 100% on your device.
          </p>

          {/* API Key Input */}
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
              placeholder="Paste Gemini API key here..."
              className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 font-mono text-[11px] transition-all"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Test & Save buttons */}
          <div className="flex items-center space-x-2 pt-1">
            <button
              onClick={handleTestKey}
              disabled={isTesting || !apiKey.trim()}
              className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-medium text-white/80 hover:text-white transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-40 cursor-pointer"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Connection</span>
              )}
            </button>

            <button
              onClick={handleSave}
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 shadow-md shadow-orange-600/30 cursor-pointer active:scale-95"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Key</span>
              )}
            </button>
          </div>

          {/* Test Feedback Message */}
          {testResult && (
            <div
              className={`p-2.5 rounded-xl text-[11px] flex items-start space-x-2 ${testResult.success
                  ? 'bg-orange-950/40 border border-orange-500/30 text-orange-200'
                  : 'bg-rose-950/40 border border-rose-500/30 text-rose-300'
                }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-400" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
              )}
              <span className="leading-tight">{testResult.message}</span>
            </div>
          )}

          {/* Link to Google AI Studio & How-to-get Guide Toggle */}
          <div className="pt-1 flex items-center justify-between text-[11px] text-white/50">
            <div className="flex items-center space-x-1.5 flex-wrap">
              <span>Need an API key?</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-orange-400 underline hover:text-orange-300 inline-flex items-center space-x-1"
              >
                <span>Get a FREE key from Google AI Studio</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            {/* Circular (i) info button */}
            <button
              type="button"
              onClick={() => setShowApiGuide(!showApiGuide)}
              title={showApiGuide ? 'Hide API key instructions' : 'How to get a free API key (Simple guide)'}
              className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all cursor-pointer shrink-0 ml-1.5 ${showApiGuide
                  ? 'bg-orange-500 text-white border-orange-400 shadow-sm shadow-orange-500/50 scale-105'
                  : 'bg-white/5 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 border-orange-500/30'
                }`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Step-by-Step Easy API Key Guide */}
          {showApiGuide && (
            <div className="mt-2 p-3 rounded-xl bg-orange-950/20 border border-orange-500/30 space-y-2 text-xs text-white/80 animate-fade-in shadow-inner">
              <div className="flex items-center justify-between pb-1.5 border-b border-orange-500/20">
                <span className="font-semibold text-white text-[11px] flex items-center space-x-1.5">
                  <span>How to Get Free API Key (4 Steps):</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowApiGuide(false)}
                  className="text-white/40 hover:text-white text-xs cursor-pointer p-0.5"
                >
                  ✕
                </button>
              </div>

              <ol className="space-y-1.5 text-[11px] list-none">
                <li className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                  <span>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-orange-400 underline hover:text-orange-300">Google AI Studio</a>.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                  <span>Sign in with your regular Google / Gmail account.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                  <span>Click the blue <strong>&quot;Create API Key&quot;</strong> button.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>
                  <span>Copy your generated key, paste it in the box above, and click <strong>&quot;Save Key&quot;</strong>.</span>
                </li>
              </ol>

              <div className="pt-1.5 border-t border-orange-500/15 flex items-center justify-between text-[10px] text-white/50">
                <span>✓ 100% Free • No credit card needed</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-400 hover:text-orange-300 font-medium inline-flex items-center space-x-0.5 underline"
                >
                  <span>Open AI Studio</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Model Selection Card */}
        <div className="p-4 rounded-2xl bg-black/60 border border-white/10 space-y-2 backdrop-blur-md">
          <div className="flex items-center space-x-2 text-xs font-semibold text-white">
            <Sliders className="w-3.5 h-3.5 text-orange-400" />
            <span>Gemini Model</span>
          </div>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              onUpdateSettings({ ...settings, geminiModel: e.target.value });
            }}
            className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-orange-400 font-sans transition-colors cursor-pointer"
          >
            <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Fastest & Recommended)</option>
            <option value="gemini-3.5-flash">gemini-3.5-flash (Standard)</option>
            <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Compact)</option>
          </select>
          <p className="text-[10px] text-white/40">
            Includes automatic model fallback if Google undergoes temporary demand spikes.
          </p>
        </div>

        {/* Local Profile Management */}
        <div className="p-4 rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                <User className="w-4 h-4 stroke-[1.75]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Form Autofill Profile</div>
                <div className="text-[11px] text-white/50 truncate max-w-[200px]">
                  {userProfile?.fullName
                    ? `${userProfile.fullName} • ${userProfile.email || 'Configured'}`
                    : 'Personal details for 1-click web form filling'}
                </div>
              </div>
            </div>
            <button
              onClick={onOpenProfile}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-xs text-white font-semibold transition-all shadow-md shadow-orange-600/30 flex items-center space-x-1.5 cursor-pointer active:scale-95 shrink-0"
            >
              <span>Edit Profile</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Chat History Management */}
        <div className="p-4 rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Clear Chat History</div>
              <div className="text-[11px] text-white/60 mt-0.5">
                Remove all saved messages from local browser storage
              </div>
            </div>
            <button
              onClick={onClearHistory}
              className="px-3 py-1.5 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Privacy & Security Card */}
        <div className="p-4 rounded-2xl bg-black/60 border border-white/10 text-xs space-y-2 backdrop-blur-md">
          <div className="flex items-center space-x-1.5 text-white font-semibold">
            <ShieldCheck className="w-4 h-4 text-orange-400" />
            <span>100% Client-Side Privacy</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-white/60 text-[11px] leading-relaxed">
            <li>
              <strong className="text-white/90">Direct API Calls:</strong> Extension communicates directly with Google Gemini using your API key. No intermediate servers.
            </li>
            <li>
              <strong className="text-white/90">Local Storage:</strong> Your API key and profile details are stored only in your browser&apos;s isolated sandbox.
            </li>
            <li>
              <strong className="text-white/90">Consequential Actions:</strong> Form filling and submitting always require your explicit preview and approval.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
