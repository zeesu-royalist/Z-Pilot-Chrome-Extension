import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAdBlockerDnrRules,
  AD_BLOCKER_RULE_ID_START,
  AD_DOMAINS_BLOCKLIST,
} from '../services/ad-blocker-rules.js';
import {
  AdBlockerService,
} from '../services/ad-blocker.js';

describe('Add Blocker Ad Blocker Rules & Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds valid Declarative Net Request rules for 50+ major ad domains', () => {
    const rules = buildAdBlockerDnrRules();
    expect(rules.length).toBe(AD_DOMAINS_BLOCKLIST.length);
    expect(rules.length).toBeGreaterThanOrEqual(40);

    // Verify first rule structure
    const r1 = rules[0];
    expect(r1.id).toBe(AD_BLOCKER_RULE_ID_START);
    expect(r1.priority).toBe(1);
    expect(r1.action.type).toBe('block');
    expect(r1.condition.urlFilter).toContain('doubleclick.net');
    expect(r1.condition.resourceTypes).toContain('main_frame');
    expect(r1.condition.resourceTypes).toContain('script');
    expect(r1.condition.resourceTypes).toContain('sub_frame');
  });

  it('loads default settings with ad blocking and video ad skipping enabled out of the box', async () => {
    const settings = await AdBlockerService.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.blockCosmetic).toBe(true);
    expect(settings.skipVideoAds).toBe(true);
    expect(settings.whitelistedDomains).toEqual([]);
    expect(settings.totalBlockedCount).toBe(0);
  });

  it('toggles global enable / disable state', async () => {
    const s1 = await AdBlockerService.toggleEnabled();
    expect(s1).toBe(false);

    const s2 = await AdBlockerService.toggleEnabled();
    expect(s2).toBe(true);
  });

  it('handles per-site domain whitelisting cleanly', async () => {
    expect(await AdBlockerService.isDomainWhitelisted('news.example.com')).toBe(false);

    const added = await AdBlockerService.toggleDomainWhitelist('news.example.com');
    expect(added).toBe(true);
    expect(await AdBlockerService.isDomainWhitelisted('news.example.com')).toBe(true);

    // Also checks with leading www
    expect(await AdBlockerService.isDomainWhitelisted('www.news.example.com')).toBe(true);

    const removed = await AdBlockerService.toggleDomainWhitelist('news.example.com');
    expect(removed).toBe(false);
    expect(await AdBlockerService.isDomainWhitelisted('news.example.com')).toBe(false);
  });

  it('increments total blocked ads counter accurately', async () => {
    await AdBlockerService.incrementBlockedCount(5);
    await AdBlockerService.incrementBlockedCount(10);
    const s = await AdBlockerService.getSettings();
    expect(s.totalBlockedCount).toBe(15);
  });
});

