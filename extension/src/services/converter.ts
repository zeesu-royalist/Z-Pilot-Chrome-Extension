/**
 * Z-Pilot Currency, Unit & Timezone Converter Engine
 * 100% Client-Side, Real-Time with Local Caching & Zero-Lag Offline Resilience.
 */

import {
  ExchangeRatesData,
  TimezoneCity,
  UnitCategory,
  UnitDefinition,
} from '../types/index.js';
import { StorageService } from './storage.js';

// ═══════════════════════════════════════════════════════════════
// 1. CURRENCY CONVERTER ENGINE
// ═══════════════════════════════════════════════════════════════

export interface CurrencyItem {
  code: string;
  name: string;
  symbol: string;
  flag: string;
}

export const POPULAR_CURRENCIES: CurrencyItem[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', flag: '🇦🇪' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', flag: '🇸🇦' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', flag: '🇰🇷' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', flag: '🇨🇭' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', flag: '🇳🇿' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', flag: '🇲🇽' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', flag: '🇹🇷' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', flag: '🇹🇭' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', flag: '🇮🇩' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', flag: '🇲🇾' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', flag: '🇵🇭' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', flag: '🇵🇰' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', flag: '🇧🇩' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', flag: '🇻🇳' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', flag: '🇷🇺' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', flag: '🇭🇰' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', flag: '🇳🇴' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', flag: '🇩🇰' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', flag: '🇵🇱' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KD', flag: '🇰🇼' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QR', flag: '🇶🇦' },
  { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', flag: '🇴🇲' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BD', flag: '🇧🇭' },
  { code: 'BTC', name: 'Bitcoin', symbol: '₿', flag: '🪙' },
  { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', flag: '🪙' },
  { code: 'SOL', name: 'Solana', symbol: '◎', flag: '🪙' },
];

// Offline baseline fallback rates relative to 1 USD
export const STATIC_FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.925,
  GBP: 0.792,
  INR: 86.85,
  JPY: 154.5,
  CAD: 1.405,
  AUD: 1.552,
  AED: 3.6725,
  SAR: 3.751,
  SGD: 1.344,
  CNY: 7.24,
  KRW: 1395.0,
  CHF: 0.884,
  NZD: 1.705,
  BRL: 5.75,
  MXN: 20.4,
  ZAR: 18.25,
  TRY: 34.6,
  THB: 34.85,
  IDR: 15950.0,
  MYR: 4.47,
  PHP: 58.85,
  PKR: 278.2,
  BDT: 120.5,
  VND: 25420.0,
  RUB: 100.2,
  HKD: 7.78,
  SEK: 10.92,
  NOK: 11.05,
  DKK: 6.9,
  PLN: 4.12,
  KWD: 0.308,
  QAR: 3.64,
  OMR: 0.385,
  BHD: 0.376,
  BTC: 0.0000108,
  ETH: 0.00032,
  SOL: 0.0048,
};

/**
 * Fetch latest exchange rates from open.er-api.com with fallback and cache.
 * 4-hour caching ensures fast startup and low network overhead.
 */
export async function fetchExchangeRates(
  forceRefresh = false
): Promise<{ rates: Record<string, number>; lastUpdated: number; isLive: boolean }> {
  const cached = await StorageService.getCachedExchangeRates();
  const now = Date.now();
  const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

  if (!forceRefresh && cached && cached.rates && now - cached.lastUpdated < CACHE_TTL) {
    return {
      rates: { ...STATIC_FALLBACK_RATES, ...cached.rates },
      lastUpdated: cached.lastUpdated,
      isLive: true,
    };
  }

  // Live fetch from open.er-api.com
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.rates && typeof data.rates === 'object') {
        const mergedRates = {
          ...STATIC_FALLBACK_RATES,
          ...data.rates,
        };
        const ratesData: ExchangeRatesData = {
          base: 'USD',
          rates: mergedRates,
          lastUpdated: now,
          source: 'open.er-api.com',
        };
        await StorageService.saveCachedExchangeRates(ratesData);
        return { rates: mergedRates, lastUpdated: now, isLive: true };
      }
    }
  } catch (err) {
    console.warn('[ConverterService] Primary exchange rate fetch failed:', err);
  }

  // Backup fetch from exchangerate-api fallback
  try {
    const resp = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.rates) {
        const mergedRates = { ...STATIC_FALLBACK_RATES, ...data.rates };
        const ratesData: ExchangeRatesData = {
          base: 'USD',
          rates: mergedRates,
          lastUpdated: now,
          source: 'exchangerate-api.com',
        };
        await StorageService.saveCachedExchangeRates(ratesData);
        return { rates: mergedRates, lastUpdated: now, isLive: true };
      }
    }
  } catch {
    // Fall back to cached or static
  }

  if (cached && cached.rates) {
    return {
      rates: { ...STATIC_FALLBACK_RATES, ...cached.rates },
      lastUpdated: cached.lastUpdated,
      isLive: false,
    };
  }

  return {
    rates: STATIC_FALLBACK_RATES,
    lastUpdated: now,
    isLive: false,
  };
}

