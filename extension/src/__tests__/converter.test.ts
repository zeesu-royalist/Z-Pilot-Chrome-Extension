import { describe, it, expect } from 'vitest';
import {
  convertCurrency,
  formatCurrencyValue,
  getPopularComparisons,
  STATIC_FALLBACK_RATES,
  convertUnit,
  formatUnitNumber,
  getUnitFormula,
  UNIT_CATEGORIES,
  ALL_WORLD_CITIES,
  getCityTime,
} from '../services/converter.js';

describe('Z-Pilot Converter Engine', () => {
  describe('1. Currency Converter Math & Formatting', () => {
    const mockRates: Record<string, number> = {
      USD: 1,
      EUR: 0.9,
      GBP: 0.8,
      INR: 85,
      JPY: 150,
      AED: 3.67,
      BTC: 0.00001,
    };

    it('returns exact same amount when converting same currency', () => {
      expect(convertCurrency(100, 'USD', 'USD', mockRates)).toBe(100);
      expect(convertCurrency(500, 'INR', 'INR', mockRates)).toBe(500);
    });

    it('converts USD to other currencies accurately', () => {
      // 100 USD -> INR = 100 * 85 = 8500
      expect(convertCurrency(100, 'USD', 'INR', mockRates)).toBe(8500);
      // 100 USD -> EUR = 100 * 0.9 = 90
      expect(convertCurrency(100, 'USD', 'EUR', mockRates)).toBe(90);
      // 100 USD -> JPY = 100 * 150 = 15000
      expect(convertCurrency(100, 'USD', 'JPY', mockRates)).toBe(15000);
    });

    it('converts non-USD pairs through USD base exchange accurately', () => {
      // 90 EUR to USD = 90 / 0.9 = 100 USD. Then 100 USD to INR = 8500 INR
      expect(convertCurrency(90, 'EUR', 'INR', mockRates)).toBeCloseTo(8500, 2);
      // 80 GBP to USD = 80 / 0.8 = 100 USD. Then 100 USD to EUR = 90 EUR
      expect(convertCurrency(80, 'GBP', 'EUR', mockRates)).toBeCloseTo(90, 2);
    });

    it('handles 0 and invalid numbers safely without throwing', () => {
      expect(convertCurrency(0, 'USD', 'INR', mockRates)).toBe(0);
      expect(convertCurrency(NaN, 'USD', 'INR', mockRates)).toBe(0);
      expect(convertCurrency(Infinity, 'USD', 'INR', mockRates)).toBe(0);
    });

    it('falls back to static baseline rates when currency is missing from rate table', () => {
      const emptyRates = {};
      const res = convertCurrency(10, 'USD', 'INR', emptyRates);
      expect(res).toBeGreaterThan(800); // 10 * ~86.85
      expect(STATIC_FALLBACK_RATES['USD']).toBe(1);
      expect(STATIC_FALLBACK_RATES['INR']).toBeGreaterThan(50);
    });

    it('formats currency numbers with correct decimal precision', () => {
      expect(formatCurrencyValue(1234.56, 'USD')).toContain('1,234.56');
      expect(formatCurrencyValue(15000, 'JPY')).toBe('15,000'); // JPY has 0 decimals
      expect(formatCurrencyValue(0.000045, 'BTC')).toBe('0.000045'); // Crypto has 6 decimals
    });

    it('returns top 6 popular comparisons excluding fromCurrency', () => {
      const list = getPopularComparisons(100, 'USD', mockRates);
      expect(list).toHaveLength(6);
      expect(list.some((item) => item.code === 'USD')).toBe(false);
      expect(list.some((item) => item.code === 'INR')).toBe(true);
      expect(list.some((item) => item.code === 'EUR')).toBe(true);
    });
  });

  describe('2. Unit Converter Math & Precision', () => {
    it('defines all 9 standard unit categories', () => {
      expect(UNIT_CATEGORIES.length).toBe(9);
      const catIds = UNIT_CATEGORIES.map((c) => c.id);
      expect(catIds).toContain('length');
      expect(catIds).toContain('weight');
      expect(catIds).toContain('temperature');
      expect(catIds).toContain('storage');
      expect(catIds).toContain('speed');
    });

    it('converts Length units accurately', () => {
      // 1 km = 1000 m
      expect(convertUnit(1, 'length', 'km', 'm')).toBe(1000);
      // 1000 m = 1 km
      expect(convertUnit(1000, 'length', 'm', 'km')).toBe(1);
      // 1 mi = 1609.344 m
      expect(convertUnit(1, 'length', 'mi', 'm')).toBeCloseTo(1609.344, 3);
      // 1 ft = 12 in
      expect(convertUnit(1, 'length', 'ft', 'in')).toBeCloseTo(12, 4);
      // 1 yd = 3 ft
      expect(convertUnit(1, 'length', 'yd', 'ft')).toBeCloseTo(3, 4);
    });

    it('converts Weight / Mass units accurately', () => {
      // 1 kg = 1000 g
      expect(convertUnit(1, 'weight', 'kg', 'g')).toBe(1000);
      // 1 t = 1000 kg
      expect(convertUnit(1, 'weight', 't', 'kg')).toBe(1000);
      // 1 lb to kg = 0.45359237
      expect(convertUnit(1, 'weight', 'lb', 'kg')).toBeCloseTo(0.453592, 4);
      // 1 kg to lb = ~2.20462
      expect(convertUnit(1, 'weight', 'kg', 'lb')).toBeCloseTo(2.20462, 3);
    });

    it('handles non-linear Temperature conversions correctly', () => {
      // 0 °C = 32 °F
      expect(convertUnit(0, 'temperature', 'C', 'F')).toBe(32);
      // 100 °C = 212 °F
      expect(convertUnit(100, 'temperature', 'C', 'F')).toBe(212);
      // -40 °C = -40 °F (equal point)
      expect(convertUnit(-40, 'temperature', 'C', 'F')).toBe(-40);
      expect(convertUnit(-40, 'temperature', 'F', 'C')).toBe(-40);
      // 0 °C = 273.15 K
      expect(convertUnit(0, 'temperature', 'C', 'K')).toBe(273.15);
      // 32 °F = 273.15 K
      expect(convertUnit(32, 'temperature', 'F', 'K')).toBeCloseTo(273.15, 2);
    });

    it('converts Digital Storage units accurately', () => {
      expect(convertUnit(1, 'storage', 'KB', 'B')).toBe(1000);
      expect(convertUnit(1, 'storage', 'MB', 'KB')).toBe(1000);
      expect(convertUnit(1, 'storage', 'GB', 'MB')).toBe(1000);
      expect(convertUnit(1, 'storage', 'TB', 'GB')).toBe(1000);
      expect(convertUnit(1, 'storage', 'B', 'bit')).toBe(8);
    });

    it('converts Speed, Area, Volume, Time & Pressure accurately', () => {
      // Speed: 36 km/h = 10 m/s
      expect(convertUnit(36, 'speed', 'km_h', 'm_s')).toBeCloseTo(10, 2);
      // Area: 1 ha = 10,000 m²
      expect(convertUnit(1, 'area', 'ha', 'm2')).toBe(10000);
      // Volume: 1 L = 1000 mL
      expect(convertUnit(1, 'volume', 'L', 'mL')).toBe(1000);
      // Time: 1 hr = 3600 s = 60 min
      expect(convertUnit(1, 'time', 'hr', 'min')).toBe(60);
      expect(convertUnit(1, 'time', 'hr', 's')).toBe(3600);
      expect(convertUnit(1, 'time', 'd', 'hr')).toBe(24);
      // Pressure: 1 bar = 100,000 Pa
      expect(convertUnit(1, 'pressure', 'bar', 'Pa')).toBe(100000);
    });

    it('formats unit result numbers without unnecessary floating point artifacts', () => {
      expect(formatUnitNumber(100)).toBe('100');
      expect(formatUnitNumber(0.5)).toBe('0.5');
      expect(formatUnitNumber(1.609344)).toBe('1.609344');
      expect(formatUnitNumber(0)).toBe('0');
    });

    it('generates clean unit formula explanations', () => {
      expect(getUnitFormula('length', 'km', 'm')).toBe('1 km = 1000 m');
      expect(getUnitFormula('temperature', 'C', 'F')).toBe('°F = (°C × 9/5) + 32');
    });
  });

  describe('3. Timezone & World Clock Engine', () => {
    it('contains major global financial and tech hubs', () => {
      const cityIds = ALL_WORLD_CITIES.map((c) => c.id);
      expect(cityIds).toContain('new_york');
      expect(cityIds).toContain('london');
      expect(cityIds).toContain('mumbai');
      expect(cityIds).toContain('tokyo');
      expect(cityIds).toContain('dubai');
      expect(cityIds).toContain('singapore');
    });

    it('computes city time with hours, minutes, date, and day/night badge', () => {
      const testDate = new Date('2026-11-17T12:00:00Z'); // 12:00 PM UTC
      const ny = ALL_WORLD_CITIES.find((c) => c.id === 'new_york')!;
      const tokyo = ALL_WORLD_CITIES.find((c) => c.id === 'tokyo')!;
      const london = ALL_WORLD_CITIES.find((c) => c.id === 'london')!;

      const nyTime = getCityTime(testDate, ny);
      const tokyoTime = getCityTime(testDate, tokyo);
      const londonTime = getCityTime(testDate, london);

      // In UTC 12:00:
      // London is ~12:00 PM
      expect(londonTime.timeFormatted).toContain('12:00');
      expect(londonTime.isDay).toBe(true);
      expect(londonTime.workHourStatus).toBe('work');

      // Tokyo is UTC+9 = ~21:00 (9:00 PM night)
      expect(tokyoTime.isDay).toBe(false);
      expect(tokyoTime.workHourStatus).toBe('night');

      // New York is UTC-5 = ~07:00 AM (flexible/morning)
      expect(nyTime.isDay).toBe(true);
    });

    it('classifies work hour status correctly', () => {
      const workDate = new Date('2026-11-17T14:30:00Z'); // 2:30 PM UTC
      const london = ALL_WORLD_CITIES.find((c) => c.id === 'london')!;
      const res = getCityTime(workDate, london);
      expect(res.workHourStatus).toBe('work');
    });

    it('calculates consistent relative timezone offset regardless of target hour', () => {
      const now = new Date('2026-11-17T10:00:00Z');
      const future = new Date('2026-11-17T18:00:00Z');
      const ny = ALL_WORLD_CITIES.find((c) => c.id === 'new_york')!;
      const t1 = getCityTime(now, ny);
      const t2 = getCityTime(future, ny);
      expect(t1.offsetHoursStr).toBe(t2.offsetHoursStr);
    });
  });
});
