import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Shield,
  MousePointerClick,
  Crop,
  DollarSign,
  Mail,
  Image as ImageIcon,
  Sliders,
  RotateCcw,
  Sparkles,
  Info,
  Check,
  Lock,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { BlurStyle, PrivacyBlurPreferences, PrivacyBlurStats } from '../types/index.js';
import { StorageService } from '../services/storage.js';

interface PrivacyBlurPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageUrl?: string;
}

export const PrivacyBlurPanel: React.FC<PrivacyBlurPanelProps> = ({
  isOpen,
  onClose,
  currentPageUrl,
}) => {
  // Config state
  const [blurIntensity, setBlurIntensity] = useState<number>(12);
  const [blurStyle, setBlurStyle] = useState<BlurStyle>('blur');
  const [hoverToReveal, setHoverToReveal] = useState<boolean>(true);
  const [rememberPerDomain, setRememberPerDomain] = useState<boolean>(true);

  // Active Modes
  const [isClickToBlurActive, setIsClickToBlurActive] = useState<boolean>(false);
  const [isDrawBoxActive, setIsDrawBoxActive] = useState<boolean>(false);
  const [isFinancialsActive, setIsFinancialsActive] = useState<boolean>(false);
  const [isPiiActive, setIsPiiActive] = useState<boolean>(false);
  const [isMediaActive, setIsMediaActive] = useState<boolean>(false);
  const [isPrivacyScreenActive, setIsPrivacyScreenActive] = useState<boolean>(false);

  // Live Stats
  const [blurredElementCount, setBlurredElementCount] = useState<number>(0);
  const [customBoxCount, setCustomBoxCount] = useState<number>(0);
  const [isPageConnected, setIsPageConnected] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Derive current domain
  const currentDomain = useMemo(() => {
    if (!currentPageUrl) return '';
    try {
      const u = new URL(currentPageUrl);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }, [currentPageUrl]);

  // Helper to send messages to active tab content script
  const sendToTab = async (message: Record<string, unknown>): Promise<any> => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setIsPageConnected(false);
        return null;
      }
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id as number, message, (res) => {
          if (chrome.runtime.lastError) {
            setIsPageConnected(false);
            resolve(null);
          } else {
            setIsPageConnected(true);
            resolve(res);
          }
        });
      });
    } catch {
      setIsPageConnected(false);
      return null;
    }
  };

  // Sync stats from content script response
  const applyStats = (stats?: PrivacyBlurStats) => {
    if (!stats) return;
    setBlurredElementCount(stats.blurredElementCount || 0);
    setCustomBoxCount(stats.customBoxCount || 0);
    setIsFinancialsActive(!!stats.financialsBlurred);
    setIsPiiActive(!!stats.piiBlurred);
    setIsMediaActive(!!stats.mediaBlurred);
    setIsPrivacyScreenActive(!!stats.privacyScreenActive);
    if (stats.blurIntensity) setBlurIntensity(stats.blurIntensity);
    if (stats.blurStyle) setBlurStyle(stats.blurStyle);
    if (typeof stats.hoverToReveal === 'boolean') setHoverToReveal(stats.hoverToReveal);
  };

  // Load preferences and initial stats when opened
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    async function init() {
      // Load saved preferences
      const prefs = await StorageService.getPrivacyBlurPreferences(
        rememberPerDomain ? currentDomain : undefined
      );
      if (mounted && prefs) {
        setBlurIntensity(prefs.blurIntensity);
        setBlurStyle(prefs.blurStyle);
        setHoverToReveal(prefs.hoverToReveal);
        setRememberPerDomain(prefs.rememberPerDomain);
      }

      // Fetch live page stats
      const res = await sendToTab({ type: 'GET_BLUR_STATS' });
      if (mounted && res?.stats) {
        applyStats(res.stats);
      }
    }

    init();

    // Listen to background/content script broadcast events
    const handleMessage = (msg: { type?: string; stats?: PrivacyBlurStats }) => {
      if (msg?.type === 'PRIVACY_BLUR_STATS_UPDATED' && msg.stats) {
        applyStats(msg.stats);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessage);
    }

    return () => {
      mounted = false;
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleMessage);
      }
    };
  }, [isOpen, currentDomain, rememberPerDomain]);

  // Persist preferences and sync live config
  const saveAndSyncConfig = async (newIntensity: number, newStyle: BlurStyle, newHover: boolean) => {
    await sendToTab({
      type: 'UPDATE_BLUR_CONFIG',
      config: {
        blurIntensity: newIntensity,
        blurStyle: newStyle,
        hoverToReveal: newHover,
      },
    });

    const prefs: PrivacyBlurPreferences = {
      blurIntensity: newIntensity,
      blurStyle: newStyle,
      hoverToReveal: newHover,
      autoBlurFinancials: isFinancialsActive,
      autoBlurPii: isPiiActive,
      autoBlurMedia: isMediaActive,
      rememberPerDomain,
    };
    await StorageService.savePrivacyBlurPreferences(
      prefs,
      rememberPerDomain ? currentDomain : undefined
    );
  };

  // ── Action Handlers ──

  const handleToggleClickToBlur = async () => {
    if (isClickToBlurActive) {
      const res = await sendToTab({ type: 'STOP_ELEMENT_BLUR_MODE' });
      setIsClickToBlurActive(false);
      if (res?.stats) applyStats(res.stats);
      setStatusMessage('Element blur paused');
    } else {
      setIsDrawBoxActive(false);
      const res = await sendToTab({ type: 'START_ELEMENT_BLUR_MODE' });
      setIsClickToBlurActive(true);
      if (res?.stats) applyStats(res.stats);
      setStatusMessage('Hover & click any element on webpage (Press Esc to finish)');
    }
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleToggleDrawBox = async () => {
    if (isDrawBoxActive) {
      const res = await sendToTab({ type: 'STOP_DRAW_BLUR_BOX_MODE' });
      setIsDrawBoxActive(false);
      if (res?.stats) applyStats(res.stats);
      setStatusMessage('Draw blur box cancelled');
    } else {
      setIsClickToBlurActive(false);
      const res = await sendToTab({ type: 'START_DRAW_BLUR_BOX_MODE' });
      setIsDrawBoxActive(true);
      if (res?.stats) applyStats(res.stats);
      setStatusMessage('Drag on webpage to draw a blur mask! (Press Esc to cancel)');
    }
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleToggleFinancials = async () => {
    const nextVal = !isFinancialsActive;
    setIsFinancialsActive(nextVal);
    const res = await sendToTab({ type: 'TOGGLE_AUTO_BLUR_FINANCIALS', enabled: nextVal });
    if (res?.stats) applyStats(res.stats);
    setStatusMessage(nextVal ? 'Financials & balances masked' : 'Financials unmasked');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleTogglePii = async () => {
    const nextVal = !isPiiActive;
    setIsPiiActive(nextVal);
    const res = await sendToTab({ type: 'TOGGLE_AUTO_BLUR_PII', enabled: nextVal });
    if (res?.stats) applyStats(res.stats);
    setStatusMessage(nextVal ? 'Emails & phone numbers masked' : 'PII unmasked');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleToggleMedia = async () => {
    const nextVal = !isMediaActive;
    setIsMediaActive(nextVal);
    const res = await sendToTab({ type: 'TOGGLE_AUTO_BLUR_MEDIA', enabled: nextVal });
    if (res?.stats) applyStats(res.stats);
    setStatusMessage(nextVal ? 'Page images & avatars blurred' : 'Images unblurred');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleTogglePrivacyScreen = async () => {
    const nextVal = !isPrivacyScreenActive;
    setIsPrivacyScreenActive(nextVal);
    const res = await sendToTab({ type: 'TOGGLE_PRIVACY_SCREEN', enabled: nextVal });
    if (res?.stats) applyStats(res.stats);
    setStatusMessage(nextVal ? 'Privacy Curtain enabled (Full page hidden)' : 'Curtain lifted');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleClearAll = async () => {
    const res = await sendToTab({ type: 'CLEAR_ALL_BLUR' });
    setIsClickToBlurActive(false);
    setIsDrawBoxActive(false);
    setIsFinancialsActive(false);
    setIsPiiActive(false);
    setIsMediaActive(false);
    setIsPrivacyScreenActive(false);
    if (res?.stats) applyStats(res.stats);
    setStatusMessage('All blur masks cleared on this page');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleIntensityChange = (val: number) => {
    setBlurIntensity(val);
    saveAndSyncConfig(val, blurStyle, hoverToReveal);
  };

  const handleStyleChange = (st: BlurStyle) => {
    setBlurStyle(st);
    saveAndSyncConfig(blurIntensity, st, hoverToReveal);
  };

  const handleHoverChange = (val: boolean) => {
    setHoverToReveal(val);
    saveAndSyncConfig(blurIntensity, blurStyle, val);
  };

  if (!isOpen) return null;

  const totalActiveProtections =
    blurredElementCount +
    customBoxCount +
    (isFinancialsActive ? 1 : 0) +
    (isPiiActive ? 1 : 0) +
    (isMediaActive ? 1 : 0) +
    (isPrivacyScreenActive ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0502] overflow-hidden font-sans select-none animate-fade-in text-white">
      {/* ── Top Header (Consistent Ember Theme across all panels) ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/80 via-[#180a04]/90 to-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-tight flex items-center space-x-1.5">
              <span>Web Privacy &amp; Blur</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-mono font-semibold border border-orange-500/30">
                SHIELD
              </span>
            </span>
            <span className="text-[10.5px] text-zinc-400">
              Click-to-blur, drag masks &amp; sensitive data obfuscation
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

      {/* ── Status Toast Banner ── */}
      {statusMessage && (
        <div className="px-4 py-2 bg-gradient-to-r from-orange-500/20 via-amber-500/15 to-transparent border-b border-orange-500/30 text-orange-300 text-xs font-medium flex items-center space-x-2 animate-fade-in shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="truncate">{statusMessage}</span>
        </div>
      )}

      {/* ── Warning Banner if tab is disconnected ── */}
      {!isPageConnected && (
        <div className="px-4 py-2 bg-red-950/40 border-b border-red-500/30 text-red-300 text-xs flex items-center space-x-2 shrink-0">
          <Info className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span>Reload this tab once so Z-Pilot Privacy Shield can interact with the webpage.</span>
        </div>
      )}

      {/* ── Scrollable Body Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs no-scrollbar">
        {/* ── Main Superpowers (Click-to-Blur & Freehand Draw Mask) ── */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Click to Blur Element */}
          <button
            type="button"
            onClick={handleToggleClickToBlur}
            className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
              isClickToBlurActive
                ? 'bg-gradient-to-br from-orange-500/25 via-amber-600/15 to-black/40 border-orange-500 ring-1 ring-orange-500/40 text-white shadow-lg shadow-orange-600/25'
                : 'bg-black/40 border-white/10 hover:border-orange-500/40 hover:bg-white/[0.04] text-white/80'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                  isClickToBlurActive
                    ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30 font-bold'
                    : 'bg-white/5 text-orange-400 group-hover:bg-orange-500/20'
                }`}
              >
                <MousePointerClick className="w-4 h-4 stroke-[2.2]" />
              </div>
              {isClickToBlurActive && (
                <span className="text-[9.5px] uppercase font-bold text-orange-300 bg-orange-500/20 px-2 py-0.5 rounded-full border border-orange-500/40 animate-pulse">
                  Active
                </span>
              )}
            </div>
            <h4 className="font-bold text-xs text-white mb-0.5">Click-to-Blur</h4>
            <p className="text-[10px] text-zinc-400 leading-tight">
              Hover &amp; click any text, card, table or element to blur it.
            </p>
          </button>

          {/* Freeform Drag & Drop Blur Box */}
          <button
            type="button"
            onClick={handleToggleDrawBox}
            className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
              isDrawBoxActive
                ? 'bg-gradient-to-br from-orange-500/25 via-amber-600/15 to-black/40 border-orange-500 ring-1 ring-orange-500/40 text-white shadow-lg shadow-orange-600/25'
                : 'bg-black/40 border-white/10 hover:border-orange-500/40 hover:bg-white/[0.04] text-white/80'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                  isDrawBoxActive
                    ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30 font-bold'
                    : 'bg-white/5 text-orange-400 group-hover:bg-orange-500/20'
                }`}
              >
                <Crop className="w-4 h-4 stroke-[2.2]" />
              </div>
              {isDrawBoxActive && (
                <span className="text-[9.5px] uppercase font-bold text-orange-300 bg-orange-500/20 px-2 py-0.5 rounded-full border border-orange-500/40 animate-pulse">
                  Drawing
                </span>
              )}
            </div>
            <h4 className="font-bold text-xs text-white mb-0.5">Draw &amp; Drag Mask</h4>
            <p className="text-[10px] text-zinc-400 leading-tight">
              Draw custom blur boxes anywhere. Move &amp; resize freely!
            </p>
          </button>
        </div>

        {/* ── 1-Tap Auto-Obfuscate Presets (Ember Styled Cards) ── */}
        <div className="p-3 rounded-2xl bg-black/50 border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-orange-400 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-orange-400" />
              <span>1-Tap Auto-Obfuscate Presets</span>
            </span>
            <span className="text-[9.5px] text-zinc-500">DOM Regex Filters</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Financials & Balances */}
            <button
              type="button"
              onClick={handleToggleFinancials}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isFinancialsActive
                  ? 'bg-gradient-to-r from-orange-500/20 to-amber-600/10 border-orange-500/70 text-orange-200 shadow-sm'
                  : 'bg-black/30 border-white/10 hover:border-orange-500/30 text-white/70'
              }`}
            >
              <div className="flex items-center space-x-2">
                <DollarSign
                  className={`w-4 h-4 ${isFinancialsActive ? 'text-orange-400' : 'text-zinc-500'}`}
                />
                <div>
                  <div className="font-semibold text-xs leading-none text-white">Financials</div>
                  <div className="text-[9.5px] text-zinc-400 mt-0.5">$, ₹, €, £, balances</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  isFinancialsActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 border-orange-400 text-white'
                    : 'border-white/20 bg-black/40'
                }`}
              >
                {isFinancialsActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
            </button>

            {/* PII: Emails & Phone Numbers */}
            <button
              type="button"
              onClick={handleTogglePii}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isPiiActive
                  ? 'bg-gradient-to-r from-orange-500/20 to-amber-600/10 border-orange-500/70 text-orange-200 shadow-sm'
                  : 'bg-black/30 border-white/10 hover:border-orange-500/30 text-white/70'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Mail className={`w-4 h-4 ${isPiiActive ? 'text-orange-400' : 'text-zinc-500'}`} />
                <div>
                  <div className="font-semibold text-xs leading-none text-white">Emails &amp; Phones</div>
                  <div className="text-[9.5px] text-zinc-400 mt-0.5">PII contact patterns</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  isPiiActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 border-orange-400 text-white'
                    : 'border-white/20 bg-black/40'
                }`}
              >
                {isPiiActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
            </button>

            {/* Media & Images */}
            <button
              type="button"
              onClick={handleToggleMedia}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isMediaActive
                  ? 'bg-gradient-to-r from-orange-500/20 to-amber-600/10 border-orange-500/70 text-orange-200 shadow-sm'
                  : 'bg-black/30 border-white/10 hover:border-orange-500/30 text-white/70'
              }`}
            >
              <div className="flex items-center space-x-2">
                <ImageIcon
                  className={`w-4 h-4 ${isMediaActive ? 'text-orange-400' : 'text-zinc-500'}`}
                />
                <div>
                  <div className="font-semibold text-xs leading-none text-white">Media &amp; Avatars</div>
                  <div className="text-[9.5px] text-zinc-400 mt-0.5">Photos &amp; media tags</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  isMediaActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 border-orange-400 text-white'
                    : 'border-white/20 bg-black/40'
                }`}
              >
                {isMediaActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
            </button>

            {/* Full-Page Screen Privacy Curtain */}
            <button
              type="button"
              onClick={handleTogglePrivacyScreen}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isPrivacyScreenActive
                  ? 'bg-gradient-to-r from-orange-500/20 to-amber-600/10 border-orange-500/70 text-orange-200 shadow-sm'
                  : 'bg-black/30 border-white/10 hover:border-orange-500/30 text-white/70'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Lock
                  className={`w-4 h-4 ${
                    isPrivacyScreenActive ? 'text-orange-400' : 'text-zinc-500'
                  }`}
                />
                <div>
                  <div className="font-semibold text-xs leading-none text-white">Privacy Curtain</div>
                  <div className="text-[9.5px] text-zinc-400 mt-0.5">Full screen veil</div>
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  isPrivacyScreenActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 border-orange-400 text-white'
                    : 'border-white/20 bg-black/40'
                }`}
              >
                {isPrivacyScreenActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
            </button>
          </div>
        </div>

        {/* ── Blur Appearance & Styling (Ember Palette) ── */}
        <div className="p-3 rounded-2xl bg-black/50 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-orange-400 flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-orange-400" />
              <span>Mask Style &amp; Blur Strength</span>
            </span>
            <span className="font-mono text-[11px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/30">
              {blurIntensity}px
            </span>
          </div>

          {/* Intensity Slider */}
          <div className="space-y-1">
            <input
              type="range"
              min={4}
              max={30}
              value={blurIntensity}
              onChange={(e) => handleIntensityChange(Number(e.target.value))}
              className="w-full accent-orange-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9.5px] text-zinc-500">
              <span>Subtle (4px)</span>
              <span>Balanced (12px)</span>
              <span>Heavy (30px)</span>
            </div>
          </div>

          {/* Redaction Style Switcher */}
          <div className="pt-2 border-t border-white/10">
            <label className="text-[10.5px] text-zinc-400 block mb-1.5 font-medium">
              Visual Obfuscation Style:
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'blur' as BlurStyle, label: 'Frosted Glass', desc: 'Modern Blur' },
                { id: 'blackout' as BlurStyle, label: 'Blackout', desc: 'Classified Redact' },
                { id: 'stealth' as BlurStyle, label: 'Matrix Tint', desc: 'Cyber Stealth' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleStyleChange(s.id)}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    blurStyle === s.id
                      ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold border-orange-400 shadow-md shadow-orange-600/30'
                      : 'bg-black/30 border-white/10 text-white/70 hover:text-white hover:border-white/20'
                  }`}
                >
                  <div className="text-xs leading-none">{s.label}</div>
                  <div className="text-[9px] text-zinc-400 mt-1">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Hover to Peek / Reveal Switch */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <div>
              <div className="font-semibold text-xs text-white">Hover to Peek / Reveal</div>
              <div className="text-[10px] text-zinc-400">
                Temporarily unmasks content when cursor hovers over it
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleHoverChange(!hoverToReveal)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                hoverToReveal ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-white/20'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 left-0.5 ${
                  hoverToReveal ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Remember Domain Switch */}
          {currentDomain && (
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div>
                <div className="font-semibold text-xs text-white">Remember for Domain</div>
                <div className="text-[10px] text-zinc-400 truncate max-w-[260px]">
                  Auto-restore privacy settings on {currentDomain}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRememberPerDomain(!rememberPerDomain)}
                className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  rememberPerDomain ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-white/20'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-0.5 left-0.5 ${
                    rememberPerDomain ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer Bar (Consistent Ember Action Dock) ── */}
      <div className="px-4 py-2.5 border-t border-orange-500/20 bg-gradient-to-r from-black/90 via-[#180a04]/95 to-black/90 backdrop-blur-xl flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1.5 text-[11px] text-zinc-400">
          <Shield className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span>
            <strong className="text-white font-mono">{blurredElementCount}</strong> blurred •{' '}
            <strong className="text-white font-mono">{customBoxCount}</strong> masks
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={totalActiveProtections === 0}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-white/70 hover:text-red-300 disabled:opacity-30 disabled:pointer-events-none transition-colors text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear All</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-bold text-xs transition-all shadow-md shadow-orange-600/25 active:scale-95 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
