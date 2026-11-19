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
  Film,
  NotebookPen,
  Languages,
  CheckSquare,
  Calculator,
  MessageCircle,
  ShieldCheck,
  ArrowRightLeft,
  ScanText,
  ShoppingBag,
  UserCheck,
} from 'lucide-react';
import { GeminiClient, sanitizeApiKey } from '../services/gemini-client.js';
import { UserProfile } from '../types/index.js';
import { AutofillService } from '../services/autofill-service.js';
import { BrowserActionService } from '../services/browser-actions.js';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string) => void;
  currentPageTitle?: string;
  geminiModel?: string;
  isApiKeyConfigured?: boolean;
  onOpenSettings?: () => void;
  onSaveApiKey?: (apiKey: string) => void;
  onOpenVideoScanner?: () => void;
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
  onOpenAutofillProfile?: () => void;
  userProfile?: UserProfile;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectPrompt,
  currentPageTitle,
  geminiModel = 'gemini-3.5-flash-lite',
  isApiKeyConfigured = false,
  onOpenSettings,
  onSaveApiKey,
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
  onOpenClipboard: _onOpenClipboard,
  onOpenClipBot: _onOpenClipBot,
  clipsCount = 0,
  onOpenChat,
  unreadChatCount = 0,
  onOpenAdBlocker,
  blockedAdsCount = 0,
  onOpenAutofillProfile,
  userProfile,
}) => {
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [autofillToast, setAutofillToast] = useState<{
    type: 'loading' | 'success' | 'info' | 'error';
    message: string;
    details?: string[];
  } | null>(null);

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

  const handleAutofillFormCardClick = async () => {
    const filledCount = userProfile ? AutofillService.getFilledCount(userProfile) : 0;
    if (!userProfile || filledCount === 0) {
      // Profile empty -> open data entry window (ProfileModal)
      if (onOpenAutofillProfile) {
        onOpenAutofillProfile();
      }
      return;
    }

    // Profile has data -> directly trigger 1-click form autofill on active page
    setAutofillToast({
      type: 'loading',
      message: '⚡ Scanning and filling forms on active page...',
    });

    try {
      const res = await BrowserActionService.autofillPageForm(userProfile, {
        overwriteExisting: false,
      });

      if (res.success && res.filledCount > 0) {
        const fieldNames = res.filledDetails.map((d) => d.fieldName).slice(0, 5);
        setAutofillToast({
          type: 'success',
          message: `✓ Successfully filled ${res.filledCount} field(s) on this page!`,
          details: fieldNames,
        });
      } else if (res.totalScanned > 0) {
        setAutofillToast({
          type: 'info',
          message: `Found ${res.totalScanned} inputs, but existing fields already had data or no matching profile fields.`,
        });
      } else {
        setAutofillToast({
          type: 'info',
          message: 'No fillable form inputs found on this page.',
        });
      }
    } catch (err: unknown) {
      setAutofillToast({
        type: 'error',
        message: (err as Error).message || 'Failed to communicate with webpage script.',
      });
    }

    setTimeout(() => {
      setAutofillToast(null);
    }, 4500);
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
      onClick: handleAutofillFormCardClick,
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

  const appLauncherItems = [
    {
      id: 'notes',
      label: 'Notes',
      icon: NotebookPen,
      onClick: onOpenQuickNotes,
      badge: notesCount > 0 ? (notesCount > 9 ? '9+' : String(notesCount)) : undefined,
      title: 'Quick notes & scratchpad',
    },
    {
      id: 'translator',
      label: 'Translator',
      icon: Languages,
      onClick: onOpenTranslator,
      badge: translationsCount > 0 ? (translationsCount > 9 ? '9+' : String(translationsCount)) : undefined,
      title: 'Smart translator',
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: CheckSquare,
      onClick: onOpenTodoList,
      badge: todosCount > 0 ? (todosCount > 9 ? '9+' : String(todosCount)) : undefined,
      title: 'Tasks & reminders',
    },
    {
      id: 'calc',
      label: 'Calculator',
      icon: Calculator,
      onClick: onOpenCalculator,
      badge: undefined,
      title: 'Advanced scientific calculator',
    },
    {
      id: 'converter',
      label: 'Converter',
      icon: ArrowRightLeft,
      onClick: onOpenConverter,
      badge: undefined,
      title: 'Currency, Unit & Timezone Converter',
    },
    {
      id: 'clean_copy_ocr',
      label: 'Clean Copy',
      icon: ScanText,
      onClick: onOpenCleanCopyOcr,
      badge: clipsCount > 0 ? (clipsCount > 9 ? '9+' : String(clipsCount)) : 'AI',
      title: 'Clean Copy Studio, OCR Extractor & Clipboard History',
    },
    {
      id: 'privacy_blur',
      label: 'Privacy Blur',
      icon: EyeOff,
      onClick: onOpenPrivacyBlur,
      badge: undefined,
      title: 'Web Privacy, Element Blur & Drag-Drop Blur Masks',
    },
    {
      id: 'shopping',
      label: 'Shopping',
      icon: ShoppingBag,
      onClick: onOpenShopping,
      badge: 'DEALS',
      title: 'Price Tracker, Fake Review Shield & Coupons',
    },
    {
      id: 'autofill',
      label: 'Form Fill',
      icon: UserCheck,
      onClick: onOpenAutofillProfile,
      badge: 'JOBS',
      title: 'Job & Form Autofill Profile (35+ Fields, Resume & Photo)',
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageCircle,
      onClick: onOpenChat,
      badge: unreadChatCount > 0 ? String(unreadChatCount) : 'PIN',
      title: 'Instant friend chat',
    },
    {
      id: 'shield',
      label: 'Ad Blocker',
      icon: ShieldCheck,
      onClick: onOpenAdBlocker,
      badge: blockedAdsCount > 0 ? (blockedAdsCount > 99 ? '99+' : String(blockedAdsCount)) : 'ON',
      title: 'Z-Shield ad blocker',
    },
    {
      id: 'video',
      label: 'Videos',
      icon: Film,
      onClick: onOpenVideoScanner,
      badge: detectedVideoCount > 0 ? (detectedVideoCount > 9 ? '9+' : String(detectedVideoCount)) : undefined,
      title: 'Scan & download webpage videos',
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
    <div className="flex flex-col justify-between min-h-full px-3 sm:px-4 pt-3 pb-4 font-sans animate-fade-in overflow-y-auto no-scrollbar gap-3 sm:gap-4">
      {/* Top Hero Section */}
      <div className="space-y-3 sm:space-y-4">
        {/* Hero Title & Browsing Context */}
        <div className="pt-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-tight drop-shadow-sm">
            How can I help<br />you to browse today ?
          </h1>
        </div>

        {/* 🚀 First-Time Quick Setup Box (if API key not set) */}
        {!isApiKeyConfigured && (
          <div className="w-full p-4 rounded-2xl bg-[#121214]/90 border border-orange-500/25 text-left shadow-xl backdrop-blur-xl animate-fade-in space-y-3">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Key className="w-3.5 h-3.5 stroke-[2]" />
              </div>
              <span className="text-xs font-semibold text-white tracking-wide">
                Activate Your Assistant
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
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
                  className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-400/60 font-mono text-[11px] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
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
                className={`p-2 rounded-lg text-[11px] flex items-start space-x-1.5 ${feedback.success
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

            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
              <div className="flex items-center space-x-1.5">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-400 hover:text-orange-300 underline inline-flex items-center space-x-1"
                >
                  <span>Get free key</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setShowQuickGuide(!showQuickGuide)}
                  title={showQuickGuide ? 'Hide instructions' : 'How to get an API key step-by-step'}
                  className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all cursor-pointer ${showQuickGuide
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
                  className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  Settings
                </button>
              )}
            </div>

            {showQuickGuide && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-300 space-y-1.5">
                <div className="font-semibold text-white text-[11px] pb-1 border-b border-white/[0.06] flex items-center justify-between">
                  <span>4 Easy Steps to Get Your Free Key:</span>
                  <button
                    type="button"
                    onClick={() => setShowQuickGuide(false)}
                    className="text-zinc-500 hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <ol className="space-y-1 list-none text-zinc-400">
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
                <div className="text-[10px] text-zinc-500 pt-1 border-t border-white/[0.06]">
                  ✓ 100% Free • No credit card required
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Quick Tools Dock (4x3 Sleek App Launcher) ── */}
        <div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {appLauncherItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                title={item.title}
                className="relative flex flex-col items-center justify-center py-2 px-0.5 rounded-xl bg-black/20 hover:bg-black/35 border border-white/15 hover:border-white/30 transition-all cursor-pointer group active:scale-95 text-center focus:outline-none backdrop-blur-md shadow-sm"
              >
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-[9px] font-bold text-white flex items-center justify-center font-mono leading-none shadow-md border border-[#1b0802]">
                    {item.badge}
                  </span>
                )}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white/90 group-hover:text-amber-200 transition-colors">
                  <item.icon className="w-[18px] h-[18px] stroke-[2]" />
                </div>
                <span className="text-[11px] font-semibold text-white group-hover:text-amber-100 mt-1 leading-tight truncate max-w-full px-0.5 transition-colors drop-shadow-sm">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Suggested Actions (2x2 Reference Matching Cards) ── */}
        <div className="pt-4 sm:pt-6">
          <div className="flex items-center justify-between px-0.5 mb-2 sm:mb-2.5">
            <span className="text-[11px] font-bold text-white/90 uppercase tracking-wider drop-shadow-sm">
              Suggested Actions
            </span>
          </div>

          {/* Live Autofill Toast on Main Screen */}
          {autofillToast && (
            <div
              className={`mb-2.5 p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all animate-fade-in ${
                autofillToast.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : autofillToast.type === 'loading'
                  ? 'bg-orange-950/40 border-orange-500/40 text-orange-200'
                  : autofillToast.type === 'error'
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                {autofillToast.type === 'loading' && (
                  <div className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                {autofillToast.type === 'success' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                {autofillToast.type === 'error' && (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                {autofillToast.type === 'info' && (
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="font-medium">{autofillToast.message}</div>
                  {autofillToast.details && autofillToast.details.length > 0 && (
                    <div className="text-[10px] text-emerald-300/80 mt-0.5">
                      Filled: {autofillToast.details.join(', ')}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setAutofillToast(null)}
                className="text-white/40 hover:text-white text-xs ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            {promptCards.map((card, idx) => {
              const IconComponent = card.icon;
              return (
                <button
                  key={idx}
                  onClick={() => (card.onClick ? card.onClick() : onSelectPrompt(card.prompt))}
                  className="p-3 sm:p-3.5 rounded-2xl bg-black/20 hover:bg-black/35 border border-white/15 hover:border-white/30 text-left transition-all group cursor-pointer shadow-sm backdrop-blur-md flex flex-col justify-between min-h-[88px] sm:min-h-[92px] active:scale-[0.98] focus:outline-none"
                >
                  <div className="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-400/35 flex items-center justify-center text-orange-200 group-hover:text-white transition-all shadow-inner">
                    <IconComponent className="w-4 h-4 stroke-[2]" />
                  </div>
                  <div className="text-xs sm:text-[13px] font-bold text-white leading-snug group-hover:text-amber-100 transition-colors mt-2 drop-shadow-sm">
                    {card.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom Input Bar (Reference Matching Command Box) ── */}
      <div className="mt-2 rounded-3xl bg-black/60 backdrop-blur-xl border border-white/15 p-3.5 sm:p-4 shadow-xl">
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
            className="w-full bg-transparent resize-none text-[13px] text-white placeholder-white/55 focus:outline-none leading-relaxed font-sans"
          />
        </form>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/15">
          <div className="flex items-center space-x-2">
            <div
              title={currentPageTitle ? `Active context: ${currentPageTitle}` : 'Attach context'}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/90 hover:text-white transition-all cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5 stroke-[2]" />
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              title="Change Gemini Model"
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <span>
                {geminiModel.includes('2.5')
                  ? 'Flash 2.5'
                  : geminiModel.includes('flash-lite')
                    ? 'Flash 3.5 Lite'
                    : 'Flash 3.5'}
              </span>
              <span className="text-[10px] text-white/70">▾</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleHomeSubmit()}
            disabled={!homeInput.trim()}
            title="Send message (Enter)"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              homeInput.trim()
                ? 'bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-600/40 hover:shadow-orange-500/50 cursor-pointer'
                : 'bg-white/10 text-white/30 cursor-not-allowed shadow-none'
            }`}
          >
            <SendHorizontal className="w-4 h-4 stroke-[2.2] translate-x-[0.5px]" />
          </button>
        </div>
      </div>
    </div>
  );
};
