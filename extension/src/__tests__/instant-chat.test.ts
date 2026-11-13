import { describe, it, expect } from 'vitest';
import { generateRoomPin, getTopicName, getSessionUserId } from '../services/instant-chat.js';

describe('InstantChat Service (Zero-Config Ephemeral)', () => {
  it('generates a valid 4-digit numeric room PIN', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateRoomPin();
      expect(pin).toHaveLength(4);
      expect(/^\d{4}$/.test(pin)).toBe(true);
      const num = Number(pin);
      expect(num).toBeGreaterThanOrEqual(1000);
      expect(num).toBeLessThanOrEqual(9999);
    }
  });

  it('correctly formats namespaced room topic name', () => {
    expect(getTopicName('4829')).toBe('zpilot_chat_v2_4829');
    expect(getTopicName(' 1234 ')).toBe('zpilot_chat_v2_1234');
  });

  it('provides a persistent session user id for the active browser context', () => {
    const uid1 = getSessionUserId();
    const uid2 = getSessionUserId();
    expect(uid1).toBeTruthy();
    expect(uid1.startsWith('user_')).toBe(true);
    expect(uid1).toBe(uid2);
  });
});

