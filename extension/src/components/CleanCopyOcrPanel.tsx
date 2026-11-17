import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Copy,
  Check,
  Sparkles,
  Link2,
  WrapText,
  FileCode,
  Type,
  Trash2,
  ClipboardPaste,
  Video,
  Camera,
  Image as ImageIcon,
  Upload,
  BookOpen,
  ArrowRight,
  Loader2,
  Key,
  Languages,
  Code,
  ListOrdered,
  FileText,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import {
  CaseStyle,
  CleanCopyTab,
  DetectedPageImage,
  OcrExtractMode,
  WebpageVideoFrame,
} from '../types/index.js';
import { StorageService } from '../services/storage.js';
import {
  captureActiveVideoFrame,
  captureTabScreenshot,
  cleanAllText,
  cleanQuotesAndChars,
  convertHtmlToMarkdown,
  extractTextWithGeminiVision,
  getDetectedPageImages,
  getTextStats,
  stripTrackingUrls,
  transformCase,
  unwrapBrokenLines,
} from '../services/clean-copy-ocr.js';

interface CleanCopyOcrPanelProps {
  isOpen: boolean;
  onClose: () => void;
  geminiApiKey?: string;
  onOpenSettings?: () => void;
  onSendToChat?: (text: string) => void;
  currentPageTitle?: string;
  currentPageUrl?: string;
}

