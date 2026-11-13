import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Tv,
  EyeOff,
  Layers,
  Globe,
  Flame,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { AdBlockerService, DEFAULT_AD_BLOCKER_SETTINGS } from '../services/ad-blocker.js';
import { AdBlockerSettings } from '../types/index.js';

interface AdBlockerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageUrl?: string;
}

export const AdBlockerPanel: React.FC<AdBlockerPanelProps> = ({
  isOpen,
  onClose,
  currentPageUrl,
}) => {
  const [settings, setSettings] = useState<AdBlockerSettings>(DEFAULT_AD_BLOCKER_SETTINGS);
  const [pageBlockedCount, setPageBlockedCount] = useState(0);
  const [isSiteWhitelisted, setIsSiteWhitelisted] = useState(false);
  const [currentDomain, setCurrentDomain] = useState('');

  // Extract hostname
  const extractDomain = useCallback((url?: string): string => {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol.startsWith('http')) {
        return parsed.hostname.toLowerCase().replace(/^www\./, '');
      }
      return '';
    } catch {
      return '';
    }
  }, []);

  // Load settings and active tab stats
  const loadData = useCallback(async () => {
    const s = await AdBlockerService.getSettings();
    setSettings(s);

    let domain = extractDomain(currentPageUrl);
    if (!domain && typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) domain = extractDomain(tab.url);
      } catch {
        // Ignore
      }
    }
    setCurrentDomain(domain);

    if (domain) {
      const whitelisted = s.whitelistedDomains.includes(domain);
      setIsSiteWhitelisted(whitelisted);
    }

    // Query active tab for page blocked count
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'GET_AD_BLOCK_STATS' }, (res) => {
            if (chrome.runtime.lastError) return;
            if (res && typeof res.pageCount === 'number') {
              setPageBlockedCount(res.pageCount);
            }
          });
        }
      } catch {
        // Ignore
      }
    }
  }, [currentPageUrl, extractDomain]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Master Toggle (Enable / Disable)
  const handleToggleMaster = async () => {
    const nextEnabled = !settings.enabled;
    const updated = { ...settings, enabled: nextEnabled };
    setSettings(updated);
    await AdBlockerService.saveSettings(updated);

    // Broadcast to active tab
    notifyActiveTab(nextEnabled);
  };

  // Toggle whitelist for active site
  const handleToggleSiteWhitelist = async () => {
    if (!currentDomain) return;
    const isNowWhitelisted = await AdBlockerService.toggleDomainWhitelist(currentDomain);
    setIsSiteWhitelisted(isNowWhitelisted);

    const s = await AdBlockerService.getSettings();
    setSettings(s);

    // Broadcast to active tab
    notifyActiveTab(!isNowWhitelisted);
  };

  // Toggle Cosmetic Ad Hiding
  const handleToggleCosmetic = async () => {
    const updated = { ...settings, blockCosmetic: !settings.blockCosmetic };
    setSettings(updated);
    await AdBlockerService.saveSettings(updated);
  };

  // Toggle Video Ad Skipping
  const handleToggleVideoAds = async () => {
    const updated = { ...settings, skipVideoAds: !settings.skipVideoAds };
    setSettings(updated);
    await AdBlockerService.saveSettings(updated);
  };

  // Reload current tab to apply changes cleanly
  const handleReloadPage = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.reload) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    }
  };

  const notifyActiveTab = (enabled: boolean) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TOGGLE_AD_SHIELD',
            enabled,
          }).catch(() => { });
        }
      });
    }
  };

  if (!isOpen) return null;

  const isProtectedOnThisPage = settings.enabled && !isSiteWhitelisted;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0502] overflow-hidden font-sans select-none animate-fade-in">
      {/* ── TOP HEADER ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/85 via-[#160a04]/90 to-black/85 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-white tracking-tight">
              Add Blocker
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider font-mono ${isProtectedOnThisPage
                  ? 'bg-orange-500/15 border border-orange-500/30 text-orange-300'
                  : 'bg-white/10 border border-white/15 text-white/50'
                }`}
            >
              {isProtectedOnThisPage ? 'PROTECTED' : 'PAUSED'}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Close Ad Blocker"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── MAIN BODY ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {/* Master Shield Hero Banner */}
        <div
          className={`p-4 rounded-3xl border transition-all shadow-2xl ${settings.enabled
              ? 'bg-gradient-to-b from-orange-600/20 via-amber-600/10 to-black/70 border-orange-500/40 shadow-orange-950/30'
              : 'bg-black/50 border-white/10 shadow-black/40'
            }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                {settings.enabled ? (
                  <ShieldCheck className="w-8 h-8 text-orange-400 stroke-[2.2] drop-shadow-sm" />
                ) : (
                  <ShieldAlert className="w-8 h-8 text-white/40 stroke-[2]" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {settings.enabled ? 'Add Blocker Protection Active' : 'Add Blocker is Paused'}
                </p>
                <p className="text-[11px] text-white/60">
                  {settings.enabled
                    ? 'Blocking ads, popups & trackers'
                    : 'Ads and trackers are allowed'}
                </p>
              </div>
            </div>

            {/* iOS-style Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              onClick={handleToggleMaster}
              title={settings.enabled ? 'Pause Ad Blocker' : 'Enable Ad Blocker'}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-0 p-1 transition-colors duration-200 ease-in-out focus:outline-none ${settings.enabled
                  ? 'bg-orange-500 shadow-md shadow-orange-500/40'
                  : 'bg-white/20'
                }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${settings.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>
        </div>

        {/* Live Blocked Stats Row */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Page Stats */}
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md space-y-1">
            <div className="flex items-center space-x-1.5 text-white/50 text-[10px] uppercase font-bold tracking-wider">
              <Sparkles className="w-3 h-3 text-orange-400" />
              <span>On This Page</span>
            </div>
            <p className="text-2xl font-extrabold font-mono text-white tracking-tight">
              {pageBlockedCount}
            </p>
            <p className="text-[10px] text-white/40">ad elements blocked</p>
          </div>

          {/* All-Time Stats */}
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-md space-y-1">
            <div className="flex items-center space-x-1.5 text-white/50 text-[10px] uppercase font-bold tracking-wider">
              <Flame className="w-3 h-3 text-amber-400" />
              <span>All-Time Blocked</span>
            </div>
            <p className="text-2xl font-extrabold font-mono text-amber-200 tracking-tight">
              {settings.totalBlockedCount || 0}
            </p>
            <p className="text-[10px] text-white/40">total ads wiped</p>
          </div>
        </div>

        {/* Current Site Whitelist Card */}
        {currentDomain && (
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 min-w-0">
                <Globe className="w-4 h-4 text-orange-400 shrink-0" />
                <span className="text-xs font-bold text-white truncate max-w-[170px]">
                  {currentDomain}
                </span>
              </div>
              <button
                onClick={handleReloadPage}
                title="Refresh page to apply"
                className="text-[11px] text-white/50 hover:text-orange-300 transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reload</span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white/80">Block Ads on this Site</p>
                <p className="text-[10px] text-white/40">
                  {isSiteWhitelisted ? 'Site is currently whitelisted' : 'Active shield protection'}
                </p>
              </div>

              {/* Toggle whitelist */}
              <button
                type="button"
                role="switch"
                onClick={handleToggleSiteWhitelist}
                disabled={!settings.enabled}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 p-1 transition-colors duration-200 ease-in-out disabled:opacity-40 focus:outline-none ${!isSiteWhitelisted && settings.enabled
                    ? 'bg-orange-500 shadow-md shadow-orange-500/30'
                    : 'bg-white/20'
                  }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${!isSiteWhitelisted && settings.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Detailed Protection Features */}
        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">
            Protection Engines
          </p>

          {/* Engine 1: Network-Level Blocking */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Declarative Network Blocker</p>
                <p className="text-[10px] text-white/50">
                  Blocks 50+ ad networks at Chrome network stack
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-orange-300 font-mono">ON</span>
          </div>

          {/* Engine 2: Cosmetic Element Hiding */}
          <div className="flex items-center justify-between py-1 border-t border-white/5">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                <EyeOff className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Cosmetic Ad Hiding</p>
                <p className="text-[10px] text-white/50">
                  Collapses empty banner boxes and popups
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              onClick={handleToggleCosmetic}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 p-1 transition-colors duration-200 ease-in-out focus:outline-none ${settings.blockCosmetic
                  ? 'bg-orange-500 shadow-md shadow-orange-500/30'
                  : 'bg-white/20'
                }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${settings.blockCosmetic ? 'translate-x-5' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>

          {/* Engine 3: Video Ad Fast-Forward & Auto-Skip */}
          <div className="flex items-center justify-between py-1 border-t border-white/5">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                <Tv className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Video Ad Auto-Skip</p>
                <p className="text-[10px] text-white/50">
                  Auto-mutes, speeds up, and clicks skip on video ads
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              onClick={handleToggleVideoAds}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 p-1 transition-colors duration-200 ease-in-out focus:outline-none ${settings.skipVideoAds
                  ? 'bg-orange-500 shadow-md shadow-orange-500/30'
                  : 'bg-white/20'
                }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${settings.skipVideoAds ? 'translate-x-5' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-[10px] text-white/50 leading-relaxed text-center">
          Brave Shields grade protection built directly into Chrome. Zero external configuration required.
        </div>
      </div>
    </div>
  );
};

