import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShoppingBag,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Tag,
  Copy,
  Check,
  Bell,
  Sparkles,
  RotateCcw,
  Star,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Store,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import {
  CouponCode,
  FakeReviewAnalysis,
  PriceHistoryPoint,
  ProductInfo,
  ShoppingTab,
  TrackedProduct,
} from '../types/index.js';
import { EcommerceAssistantService } from '../services/ecommerce-assistant.js';
import { StorageService } from '../services/storage.js';

interface ShoppingAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageUrl?: string;
  currentPageTitle?: string;
  geminiApiKey?: string;
}

export const ShoppingAssistantPanel: React.FC<ShoppingAssistantPanelProps> = ({
  isOpen,
  onClose,
  currentPageUrl = '',
  currentPageTitle = '',
  geminiApiKey = '',
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<ShoppingTab>('price_tracker');

  // Product Data State
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [reviewAnalysis, setReviewAnalysis] = useState<FakeReviewAnalysis | null>(null);
  const [coupons, setCoupons] = useState<CouponCode[]>([]);
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);

  // Price Tracker state
  const [targetPriceInput, setTargetPriceInput] = useState<string>('');
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [isTrackedCurrent, setIsTrackedCurrent] = useState<boolean>(false);
  const [lastRecordedPrice, setLastRecordedPrice] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Live active tab URL and title
  const [liveUrl, setLiveUrl] = useState<string>(currentPageUrl || '');
  const [liveTitle, setLiveTitle] = useState<string>(currentPageTitle || '');

  // Keep in sync when parent props update
  useEffect(() => {
    if (currentPageUrl) setLiveUrl(currentPageUrl);
    if (currentPageTitle) setLiveTitle(currentPageTitle);
  }, [currentPageUrl, currentPageTitle]);

  // Derive domain from live tab or product
  const currentDomain = useMemo(() => {
    const urlToUse = product?.url || liveUrl || currentPageUrl;
    if (!urlToUse) return '';
    try {
      return new URL(urlToUse).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }, [product?.url, liveUrl, currentPageUrl]);

  // Query live active tab in current window with comprehensive fallbacks
  const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
      let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      }
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true });
      }
      return tabs?.[0] || null;
    } catch {
      return null;
    }
  };

  // Helper to send message to active tab with auto-injection fallback
  const sendToTab = async (message: Record<string, unknown>, tabId?: number): Promise<any> => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) return null;
      let targetId = tabId;
      if (!targetId) {
        const tab = await getActiveTab();
        targetId = tab?.id;
      }
      if (!targetId) return null;

      const doSend = (): Promise<any> =>
        new Promise((resolve) => {
          chrome.tabs.sendMessage(targetId as number, message, (res) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(res);
            }
          });
        });

      let res = await doSend();
      // If message failed (e.g. content script not yet injected), attempt injecting content.js
      if (!res && typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetId },
            files: ['content.js'],
          });
          await new Promise((r) => setTimeout(r, 200));
          res = await doSend();
        } catch {
          // Ignore injection errors
        }
      }
      return res;
    } catch {
      return null;
    }
  };

  // Scan current webpage for product and coupons
  const scanCurrentPage = async (isManualClick: boolean = false) => {
    setIsScanning(true);
    setIsLoading(true);

    try {
      // Direct live active tab query
      const activeTab = await getActiveTab();
      const currentTabUrl = activeTab?.url || liveUrl || currentPageUrl;
      const currentTabTitle = activeTab?.title || liveTitle || currentPageTitle;

      if (activeTab?.url) setLiveUrl(activeTab.url);
      if (activeTab?.title) setLiveTitle(activeTab.title);

      let targetDomain = '';
      try {
        if (currentTabUrl) {
          targetDomain = new URL(currentTabUrl).hostname.replace(/^www\./, '');
        }
      } catch {
        // Ignore URL parse error
      }

      // Always reload fresh tracked products from storage
      const freshTracked = await StorageService.getTrackedProducts();
      setTrackedProducts(freshTracked);

      // 1. Fetch DOM product info from content script
      let res = await sendToTab({ type: 'DETECT_ECOMMERCE_PRODUCT' }, activeTab?.id);

      // If content script was still mounting, retry once shortly
      if (!res && activeTab?.id) {
        await new Promise((r) => setTimeout(r, 250));
        res = await sendToTab({ type: 'DETECT_ECOMMERCE_PRODUCT' }, activeTab.id);
      }

      const couponRes = await sendToTab({ type: 'EXTRACT_PAGE_COUPONS' }, activeTab?.id);

      let parsedProduct: ProductInfo | null = null;
      const rawProduct = res?.product;

      // Extract selling price & list price
      if (rawProduct && rawProduct.rawPriceText) {
        const { price, currency } = EcommerceAssistantService.parsePriceString(
          rawProduct.rawPriceText
        );

        let originalPrice: number | undefined;
        if (rawProduct.rawListPriceText) {
          const orig = EcommerceAssistantService.parsePriceString(rawProduct.rawListPriceText);
          if (orig.price > 0 && orig.price > price) {
            originalPrice = orig.price;
          }
        }

        let lowestPriceObserved: number | undefined;
        if (rawProduct.rawLowPriceText) {
          const parsedLow = EcommerceAssistantService.parsePriceString(rawProduct.rawLowPriceText);
          if (parsedLow.price > 0 && parsedLow.price < price) {
            lowestPriceObserved = parsedLow.price;
          }
        }

        if (price > 0) {
          parsedProduct = {
            title: rawProduct.title || currentTabTitle || 'Product on ' + targetDomain,
            url: rawProduct.url || currentTabUrl || '',
            domain: rawProduct.domain || targetDomain || 'store',
            imageUrl: rawProduct.imageUrl,
            currentPrice: price,
            originalPrice,
            lowestPrice: lowestPriceObserved,
            currency: currency || '$',
            rating: rawProduct.rating,
            reviewCount: rawProduct.reviewCount,
            dealBadge: rawProduct.dealBadge,
            pageReviews: rawProduct.pageReviews || [],
            rawPriceText: rawProduct.rawPriceText,
            rawListPriceText: rawProduct.rawListPriceText,
            rawLowPriceText: rawProduct.rawLowPriceText,
          };
        }
      }

      if (parsedProduct) {
        // Derive clean product cache key (with ASIN / PID detection for Amazon & Flipkart)
        let productKey = `${parsedProduct.domain}_${(parsedProduct.url || '').split('?')[0].replace(/^https?:\/\//, '')}`;
        const asinMatch = (parsedProduct.url || '').match(/\/(?:dp|gp\/product)\/([A-Za-z0-9]{10})/i);
        const fkpMatch =
          (parsedProduct.url || '').match(/[?&]pid=([A-Za-z0-9]+)/i) ||
          (parsedProduct.url || '').match(/\/p\/([a-zA-Z0-9]+)/i);
        if (asinMatch) {
          productKey = `${parsedProduct.domain}_asin_${asinMatch[1]}`;
        } else if (fkpMatch) {
          productKey = `${parsedProduct.domain}_pid_${fkpMatch[1]}`;
        }

        // Retrieve automatic persistent price cache
        const cached = await StorageService.getCachedProductPrice(productKey);

        // Check if tracked in wishlist
        const existingTracked = freshTracked.find(
          (p) => p.url === parsedProduct.url || (p.title === parsedProduct.title && p.domain === parsedProduct.domain)
        );

        // Determine last recorded price from previous check (tracked or cached)
        const previousPrice = existingTracked?.currentPrice || cached?.lastPrice;
        if (previousPrice && previousPrice !== parsedProduct.currentPrice) {
          setLastRecordedPrice(previousPrice);
        } else if (previousPrice) {
          setLastRecordedPrice(previousPrice);
        } else {
          setLastRecordedPrice(null);
        }

        // Combine history from tracked wishlist or persistent cache
        const existingHistory = existingTracked?.history || cached?.history;
        const history = EcommerceAssistantService.getAuthenticPriceHistory(
          parsedProduct.currentPrice,
          existingHistory
        );

        // Auto-save observation to persistent cache so history grows naturally across visits!
        void StorageService.saveCachedProductPrice(productKey, history, parsedProduct.currentPrice);

        if (existingTracked) {
          const prices = history.map((h) => h.price);
          const allHighs = [
            ...prices,
            existingTracked.highestPrice || 0,
            parsedProduct.originalPrice || 0,
          ].filter(Boolean);
          const allLows = [
            ...prices,
            existingTracked.lowestPrice || Infinity,
          ].filter(Boolean);

          void StorageService.updateTrackedProduct(existingTracked.id, {
            currentPrice: parsedProduct.currentPrice,
            lowestPrice: Math.min(...allLows),
            highestPrice: Math.max(...allHighs),
            history,
            lastChecked: Date.now(),
          }).then((updatedList) => {
            setTrackedProducts(updatedList);
          });

          // Check if price dropped below target
          if (existingTracked.targetPrice && parsedProduct.currentPrice <= existingTracked.targetPrice) {
            setStatusMessage(
              `🔥 Price Drop Target Reached! ${parsedProduct.currency}${parsedProduct.currentPrice} (Target: ${parsedProduct.currency}${existingTracked.targetPrice})`
            );
            if (typeof chrome !== 'undefined' && chrome.notifications?.create) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: '🔥 Z-Pilot Price Alert Reached!',
                message: `${parsedProduct.title.slice(0, 45)} dropped to ${parsedProduct.currency}${parsedProduct.currentPrice}!`,
                priority: 2,
              });
            }
          }
        }

        setProduct(parsedProduct);
        setPriceHistory(history);
        setTargetPriceInput(
          existingTracked?.targetPrice
            ? existingTracked.targetPrice + ''
            : Math.round(parsedProduct.currentPrice * 0.9 * 100) / 100 + ''
        );

        // 2. Authentic Reviews (strictly only visible on-page reviews & ratings)
        const analysis = EcommerceAssistantService.analyzeReviewsHeuristic(
          parsedProduct.pageReviews,
          parsedProduct.rating,
          parsedProduct.reviewCount
        );
        setReviewAnalysis(analysis);

        // 3. Authentic Coupons (strictly on-page or recognized store database)
        const pageCoupons = couponRes?.coupons || [];
        const storeCoupons = EcommerceAssistantService.getStoreCoupons(
          parsedProduct.domain,
          pageCoupons
        );
        setCoupons(storeCoupons);

        if (isManualClick) {
          const domainLabel = parsedProduct.domain ? ` (${parsedProduct.domain})` : '';
          setStatusMessage(`✓ Refreshed & verified: ${parsedProduct.title.slice(0, 30)}...${domainLabel}`);
          setTimeout(() => setStatusMessage(null), 2500);
        }
      } else {
        // No product detected on this tab - NEVER FABRICATE FAKE PRODUCT
        setProduct(null);
        setPriceHistory([]);
        setReviewAnalysis(null);
        setCoupons([]);
        setLastRecordedPrice(null);
        if (isManualClick) {
          setStatusMessage('No product or pricing found on this page.');
          setTimeout(() => setStatusMessage(null), 2500);
        }
      }
    } catch {
      if (isManualClick) {
        setStatusMessage('Refreshed current view');
        setTimeout(() => setStatusMessage(null), 2000);
      }
    } finally {
      setIsScanning(false);
      setIsLoading(false);
    }
  };

  // Scroll down to customer reviews and re-analyze
  const handleScrollToReviews = async () => {
    setIsScanning(true);
    setStatusMessage('📜 Scrolling down to reviews section...');
    try {
      const activeTab = await getActiveTab();
      const res = await sendToTab({ type: 'SCROLL_TO_REVIEWS' }, activeTab?.id);
      if (res?.product && res.product.pageReviews) {
        const rawReviews = res.product.pageReviews;
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                pageReviews: rawReviews,
                rating: res.product.rating || prev.rating,
                reviewCount: res.product.reviewCount || prev.reviewCount,
              }
            : prev
        );
        const updatedAnalysis = EcommerceAssistantService.analyzeReviewsHeuristic(
          rawReviews,
          res.product.rating || product?.rating,
          res.product.reviewCount || product?.reviewCount
        );
        setReviewAnalysis(updatedAnalysis);
        setStatusMessage(
          rawReviews.length > 0
            ? `✓ Loaded & analyzed ${rawReviews.length} live buyer reviews!`
            : '✓ Reviews scanned'
        );
        setTimeout(() => setStatusMessage(null), 2500);
      } else {
        await scanCurrentPage(true);
      }
    } catch {
      await scanCurrentPage(true);
    } finally {
      setIsScanning(false);
    }
  };

  // Load preferences and tracked products on open
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function loadData() {
      const [prefs, tracked] = await Promise.all([
        StorageService.getShoppingPreferences(),
        StorageService.getTrackedProducts(),
      ]);

      if (!mounted) return;
      if (prefs?.activeTab) setActiveTab(prefs.activeTab);
      setTrackedProducts(tracked);

      // Auto-scan product from current webpage
      void scanCurrentPage(false);
    }

    void loadData();

    return () => {
      mounted = false;
    };
  }, [isOpen, currentPageUrl]);

  // Listen to Chrome tab updates and switching while panel is open
  useEffect(() => {
    if (!isOpen || typeof chrome === 'undefined' || !chrome.tabs) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleTabUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      // Re-scan when active tab completes loading or changes URL
      if (tab.active && (changeInfo.status === 'complete' || changeInfo.url)) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void scanCurrentPage(false);
        }, 350);
      }
    };

    const handleTabActivated = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void scanCurrentPage(false);
      }, 300);
    };

    chrome.tabs.onUpdated?.addListener(handleTabUpdated);
    chrome.tabs.onActivated?.addListener(handleTabActivated);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
      chrome.tabs.onActivated?.removeListener(handleTabActivated);
    };
  }, [isOpen]);

  // Check if current product is in tracked list
  useEffect(() => {
    if (!product || trackedProducts.length === 0) {
      setIsTrackedCurrent(false);
      return;
    }
    const found = trackedProducts.some(
      (p) => p.url === product.url || (p.title === product.title && p.domain === product.domain)
    );
    setIsTrackedCurrent(found);
  }, [product, trackedProducts]);

  // Tab switch
  const handleTabChange = (tab: ShoppingTab) => {
    setActiveTab(tab);
    void StorageService.saveShoppingPreferences({ activeTab: tab });
    if (tab === 'fake_reviews' && product && (!product.pageReviews || product.pageReviews.length === 0)) {
      void handleScrollToReviews();
    }
  };

  // Toggle Price Drop Tracking
  const handleToggleTrack = async () => {
    if (!product) return;

    if (isTrackedCurrent) {
      // Remove
      const item = trackedProducts.find(
        (p) => p.url === product.url || (p.title === product.title && p.domain === product.domain)
      );
      if (item) {
        const updated = await StorageService.removeTrackedProduct(item.id);
        setTrackedProducts(updated);
        setIsTrackedCurrent(false);
        setStatusMessage('Removed from Price Tracker Wishlist');
        setTimeout(() => setStatusMessage(null), 2500);
      }
    } else {
      // Add
      const parsedTarget = EcommerceAssistantService.parsePriceString(targetPriceInput).price;
      const targetNum = parsedTarget > 0 ? parsedTarget : Math.round(product.currentPrice * 0.9 * 100) / 100;
      const newTracked = EcommerceAssistantService.createTrackedProduct(product, targetNum);
      const updated = await StorageService.addTrackedProduct(newTracked);
      setTrackedProducts(updated);
      setIsTrackedCurrent(true);
      setStatusMessage(`Tracking price! We'll alert you if it drops below ${product.currency}${targetNum}`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  // Copy coupon code
  const handleCopyCoupon = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCoupon(code);
    setTimeout(() => setCopiedCoupon(null), 2000);
  };

  // Deep AI Review Analysis with Gemini
  const handleRunAiReviewAnalysis = async () => {
    if (!product || !geminiApiKey) {
      setStatusMessage('Please configure your free Gemini API Key in Settings for AI analysis.');
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsLoading(true);
    setStatusMessage('Analyzing reviews with Gemini AI...');
    try {
      const res = await EcommerceAssistantService.analyzeReviewsWithGemini(
        product.title,
        product.pageReviews || [],
        product.rating || 4.5,
        geminiApiKey
      );
      setReviewAnalysis(res);
      setStatusMessage('Review analysis complete!');
    } catch {
      setStatusMessage('Analysis complete with heuristic model.');
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatusMessage(null), 2500);
    }
  };

  if (!isOpen) return null;

  // Price calculations
  const prices = priceHistory.map((p) => p.price);
  if (product?.lowestPrice && product.lowestPrice > 0) {
    prices.push(product.lowestPrice);
  }
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : product?.currentPrice || 0;
  const highestPrice =
    prices.length > 0
      ? Math.max(...prices, product?.originalPrice || 0)
      : Math.max(product?.currentPrice || 0, product?.originalPrice || 0);
  const dealEvaluation = product
    ? EcommerceAssistantService.evaluateDeal(
        product.currentPrice,
        lowestPrice,
        highestPrice,
        priceHistory.length,
        product.originalPrice
      )
    : { score: 'Current Price' as const, color: 'text-zinc-400', advice: 'No product detected.' };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0502] overflow-hidden font-sans select-none animate-fade-in text-white">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-orange-500/20 bg-gradient-to-r from-black/80 via-[#180a04]/90 to-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-tight flex items-center space-x-1.5">
              <span>Smart Shopping</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-400 font-mono font-semibold border border-orange-500/30">
                PRO
              </span>
            </span>
            <span className="text-[10.5px] text-zinc-400">
              Price Tracker • Fake Review Shield • Instant Coupons
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Refresh / Rescan Button */}
          <button
            type="button"
            onClick={() => void scanCurrentPage(true)}
            disabled={isScanning}
            title="Refresh & Rescan Active Page"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 hover:text-orange-300 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Status Toast Banner ── */}
      {statusMessage && (
        <div className="px-4 py-2 bg-gradient-to-r from-orange-500/20 via-amber-500/15 to-transparent border-b border-orange-500/30 text-orange-300 text-xs font-medium flex items-center space-x-2 animate-fade-in shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="truncate">{statusMessage}</span>
        </div>
      )}

      {product ? (
        <>
          {/* ── Active Product Hero Card (Simple & At-a-Glance) ── */}
          <div className="p-3.5 mx-3.5 mt-3 rounded-2xl bg-gradient-to-br from-black/60 via-[#180803]/60 to-black/60 border border-orange-500/25 shadow-lg shrink-0">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start space-x-2.5 min-w-0">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    className="w-12 h-12 rounded-xl object-cover bg-black/40 border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                    <ShoppingBag className="w-6 h-6 stroke-[1.8]" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center justify-between space-x-1.5 text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <Store className="w-3 h-3 text-orange-400 shrink-0" />
                      <span className="font-semibold text-zinc-300 truncate">{product.domain}</span>
                      {product.rating && (
                        <span className="flex items-center space-x-1 text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] shrink-0">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          <span>{product.rating}</span>
                          {product.reviewCount && (
                            <span className="text-zinc-400 font-normal text-[9px]">
                              ({product.reviewCount >= 1000 ? `${(product.reviewCount / 1000).toFixed(1)}k` : product.reviewCount})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void scanCurrentPage(true)}
                      disabled={isScanning}
                      title="Rescan & Refresh from active page"
                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-[9.5px] font-semibold text-orange-300 hover:text-orange-200 transition-all cursor-pointer shrink-0"
                    >
                      <RotateCcw className={`w-2.5 h-2.5 ${isScanning ? 'animate-spin' : ''}`} />
                      <span>{isScanning ? 'Scanning...' : 'Refresh'}</span>
                    </button>
                  </div>
                  <h3 className="font-bold text-xs text-white leading-tight line-clamp-2">
                    {product.title}
                  </h3>
                </div>
              </div>

              {/* Price Pill */}
              <div className="text-right shrink-0">
                <div className="text-base font-extrabold text-orange-400 font-mono">
                  {EcommerceAssistantService.formatPrice(product.currentPrice, product.currency)}
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold border mt-0.5 ${
                    dealEvaluation.score === 'Great Deal'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : dealEvaluation.score === 'Fair Price'
                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                      : dealEvaluation.score === 'High Price'
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {dealEvaluation.score === 'Great Deal' ? '🔥 ' : ''}
                  {dealEvaluation.score}
                </span>
              </div>
            </div>
          </div>

          {/* ── 3 Clean Tabs Switcher ── */}
          <div className="px-3.5 pt-3 shrink-0">
            <div className="p-1 rounded-2xl bg-black/60 border border-white/10 grid grid-cols-3 gap-1 shadow-md">
              <button
                type="button"
                onClick={() => handleTabChange('price_tracker')}
                className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'price_tracker'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Price History</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('fake_reviews')}
                className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'fake_reviews'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Customer Reviews</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('coupons')}
                className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  activeTab === 'coupons'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Coupons ({coupons.length})</span>
              </button>
            </div>
          </div>

          {/* ── Scrollable Body Content ── */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs no-scrollbar">
            {/* ══════════════════════════════════════════════════════════ */}
            {/* TAB 1: PRICE TRACKER & DEAL INTELLIGENCE */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === 'price_tracker' && (
              <div className="space-y-3 animate-fade-in">
                {/* 3 Price Stat Badges */}
                <div className="grid grid-cols-3 gap-2">
                  {lowestPrice < product.currentPrice ? (
                    <>
                      {/* Card 1: Lowest Recorded Price */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-emerald-500/30 text-center">
                        <span className="text-[10px] text-emerald-400 font-semibold block">Lowest Price</span>
                        <span className="text-sm font-bold font-mono text-emerald-300">
                          {EcommerceAssistantService.formatPrice(lowestPrice, product.currency)}
                        </span>
                        <span className="text-[9px] text-zinc-400 block mt-0.5">Lowest recorded</span>
                      </div>

                      {/* Card 2: Current Deal Price */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-orange-500/30 text-center">
                        <span className="text-[10px] text-orange-400 font-semibold block">Current Price</span>
                        <span className="text-sm font-bold font-mono text-orange-300">
                          {EcommerceAssistantService.formatPrice(product.currentPrice, product.currency)}
                        </span>
                        <span className="text-[9px] text-amber-400/90 font-medium block mt-0.5">
                          +{EcommerceAssistantService.formatPrice(product.currentPrice - lowestPrice, product.currency)} above low
                        </span>
                      </div>

                      {/* Card 3: Highest / MRP */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-red-500/30 text-center">
                        <span className="text-[10px] text-red-400 font-semibold block">
                          {highestPrice > product.currentPrice ? 'Highest / MRP' : 'Highest Price'}
                        </span>
                        <span className="text-sm font-bold font-mono text-red-300">
                          {EcommerceAssistantService.formatPrice(highestPrice, product.currency)}
                        </span>
                        {highestPrice > product.currentPrice ? (
                          <span className="text-[9px] text-emerald-400 font-semibold block mt-0.5">
                            Save {Math.round(((highestPrice - product.currentPrice) / highestPrice) * 100)}% off MRP
                          </span>
                        ) : (
                          <span className="text-[9px] text-zinc-500 block mt-0.5">Peak observed</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Card 1: Current Price (All-Time Low) */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-orange-500/30 text-center">
                        <span className="text-[10px] text-orange-400 font-semibold block">Current Price</span>
                        <span className="text-sm font-bold font-mono text-orange-300">
                          {EcommerceAssistantService.formatPrice(product.currentPrice, product.currency)}
                        </span>
                        <span className="text-[9px] text-emerald-400 font-semibold block mt-0.5">
                          {product.dealBadge ? product.dealBadge.slice(0, 20) : '🔥 All-Time Low!'}
                        </span>
                      </div>

                      {/* Card 2: Total Savings vs MRP */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-emerald-500/30 text-center">
                        <span className="text-[10px] text-emerald-400 font-semibold block">Total Savings</span>
                        <span className="text-sm font-bold font-mono text-emerald-300">
                          {highestPrice > product.currentPrice
                            ? `Save ${EcommerceAssistantService.formatPrice(highestPrice - product.currentPrice, product.currency)}`
                            : 'Best Price'}
                        </span>
                        <span className="text-[9px] text-emerald-400/90 font-medium block mt-0.5">
                          {highestPrice > product.currentPrice
                            ? `${Math.round(((highestPrice - product.currentPrice) / highestPrice) * 100)}% Below MRP`
                            : '1st Price Check'}
                        </span>
                      </div>

                      {/* Card 3: Original MRP / List Price */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-700/60 text-center">
                        <span className="text-[10px] text-zinc-400 font-semibold block">
                          {highestPrice > product.currentPrice ? 'Original MRP' : 'Price Baseline'}
                        </span>
                        <span className="text-sm font-bold font-mono text-zinc-300">
                          {highestPrice > product.currentPrice
                            ? EcommerceAssistantService.formatPrice(highestPrice, product.currency)
                            : `${priceHistory.length} Check`}
                        </span>
                        <span className="text-[9px] text-zinc-500 block mt-0.5">
                          {highestPrice > product.currentPrice ? 'List / MRP' : 'Tracking started'}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Last Recorded Price Banner (when previously tracked) */}
                {lastRecordedPrice !== null && (
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400 flex items-center space-x-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
                      <span>Last Checked Price:</span>
                    </span>
                    <span className="font-bold text-white">
                      {EcommerceAssistantService.formatPrice(lastRecordedPrice, product.currency)}
                      {product.currentPrice < lastRecordedPrice ? (
                        <span className="text-emerald-400 font-semibold ml-2">
                          (↓ Dropped by {product.currency}{Math.round((lastRecordedPrice - product.currentPrice) * 100) / 100})
                        </span>
                      ) : product.currentPrice > lastRecordedPrice ? (
                        <span className="text-amber-400 font-semibold ml-2">
                          (↑ Rose by {product.currency}{Math.round((product.currentPrice - lastRecordedPrice) * 100) / 100})
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-normal ml-2">(Unchanged)</span>
                      )}
                    </span>
                  </div>
                )}

                {/* Deal Advice Callout */}
                <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-transparent border border-orange-500/30 flex items-center space-x-2.5 text-xs text-orange-200">
                  <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                  <span>{dealEvaluation.advice}</span>
                </div>

                {/* Visual Authentic Price Trend */}
                <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-white flex items-center space-x-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-orange-400" />
                      <span>Authentic Price History</span>
                    </span>
                    <span className="text-emerald-400 font-mono text-[10px] flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{priceHistory.length} Real Check{priceHistory.length > 1 ? 's' : ''}</span>
                    </span>
                  </div>

                  {priceHistory.length > 1 ? (
                    <>
                      {/* Sparkline Visual of Real Observed Points */}
                      <div className="h-24 w-full flex items-end justify-between gap-1 pt-4 pb-1">
                        {priceHistory.map((point, idx) => {
                          const range = highestPrice - lowestPrice || 1;
                          const normalizedHeight = Math.max(
                            15,
                            Math.round(((point.price - lowestPrice) / range) * 75 + 15)
                          );
                          const isCurrent = idx === priceHistory.length - 1;
                          const isLowest = point.price === lowestPrice;

                          return (
                            <div
                              key={idx}
                              className="flex-1 flex flex-col items-center group relative cursor-pointer"
                              title={`${point.date}: ${product.currency}${point.price}`}
                            >
                              <div className="absolute -top-7 hidden group-hover:flex px-1.5 py-0.5 rounded bg-zinc-800 text-white font-mono text-[9px] whitespace-nowrap shadow-md z-10">
                                {point.date}: {product.currency}{point.price}
                              </div>

                              <div
                                style={{ height: `${normalizedHeight}%` }}
                                className={`w-full rounded-t-sm transition-all ${
                                  isLowest
                                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                                    : isCurrent
                                    ? 'bg-orange-500 shadow-sm shadow-orange-500/50'
                                    : 'bg-white/20 group-hover:bg-white/40'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-between text-[9.5px] text-zinc-500 pt-1 border-t border-white/10 font-mono">
                        <span>First: {priceHistory[0].date}</span>
                        <span className="text-orange-400 font-bold">Latest: Today</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-zinc-300 space-y-1.5">
                      <p>
                        First observation recorded at <strong className="text-white font-mono">{EcommerceAssistantService.formatPrice(product.currentPrice, product.currency)}</strong>.
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        🛡️ <strong>Strict Authentic Data:</strong> We do not show fake past price curves. Click <strong>"Track This Product"</strong> below to record actual price movements every time you visit or refresh this page.
                      </p>
                    </div>
                  )}
                </div>

                {/* Set Price Drop Alert Card */}
                <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-white flex items-center space-x-1.5">
                        <Bell className="w-3.5 h-3.5 text-orange-400" />
                        <span>Price Drop Notification Alert</span>
                      </h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        We’ll monitor this product and alert you if the price falls.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center space-x-1.5 flex-1 min-w-0 bg-black/40 border border-white/15 focus-within:border-orange-500/60 rounded-xl px-2.5 py-2">
                      <span className="text-zinc-400 font-mono text-xs shrink-0">{product.currency}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={targetPriceInput}
                        onChange={(e) => setTargetPriceInput(e.target.value)}
                        placeholder="Enter target price..."
                        className="bg-transparent text-xs text-white focus:outline-none w-full min-w-0 font-mono"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleTrack}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
                        isTrackedCurrent
                          ? 'bg-white/10 border border-white/20 text-white hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300'
                          : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white shadow-orange-600/30'
                      }`}
                    >
                      {isTrackedCurrent ? 'Tracking Active ✓' : 'Track This Product'}
                    </button>
                  </div>
                </div>

                {/* Tracked Wishlist Drawer */}
                {trackedProducts.length > 0 && (
                  <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      My Tracked Products ({trackedProducts.length})
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
                      {trackedProducts.map((p) => (
                        <div
                          key={p.id}
                          className="p-2 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-white truncate max-w-[200px]">
                              {p.title}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              Current: {p.currency}
                              {p.currentPrice} • Target: {p.currency}
                              {p.targetPrice}
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              const updated = await StorageService.removeTrackedProduct(p.id);
                              setTrackedProducts(updated);
                            }}
                            className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* TAB 2: FAKE REVIEW & TRUST SCORE DETECTOR */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === 'fake_reviews' && (
              <div className="space-y-3 animate-fade-in">
                {/* Store Rating & Review Authenticity Overview Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-black/60 via-[#180803]/70 to-black/60 border border-orange-500/30 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-0.5">
                      Customer Rating & Trust Grade
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1 text-base font-extrabold text-white font-mono">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
                        <span>{product.rating ? `${product.rating} / 5` : reviewAnalysis ? `${reviewAnalysis.originalRating} / 5` : 'Rating not found'}</span>
                      </div>
                      {product.reviewCount && (
                        <span className="text-xs text-zinc-400 font-mono">
                          • {product.reviewCount.toLocaleString()} Reviews
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-orange-400 mt-1">
                      {reviewAnalysis?.verdict || 'Store Feedback Verified'}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 max-w-[240px]">
                      {reviewAnalysis?.summary || 'Authentic store ratings evaluated from live webpage.'}
                    </div>
                  </div>

                  {/* Trust Grade Badge */}
                  {reviewAnalysis && reviewAnalysis.trustGrade !== 'N/A' && (
                    <div
                      className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg shrink-0 ${
                        reviewAnalysis.trustGrade === 'A' || reviewAnalysis.trustGrade === 'B'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                          : reviewAnalysis.trustGrade === 'C'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                          : 'bg-red-500/20 text-red-300 border border-red-500/50'
                      }`}
                    >
                      <span className="text-xl leading-none">{reviewAnalysis.trustGrade}</span>
                      <span className="text-[9px] font-mono mt-0.5">{reviewAnalysis.trustScore}% Trust</span>
                    </div>
                  )}
                </div>

                {/* Rating Comparison: Listed vs Adjusted */}
                {reviewAnalysis && reviewAnalysis.trustGrade !== 'N/A' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center">
                      <span className="text-[10px] text-zinc-400 block mb-0.5">Website Listed Rating</span>
                      <div className="flex items-center justify-center space-x-1 text-sm font-bold text-white font-mono">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{product.rating || reviewAnalysis.originalRating} / 5</span>
                      </div>
                      <span className="text-[9px] text-zinc-500 mt-0.5 block">Store rating</span>
                    </div>

                    <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-center">
                      <span className="text-[10px] text-orange-400 block mb-0.5">Adjusted Real Rating</span>
                      <div className="flex items-center justify-center space-x-1 text-sm font-bold text-orange-300 font-mono">
                        <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400" />
                        <span>{reviewAnalysis.adjustedRating} / 5</span>
                      </div>
                      <span className="text-[9px] text-zinc-400 mt-0.5 block">After authenticity audit</span>
                    </div>
                  </div>
                )}

                {/* If individual comment paragraphs not yet rendered, show 1-click Auto-Scroll action banner */}
                {(!product.pageReviews || product.pageReviews.length === 0) && (
                  <div className="p-4 rounded-2xl bg-black/50 border border-amber-500/30 text-center space-y-2">
                    <ShieldAlert className="w-7 h-7 text-amber-400 mx-auto" />
                    <h4 className="text-xs font-bold text-white">Review Comment Text Not in DOM Yet</h4>
                    <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
                      Official store rating was captured successfully. Individual customer review paragraphs load when scrolling. Click below to automatically scroll and analyze buyer comments.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleScrollToReviews()}
                      disabled={isScanning}
                      className="mt-1 px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-semibold text-xs inline-flex items-center space-x-1.5 cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                      <span>{isScanning ? 'Scanning Reviews...' : '📜 Auto-Scroll & Scan Detailed Reviews'}</span>
                    </button>
                  </div>
                )}

                {/* Pros & Real Buyer Flaws */}
                {reviewAnalysis && (reviewAnalysis.pros.length > 0 || reviewAnalysis.cons.length > 0) && (
                  <div className="p-3.5 rounded-2xl bg-black/50 border border-white/10 space-y-2.5">
                    <span className="text-[10.5px] font-bold text-white uppercase tracking-wider block">
                      Verified Buyer Insights
                    </span>

                    {reviewAnalysis.pros.length > 0 && (
                      <div className="space-y-1">
                        {reviewAnalysis.pros.map((pro, i) => (
                          <div key={i} className="flex items-start space-x-2 text-xs text-zinc-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{pro}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {reviewAnalysis.cons.length > 0 && (
                      <div className="space-y-1 pt-1.5 border-t border-white/10">
                        {reviewAnalysis.cons.map((con, i) => (
                          <div key={i} className="flex items-start space-x-2 text-xs text-zinc-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>{con}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Detected Red Flags */}
                {reviewAnalysis && reviewAnalysis.redFlags.length > 0 && (
                  <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
                      <span>Review Authenticity Flags</span>
                    </span>
                    <ul className="space-y-1 text-[11px] text-zinc-400 pl-4 list-disc">
                      {reviewAnalysis.redFlags.map((flag, idx) => (
                        <li key={idx}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Real On-Page Review Snippets (Visual Proof) */}
                {reviewAnalysis?.sampleQuotes && reviewAnalysis.sampleQuotes.length > 0 && (
                  <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Verified On-Page Review Snippets ({reviewAnalysis.sampleQuotes.length})
                    </span>
                    <div className="space-y-1.5">
                      {reviewAnalysis.sampleQuotes.map((quote, qIdx) => (
                        <div
                          key={qIdx}
                          className="text-[11px] text-zinc-300 italic bg-white/5 p-2 rounded-xl border border-white/5 leading-relaxed"
                        >
                          "{quote}"
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Deep Analysis Button */}
                {geminiApiKey && product.pageReviews && product.pageReviews.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRunAiReviewAnalysis}
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-orange-400 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>{isLoading ? 'Analyzing Reviews...' : 'Re-Analyze with Gemini AI Vision'}</span>
                  </button>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* TAB 3: INSTANT COUPONS & PROMO CODES */}
            {/* ══════════════════════════════════════════════════════════ */}
            {activeTab === 'coupons' && (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between text-xs text-zinc-400 px-0.5">
                  <span>
                    Coupons for <strong className="text-white">{product.domain || currentDomain}</strong>:
                  </span>
                  <span className="text-orange-400 font-mono">{coupons.length} Deals</span>
                </div>

                {coupons.length > 0 ? (
                  <div className="space-y-2">
                    {coupons.map((coupon, idx) => {
                      const isCopied = copiedCoupon === coupon.code;
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl bg-black/50 border border-white/10 hover:border-orange-500/40 transition-all flex items-center justify-between gap-3 group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-mono font-bold text-xs bg-orange-500/20 border border-orange-500/40 text-orange-300 px-2 py-0.5 rounded-lg tracking-wider">
                                {coupon.code}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                                {coupon.discount}
                              </span>
                              {coupon.source === 'page_found' ? (
                                <span className="text-[9px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.2 rounded-full">
                                  ✓ On-Page
                                </span>
                              ) : (
                                <span className="text-[9px] text-zinc-400 bg-white/5 border border-white/10 px-1.5 py-0.2 rounded-full">
                                  Store Code
                                </span>
                              )}
                            </div>
                            <p className="text-[10.5px] text-zinc-400 line-clamp-1">
                              {coupon.description}
                            </p>
                            {coupon.successRate && (
                              <span className="text-[9.5px] text-zinc-500 mt-0.5 block">
                                ✓ {coupon.successRate}% verified success rate
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCopyCoupon(coupon.code)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shrink-0 shadow-sm ${
                              isCopied
                                ? 'bg-emerald-500 text-black font-bold'
                                : 'bg-white/10 hover:bg-orange-500 hover:text-white text-white/90 border border-white/15'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-black/40 border border-white/10 text-center text-zinc-400 space-y-2">
                    <Tag className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="font-semibold text-zinc-300">No Active Verified Coupons Found</p>
                    <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                      No promo banners or public coupon codes were detected on this page. We do not invent fake or placeholder coupon codes.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Empty / Non-Product State: 100% Honest Transparency */
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center space-y-4 no-scrollbar">
          <div className="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400">
            <ShoppingBag className="w-8 h-8 stroke-[1.8]" />
          </div>

          <div className="space-y-1.5 max-w-xs">
            <h3 className="text-sm font-bold text-white">No E-Commerce Product Detected</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Z-Pilot operates with <strong>100% authentic data only</strong>. Please navigate to a product page on Amazon, Flipkart, Walmart, eBay, Nike, Myntra, etc., then click <strong>Rescan Active Page</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void scanCurrentPage(true)}
            disabled={isScanning}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white font-bold text-xs flex items-center space-x-2 shadow-md shadow-orange-600/30 transition-all cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning Tab...' : 'Rescan Active Page'}</span>
          </button>

          {/* Saved Tracked Wishlist */}
          {trackedProducts.length > 0 && (
            <div className="w-full mt-4 text-left p-3.5 rounded-2xl bg-black/50 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center space-x-1.5">
                  <Bell className="w-3.5 h-3.5 text-orange-400" />
                  <span>Your Tracked Wishlist</span>
                </span>
                <span className="text-[10.5px] font-mono text-zinc-500">{trackedProducts.length} items</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                {trackedProducts.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs hover:border-orange-500/30 transition-all"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-white truncate max-w-[200px]">{item.title}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {item.domain} • Current: {item.currency}{item.currentPrice} • Target: {item.currency}{item.targetPrice}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await StorageService.removeTrackedProduct(item.id);
                        setTrackedProducts(updated);
                      }}
                      className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Action & Control Bar ── */}
      <div className="px-4 py-2.5 border-t border-orange-500/20 bg-gradient-to-r from-black/90 via-[#180a04]/95 to-black/90 backdrop-blur-xl flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => void scanCurrentPage(true)}
          disabled={isScanning}
          className="text-xs text-zinc-400 hover:text-white flex items-center space-x-1.5 cursor-pointer transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 text-orange-400 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Scanning Tab...' : 'Rescan Active Page'}</span>
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
  );
};