/**
 * Convert any amount from one currency to another using USD-based rate table
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (from === to) return amount;

  const rateFrom = rates[from] || STATIC_FALLBACK_RATES[from] || 1;
  const rateTo = rates[to] || STATIC_FALLBACK_RATES[to] || 1;

  // Amount in USD = amount / rateFrom
  const inUSD = amount / rateFrom;
  return inUSD * rateTo;
}

/**
 * Format currency numbers with localized commas and appropriate decimals
 */
export function formatCurrencyValue(amount: number, currencyCode: string): string {
  if (!Number.isFinite(amount)) return '0';

  // For high-value crypto or tiny numbers
  if (amount > 0 && amount < 0.001) {
    return amount.toFixed(6);
  }
  if (['JPY', 'KRW', 'VND', 'IDR'].includes(currencyCode)) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount);
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get popular currency conversion snapshots for the quick comparison table
 */
export function getPopularComparisons(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number>
) {
  const targets = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AED', 'CAD', 'AUD'].filter(
    (c) => c !== fromCurrency
  ).slice(0, 6);

  return targets.map((code) => {
    const item = POPULAR_CURRENCIES.find((c) => c.code === code)!;
    const converted = convertCurrency(amount, fromCurrency, code, rates);
    return {
      code,
      name: item?.name || code,
      flag: item?.flag || '🌐',
      symbol: item?.symbol || '',
      amount: converted,
      formatted: formatCurrencyValue(converted, code),
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. UNIT CONVERTER ENGINE
// ═══════════════════════════════════════════════════════════════

export interface CategoryUnits {
  id: UnitCategory;
  label: string;
  iconName: string;
  baseUnit: string;
  units: UnitDefinition[];
}

export const UNIT_CATEGORIES: CategoryUnits[] = [
  {
    id: 'length',
    label: 'Length',
    iconName: 'Ruler',
    baseUnit: 'm',
    units: [
      { id: 'km', name: 'Kilometer', symbol: 'km', ratioToBase: 1000 },
      { id: 'm', name: 'Meter', symbol: 'm', ratioToBase: 1 },
      { id: 'cm', name: 'Centimeter', symbol: 'cm', ratioToBase: 0.01 },
      { id: 'mm', name: 'Millimeter', symbol: 'mm', ratioToBase: 0.001 },
      { id: 'mi', name: 'Mile', symbol: 'mi', ratioToBase: 1609.344 },
      { id: 'yd', name: 'Yard', symbol: 'yd', ratioToBase: 0.9144 },
      { id: 'ft', name: 'Foot', symbol: 'ft', ratioToBase: 0.3048 },
      { id: 'in', name: 'Inch', symbol: 'in', ratioToBase: 0.0254 },
      { id: 'nmi', name: 'Nautical Mile', symbol: 'NM', ratioToBase: 1852 },
    ],
  },
  {
    id: 'weight',
    label: 'Weight',
    iconName: 'Scale',
    baseUnit: 'kg',
    units: [
      { id: 't', name: 'Metric Ton', symbol: 't', ratioToBase: 1000 },
      { id: 'kg', name: 'Kilogram', symbol: 'kg', ratioToBase: 1 },
      { id: 'g', name: 'Gram', symbol: 'g', ratioToBase: 0.001 },
      { id: 'mg', name: 'Milligram', symbol: 'mg', ratioToBase: 0.000001 },
      { id: 'lb', name: 'Pound', symbol: 'lb', ratioToBase: 0.45359237 },
      { id: 'oz', name: 'Ounce', symbol: 'oz', ratioToBase: 0.028349523125 },
      { id: 'st', name: 'Stone', symbol: 'st', ratioToBase: 6.35029318 },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    iconName: 'Thermometer',
    baseUnit: 'C',
    units: [
      { id: 'C', name: 'Celsius', symbol: '°C', ratioToBase: 1 },
      { id: 'F', name: 'Fahrenheit', symbol: '°F', ratioToBase: 1 },
      { id: 'K', name: 'Kelvin', symbol: 'K', ratioToBase: 1 },
    ],
  },
  {
    id: 'storage',
    label: 'Digital Data',
    iconName: 'HardDrive',
    baseUnit: 'B',
    units: [
      { id: 'B', name: 'Byte', symbol: 'B', ratioToBase: 1 },
      { id: 'KB', name: 'Kilobyte', symbol: 'KB', ratioToBase: 1000 },
      { id: 'MB', name: 'Megabyte', symbol: 'MB', ratioToBase: 1000000 },
      { id: 'GB', name: 'Gigabyte', symbol: 'GB', ratioToBase: 1000000000 },
      { id: 'TB', name: 'Terabyte', symbol: 'TB', ratioToBase: 1000000000000 },
      { id: 'PB', name: 'Petabyte', symbol: 'PB', ratioToBase: 1000000000000000 },
      { id: 'bit', name: 'Bit', symbol: 'bit', ratioToBase: 0.125 },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    iconName: 'Gauge',
    baseUnit: 'm_s',
    units: [
      { id: 'km_h', name: 'Kilometers per hour', symbol: 'km/h', ratioToBase: 1 / 3.6 },
      { id: 'mph', name: 'Miles per hour', symbol: 'mph', ratioToBase: 0.44704 },
      { id: 'm_s', name: 'Meters per second', symbol: 'm/s', ratioToBase: 1 },
      { id: 'kn', name: 'Knot', symbol: 'kn', ratioToBase: 0.514444 },
      { id: 'ft_s', name: 'Feet per second', symbol: 'ft/s', ratioToBase: 0.3048 },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    iconName: 'Grid',
    baseUnit: 'm2',
    units: [
      { id: 'sq_km', name: 'Square Kilometer', symbol: 'km²', ratioToBase: 1000000 },
      { id: 'm2', name: 'Square Meter', symbol: 'm²', ratioToBase: 1 },
      { id: 'ha', name: 'Hectare', symbol: 'ha', ratioToBase: 10000 },
      { id: 'ac', name: 'Acre', symbol: 'ac', ratioToBase: 4046.8564224 },
      { id: 'sq_mi', name: 'Square Mile', symbol: 'mi²', ratioToBase: 2589988.110336 },
      { id: 'sq_ft', name: 'Square Foot', symbol: 'ft²', ratioToBase: 0.09290304 },
      { id: 'sq_in', name: 'Square Inch', symbol: 'in²', ratioToBase: 0.00064516 },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    iconName: 'Beaker',
    baseUnit: 'L',
    units: [
      { id: 'm3', name: 'Cubic Meter', symbol: 'm³', ratioToBase: 1000 },
      { id: 'L', name: 'Liter', symbol: 'L', ratioToBase: 1 },
      { id: 'mL', name: 'Milliliter', symbol: 'mL', ratioToBase: 0.001 },
      { id: 'gal', name: 'Gallon (US)', symbol: 'gal', ratioToBase: 3.785411784 },
      { id: 'qt', name: 'Quart (US)', symbol: 'qt', ratioToBase: 0.946352946 },
      { id: 'pt', name: 'Pint (US)', symbol: 'pt', ratioToBase: 0.473176473 },
      { id: 'cup', name: 'Cup (US)', symbol: 'cup', ratioToBase: 0.24 },
      { id: 'fl_oz', name: 'Fluid Ounce (US)', symbol: 'fl oz', ratioToBase: 0.0295735295625 },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    iconName: 'Clock',
    baseUnit: 's',
    units: [
      { id: 'yr', name: 'Year (avg)', symbol: 'yr', ratioToBase: 31556952 },
      { id: 'mo', name: 'Month (30.4d)', symbol: 'mo', ratioToBase: 2629746 },
      { id: 'wk', name: 'Week', symbol: 'wk', ratioToBase: 604800 },
      { id: 'd', name: 'Day', symbol: 'd', ratioToBase: 86400 },
      { id: 'hr', name: 'Hour', symbol: 'hr', ratioToBase: 3600 },
      { id: 'min', name: 'Minute', symbol: 'min', ratioToBase: 60 },
      { id: 's', name: 'Second', symbol: 's', ratioToBase: 1 },
      { id: 'ms', name: 'Millisecond', symbol: 'ms', ratioToBase: 0.001 },
    ],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    iconName: 'Activity',
    baseUnit: 'Pa',
    units: [
      { id: 'bar', name: 'Bar', symbol: 'bar', ratioToBase: 100000 },
      { id: 'atm', name: 'Standard Atmosphere', symbol: 'atm', ratioToBase: 101325 },
      { id: 'psi', name: 'Pound / sq inch', symbol: 'psi', ratioToBase: 6894.757293 },
      { id: 'kPa', name: 'Kilopascal', symbol: 'kPa', ratioToBase: 1000 },
      { id: 'mmHg', name: 'Millimeter of mercury', symbol: 'mmHg', ratioToBase: 133.322387415 },
      { id: 'Pa', name: 'Pascal', symbol: 'Pa', ratioToBase: 1 },
    ],
  },
];

/**
 * Universal Unit Conversion handler
 */
export function convertUnit(
  val: number,
  category: UnitCategory,
  fromId: string,
  toId: string
): number {
  if (!Number.isFinite(val)) return 0;
  if (fromId === toId) return val;

  // Temperature has non-linear offsets
  if (category === 'temperature') {
    let celsius = val;
    if (fromId === 'F') {
      celsius = ((val - 32) * 5) / 9;
    } else if (fromId === 'K') {
      celsius = val - 273.15;
    }

    if (toId === 'C') return celsius;
    if (toId === 'F') return (celsius * 9) / 5 + 32;
    if (toId === 'K') return celsius + 273.15;
    return celsius;
  }

  const cat = UNIT_CATEGORIES.find((c) => c.id === category);
  if (!cat) return val;

  const fromUnit = cat.units.find((u) => u.id === fromId);
  const toUnit = cat.units.find((u) => u.id === toId);

  if (!fromUnit || !toUnit) return val;

  // Convert to base unit, then to target unit
  const baseValue = val * fromUnit.ratioToBase;
  return baseValue / toUnit.ratioToBase;
}

/**
 * Format unit results cleanly (removes trailing zeroes, supports precision)
 */
export function formatUnitNumber(num: number): string {
  if (!Number.isFinite(num)) return '0';
  if (num === 0) return '0';

  if (Math.abs(num) < 0.000001 || Math.abs(num) >= 1e12) {
    return num.toExponential(4);
  }

  // Format up to 6 significant decimal places, trim extra zeroes
  const rounded = Number(num.toPrecision(7));
  return String(rounded);
}

/**
 * Get human-readable formula or conversion ratio explanation
 */
export function getUnitFormula(category: UnitCategory, fromId: string, toId: string): string {
  if (fromId === toId) return `1 ${fromId} = 1 ${toId}`;

  if (category === 'temperature') {
    if (fromId === 'C' && toId === 'F') return '°F = (°C × 9/5) + 32';
    if (fromId === 'F' && toId === 'C') return '°C = (°F − 32) × 5/9';
    if (fromId === 'C' && toId === 'K') return 'K = °C + 273.15';
    if (fromId === 'K' && toId === 'C') return '°C = K − 273.15';
    if (fromId === 'F' && toId === 'K') return 'K = (°F − 32) × 5/9 + 273.15';
    if (fromId === 'K' && toId === 'F') return '°F = (K − 273.15) × 9/5 + 32';
  }

  const unit1 = convertUnit(1, category, fromId, toId);
  return `1 ${fromId} = ${formatUnitNumber(unit1)} ${toId}`;
}

// ═══════════════════════════════════════════════════════════════
// 3. TIMEZONE & WORLD CLOCK ENGINE
// ═══════════════════════════════════════════════════════════════

export const ALL_WORLD_CITIES: TimezoneCity[] = [
  { id: 'new_york', name: 'New York', country: 'United States', timezone: 'America/New_York', flag: '🇺🇸' },
  { id: 'london', name: 'London', country: 'United Kingdom', timezone: 'Europe/London', flag: '🇬🇧' },
  { id: 'mumbai', name: 'Mumbai / Delhi', country: 'India', timezone: 'Asia/Kolkata', flag: '🇮🇳' },
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', flag: '🇯🇵' },
  { id: 'dubai', name: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', flag: '🇦🇪' },
  { id: 'paris', name: 'Paris', country: 'France', timezone: 'Europe/Paris', flag: '🇫🇷' },
  { id: 'berlin', name: 'Berlin', country: 'Germany', timezone: 'Europe/Berlin', flag: '🇩🇪' },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', flag: '🇸🇬' },
  { id: 'sydney', name: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', flag: '🇦🇺' },
  { id: 'san_francisco', name: 'San Francisco', country: 'United States', timezone: 'America/Los_Angeles', flag: '🇺🇸' },
  { id: 'toronto', name: 'Toronto', country: 'Canada', timezone: 'America/Toronto', flag: '🇨🇦' },
  { id: 'hong_kong', name: 'Hong Kong', country: 'Hong Kong', timezone: 'Asia/Hong_Kong', flag: '🇭🇰' },
  { id: 'zurich', name: 'Zurich', country: 'Switzerland', timezone: 'Europe/Zurich', flag: '🇨🇭' },
  { id: 'seoul', name: 'Seoul', country: 'South Korea', timezone: 'Asia/Seoul', flag: '🇰🇷' },
  { id: 'auckland', name: 'Auckland', country: 'New Zealand', timezone: 'Pacific/Auckland', flag: '🇳🇿' },
  { id: 'sao_paulo', name: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo', flag: '🇧🇷' },
  { id: 'cairo', name: 'Cairo', country: 'Egypt', timezone: 'Africa/Cairo', flag: '🇪🇬' },
  { id: 'bangkok', name: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok', flag: '🇹🇭' },
  { id: 'johannesburg', name: 'Johannesburg', country: 'South Africa', timezone: 'Africa/Johannesburg', flag: '🇿🇦' },
  { id: 'riyadh', name: 'Riyadh', country: 'Saudi Arabia', timezone: 'Asia/Riyadh', flag: '🇸🇦' },
  { id: 'chicago', name: 'Chicago', country: 'United States', timezone: 'America/Chicago', flag: '🇺🇸' },
  { id: 'istanbul', name: 'Istanbul', country: 'Turkey', timezone: 'Europe/Istanbul', flag: '🇹🇷' },
];

export interface CityTimeData {
  city: TimezoneCity;
  timeFormatted: string; // e.g. "04:30 PM"
  time24: string; // e.g. "16:30"
  seconds: string; // e.g. "45"
  dateFormatted: string; // e.g. "Tue, Nov 17"
  isDay: boolean; // 6am - 6pm = day, else night
  hours24: number;
  minutes: number;
  offsetHoursStr: string; // e.g. "+4.5 hrs" vs local
  workHourStatus: 'work' | 'flexible' | 'night';
}

/**
 * Calculates current time and meeting status in a specific timezone using Intl
 */
export function getCityTime(targetDate: Date, city: TimezoneCity): CityTimeData {
  const tz = city.timezone;

  // Format time in target timezone
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const secFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    second: '2-digit',
  });

  const time24Formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const hour24NumFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  });

  const minNumFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    minute: 'numeric',
  });

  const timeFormatted = timeFormatter.format(targetDate);
  const time24 = time24Formatter.format(targetDate);
  const seconds = secFormatter.format(targetDate);
  const dateFormatted = dateFormatter.format(targetDate);

  const rawH = parseInt(hour24NumFormatter.format(targetDate), 10);
  const hours24 = isNaN(rawH) ? 0 : rawH % 24;
  const minutes = parseInt(minNumFormatter.format(targetDate), 10) || 0;

  // Day vs Night check: 06:00 to 18:00
  const isDay = hours24 >= 6 && hours24 < 18;

  // Work hour check: 9am - 6pm (working), 7-9am or 6-9pm (flexible), 9pm-7am (night/sleeping)
  let workHourStatus: 'work' | 'flexible' | 'night' = 'night';
  if (hours24 >= 9 && hours24 < 18) {
    workHourStatus = 'work';
  } else if ((hours24 >= 7 && hours24 < 9) || (hours24 >= 18 && hours24 < 21)) {
    workHourStatus = 'flexible';
  }

  // Calculate relative offset diff compared to local computer time
  // Using epoch difference across timezones evaluated at targetDate
  const targetDateStr = targetDate.toLocaleString('en-US', { timeZone: tz });
  const localDateStr = targetDate.toLocaleString('en-US');
  const diffMs = new Date(targetDateStr).getTime() - new Date(localDateStr).getTime();
  const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 4) / 4;

  let offsetHoursStr = 'Local';
  if (diffHours > 0) {
    offsetHoursStr = `+${diffHours}h`;
  } else if (diffHours < 0) {
    offsetHoursStr = `${diffHours}h`;
  }

  return {
    city,
    timeFormatted,
    time24,
    seconds,
    dateFormatted,
    isDay,
    hours24,
    minutes,
    offsetHoursStr,
    workHourStatus,
  };
}
