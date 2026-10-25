import { describe, it, expect, beforeEach } from 'vitest';
import { isRestrictedUrl } from '../src/services/browser-actions.js';
import { StorageService } from '../src/services/storage.js';

describe('Browser Actions & Restricted URLs', () => {
  it('should identify internal and protected URLs as restricted', () => {
    expect(isRestrictedUrl('chrome://settings')).toBe(true);
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('chrome-extension://abcdefg/popup.html')).toBe(true);
    expect(isRestrictedUrl('edge://settings')).toBe(true);
    expect(isRestrictedUrl('brave://settings')).toBe(true);
    expect(isRestrictedUrl('about:blank')).toBe(true);
    expect(isRestrictedUrl('https://chromewebstore.google.com/detail/123')).toBe(true);
  });

  it('should permit standard web URLs', () => {
    expect(isRestrictedUrl('https://www.google.com')).toBe(false);
    expect(isRestrictedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isRestrictedUrl('https://github.com/trending')).toBe(false);
    expect(isRestrictedUrl('https://en.wikipedia.org/wiki/Artificial_intelligence')).toBe(false);
  });

  it('should handle undefined or empty URLs safely', () => {
    expect(isRestrictedUrl(undefined)).toBe(true);
    expect(isRestrictedUrl('')).toBe(true);
  });
});

describe('StorageService local fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should provide default settings when storage is empty', async () => {
    const settings = await StorageService.getSettings();
    expect(settings.geminiModel).toBe('gemini-3.5-flash-lite');
    expect(settings.theme).toBe('dark');
  });

  it('should save and retrieve user profile', async () => {
    const mockProfile = {
      fullName: 'Alex Smith',
      email: 'alex@example.com',
      company: 'TechCorp',
    };

    await StorageService.saveProfile(mockProfile);
    const loaded = await StorageService.getProfile();

    expect(loaded.fullName).toBe('Alex Smith');
    expect(loaded.email).toBe('alex@example.com');
  });

  it('should cap message history length to avoid storage overflow', async () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      id: `msg_${i}`,
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: Date.now() + i,
    }));

    await StorageService.saveMessages(messages);
    const loaded = await StorageService.getMessages();

    expect(loaded.length).toBeLessThanOrEqual(40);
  });
});

describe('Action Plan Approval & Execution Transformation', () => {
  it('should transform approved action status to running for execution engine', () => {
    const rawActions = [
      {
        id: 'act_1',
        type: 'FILL_FORM' as const,
        description: 'Fill form',
        requiresApproval: true,
        riskLevel: 'medium' as const,
        status: 'awaiting_approval' as const,
      },
      {
        id: 'act_2',
        type: 'REPORT_RESULT' as const,
        description: 'Done',
        requiresApproval: false,
        riskLevel: 'low' as const,
        status: 'pending' as const,
      },
    ];

    // Simulating handleApproveAction logic
    const actionIndex = rawActions.findIndex((a) => a.id === 'act_1');
    const remainingActions = rawActions.slice(actionIndex).map((act, idx) =>
      idx === 0 ? { ...act, status: 'running' as const } : act
    );

    expect(remainingActions[0].status).toBe('running');
    expect(remainingActions[1].status).toBe('pending');
  });

  it('should reject dangerous navigation targets in executeSingleAction safely', async () => {
    const { BrowserActionService } = await import('../src/services/browser-actions.js');

    const dangerousAction = {
      id: 'act_danger',
      type: 'NAVIGATE' as const,
      description: 'Dangerous script',
      targetUrl: 'javascript:alert(1)',
      requiresApproval: false,
      riskLevel: 'high' as const,
    };

    const result = await BrowserActionService.executeSingleAction(dangerousAction, 1);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Security restriction');
  });
});