export const CleanCopyOcrPanel: React.FC<CleanCopyOcrPanelProps> = ({
  isOpen,
  onClose,
  geminiApiKey = '',
  onOpenSettings,
  onSendToChat,
  currentPageTitle,
  currentPageUrl,
}) => {
  const [activeTab, setActiveTab] = useState<CleanCopyTab>('clean_copy');

  // ── Clean Copy Studio State ──
  const [inputText, setInputText] = useState<string>('');
  const [copiedClean, setCopiedClean] = useState<boolean>(false);
  const [savedToNotes, setSavedToNotes] = useState<boolean>(false);
  const [showCaseMenu, setShowCaseMenu] = useState<boolean>(false);

  // ── OCR Extractor State ──
  const [ocrImageSource, setOcrImageSource] = useState<string | null>(null);
  const [ocrImageName, setOcrImageName] = useState<string>('');
  const [ocrSourceType, setOcrSourceType] = useState<'image' | 'video' | 'screen'>('image');
  const [ocrMode, setOcrMode] = useState<OcrExtractMode>('raw');
  const [targetTranslateLang, setTargetTranslateLang] = useState<string>('English');
  const [isExtractingOcr, setIsExtractingOcr] = useState<boolean>(false);
  const [ocrResultText, setOcrResultText] = useState<string>('');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [copiedOcr, setCopiedOcr] = useState<boolean>(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState<boolean>(false);
  const [pageImages, setPageImages] = useState<DetectedPageImage[]>([]);
  const [videoFrameMeta, setVideoFrameMeta] = useState<WebpageVideoFrame | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persistent preferences
  useEffect(() => {
    if (!isOpen) return;

    StorageService.getCleanCopyPreferences().then((prefs) => {
      setActiveTab(prefs.lastTab || 'clean_copy');
      setOcrMode(prefs.lastOcrMode || 'raw');
      if (prefs.targetTranslateLang) {
        setTargetTranslateLang(prefs.targetTranslateLang);
      }
    });
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showImagePickerModal) {
          setShowImagePickerModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showImagePickerModal, onClose]);

  // Global Clipboard Paste listener when in OCR tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'ocr_extractor') return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setOcrImageSource(event.target.result as string);
                setOcrImageName('Pasted Screenshot / Image');
                setOcrSourceType('image');
                setOcrError(null);
              }
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, activeTab]);

  const handleTabChange = (tab: CleanCopyTab) => {
    setActiveTab(tab);
    void StorageService.saveCleanCopyPreferences({ lastTab: tab });
  };

  // ── Clean Copy Operations ──
  const stats = useMemo(() => getTextStats(inputText), [inputText]);

  const handleCleanAll = () => {
    if (!inputText) return;
    const cleaned = cleanAllText(inputText);
    setInputText(cleaned);
  };

  const handleStripUrls = () => {
    if (!inputText) return;
    setInputText(stripTrackingUrls(inputText));
  };

  const handleUnwrapLines = () => {
    if (!inputText) return;
    setInputText(unwrapBrokenLines(inputText));
  };

  const handleHtmlToMarkdown = () => {
    if (!inputText) return;
    setInputText(convertHtmlToMarkdown(inputText));
  };

  const handleStandardizeQuotes = () => {
    if (!inputText) return;
    setInputText(cleanQuotesAndChars(inputText, { stripCitations: false, stripQuotesPrefix: false }));
  };

  const handleStripCitations = () => {
    if (!inputText) return;
    setInputText(cleanQuotesAndChars(inputText, { stripCitations: true }));
  };

  const handleStripEmailQuotes = () => {
    if (!inputText) return;
    setInputText(cleanQuotesAndChars(inputText, { stripQuotesPrefix: true }));
  };

  const handleApplyCase = (style: CaseStyle) => {
    if (!inputText) return;
    setInputText(transformCase(inputText, style));
    setShowCaseMenu(false);
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputText(text);
        }
      }
    } catch {
      // Fallback
    }
  };

  const handleGetTabSelection = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }, (res) => {
            if (res && res.selectedText) {
              setInputText(res.selectedText);
            } else if (res && res.extractedText) {
              setInputText(res.extractedText.slice(0, 4000));
            }
          });
        }
      });
    }
  };

  const handleCopyCleanText = () => {
    if (!inputText) return;
    navigator.clipboard?.writeText(inputText);
    setCopiedClean(true);
    setTimeout(() => setCopiedClean(false), 2000);
  };

  const handleSaveToNotes = async (textToSave: string, title?: string) => {
    if (!textToSave.trim()) return;
    await StorageService.addNote({
      title: title || (currentPageTitle ? `Notes: ${currentPageTitle.slice(0, 30)}` : 'Clean Text Extract'),
      content: textToSave,
      pageUrl: currentPageUrl,
      pageTitle: currentPageTitle,
    });
    setSavedToNotes(true);
    setTimeout(() => setSavedToNotes(false), 2000);
  };

  // ── OCR Operations ──

  const handleSnapVideoFrame = async () => {
    setOcrError(null);
    try {
      const frame = await captureActiveVideoFrame();
      setOcrImageSource(frame.dataUrl);
      setOcrImageName(frame.videoTitle || 'Active Video Snapshot');
      setOcrSourceType('video');
      setVideoFrameMeta(frame);

      // If active subtitles are detected in DOM, populate preview result
      if (frame.domSubtitles && frame.domSubtitles.length > 0) {
        setOcrResultText(frame.domSubtitles.join(' '));
      }
    } catch (err: unknown) {
      setOcrError(
        err instanceof Error ? err.message : 'Could not capture active video frame.'
      );
    }
  };

  const handleCaptureScreen = async () => {
    setOcrError(null);
    try {
      const dataUrl = await captureTabScreenshot();
      setOcrImageSource(dataUrl);
      setOcrImageName(`Tab Screenshot: ${currentPageTitle || 'Active Webpage'}`);
      setOcrSourceType('screen');
      setVideoFrameMeta(null);
    } catch (err: unknown) {
      setOcrError(
        err instanceof Error ? err.message : 'Could not capture visible browser tab.'
      );
    }
  };

  const handleOpenPageImagePicker = async () => {
    setOcrError(null);
    const images = await getDetectedPageImages();
    setPageImages(images);
    setShowImagePickerModal(true);
  };

  const handleSelectPageImage = (img: DetectedPageImage) => {
    setOcrImageSource(img.src);
    setOcrImageName(img.title || img.alt || 'Webpage Image');
    setOcrSourceType('image');
    setVideoFrameMeta(null);
    setShowImagePickerModal(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setOcrImageSource(event.target.result as string);
        setOcrImageName(file.name);
        setOcrSourceType('image');
        setOcrError(null);
        setVideoFrameMeta(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunOcrExtraction = async () => {
    if (!ocrImageSource) {
      setOcrError('Please select or upload an image / video frame first.');
      return;
    }

    if (!geminiApiKey || !geminiApiKey.trim()) {
      setOcrError('Google Gemini API Key is required for high-precision OCR. Connect your free key in Settings.');
      return;
    }

    setIsExtractingOcr(true);
    setOcrError(null);

    try {
      const result = await extractTextWithGeminiVision({
        apiKey: geminiApiKey,
        base64Data: ocrImageSource,
        mode: ocrMode,
        targetLang: targetTranslateLang,
        sourceType: ocrSourceType,
      });

      setOcrResultText(result.text);
    } catch (err: unknown) {
      setOcrError(
        err instanceof Error
          ? err.message
          : 'Failed to extract text. Please verify your internet connection and API key.'
      );
    } finally {
      setIsExtractingOcr(false);
    }
  };

  const handleTransferToCleanStudio = () => {
    if (ocrResultText) {
      setInputText(ocrResultText);
      setActiveTab('clean_copy');
    }
  };

  const handleCopyOcrResult = () => {
    if (!ocrResultText) return;
    navigator.clipboard?.writeText(ocrResultText);
    setCopiedOcr(true);
    setTimeout(() => setCopiedOcr(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0502] overflow-hidden font-sans select-none animate-fade-in text-white">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/80 via-[#180a04]/90 to-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-tight flex items-center space-x-1.5">
              <span>Clean Copy & OCR</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-orange-500/20 text-orange-400 font-mono font-semibold border border-orange-500/30">
                PRO
              </span>
            </span>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tab Switcher: Clean Copy | OCR Extractor ── */}
      <div className="px-3 pt-3 shrink-0">
        <div className="p-1 rounded-2xl bg-black/60 border border-white/10 grid grid-cols-2 gap-1 shadow-md">
          <button
            type="button"
            onClick={() => handleTabChange('clean_copy')}
            className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'clean_copy'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Clean Copy Studio</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('ocr_extractor')}
            className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'ocr_extractor'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Image & Video OCR</span>
          </button>
        </div>
      </div>

      {/* ── Tab Contents ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
        {/* ══════════════════════════════════════════════════════
            TAB 1: CLEAN COPY STUDIO
           ══════════════════════════════════════════════════════ */}
        {activeTab === 'clean_copy' && (
          <div className="space-y-3 animate-fade-in">
            {/* Quick Source Action Pills */}
            <div className="flex items-center justify-between text-xs text-white/60 px-0.5">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-[11px] font-medium text-white/90 flex items-center space-x-1 transition-all cursor-pointer shrink-0"
                >
                  <ClipboardPaste className="w-3 h-3 text-orange-400" />
                  <span>Paste Clipboard</span>
                </button>

                <button
                  type="button"
                  onClick={handleGetTabSelection}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-[11px] font-medium text-white/90 flex items-center space-x-1 transition-all cursor-pointer shrink-0"
                >
                  <BookOpen className="w-3 h-3 text-amber-400" />
                  <span>Get Tab Text</span>
                </button>
              </div>

              {inputText.length > 0 && (
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  title="Clear all text"
                  className="text-[11px] text-white/40 hover:text-red-400 transition-colors cursor-pointer flex items-center space-x-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Main Textarea Box */}
            <div className="relative rounded-2xl bg-black/60 border border-white/15 focus-within:border-orange-500/60 p-3 transition-colors shadow-lg shadow-black/40">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={7}
                placeholder="Paste messy text, articles, PDF clips, or URLs here to instantly clean..."
                className="w-full bg-transparent resize-none text-xs text-white placeholder-white/40 focus:outline-none leading-relaxed font-mono"
              />

              {/* Live Character & Word Statistics Bar */}
              <div className="pt-2 mt-1 border-t border-white/10 flex flex-wrap items-center justify-between gap-1 text-[10px] text-white/50 font-mono">
                <div className="flex items-center space-x-2">
                  <span>{stats.words} words</span>
                  <span>•</span>
                  <span>{stats.charactersWithSpaces} chars</span>
                  <span>•</span>
                  <span>{stats.paragraphs} paras</span>
                </div>
                <span>~{stats.readingTimeMinutes} min read</span>
              </div>
            </div>

            {/* Quick Clean Operation Buttons */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider block px-1">
                Instant Cleaning Rules
              </span>

              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                {/* Clean All Button */}
                <button
                  type="button"
                  onClick={handleCleanAll}
                  disabled={!inputText}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-600/20 hover:from-orange-500/35 hover:to-amber-600/35 border border-orange-500/40 text-left transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-40"
                >
                  <div className="w-6 h-6 rounded-lg bg-orange-500/30 text-orange-300 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Clean Everything</div>
                    <div className="text-[9px] text-white/40 truncate">Strip UTM, unwrap, quotes</div>
                  </div>
                </button>

                {/* Strip Tracking URLs */}
                <button
                  type="button"
                  onClick={handleStripUrls}
                  disabled={!inputText}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/30 text-left transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-40"
                >
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <Link2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Strip UTM & Tracking</div>
                    <div className="text-[9px] text-white/40 truncate">Clean all web links</div>
                  </div>
                </button>

                {/* Unwrap Broken Lines (PDF Fixer) */}
                <button
                  type="button"
                  onClick={handleUnwrapLines}
                  disabled={!inputText}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/30 text-left transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-40"
                >
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <WrapText className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Unwrap PDF Lines</div>
                    <div className="text-[9px] text-white/40 truncate">Fix artificial line breaks</div>
                  </div>
                </button>

                {/* HTML to Clean Markdown */}
                <button
                  type="button"
                  onClick={handleHtmlToMarkdown}
                  disabled={!inputText}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/30 text-left transition-all cursor-pointer flex items-center space-x-2 disabled:opacity-40"
                >
                  <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <FileCode className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">HTML → Markdown</div>
                    <div className="text-[9px] text-white/40 truncate">Remove spans & tags</div>
                  </div>
                </button>
              </div>

              {/* Secondary Clean Actions Row */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  onClick={handleStandardizeQuotes}
                  disabled={!inputText}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/70 hover:text-white transition-all cursor-pointer shrink-0 disabled:opacity-40"
                >
                  Standardize Quotes ("")
                </button>

                <button
                  type="button"
                  onClick={handleStripCitations}
                  disabled={!inputText}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/70 hover:text-white transition-all cursor-pointer shrink-0 disabled:opacity-40"
                >
                  Strip Citations [1]
                </button>

                <button
                  type="button"
                  onClick={handleStripEmailQuotes}
                  disabled={!inputText}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/70 hover:text-white transition-all cursor-pointer shrink-0 disabled:opacity-40"
                >
                  Strip Quotes (&gt;)
                </button>

                {/* Case Transformer Dropdown Trigger */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCaseMenu(!showCaseMenu)}
                    disabled={!inputText}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/70 hover:text-white transition-all cursor-pointer flex items-center space-x-1 disabled:opacity-40"
                  >
                    <Type className="w-3 h-3" />
                    <span>Change Case ▾</span>
                  </button>

                  {showCaseMenu && (
                    <div className="absolute left-0 bottom-full mb-1 z-30 w-36 rounded-xl bg-[#1a0c05] border border-orange-500/30 p-1 shadow-2xl space-y-0.5">
                      {[
                        { label: 'Title Case', style: 'title' as CaseStyle },
                        { label: 'Sentence case', style: 'sentence' as CaseStyle },
                        { label: 'UPPERCASE', style: 'upper' as CaseStyle },
                        { label: 'lowercase', style: 'lower' as CaseStyle },
                        { label: 'camelCase', style: 'camel' as CaseStyle },
                        { label: 'snake_case', style: 'snake' as CaseStyle },
                        { label: 'kebab-case', style: 'kebab' as CaseStyle },
                      ].map((c) => (
                        <button
                          key={c.style}
                          type="button"
                          onClick={() => handleApplyCase(c.style)}
                          className="w-full text-left px-2 py-1 rounded-lg text-[11px] text-white/80 hover:text-white hover:bg-orange-500/20 cursor-pointer"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Primary Action Button: Copy Clean Text */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleCopyCleanText}
                disabled={!inputText}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-orange-600/30 active:scale-[0.99] disabled:opacity-40"
              >
                {copiedClean ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span className="text-emerald-100">Cleaned & Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Clean Text</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveToNotes(inputText)}
                  disabled={!inputText}
                  className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-40"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>{savedToNotes ? 'Saved to Notes!' : 'Save to Notes'}</span>
                </button>

                {onSendToChat && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendToChat(inputText);
                      onClose();
                    }}
                    disabled={!inputText}
                    className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-40"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-orange-400" />
                    <span>Send to AI Chat</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 2: INSTANT OCR EXTRACTOR (IMAGE & VIDEO)
           ══════════════════════════════════════════════════════ */}
        {activeTab === 'ocr_extractor' && (
          <div className="space-y-3 animate-fade-in">
            {/* API Key Missing Alert */}
            {(!geminiApiKey || !geminiApiKey.trim()) && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-orange-950/40 via-amber-950/30 to-black/60 border border-orange-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-orange-400 shrink-0" />
                  <span className="text-white/80 text-[11px]">
                    Connect your free Gemini key to run AI Vision OCR
                  </span>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-300 font-bold text-[10px] hover:bg-orange-500/30 transition-all cursor-pointer shrink-0"
                  >
                    Connect
                  </button>
                )}
              </div>
            )}

            {/* 4 Extraction Source Buttons */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider block px-1">
                Select Extraction Source
              </span>

              <div className="grid grid-cols-2 gap-2">
                {/* 1. Snap Video Frame */}
                <button
                  type="button"
                  onClick={handleSnapVideoFrame}
                  className="p-3 rounded-xl bg-gradient-to-b from-[#180e06] to-[#0e0703] hover:from-[#221309] hover:to-[#140a04] border border-orange-500/30 hover:border-orange-500/60 text-left transition-all cursor-pointer flex items-center space-x-2.5 group active:scale-95 shadow-md shadow-black/40"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 group-hover:bg-orange-500/30 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white group-hover:text-amber-200 truncate">
                      Snap Video Frame
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      Active video on page
                    </div>
                  </div>
                </button>

                {/* 2. Capture Visible Tab Screen */}
                <button
                  type="button"
                  onClick={handleCaptureScreen}
                  className="p-3 rounded-xl bg-gradient-to-b from-[#180e06] to-[#0e0703] hover:from-[#221309] hover:to-[#140a04] border border-orange-500/30 hover:border-orange-500/60 text-left transition-all cursor-pointer flex items-center space-x-2.5 group active:scale-95 shadow-md shadow-black/40"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30 flex items-center justify-center shrink-0">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white group-hover:text-amber-200 truncate">
                      Capture Tab Area
                    </div>
                    <div className="text-[10px] text-white/40 truncate">
                      Visible screen snip
                    </div>
                  </div>
                </button>

                {/* 3. Pick Image From Webpage */}
                <button
                  type="button"
                  onClick={handleOpenPageImagePicker}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/40 text-left transition-all cursor-pointer flex items-center space-x-2.5 group active:scale-95"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Pick Page Image</div>
                    <div className="text-[10px] text-white/40 truncate">Scan webpage images</div>
                  </div>
                </button>

                {/* 4. Upload or Paste Image File */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/40 text-left transition-all cursor-pointer flex items-center space-x-2.5 group active:scale-95"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Upload / Paste</div>
                    <div className="text-[10px] text-white/40 truncate">Ctrl+V or file drop</div>
                  </div>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Image Preview Box (if selected) */}
            {ocrImageSource && (
              <div className="p-3 rounded-2xl bg-black/50 border border-orange-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="font-bold text-white truncate max-w-[180px]">
                      {ocrImageName || 'Selected Image'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 uppercase font-mono">
                      {ocrSourceType}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setOcrImageSource(null);
                      setVideoFrameMeta(null);
                      setOcrResultText('');
                    }}
                    className="text-[10px] text-white/40 hover:text-red-400 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>

                <div className="relative max-h-40 overflow-hidden rounded-xl bg-black/80 flex items-center justify-center border border-white/10">
                  <img
                    src={ocrImageSource}
                    alt="Source for OCR"
                    className="max-h-40 object-contain w-full"
                  />

                  {videoFrameMeta?.currentTime !== undefined && (
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white/80">
                      {Math.floor(videoFrameMeta.currentTime)}s
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* OCR Mode Selector Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider block px-1">
                Extraction Mode
              </span>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'raw' as OcrExtractMode, label: 'Raw Text', icon: Type },
                  { id: 'markdown' as OcrExtractMode, label: 'Markdown', icon: ListOrdered },
                  { id: 'code' as OcrExtractMode, label: 'Code & Data', icon: Code },
                  { id: 'translate' as OcrExtractMode, label: 'Translate', icon: Languages },
                  { id: 'summarize' as OcrExtractMode, label: 'Summary', icon: BookOpen },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setOcrMode(m.id);
                      void StorageService.saveCleanCopyPreferences({ lastOcrMode: m.id });
                    }}
                    className={`flex-1 min-w-[95px] py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      ocrMode === m.id
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                        : 'bg-black/60 border border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <m.icon className="w-3 h-3" />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              {ocrMode === 'translate' && (
                <div className="pt-1.5 flex items-center space-x-2 text-xs">
                  <span className="text-white/50 text-[11px]">Translate to:</span>
                  <select
                    value={targetTranslateLang}
                    onChange={(e) => {
                      setTargetTranslateLang(e.target.value);
                      void StorageService.saveCleanCopyPreferences({
                        targetTranslateLang: e.target.value,
                      });
                    }}
                    className="flex-1 bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none [color-scheme:dark]"
                  >
                    {[
                      'English',
                      'Hindi',
                      'Spanish',
                      'French',
                      'German',
                      'Japanese',
                      'Chinese',
                      'Arabic',
                      'Russian',
                      'Portuguese',
                    ].map((lang) => (
                      <option key={lang} value={lang} className="bg-[#180a04] text-white">
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Error Message */}
            {ocrError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs leading-relaxed">
                {ocrError}
              </div>
            )}

            {/* Extract Button */}
            <button
              type="button"
              onClick={handleRunOcrExtraction}
              disabled={isExtractingOcr || !ocrImageSource}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-orange-600/30 active:scale-[0.99] disabled:opacity-40"
            >
              {isExtractingOcr ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Scanning & Extracting Text with AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Extract Text Now (AI Vision)</span>
                </>
              )}
            </button>

            {/* Extracted Result Area */}
            {ocrResultText && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#180e06] to-[#0e0703] border border-orange-500/30 shadow-xl space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span className="font-bold text-white flex items-center space-x-1">
                    <span>Extracted Text</span>
                    <span className="text-[10px] text-orange-400 font-mono">
                      ({ocrResultText.length} chars)
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={handleCopyOcrResult}
                    className="flex items-center space-x-1 text-[11px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer active:scale-95 transition-all"
                  >
                    {copiedOcr ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <textarea
                  value={ocrResultText}
                  onChange={(e) => setOcrResultText(e.target.value)}
                  rows={6}
                  className="w-full bg-black/60 border border-white/10 rounded-xl p-2.5 text-xs font-mono text-white leading-relaxed focus:outline-none"
                />

                {/* Post-OCR Next Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTransferToCleanStudio}
                    className="py-2 px-3 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Open in Clean Studio</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveToNotes(ocrResultText, `OCR: ${ocrImageName || 'Extract'}`)}
                    className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Save to Notes</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Page Image Picker Modal Drawer ── */}
      {showImagePickerModal && (
        <div
          onClick={() => setShowImagePickerModal(false)}
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[#140803] border border-orange-500/40 p-4 shadow-2xl space-y-3 max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-bold text-xs text-white">
                Pick Webpage Image ({pageImages.length})
              </span>
              <button
                type="button"
                onClick={() => setShowImagePickerModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-1">
              {pageImages.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/50">
                  No images detected on active webpage. Try using "Capture Tab Area" instead.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {pageImages.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPageImage(img)}
                      className="p-1.5 rounded-xl bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 transition-all cursor-pointer flex flex-col items-center group"
                    >
                      <div className="w-full h-24 rounded-lg bg-black/60 overflow-hidden flex items-center justify-center">
                        <img
                          src={img.src}
                          alt={img.alt || 'Webpage graphic'}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <span className="text-[10px] text-white/70 group-hover:text-amber-200 truncate w-full text-center mt-1 px-1">
                        {img.title || img.alt || `Image ${idx + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
