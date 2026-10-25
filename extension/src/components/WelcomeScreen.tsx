import React, { useState } from 'react';
import {
  Paperclip,
  SendHorizontal,
  Key,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  FileText,
  FormInput,
  Globe,
  Youtube,
  Info,
} from 'lucide-react';
import { GeminiClient, sanitizeApiKey } from '../services/gemini-client.js';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  currentPageTitle?: string;
  isApiKeyConfigured?: boolean;
  onOpenSettings?: () => void;
  onSaveApiKey?: (apiKey: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectPrompt,
  currentPageTitle,
  isApiKeyConfigured = false,
  onOpenSettings,
  onSaveApiKey,
}) => {
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [showQuickGuide, setShowQuickGuide] = useState(false);

  const handleQuickConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = sanitizeApiKey(inputKey);
    if (!cleanKey) {
      setFeedback({ success: false, message: 'Please paste your Gemini API key.' });
      return;
    }

    setIsValidating(true);
    setFeedback(null);

    const test = await GeminiClient.testApiKey(cleanKey);
    if (test.success) {
      setFeedback({ success: true, message: 'Key connected! Starting Z-Pilot...' });
      setTimeout(() => {
        if (onSaveApiKey) {
          onSaveApiKey(cleanKey);
        }
      }, 600);
    } else {
      setFeedback({ success: false, message: test.message });
      setIsValidating(false);
    }
  };

  const [homeInput, setHomeInput] = useState('');

  const promptCards = [
    {
      title: 'Summarize active webpage',
      icon: FileText,
      prompt: 'Summarize the current webpage and give me the key points and insights.',
    },
    {
      title: 'Autofill page forms',
      icon: FormInput,
      prompt: 'Inspect any input forms on this page and help me autofill them with my saved profile.',
    },
    {
      title: 'Explain this website',
      icon: Globe,
      prompt: 'Explain what this website does, its purpose, and its key features.',
    },
    {
      title: 'Play music on YouTube',
      icon: Youtube,
      prompt: 'Search and play chill lofi beats on YouTube.',
    },
  ];

  const handleHomeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (homeInput.trim()) {
      onSelectPrompt(homeInput.trim());
      setHomeInput('');
    }
  };

  return (
    <div className="flex flex-col justify-between min-h-full px-5 pt-8 pb-6 text-left animate-fade-in font-sans">
      {/* Top Hero Section */}
      <div className="space-y-6">
        {/* Hero Title */}
        <div className="pt-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
            How can I help<br />
            you to browse today ?
          </h1>
        </div>

        {/* 🚀 First-Time Quick Setup Box (if API key not set) */}
        {!isApiKeyConfigured && (
          <div className="w-full p-4 rounded-2xl bg-black/60 border border-orange-500/30 text-left shadow-2xl backdrop-blur-xl animate-fade-in">
            <div className="flex items-center space-x-2 mb-2">
              <Key className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-xs font-semibold text-white tracking-wide">
                Activate Your Assistant
              </span>
            </div>

            <p className="text-[11px] text-white/70 mb-3 leading-relaxed">
              Enter your free Google Gemini API Key. Stored securely on your device:
            </p>

            <form onSubmit={handleQuickConnect} className="space-y-2.5">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={inputKey}
                  onChange={(e) => {
                    setInputKey(e.target.value);
                    setFeedback(null);
                  }}
                  placeholder="Paste Gemini API key here..."
                  autoFocus
                  className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder-white/40 focus:outline-none focus:border-orange-400 font-mono text-[11px] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={isValidating || !inputKey.trim()}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-semibold transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-orange-600/30 active:scale-[0.99]"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <span>Connect & Start</span>
                    <SendHorizontal className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            {feedback && (
              <div
                className={`mt-2.5 p-2 rounded-lg text-[11px] flex items-start space-x-1.5 ${
                  feedback.success
                    ? 'bg-orange-950/40 border border-orange-500/30 text-orange-200'
                    : 'bg-rose-950/40 border border-rose-500/30 text-rose-300'
                }`}
              >
                {feedback.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                )}
                <span className="leading-tight">{feedback.message}</span>
              </div>
            )}

            <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px]">
              <div className="flex items-center space-x-1.5">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-300 hover:text-white underline inline-flex items-center space-x-1"
                >
                  <span>Get free key</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>

                {/* Circular (i) info button */}
                <button
                  type="button"
                  onClick={() => setShowQuickGuide(!showQuickGuide)}
                  title={showQuickGuide ? 'Hide instructions' : 'How to get an API key step-by-step'}
                  className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                    showQuickGuide
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-white/5 hover:bg-orange-500/20 text-orange-400 border-orange-500/30'
                  }`}
                >
                  <Info className="w-3 h-3" />
                </button>
              </div>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-white/60 hover:text-white transition-colors cursor-pointer"
                >
                  Settings
                </button>
              )}
            </div>

            {/* Expandable Step-by-Step API Key Guide */}
            {showQuickGuide && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-orange-950/25 border border-orange-500/30 text-[11px] text-white/80 space-y-1.5 animate-fade-in">
                <div className="font-semibold text-white text-[11px] pb-1 border-b border-orange-500/20 flex items-center justify-between">
                  <span>4 Easy Steps to Get Your Free Key:</span>
                  <button
                    type="button"
                    onClick={() => setShowQuickGuide(false)}
                    className="text-white/40 hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <ol className="space-y-1 list-none text-white/80">
                  <li className="flex items-start space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                    <span>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-orange-400 underline">Google AI Studio</a>.</span>
                  </li>
                  <li className="flex items-start space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                    <span>Sign in with your Google account.</span>
                  </li>
                  <li className="flex items-start space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                    <span>Click <strong>&quot;Create API Key&quot;</strong>.</span>
                  </li>
                  <li className="flex items-start space-x-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>
                    <span>Copy &amp; paste it above, then click <strong>&quot;Connect &amp; Start&quot;</strong>!</span>
                  </li>
                </ol>
                <div className="text-[10px] text-white/50 pt-1 border-t border-orange-500/15">
                  ✓ 100% Free • No credit card required
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggestion Cards Row (Refined, Non-Vibe-Coded Icons) */}
        <div className="grid grid-cols-2 gap-2.5">
          {promptCards.map((card, idx) => {
            const IconComponent = card.icon;
            return (
              <button
                key={idx}
                onClick={() => onSelectPrompt(card.prompt)}
                className="p-4 rounded-2xl bg-black/40 hover:bg-black/60 border border-white/15 backdrop-blur-md text-left transition-all group cursor-pointer shadow-lg shadow-black/20 hover:border-orange-400/50 flex flex-col justify-between min-h-[104px] active:scale-95"
              >
                {/* Clean, purposeful Icon */}
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 group-hover:text-orange-300 group-hover:bg-orange-500/20 transition-all">
                  <IconComponent className="w-3.5 h-3.5 stroke-[1.75]" />
                </div>

                {/* Title */}
                <div className="text-xs font-semibold text-white/95 leading-snug group-hover:text-orange-200 transition-colors mt-3">
                  {card.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Elevated Frosted Glass Input Card (Screenshot 1) */}
      <div className="mt-8 rounded-3xl bg-black/70 backdrop-blur-xl border border-white/15 p-4 shadow-2xl space-y-4">
        {/* Text prompt form */}
        <form onSubmit={handleHomeSubmit}>
          <textarea
            value={homeInput}
            onChange={(e) => setHomeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleHomeSubmit();
              }
            }}
            rows={2}
            placeholder="Ask anything about this page, fill forms, or search web..."
            className="w-full bg-transparent resize-none text-xs text-white placeholder-white/45 focus:outline-none leading-relaxed font-sans"
          />
        </form>

        {/* Bottom toolbar inside card: paperclip, model selector, glowing send button */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2">
            {/* Paperclip / Context Icon */}
            <div
              title={currentPageTitle ? `Active context: ${currentPageTitle}` : 'Attach context or prompt'}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/80 transition-colors cursor-pointer"
            >
              <Paperclip className="w-4 h-4 stroke-[1.75]" />
            </div>

            {/* Model Selector Pill */}
            <button
              onClick={onOpenSettings}
              title="Change Gemini Model"
              className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-medium text-white/90 flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <span>Flash 2.5</span>
              <span className="text-[10px] text-white/60">▾</span>
            </button>
          </div>

          {/* Large Glowing Orange Send Action Button (Centered) */}
          <button
            onClick={() => handleHomeSubmit()}
            title="Send message"
            className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#EA580C] to-[#FB923C] hover:from-[#F97316] hover:to-[#FED7AA] text-white flex items-center justify-center shadow-lg shadow-orange-600/50 transition-all cursor-pointer active:scale-95"
          >
            <SendHorizontal className="w-5 h-5 stroke-[2.2] translate-x-[0.5px]" />
          </button>
        </div>
      </div>
    </div>
  );
};
