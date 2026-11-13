import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ArrowLeftRight,
  Copy,
  Trash2,
  Star,
  Search,
  Loader2,
  CheckCheck,
  Bookmark,
  Sparkles,
  Volume2,
  ChevronDown,
  RotateCcw,
  ClipboardPaste,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { StorageService } from '../services/storage.js';
import { translateText, SUPPORTED_LANGUAGES, LANG_LABEL } from '../services/translator.js';
import { SavedTranslation } from '../types/index.js';

interface TranslatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onHistoryCountChange?: (count: number) => void;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function speakText(text: string, langCode: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (langCode && langCode !== 'auto') {
      utterance.lang = langCode;
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[Translator] Speech synthesis error:', err);
  }
}

interface LanguageSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { code: string; label: string }[];
}

const LanguageSelect: React.FC<LanguageSelectProps> = ({
  label,
  value,
  onChange,
  options,
}) => {
  const currentLabel = LANG_LABEL[value] || (value === 'auto' ? 'Auto Detect' : value);
  return (
    <div className="relative flex-1 group">
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-b from-[#1f1208] to-[#120a04] border border-orange-500/25 group-hover:border-orange-500/50 shadow-sm transition-all duration-200">
        <div className="flex flex-col min-w-0 pr-1 text-left">
          <span className="text-[9px] font-bold uppercase tracking-wider text-orange-400/75 leading-none mb-1">
            {label}
          </span>
          <span className="text-xs font-semibold text-white truncate leading-none">
            {currentLabel}
          </span>
        </div>
        <div className="w-6 h-6 rounded-lg bg-white/5 group-hover:bg-orange-500/20 flex items-center justify-center transition-colors shrink-0">
          <ChevronDown className="w-3.5 h-3.5 text-orange-300 group-hover:text-orange-200 transition-colors" />
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 bg-transparent"
      >
        {options.map((opt) => (
          <option key={opt.code} value={opt.code} className="bg-[#191008] text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const TranslatorPanel: React.FC<TranslatorPanelProps> = ({
  isOpen,
  onClose,
  onHistoryCountChange,
}) => {
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('hi');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SavedTranslation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavs, setShowFavs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [detectedLang, setDetectedLang] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load history on open
  useEffect(() => {
    if (isOpen) {
      StorageService.getTranslations().then((t) => {
        setHistory(t);
        onHistoryCountChange?.(t.length);
      });
    }
  }, [isOpen]);

  const runTranslate = useCallback(
    async (text: string, sl: string, tl: string) => {
      if (!text.trim() || sl === tl) {
        setTranslatedText('');
        setError('');
        return;
      }
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setIsTranslating(true);
      setError('');

      const { translatedText: result, detectedLang: detected, error: err } = await translateText({
        text,
        sourceLang: sl,
        targetLang: tl,
        signal: ctrl.signal,
      });

      if (ctrl.signal.aborted) return;
      setIsTranslating(false);
      if (err && err !== 'cancelled') {
        setError(err);
      } else {
        setTranslatedText(result);
        setDetectedLang(detected && detected !== sl ? LANG_LABEL[detected] ?? detected : '');
      }
    },
    []
  );

  // Debounce auto-translate
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!sourceText.trim()) {
      setTranslatedText('');
      setDetectedLang('');
      return;
    }
    debounceRef.current = setTimeout(() => {
      runTranslate(sourceText, sourceLang, targetLang);
    }, 550);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sourceText, sourceLang, targetLang, runTranslate]);

  const handleSwapLangs = () => {
    if (sourceLang === 'auto') return;
    const newSrc = targetLang;
    const newTgt = sourceLang;
    const newText = translatedText;
    setSourceLang(newSrc);
    setTargetLang(newTgt);
    setSourceText(newText);
    setTranslatedText('');
  };

  const handleSaveToHistory = async () => {
    if (!sourceText.trim() || !translatedText.trim()) return;
    const entry = await StorageService.saveTranslation({
      sourceText: sourceText.trim(),
      translatedText: translatedText.trim(),
      sourceLang: sourceLang === 'auto' ? detectedLang || 'auto' : sourceLang,
      targetLang,
    });
    const updated = [entry, ...history].slice(0, 200);
    setHistory(updated);
    onHistoryCountChange?.(updated.length);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const handleDelete = async (id: string) => {
    const updated = await StorageService.deleteTranslation(id);
    setHistory(updated);
    onHistoryCountChange?.(updated.length);
  };

  const handleToggleFav = async (id: string) => {
    const updated = await StorageService.toggleFavTranslation(id);
    setHistory(updated);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setSourceText(text);
      }
    } catch {
      /* ignore */
    }
  };

  const handleLoadFromHistory = (item: SavedTranslation) => {
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
    setSourceText(item.sourceText);
    setTranslatedText(item.translatedText);
  };

  const filteredHistory = history.filter((t) => {
    if (showFavs && !t.favorite) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.sourceText.toLowerCase().includes(q) || t.translatedText.toLowerCase().includes(q);
  });

  if (!isOpen) return null;

  const availableTargetLangs = SUPPORTED_LANGUAGES.filter(
    (l) => l.code !== 'auto' && l.code !== sourceLang
  );
  const availableSourceLangs = SUPPORTED_LANGUAGES.filter((l) => l.code !== targetLang);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0502] overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-orange-500/20 bg-gradient-to-r from-black/80 via-[#180a04]/90 to-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex items-center space-x-2">
            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-bold text-white tracking-tight">Smart Translator</span>
              </div>
              <span className="text-[10px] text-white/50">Free Google AI translation</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close translator"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Language Selector Row */}
        <div className="p-2 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md shadow-lg shadow-black/30 space-y-2">
          <div className="flex items-center space-x-2">
            <LanguageSelect
              label="From"
              value={sourceLang}
              onChange={setSourceLang}
              options={availableSourceLangs}
            />

            <button
              type="button"
              onClick={handleSwapLangs}
              disabled={sourceLang === 'auto'}
              title={sourceLang === 'auto' ? 'Cannot swap with Auto Detect' : 'Swap languages'}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-b from-orange-500/20 to-orange-600/10 hover:from-orange-500/35 hover:to-orange-600/25 border border-orange-500/35 hover:border-orange-500/60 text-orange-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90 shadow-sm shrink-0 cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <LanguageSelect
              label="To"
              value={targetLang}
              onChange={setTargetLang}
              options={availableTargetLangs}
            />
          </div>

          {/* Quick Language Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5 pt-1 no-scrollbar">
            <span className="text-[10px] text-white/40 shrink-0 font-medium pl-1">Quick:</span>
            {[
              { sl: 'en', tl: 'hi', label: 'English ↔ Hindi' },
              { sl: 'hi', tl: 'en', label: 'Hindi ↔ English' },
              { sl: 'en', tl: 'es', label: 'English ↔ Spanish' },
              { sl: 'auto', tl: 'hi', label: 'Auto → Hindi' },
              { sl: 'auto', tl: 'en', label: 'Auto → English' },
            ].map((pair, idx) => {
              const isActive = sourceLang === pair.sl && targetLang === pair.tl;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSourceLang(pair.sl);
                    setTargetLang(pair.tl);
                    if (sourceText.trim()) {
                      runTranslate(sourceText, pair.sl, pair.tl);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold shadow-sm'
                      : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 hover:border-white/20'
                  }`}
                >
                  {pair.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input Area (Source Text) */}
        <div className="rounded-2xl border border-white/15 focus-within:border-orange-500/60 focus-within:ring-2 focus-within:ring-orange-500/20 bg-gradient-to-b from-[#140b05] to-[#0c0703] shadow-md transition-all overflow-hidden">
          {/* Top Info Bar */}
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/10 bg-black/30">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
                Source Text
              </span>
              {detectedLang && (
                <span className="px-1.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/35 text-[9px] text-orange-300 font-medium flex items-center space-x-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Detected: {detectedLang}</span>
                </span>
              )}
            </div>
            {!sourceText && (
              <button
                type="button"
                onClick={handlePaste}
                className="text-[11px] text-white/50 hover:text-orange-300 transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>Paste</span>
              </button>
            )}
          </div>

          {/* Textarea */}
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Type or paste any word, phrase, or sentence..."
            rows={4}
            className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none resize-none leading-relaxed font-sans"
          />

          {/* Bottom Bar */}
          <div className="flex items-center justify-between px-3.5 py-2 bg-black/30 border-t border-white/5">
            <span className="text-[10px] text-white/35 font-mono">
              {sourceText.length} characters
            </span>
            <div className="flex items-center space-x-2">
              {sourceText.trim() && (
                <button
                  type="button"
                  onClick={() => speakText(sourceText, sourceLang)}
                  title="Listen source text"
                  className="text-white/40 hover:text-orange-300 p-1 rounded-md transition-colors cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
              {sourceText && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceText('');
                    setTranslatedText('');
                    setDetectedLang('');
                  }}
                  className="text-[11px] text-white/45 hover:text-red-400 transition-colors cursor-pointer font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Output Area (Translated Text) */}
        <div className="rounded-2xl border border-orange-500/35 bg-gradient-to-b from-[#1f1006] via-[#160b04] to-[#0e0703] shadow-xl shadow-orange-950/30 overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-orange-500/20 bg-black/40">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Translation
              </span>
              <span className="px-2 py-0.5 rounded-full bg-orange-500/25 border border-orange-500/40 text-[9px] font-semibold text-orange-200">
                {LANG_LABEL[targetLang] ?? targetLang}
              </span>
            </div>
            {isTranslating ? (
              <div className="flex items-center space-x-1.5 text-orange-400/80">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px] font-medium">Translating...</span>
              </div>
            ) : translatedText ? (
              <span className="text-[10px] text-emerald-400 font-medium flex items-center space-x-1">
                <span>✓ Ready</span>
              </span>
            ) : null}
          </div>

          {/* Content Area */}
          <div className="px-4 py-3.5 min-h-[90px] flex items-center">
            {isTranslating ? (
              <div className="flex items-center space-x-2 text-orange-400/60 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Converting words...</span>
              </div>
            ) : error ? (
              <p className="text-xs text-red-400">{error}</p>
            ) : translatedText ? (
              <p className="text-base text-amber-50 font-medium leading-relaxed select-text">
                {translatedText}
              </p>
            ) : (
              <p className="text-xs text-white/30 italic">
                Translation will automatically appear here as you type...
              </p>
            )}
          </div>

          {/* Bottom Action Bar */}
          {translatedText && !isTranslating && (
            <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-orange-500/20 bg-black/40">
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => handleCopy(translatedText)}
                  className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                    copied
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/75 hover:text-white'
                  }`}
                >
                  {copied ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => speakText(translatedText, targetLang)}
                  title="Listen pronunciation"
                  className="flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/75 hover:text-orange-300 transition-all active:scale-95 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Listen</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveToHistory}
                className={`flex items-center space-x-1.5 text-xs px-3.5 py-1.5 rounded-xl font-semibold transition-all active:scale-95 cursor-pointer shadow-md ${
                  justSaved
                    ? 'bg-emerald-500/25 border border-emerald-500/50 text-emerald-300'
                    : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white border border-orange-400/40 shadow-orange-600/30'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" fill={justSaved ? 'currentColor' : 'none'} />
                <span>{justSaved ? 'Saved! ✓' : 'Save to History'}</span>
              </button>
            </div>
          )}
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="space-y-3 pt-2">
            {/* History Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white/80">Saved Translations</span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-mono text-white/60">
                  {history.length}
                </span>
                <button
                  type="button"
                  onClick={() => setShowFavs(!showFavs)}
                  className={`flex items-center space-x-1 text-[10px] px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${
                    showFavs
                      ? 'bg-amber-500/25 border-amber-500/50 text-amber-300 font-semibold'
                      : 'bg-white/5 border-white/15 text-white/50 hover:text-white'
                  }`}
                >
                  <Star className="w-2.5 h-2.5" fill={showFavs ? 'currentColor' : 'none'} />
                  <span>Favorites</span>
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history by word or sentence..."
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* History Cards */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {filteredHistory.length === 0 ? (
                <p className="text-center text-xs text-white/40 py-4">No matching translations</p>
              ) : (
                filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-gradient-to-b from-[#1a1008] to-[#120a05] border border-white/10 hover:border-orange-500/40 transition-all group shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs text-white/70 line-clamp-2 leading-relaxed">
                          {item.sourceText}
                        </p>
                        <p className="text-xs text-amber-200 font-medium line-clamp-2 leading-relaxed">
                          {item.translatedText}
                        </p>
                        <div className="flex items-center space-x-2 pt-0.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono">
                            {LANG_LABEL[item.sourceLang] ?? item.sourceLang} →{' '}
                            {LANG_LABEL[item.targetLang] ?? item.targetLang}
                          </span>
                          <span className="text-[9px] text-white/35">
                            {timeAgo(item.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* History Card Actions */}
                      <div className="flex items-center space-x-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleLoadFromHistory(item)}
                          title="Load into translator"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-orange-300 bg-white/5 hover:bg-orange-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => speakText(item.translatedText, item.targetLang)}
                          title="Listen"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-orange-300 bg-white/5 hover:bg-orange-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleFav(item.id)}
                          title={item.favorite ? 'Unstar' : 'Star'}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                            item.favorite
                              ? 'text-amber-400 bg-amber-500/20 border border-amber-500/35'
                              : 'text-white/30 hover:text-amber-400 bg-white/5'
                          }`}
                        >
                          <Star className="w-3 h-3" fill={item.favorite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.translatedText)}
                          title="Copy translation"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-all active:scale-95 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          title="Delete"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 bg-white/5 hover:bg-red-500/20 transition-all active:scale-95 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Empty state when no history */}
        {history.length === 0 && !sourceText && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3 opacity-60">
            <div className="text-center">
              <p className="text-xs font-semibold text-white/70">Ready to Translate</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                Type words or sentences above to get instant translations
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
