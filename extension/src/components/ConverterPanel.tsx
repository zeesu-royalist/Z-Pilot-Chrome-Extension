import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ArrowRightLeft,
  Coins,
  Ruler,
  Globe,
  Copy,
  Check,
  RefreshCw,
  Sun,
  Moon,
  Clock,
  Plus,
  Trash2,
  Sliders,
  Scale,
  Thermometer,
  HardDrive,
  Gauge,
  Grid,
  Beaker,
  Activity,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import {
  ConverterTab,
  UnitCategory,
  TimezoneCity,
} from '../types/index.js';
import { StorageService } from '../services/storage.js';
import {
  ALL_WORLD_CITIES,
  POPULAR_CURRENCIES,
  STATIC_FALLBACK_RATES,
  UNIT_CATEGORIES,
  convertCurrency,
  convertUnit,
  fetchExchangeRates,
  formatCurrencyValue,
  formatUnitNumber,
  getCityTime,
  getPopularComparisons,
  getUnitFormula,
} from '../services/converter.js';

interface ConverterPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConverterPanel: React.FC<ConverterPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<ConverterTab>('currency');

  // ── Currency State ──
  const [currencyAmount, setCurrencyAmount] = useState<string>('100');
  const [currencyFrom, setCurrencyFrom] = useState<string>('USD');
  const [currencyTo, setCurrencyTo] = useState<string>('INR');
  const [rates, setRates] = useState<Record<string, number>>(STATIC_FALLBACK_RATES);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<number>(Date.now());
  const [isRefreshingRates, setIsRefreshingRates] = useState<boolean>(false);
  const [isLiveRates, setIsLiveRates] = useState<boolean>(true);
  const [copiedCurrency, setCopiedCurrency] = useState<boolean>(false);

  // ── Unit Converter State ──
  const [unitCategory, setUnitCategory] = useState<UnitCategory>('length');
  const [unitAmount, setUnitAmount] = useState<string>('1');
  const [unitFrom, setUnitFrom] = useState<string>('km');
  const [unitTo, setUnitTo] = useState<string>('mi');
  const [copiedUnit, setCopiedUnit] = useState<boolean>(false);

  // ── Timezone & World Clock State ──
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [timeSliderHours, setTimeSliderHours] = useState<number>(() => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  });
  const [isTimeSliderActive, setIsTimeSliderActive] = useState<boolean>(false);
  const [selectedCityIds, setSelectedCityIds] = useState<string[]>([
    'new_york',
    'london',
    'mumbai',
    'dubai',
    'tokyo',
  ]);
  const [showAddCityModal, setShowAddCityModal] = useState<boolean>(false);

  // Initialize and load persistent preferences
  useEffect(() => {
    if (!isOpen) return;

    // Load saved preferences
    StorageService.getConverterPreferences().then((prefs) => {
      setActiveTab(prefs.lastTab || 'currency');
      setCurrencyFrom(prefs.currencyFrom || 'USD');
      setCurrencyTo(prefs.currencyTo || 'INR');
      setUnitCategory(prefs.unitCategory || 'length');
      setUnitFrom(prefs.unitFrom || 'km');
      setUnitTo(prefs.unitTo || 'mi');
      if (prefs.selectedCities && prefs.selectedCities.length > 0) {
        setSelectedCityIds(prefs.selectedCities);
      }
    });

    // Fetch exchange rates
    fetchExchangeRates(false).then((data) => {
      setRates(data.rates);
      setRatesLastUpdated(data.lastUpdated);
      setIsLiveRates(data.isLive);
    });
  }, [isOpen]);

  // Live timer for clock (updates every second when not scrubbing slider)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentDate(now);
      if (!isTimeSliderActive) {
        setTimeSliderHours(now.getHours() + now.getMinutes() / 60);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, isTimeSliderActive]);

  // Escape key listener to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showAddCityModal) {
          setShowAddCityModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showAddCityModal, onClose]);

  // Save preferences on change
  const handleTabChange = (tab: ConverterTab) => {
    setActiveTab(tab);
    void StorageService.saveConverterPreferences({ lastTab: tab });
  };

  // ── Currency Helpers ──
  const handleRefreshRates = async () => {
    setIsRefreshingRates(true);
    try {
      const data = await fetchExchangeRates(true);
      setRates(data.rates);
      setRatesLastUpdated(data.lastUpdated);
      setIsLiveRates(data.isLive);
    } finally {
      setIsRefreshingRates(false);
    }
  };

  const handleSwapCurrencies = () => {
    const prevFrom = currencyFrom;
    const prevTo = currencyTo;
    setCurrencyFrom(prevTo);
    setCurrencyTo(prevFrom);
    void StorageService.saveConverterPreferences({
      currencyFrom: prevTo,
      currencyTo: prevFrom,
    });
  };

  const numericCurrencyAmount = useMemo(() => {
    const parsed = parseFloat(currencyAmount.replace(/,/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }, [currencyAmount]);

  const convertedCurrencyResult = useMemo(() => {
    return convertCurrency(numericCurrencyAmount, currencyFrom, currencyTo, rates);
  }, [numericCurrencyAmount, currencyFrom, currencyTo, rates]);

  const singleUnitRate = useMemo(() => {
    return convertCurrency(1, currencyFrom, currencyTo, rates);
  }, [currencyFrom, currencyTo, rates]);

  const popularComparisons = useMemo(() => {
    return getPopularComparisons(numericCurrencyAmount, currencyFrom, rates);
  }, [numericCurrencyAmount, currencyFrom, rates]);

  const handleCopyCurrency = () => {
    const formatted = `${formatCurrencyValue(convertedCurrencyResult, currencyTo)} ${currencyTo}`;
    navigator.clipboard?.writeText(formatted);
    setCopiedCurrency(true);
    setTimeout(() => setCopiedCurrency(false), 2000);
  };

  // ── Unit Helpers ──
  const activeCategoryObj = useMemo(() => {
    return UNIT_CATEGORIES.find((c) => c.id === unitCategory) || UNIT_CATEGORIES[0];
  }, [unitCategory]);

  const handleCategorySelect = (catId: UnitCategory) => {
    setUnitCategory(catId);
    const cat = UNIT_CATEGORIES.find((c) => c.id === catId);
    if (cat && cat.units.length >= 2) {
      setUnitFrom(cat.units[0].id);
      setUnitTo(cat.units[1].id);
      void StorageService.saveConverterPreferences({
        unitCategory: catId,
        unitFrom: cat.units[0].id,
        unitTo: cat.units[1].id,
      });
    }
  };

  const handleSwapUnits = () => {
    const prevFrom = unitFrom;
    const prevTo = unitTo;
    setUnitFrom(prevTo);
    setUnitTo(prevFrom);
    void StorageService.saveConverterPreferences({
      unitFrom: prevTo,
      unitTo: prevFrom,
    });
  };

  const numericUnitAmount = useMemo(() => {
    const parsed = parseFloat(unitAmount.replace(/,/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }, [unitAmount]);

  const convertedUnitResult = useMemo(() => {
    return convertUnit(numericUnitAmount, unitCategory, unitFrom, unitTo);
  }, [numericUnitAmount, unitCategory, unitFrom, unitTo]);

  const unitFormula = useMemo(() => {
    return getUnitFormula(unitCategory, unitFrom, unitTo);
  }, [unitCategory, unitFrom, unitTo]);

  const handleCopyUnit = () => {
    const toUnitObj = activeCategoryObj.units.find((u) => u.id === unitTo);
    const text = `${formatUnitNumber(convertedUnitResult)} ${toUnitObj?.symbol || unitTo}`;
    navigator.clipboard?.writeText(text);
    setCopiedUnit(true);
    setTimeout(() => setCopiedUnit(false), 2000);
  };

  // ── Timezone Helpers ──
  const effectiveBaseDate = useMemo(() => {
    if (!isTimeSliderActive) {
      return currentDate;
    }
    const d = new Date(currentDate);
    const totalMinutes = Math.round(timeSliderHours * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    d.setHours(hours, minutes, 0, 0);
    return d;
  }, [currentDate, timeSliderHours, isTimeSliderActive]);

  const selectedCitiesData = useMemo(() => {
    return selectedCityIds
      .map((id) => ALL_WORLD_CITIES.find((c) => c.id === id))
      .filter((c): c is TimezoneCity => !!c)
      .map((city) => getCityTime(effectiveBaseDate, city));
  }, [selectedCityIds, effectiveBaseDate]);

  const availableCitiesToAdd = useMemo(() => {
    return ALL_WORLD_CITIES.filter((c) => !selectedCityIds.includes(c.id));
  }, [selectedCityIds]);

  const handleAddCity = (cityId: string) => {
    if (!selectedCityIds.includes(cityId)) {
      const updated = [...selectedCityIds, cityId];
      setSelectedCityIds(updated);
      void StorageService.saveConverterPreferences({ selectedCities: updated });
    }
    setShowAddCityModal(false);
  };

  const handleRemoveCity = (cityId: string) => {
    const updated = selectedCityIds.filter((id) => id !== cityId);
    setSelectedCityIds(updated);
    void StorageService.saveConverterPreferences({ selectedCities: updated });
  };

  const handleResetToNow = () => {
    setIsTimeSliderActive(false);
    const now = new Date();
    setCurrentDate(now);
    setTimeSliderHours(now.getHours() + now.getMinutes() / 60);
  };

  // Helper for category icon
  const renderCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'Ruler':
        return <Ruler className="w-3.5 h-3.5" />;
      case 'Scale':
        return <Scale className="w-3.5 h-3.5" />;
      case 'Thermometer':
        return <Thermometer className="w-3.5 h-3.5" />;
      case 'HardDrive':
        return <HardDrive className="w-3.5 h-3.5" />;
      case 'Gauge':
        return <Gauge className="w-3.5 h-3.5" />;
      case 'Grid':
        return <Grid className="w-3.5 h-3.5" />;
      case 'Beaker':
        return <Beaker className="w-3.5 h-3.5" />;
      case 'Clock':
        return <Clock className="w-3.5 h-3.5" />;
      case 'Activity':
        return <Activity className="w-3.5 h-3.5" />;
      default:
        return <Ruler className="w-3.5 h-3.5" />;
    }
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
              <span>Converter</span>
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

      {/* ── Tab Switcher: Currency | Units | Timezone ── */}
      <div className="px-3 pt-3 shrink-0">
        <div className="p-1 rounded-2xl bg-black/60 border border-white/10 grid grid-cols-3 gap-1 shadow-md">
          <button
            type="button"
            onClick={() => handleTabChange('currency')}
            className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'currency'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Currency</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('units')}
            className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'units'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Units</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('timezone')}
            className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'timezone'
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Timezone</span>
          </button>
        </div>
      </div>

      {/* ── Tab Contents ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
        {/* ══════════════════════════════════════════════════════
            TAB 1: CURRENCY CONVERTER
           ══════════════════════════════════════════════════════ */}
        {activeTab === 'currency' && (
          <div className="space-y-3 animate-fade-in">
            {/* Input & Pickers Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#180e06] to-[#0e0703] border border-orange-500/25 shadow-xl shadow-black/30 space-y-3 overflow-hidden w-full">
              {/* Amount Input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-white/50">
                  <span>Enter Amount</span>
                  {numericCurrencyAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setCurrencyAmount('0')}
                      className="text-[10px] text-white/40 hover:text-orange-400 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={currencyAmount}
                    onChange={(e) => setCurrencyAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-black/60 border border-white/15 focus:border-orange-500/60 rounded-xl px-3.5 py-2.5 text-lg font-mono font-bold text-amber-300 placeholder:text-white/20 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Quick Multiplier Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {[
                  { label: '10', val: 10 },
                  { label: '50', val: 50 },
                  { label: '100', val: 100 },
                  { label: '500', val: 500 },
                  { label: '1k', val: 1000 },
                  { label: '5k', val: 5000 },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setCurrencyAmount(String(chip.val))}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-[10px] font-mono text-white/80 hover:text-white transition-all cursor-pointer shrink-0 active:scale-95"
                  >
                    +{chip.label}
                  </button>
                ))}
              </div>

              {/* From & To Currency Selectors with Swap */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/10 w-full">
                {/* From Currency */}
                <div className="flex-1 min-w-0 bg-black/60 border border-white/15 rounded-xl px-2.5 py-2 focus-within:border-orange-500/50">
                  <span className="block text-[9px] uppercase font-bold text-white/40 mb-0.5">
                    From
                  </span>
                  <select
                    value={currencyFrom}
                    onChange={(e) => {
                      setCurrencyFrom(e.target.value);
                      void StorageService.saveConverterPreferences({ currencyFrom: e.target.value });
                    }}
                    className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer [color-scheme:dark] truncate"
                  >
                    {POPULAR_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code} className="bg-[#180a04] text-white">
                        {c.flag} {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Swap Button */}
                <button
                  type="button"
                  onClick={handleSwapCurrencies}
                  title="Swap Currencies"
                  className="w-9 h-9 rounded-xl bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/40 text-orange-300 flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0 shadow-sm"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>

                {/* To Currency */}
                <div className="flex-1 min-w-0 bg-black/60 border border-white/15 rounded-xl px-2.5 py-2 focus-within:border-orange-500/50">
                  <span className="block text-[9px] uppercase font-bold text-white/40 mb-0.5">
                    To
                  </span>
                  <select
                    value={currencyTo}
                    onChange={(e) => {
                      setCurrencyTo(e.target.value);
                      void StorageService.saveConverterPreferences({ currencyTo: e.target.value });
                    }}
                    className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer [color-scheme:dark] truncate"
                  >
                    {POPULAR_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code} className="bg-[#180a04] text-white">
                        {c.flag} {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Main Converted Result Box */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-600/20 via-amber-600/15 to-black/60 border border-orange-500/35 shadow-xl shadow-orange-950/20 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Converted Result</span>
                <button
                  type="button"
                  onClick={handleCopyCurrency}
                  className="flex items-center space-x-1 text-[11px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer active:scale-95 transition-all"
                >
                  {copiedCurrency ? (
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

              <div className="flex items-baseline space-x-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight break-all">
                  {formatCurrencyValue(convertedCurrencyResult, currencyTo)}
                </span>
                <span className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                  {currencyTo}
                </span>
              </div>

              {/* Rate & Live timestamp */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60">
                <div className="flex items-center space-x-1">
                  <span>1 {currencyFrom} =</span>
                  <span className="font-mono font-bold text-white">
                    {formatCurrencyValue(singleUnitRate, currencyTo)} {currencyTo}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshRates}
                  disabled={isRefreshingRates}
                  title="Refresh live exchange rates"
                  className="flex items-center space-x-1 text-[10px] text-white/50 hover:text-orange-300 transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isRefreshingRates ? 'animate-spin text-orange-400' : ''}`}
                  />
                  <span>
                    {isLiveRates ? 'Live' : 'Cached'}{' '}
                    {ratesLastUpdated > 0
                      ? `(${new Date(ratesLastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                      : ''}
                  </span>
                </button>
              </div>
            </div>

            {/* Popular Currencies Comparison Cards */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-white/80">
                <span>Instant Multi-Currency Glance</span>
                <span className="text-[10px] font-normal text-white/40">Top Exchanges</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {popularComparisons.map((item) => (
                  <div
                    key={item.code}
                    onClick={() => {
                      setCurrencyTo(item.code);
                      void StorageService.saveConverterPreferences({ currencyTo: item.code });
                    }}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-orange-500/15 border border-white/10 hover:border-orange-500/30 transition-all cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center space-x-1 font-bold text-white/90">
                        <span>{item.flag}</span>
                        <span>{item.code}</span>
                      </span>
                      <span className="text-[10px] text-white/40">{item.symbol}</span>
                    </div>
                    <div className="font-mono font-bold text-xs text-amber-300 truncate">
                      {item.formatted}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 2: UNIT CONVERTER
           ══════════════════════════════════════════════════════ */}
        {activeTab === 'units' && (
          <div className="space-y-3 animate-fade-in">
            {/* Category Selector Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {UNIT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategorySelect(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 active:scale-95 ${
                    unitCategory === cat.id
                      ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-600/30'
                      : 'bg-black/60 border border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  {renderCategoryIcon(cat.iconName)}
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Input & Unit Pickers Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#180e06] to-[#0e0703] border border-orange-500/25 shadow-xl shadow-black/30 space-y-3 overflow-hidden w-full">
              {/* Value Input */}
              <div className="space-y-1">
                <span className="text-[11px] text-white/50">Enter Value</span>
                <input
                  type="number"
                  step="any"
                  value={unitAmount}
                  onChange={(e) => setUnitAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-black/60 border border-white/15 focus:border-orange-500/60 rounded-xl px-3.5 py-2.5 text-lg font-mono font-bold text-amber-300 placeholder:text-white/20 focus:outline-none transition-colors"
                />
              </div>

              {/* From & To Selectors */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/10 w-full">
                {/* From Unit */}
                <div className="flex-1 min-w-0 bg-black/60 border border-white/15 rounded-xl px-2.5 py-2 focus-within:border-orange-500/50">
                  <span className="block text-[9px] uppercase font-bold text-white/40 mb-0.5">
                    From
                  </span>
                  <select
                    value={unitFrom}
                    onChange={(e) => {
                      setUnitFrom(e.target.value);
                      void StorageService.saveConverterPreferences({ unitFrom: e.target.value });
                    }}
                    className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer [color-scheme:dark] truncate"
                  >
                    {activeCategoryObj.units.map((u) => (
                      <option key={u.id} value={u.id} className="bg-[#180a04] text-white">
                        {u.name} ({u.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Swap */}
                <button
                  type="button"
                  onClick={handleSwapUnits}
                  title="Swap Units"
                  className="w-9 h-9 rounded-xl bg-orange-500/20 hover:bg-orange-500/35 border border-orange-500/40 text-orange-300 flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0 shadow-sm"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>

                {/* To Unit */}
                <div className="flex-1 min-w-0 bg-black/60 border border-white/15 rounded-xl px-2.5 py-2 focus-within:border-orange-500/50">
                  <span className="block text-[9px] uppercase font-bold text-white/40 mb-0.5">
                    To
                  </span>
                  <select
                    value={unitTo}
                    onChange={(e) => {
                      setUnitTo(e.target.value);
                      void StorageService.saveConverterPreferences({ unitTo: e.target.value });
                    }}
                    className="w-full bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer [color-scheme:dark] truncate"
                  >
                    {activeCategoryObj.units.map((u) => (
                      <option key={u.id} value={u.id} className="bg-[#180a04] text-white">
                        {u.name} ({u.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Main Converted Result Box */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-600/20 via-amber-600/15 to-black/60 border border-orange-500/35 shadow-xl shadow-orange-950/20 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Calculated Unit</span>
                <button
                  type="button"
                  onClick={handleCopyUnit}
                  className="flex items-center space-x-1 text-[11px] text-orange-400 hover:text-orange-300 font-semibold cursor-pointer active:scale-95 transition-all"
                >
                  {copiedUnit ? (
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

              <div className="flex items-baseline space-x-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight break-all">
                  {formatUnitNumber(convertedUnitResult)}
                </span>
                <span className="text-sm font-bold text-amber-400">
                  {activeCategoryObj.units.find((u) => u.id === unitTo)?.symbol || unitTo}
                </span>
              </div>

              {/* Conversion formula pill */}
              <div className="pt-2 border-t border-white/10 text-[11px] text-white/60 flex items-center justify-between">
                <span>Formula:</span>
                <span className="font-mono font-medium text-amber-300/90">{unitFormula}</span>
              </div>
            </div>

            {/* Quick multi-unit table */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
              <span className="text-xs font-bold text-white/80 block">
                All {activeCategoryObj.label} Conversions
              </span>

              <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                {activeCategoryObj.units
                  .filter((u) => u.id !== unitFrom)
                  .map((u) => {
                    const cVal = convertUnit(numericUnitAmount, unitCategory, unitFrom, u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          setUnitTo(u.id);
                          void StorageService.saveConverterPreferences({ unitTo: u.id });
                        }}
                        className="px-3 py-2 rounded-xl bg-white/5 hover:bg-orange-500/15 border border-white/5 hover:border-orange-500/30 flex items-center justify-between text-xs transition-colors cursor-pointer"
                      >
                        <span className="text-white/70 font-medium">
                          {u.name} <span className="text-white/40">({u.symbol})</span>
                        </span>
                        <span className="font-mono font-bold text-amber-300">
                          {formatUnitNumber(cVal)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB 3: TIMEZONE CONVERTER & WORLD CLOCK
           ══════════════════════════════════════════════════════ */}
        {activeTab === 'timezone' && (
          <div className="space-y-3 animate-fade-in">
            {/* Top Local Time Clock Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-600/25 via-orange-600/15 to-black/60 border border-orange-500/35 shadow-xl shadow-orange-950/25 space-y-2">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="flex items-center space-x-1.5 font-bold text-white">
                  <Clock className="w-3.5 h-3.5 text-orange-400" />
                  <span>Your Local Time</span>
                </span>
                <span className="text-[11px] font-mono text-amber-300/80">
                  {currentDate.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              <div className="flex items-baseline space-x-2">
                <span className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                  {currentDate.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </span>
                <span className="text-xs font-mono text-white/50">
                  :{String(currentDate.getSeconds()).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Interactive Meeting / Time Slider Card */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white/90 flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-orange-400" />
                  <span>Interactive Time Travel / Planner</span>
                </span>
                {isTimeSliderActive && (
                  <button
                    type="button"
                    onClick={handleResetToNow}
                    className="text-[10px] text-orange-400 hover:text-orange-300 font-bold cursor-pointer"
                  >
                    Reset to Now ↺
                  </button>
                )}
              </div>

              <p className="text-[11px] text-white/50 leading-relaxed">
                Drag slider to scrub hours and plan calls across timezones:
              </p>

              {/* Slider */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="0"
                  max="23.75"
                  step="0.25"
                  value={timeSliderHours}
                  onChange={(e) => {
                    setTimeSliderHours(parseFloat(e.target.value));
                    setIsTimeSliderActive(true);
                  }}
                  className="w-full accent-orange-500 cursor-pointer h-2 bg-white/10 rounded-lg"
                />
                <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                  <span>12 AM</span>
                  <span>6 AM</span>
                  <span className="text-orange-400 font-bold">12 PM</span>
                  <span>6 PM</span>
                  <span>11 PM</span>
                </div>
              </div>

              {/* Status Badge Legend */}
              <div className="flex items-center justify-between pt-1 text-[10px] text-white/50 border-t border-white/5">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Work (9-6)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Awake (7-9, 6-9)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span>Sleep (9pm-7am)</span>
                </span>
              </div>
            </div>

            {/* Cities World Clock List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white/80 px-1">
                <span>World Cities ({selectedCitiesData.length})</span>
                <button
                  type="button"
                  onClick={() => setShowAddCityModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer active:scale-95 transition-all"
                >
                  <Plus className="w-3 h-3 stroke-[2.5]" />
                  <span>Add City</span>
                </button>
              </div>

              {selectedCitiesData.length === 0 && (
                <div className="p-6 rounded-2xl bg-black/40 border border-white/10 text-center space-y-2">
                  <p className="text-xs text-white/50">No world cities pinned yet.</p>
                  <button
                    type="button"
                    onClick={() => setShowAddCityModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-semibold cursor-pointer"
                  >
                    + Add Cities
                  </button>
                </div>
              )}

              {selectedCitiesData.map((data) => (
                <div
                  key={data.city.id}
                  className="p-3 rounded-2xl bg-black/40 border border-white/10 hover:border-orange-500/30 transition-all flex items-center justify-between group space-x-2"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="text-xl shrink-0">{data.city.flag}</span>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-xs text-white truncate">
                          {data.city.name}
                        </span>
                        <span className="text-[10px] text-white/40 shrink-0 font-mono">
                          {data.offsetHoursStr}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/50 truncate">
                        {data.dateFormatted}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2.5 shrink-0">
                    {/* Time display & Sun/Moon icon */}
                    <div className="flex flex-col items-end">
                      <div className="flex items-center space-x-1 font-mono font-bold text-sm text-white">
                        {data.isDay ? (
                          <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Moon className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                        )}
                        <span>{data.timeFormatted}</span>
                      </div>
                      <div className="flex items-center space-x-1 mt-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            data.workHourStatus === 'work'
                              ? 'bg-emerald-400'
                              : data.workHourStatus === 'flexible'
                              ? 'bg-amber-400'
                              : 'bg-red-400'
                          }`}
                        />
                        <span className="text-[9px] uppercase tracking-wider font-semibold text-white/50">
                          {data.workHourStatus === 'work'
                            ? 'Working'
                            : data.workHourStatus === 'flexible'
                            ? 'Awake'
                            : 'Night'}
                        </span>
                      </div>
                    </div>

                    {/* Delete city button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveCity(data.city.id)}
                      title={`Remove ${data.city.name}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Add City Modal Drawer ── */}
      {showAddCityModal && (
        <div
          onClick={() => setShowAddCityModal(false)}
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-[#140803] border border-orange-500/40 p-4 shadow-2xl space-y-3 max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-bold text-xs text-white">Add Global City</span>
              <button
                type="button"
                onClick={() => setShowAddCityModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 no-scrollbar pr-1">
              {availableCitiesToAdd.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/50 leading-relaxed">
                  All global hub cities are already added to your dashboard!
                </div>
              ) : (
                availableCitiesToAdd.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => handleAddCity(city.id)}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 hover:bg-orange-500/20 border border-white/5 hover:border-orange-500/40 flex items-center justify-between text-left text-xs transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="text-lg">{city.flag}</span>
                      <div>
                        <div className="font-bold text-white group-hover:text-orange-300">
                          {city.name}
                        </div>
                        <div className="text-[10px] text-white/40">{city.country}</div>
                      </div>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-white/40 group-hover:text-orange-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
