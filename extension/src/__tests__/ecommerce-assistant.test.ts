import { describe, it, expect, beforeEach } from 'vitest';
import { EcommerceAssistantService } from '../services/ecommerce-assistant.js';
import { StorageService } from '../services/storage.js';
import { ProductInfo } from '../types/index.js';

describe('Smart Shopping Assistant Service Tests', () => {
  beforeEach(async () => {
    await StorageService.saveTrackedProducts([]);
  });

  describe('Price String Parsing & Formatting', () => {
    it('parses US Dollar amounts with commas and decimals', () => {
      const res = EcommerceAssistantService.parsePriceString('$ 1,299.99');
      expect(res.price).toBe(1299.99);
      expect(res.currency).toBe('$');
    });

    it('parses Indian Rupee (INR) amounts correctly', () => {
      const res = EcommerceAssistantService.parsePriceString('₹49,990.00');
      expect(res.price).toBe(49990.0);
      expect(res.currency).toBe('₹');
    });

    it('parses Euro and British Pound symbols', () => {
      const eur = EcommerceAssistantService.parsePriceString('€ 89,95');
      expect(eur.price).toBe(89.95);
      expect(eur.currency).toBe('€');

      const gbp = EcommerceAssistantService.parsePriceString('£149.50');
      expect(gbp.price).toBe(149.5);
      expect(gbp.currency).toBe('£');
    });

    it('gracefully handles empty or invalid price strings', () => {
      const empty = EcommerceAssistantService.parsePriceString('');
      expect(empty.price).toBe(0);

      const invalid = EcommerceAssistantService.parsePriceString('Out of Stock');
      expect(invalid.price).toBe(0);
    });

    it('formats price correctly with currency prefix', () => {
      expect(EcommerceAssistantService.formatPrice(99.5, '$')).toBe('$99.50');
      expect(EcommerceAssistantService.formatPrice(1499, '₹')).toBe('₹1,499.00');
    });
  });

  describe('Deal Score Evaluation', () => {
    it('identifies lowest recorded price as Great Deal', () => {
      const deal = EcommerceAssistantService.evaluateDeal(50, 50, 100, 2);
      expect(deal.score).toBe('Great Deal');
      expect(deal.color).toContain('emerald');
    });

    it('identifies price below average as Great Deal', () => {
      const deal = EcommerceAssistantService.evaluateDeal(60, 50, 100, 2);
      expect(deal.score).toBe('Great Deal');
    });

    it('identifies price near historical peak as High Price', () => {
      const deal = EcommerceAssistantService.evaluateDeal(98, 50, 100, 2);
      expect(deal.score).toBe('High Price');
      expect(deal.advice).toContain('alert');
    });

    it('identifies initial observation as Current Price with zero fabrication', () => {
      const deal = EcommerceAssistantService.evaluateDeal(75, 75, 75, 1);
      expect(deal.score).toBe('Current Price');
      expect(deal.advice).toContain('1st recorded price');
    });
  });

  describe('Authentic Price History Tracking', () => {
    it('records authentic initial point without fake past curves', () => {
      const initial = EcommerceAssistantService.getAuthenticPriceHistory(100);
      expect(initial.length).toBe(1);
      expect(initial[0].price).toBe(100);
      expect(initial[0].label).toBe('Current');
    });

    it('tracks genuine historical points with Lowest & Highest labels when recorded', () => {
      const p1 = { date: '2026-11-01', price: 120, label: 'Highest' };
      const p2 = { date: '2026-11-10', price: 80, label: 'Lowest' };
      const history = EcommerceAssistantService.getAuthenticPriceHistory(95, [p1, p2]);
      expect(history.length).toBe(3);

      const hasLowestLabel = history.some((h) => h.label === 'Lowest');
      const hasHighestLabel = history.some((h) => h.label === 'Highest');
      expect(hasLowestLabel).toBe(true);
      expect(hasHighestLabel).toBe(true);
    });
  });

  describe('Fake Review & Authenticity Detector', () => {
    it('rates natural detailed reviews with high trust grade', () => {
      const reviews = [
        'The build quality is very solid and battery lasts through the whole workday without issue.',
        'Good for the price, but the plastic latch feels a bit flimsy if handled roughly.',
        'Works as expected out of the box. Delivery was fast.',
        'Customer support helped with setup immediately.',
      ];

      const analysis = EcommerceAssistantService.analyzeReviewsHeuristic(reviews, 4.4, 250);
      expect(analysis.trustGrade).toBe('A');
      expect(analysis.trustScore).toBeGreaterThanOrEqual(80);
      expect(analysis.verdict).toBe('Genuine & Reliable');
      expect(analysis.pros.length).toBeGreaterThan(0);
    });

    it('detects repetitive generic praise and adjusts rating downwards', () => {
      const fakeReviews = [
        'best product ever must buy 100% recommend',
        'five stars awesome seller super fast delivery',
        'loved it loved it five stars',
        'super quality must buy best product ever',
      ];

      const analysis = EcommerceAssistantService.analyzeReviewsHeuristic(fakeReviews, 4.9, 1000);
      expect(analysis.trustScore).toBeLessThan(75);
      expect(analysis.adjustedRating).toBeLessThan(4.9);
      expect(analysis.redFlags.length).toBeGreaterThan(0);
    });
  });

  describe('Coupon Database & Discovery', () => {
    it('retrieves store coupons for popular e-commerce platforms like Amazon & Flipkart', () => {
      const amazonCoupons = EcommerceAssistantService.getStoreCoupons('amazon.com');
      expect(amazonCoupons.length).toBeGreaterThanOrEqual(2);
      expect(amazonCoupons.some((c) => c.code === 'SAVE15' || c.code === 'PRIME10')).toBe(true);

      const flipkartCoupons = EcommerceAssistantService.getStoreCoupons('flipkart.com');
      expect(flipkartCoupons.some((c) => c.code === 'FLIP10')).toBe(true);
    });

    it('merges on-page detected coupons with store database coupons without duplicates', () => {
      const pageCoupons = [
        {
          code: 'CUSTOM50',
          discount: '50% OFF',
          description: 'Special page banner promo',
          store: 'myntra.com',
          verified: true,
          source: 'page_found' as const,
        },
      ];

      const merged = EcommerceAssistantService.getStoreCoupons('myntra.com', pageCoupons);
      expect(merged[0].code).toBe('CUSTOM50');
      expect(merged.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Tracked Products Storage', () => {
    it('saves, retrieves, and removes tracked products', async () => {
      const demoProduct: ProductInfo = {
        title: 'Wireless Noise Cancelling Headphones',
        url: 'https://example.com/headphones',
        domain: 'example.com',
        currentPrice: 199.99,
        currency: '$',
        rating: 4.6,
      };

      const tracked = EcommerceAssistantService.createTrackedProduct(demoProduct, 175.0);
      expect(tracked.targetPrice).toBe(175.0);

      await StorageService.addTrackedProduct(tracked);
      const list = await StorageService.getTrackedProducts();
      expect(list.length).toBe(1);
      expect(list[0].title).toBe('Wireless Noise Cancelling Headphones');

      await StorageService.removeTrackedProduct(tracked.id);
      const afterDelete = await StorageService.getTrackedProducts();
      expect(afterDelete.length).toBe(0);
    });
  });
});
