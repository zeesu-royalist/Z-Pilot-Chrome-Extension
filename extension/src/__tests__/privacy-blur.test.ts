import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyBlurPreferences } from '../types/index.js';
import { StorageService } from '../services/storage.js';

describe('Web Privacy & Blur Shield Engine Tests', () => {
  beforeEach(async () => {
    // Clear storage keys if needed
  });

  describe('Sensitive Data Obfuscation Regex Patterns', () => {
    // Standard financial patterns tested against DOM text nodes
    const FINANCIAL_REGEX = /(?:[\$€£₹¥]|USD|EUR|INR|GBP|CAD|AUD)\s?[0-9]{1,3}(?:[,.][0-9]{2,3})*(?:\.[0-9]{2})?|\b[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/i;

    it('identifies USD, INR, EUR, and GBP amounts correctly', () => {
      expect(FINANCIAL_REGEX.test('Your account balance is $1,450.50')).toBe(true);
      expect(FINANCIAL_REGEX.test('Payable amount: ₹25,000.00')).toBe(true);
      expect(FINANCIAL_REGEX.test('Total fee is €99.99')).toBe(true);
      expect(FINANCIAL_REGEX.test('Refund: £120.00')).toBe(true);
      expect(FINANCIAL_REGEX.test('Transfer INR 50000')).toBe(true);
      expect(FINANCIAL_REGEX.test('Just normal text without money')).toBe(false);
    });

    it('identifies 16-digit credit card number patterns', () => {
      expect(FINANCIAL_REGEX.test('Card: 4111 2222 3333 4444')).toBe(true);
      expect(FINANCIAL_REGEX.test('Card: 4111-2222-3333-4444')).toBe(true);
      expect(FINANCIAL_REGEX.test('Only four digits 1234')).toBe(false);
    });

    // PII patterns
    const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

    it('identifies email addresses accurately', () => {
      expect(EMAIL_REGEX.test('Contact us at john.doe@example.com for help')).toBe(true);
      expect(EMAIL_REGEX.test('admin_support+vip@company.org')).toBe(true);
      expect(EMAIL_REGEX.test('No email address here')).toBe(false);
    });

    it('identifies phone numbers across international and US formats', () => {
      expect(PHONE_REGEX.test('Call +1 (555) 123-4567')).toBe(true);
      expect(PHONE_REGEX.test('Mobile: 987-654-3210')).toBe(true);
      expect(PHONE_REGEX.test('+91 9876543210')).toBe(true);
      expect(PHONE_REGEX.test('Short pin 1234')).toBe(false);
    });
  });

  describe('Blur Config & Dimension Clamping', () => {
    it('clamps blur intensity properly within valid 4px - 30px bounds', () => {
      const clampIntensity = (val: number) => Math.max(4, Math.min(30, Math.round(val)));
      expect(clampIntensity(2)).toBe(4);
      expect(clampIntensity(14)).toBe(14);
      expect(clampIntensity(45)).toBe(30);
      expect(clampIntensity(12.7)).toBe(13);
    });

    it('computes positive drag-to-draw box boundaries accurately', () => {
      const computeBox = (startX: number, startY: number, curX: number, curY: number) => {
        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.max(20, Math.abs(curX - startX));
        const height = Math.max(20, Math.abs(curY - startY));
        return { left, top, width, height };
      };

      // Dragging top-left to bottom-right
      const box1 = computeBox(100, 150, 300, 400);
      expect(box1).toEqual({ left: 100, top: 150, width: 200, height: 250 });

      // Dragging bottom-right to top-left (reverse)
      const box2 = computeBox(300, 400, 100, 150);
      expect(box2).toEqual({ left: 100, top: 150, width: 200, height: 250 });

      // Tiny drag enforces minimum 20x20 size
      const box3 = computeBox(50, 50, 52, 54);
      expect(box3).toEqual({ left: 50, top: 50, width: 20, height: 20 });
    });
  });

  describe('Privacy Blur Preferences Storage', () => {
    it('saves and retrieves global and domain-specific preferences', async () => {
      const globalPrefs: PrivacyBlurPreferences = {
        blurIntensity: 18,
        blurStyle: 'stealth',
        hoverToReveal: false,
        autoBlurFinancials: true,
        autoBlurPii: true,
        autoBlurMedia: false,
        rememberPerDomain: true,
      };

      await StorageService.savePrivacyBlurPreferences(globalPrefs);
      const loadedGlobal = await StorageService.getPrivacyBlurPreferences();

      expect(loadedGlobal).toBeDefined();
      expect(loadedGlobal?.blurIntensity).toBe(18);
      expect(loadedGlobal?.blurStyle).toBe('stealth');
      expect(loadedGlobal?.hoverToReveal).toBe(false);
      expect(loadedGlobal?.autoBlurFinancials).toBe(true);

      // Save domain-specific override
      const domainPrefs: PrivacyBlurPreferences = {
        ...globalPrefs,
        blurIntensity: 25,
        blurStyle: 'blackout',
      };

      await StorageService.savePrivacyBlurPreferences(domainPrefs, 'bank.example.com');
      const loadedDomain = await StorageService.getPrivacyBlurPreferences('bank.example.com');

      expect(loadedDomain?.blurIntensity).toBe(25);
      expect(loadedDomain?.blurStyle).toBe('blackout');

      // Other domain falls back to global
      const loadedOther = await StorageService.getPrivacyBlurPreferences('unknown-site.com');
      expect(loadedOther?.blurIntensity).toBe(18);
    });
  });
});
