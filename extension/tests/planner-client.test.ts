import { describe, it, expect } from 'vitest';
import { sanitizeAndValidatePlan, isValidWebUrl } from '../src/services/agent-planner.js';
import {
  GeminiClient,
  sanitizeApiKey,
  sanitizeErrorMessage,
} from '../src/services/gemini-client.js';

describe('Extension Agent Planner & Security Validation', () => {
  it('should validate standard web URLs and reject dangerous protocols', () => {
    expect(isValidWebUrl('https://www.youtube.com')).toBe(true);
    expect(isValidWebUrl('http://example.com')).toBe(true);
    expect(isValidWebUrl('javascript:alert(1)')).toBe(false);
    expect(isValidWebUrl('file:///etc/passwd')).toBe(false);
    expect(isValidWebUrl('data:text/html,<script>')).toBe(false);
  });

  it('should enforce user approval and strip sensitive fields from FILL_FORM actions', () => {
    const rawLLMOutput = {
      reply: 'I will fill your form',
      plan: {
        summary: 'Fill form',
        actions: [
          {
            type: 'FILL_FORM',
            description: 'Fill details',
            fields: [
              { name: 'username', value: 'zeesu', label: 'Username' },
              { name: 'password', value: 'secret123', label: 'Password' },
              { name: 'creditcard', value: '4111222233334444', label: 'Credit Card' },
            ],
            requiresApproval: false,
          },
        ],
      },
    };

    const sanitized = sanitizeAndValidatePlan(rawLLMOutput);
    expect(sanitized.plan).toBeDefined();
    const fillAction = sanitized.plan!.actions[0];
    expect(fillAction.type).toBe('FILL_FORM');
    expect(fillAction.requiresApproval).toBe(true);
    expect(fillAction.riskLevel).toBe('medium');
    expect(fillAction.fields?.length).toBe(1);
    expect(fillAction.fields?.[0].name).toBe('username');
  });

  it('should strip unsupported or arbitrary action types', () => {
    const rawLLMOutput = {
      reply: 'Testing disallowed actions',
      plan: {
        summary: 'Hack test',
        actions: [
          {
            type: 'EXECUTE_ARBITRARY_JS',
            description: 'Evil script',
          },
          {
            type: 'NAVIGATE',
            description: 'Safe nav',
            targetUrl: 'https://www.google.com',
          },
        ],
      },
    };

    const sanitized = sanitizeAndValidatePlan(rawLLMOutput);
    expect(sanitized.plan?.actions.length).toBe(1);
    expect(sanitized.plan?.actions[0].type).toBe('NAVIGATE');
  });

  it('should fail testApiKey gracefully when empty key is provided', async () => {
    const result = await GeminiClient.testApiKey('');
    expect(result.success).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('should sanitize API keys by removing quotes, whitespace, and newlines', () => {
    expect(sanitizeApiKey('  "AIzaSyDemoKey1234567890123456789012"  ')).toBe(
      'AIzaSyDemoKey1234567890123456789012'
    );
    expect(sanitizeApiKey("'SAMPLE_MOCK_GEMINI_KEY_9876543210' \n")).toBe(
      'SAMPLE_MOCK_GEMINI_KEY_9876543210'
    );
    expect(sanitizeApiKey('')).toBe('');
    expect(sanitizeApiKey(undefined)).toBe('');
  });

  it('should scrub API key secrets from error messages', () => {
    const rawError = 'Failed request with key=SECRET_KEY_12345 on host';
    const scrubbed = sanitizeErrorMessage(rawError);
    expect(scrubbed).not.toContain('SECRET_KEY_12345');
    expect(scrubbed).toContain('[REDACTED]');
  });
});
