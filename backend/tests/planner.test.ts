import { describe, it, expect } from 'vitest';
import {
  ALLOWED_ACTION_TYPES,
  sanitizeAndValidatePlan,
} from '../src/services/agent-planner.js';

describe('Agent Planner & Action Validation', () => {
  it('should define the required safe browser actions in the allowlist', () => {
    expect(ALLOWED_ACTION_TYPES).toContain('NAVIGATE');
    expect(ALLOWED_ACTION_TYPES).toContain('SEARCH_WEB');
    expect(ALLOWED_ACTION_TYPES).toContain('SEARCH_YOUTUBE');
    expect(ALLOWED_ACTION_TYPES).toContain('READ_CURRENT_PAGE');
    expect(ALLOWED_ACTION_TYPES).toContain('SUMMARIZE_PAGE');
    expect(ALLOWED_ACTION_TYPES).toContain('FILL_FORM');
    expect(ALLOWED_ACTION_TYPES).toContain('WAIT_FOR_PAGE');
    expect(ALLOWED_ACTION_TYPES).toContain('ASK_USER');
    expect(ALLOWED_ACTION_TYPES).toContain('REPORT_RESULT');
  });

  it('should validate and sanitize a well-formed plan', () => {
    const rawPlan = {
      reply: 'Searching YouTube for the requested song',
      plan: {
        summary: 'Play music on YouTube',
        actions: [
          {
            type: 'SEARCH_YOUTUBE',
            description: 'Search for Arijit Singh',
            query: 'Arijit Singh best songs',
          },
          {
            type: 'WAIT_FOR_PAGE',
            description: 'Wait for results to load',
            milliseconds: 2000,
          },
        ],
      },
    };

    const result = sanitizeAndValidatePlan(rawPlan);

    expect(result.reply).toBe('Searching YouTube for the requested song');
    expect(result.plan).toBeDefined();
    expect(result.plan?.actions.length).toBe(2);
    expect(result.plan?.actions[0].type).toBe('SEARCH_YOUTUBE');
    expect(result.plan?.actions[0].id).toBeDefined();
    expect(result.plan?.actions[0].requiresApproval).toBe(false);
  });

  it('should strictly enforce user approval and medium risk on FILL_FORM actions', () => {
    const rawPlan = {
      reply: 'Ready to fill the form',
      plan: {
        summary: 'Fill registration form',
        actions: [
          {
            type: 'FILL_FORM',
            description: 'Fill name and email fields',
            requiresApproval: false, // Attempting to bypass approval
            fields: [
              { name: 'fullName', value: 'Jane Doe', label: 'Full Name' },
              { name: 'email', value: 'jane@example.com', label: 'Email' },
            ],
          },
        ],
      },
    };

    const result = sanitizeAndValidatePlan(rawPlan);

    expect(result.plan).toBeDefined();
    const fillAction = result.plan?.actions[0];
    expect(fillAction?.requiresApproval).toBe(true); // Must be forced to true
    expect(fillAction?.riskLevel).toBe('medium');
    expect(fillAction?.fields?.length).toBe(2);
  });

  it('should reject or strip unsupported action types', () => {
    const rawWithUnsupported = {
      reply: 'Running custom script',
      plan: {
        summary: 'Dangerous plan',
        actions: [
          {
            type: 'EXECUTE_ARBITRARY_JS', // Disallowed!
            description: 'Run unsafe code',
          },
          {
            type: 'READ_CURRENT_PAGE',
            description: 'Read the page text',
          },
        ],
      },
    };

    const result = sanitizeAndValidatePlan(rawWithUnsupported);

    expect(result.plan).toBeDefined();
    // Only the supported action READ_CURRENT_PAGE should remain
    expect(result.plan?.actions.length).toBe(1);
    expect(result.plan?.actions[0].type).toBe('READ_CURRENT_PAGE');
  });

  it('should reject NAVIGATE actions with dangerous or non-web protocols', () => {
    const dangerousPlan = {
      reply: 'Navigating to script',
      plan: {
        summary: 'Dangerous navigation attempt',
        actions: [
          {
            type: 'NAVIGATE',
            description: 'Run javascript in address bar',
            targetUrl: 'javascript:alert(document.cookie)',
          },
          {
            type: 'NAVIGATE',
            description: 'Read local shadow file',
            targetUrl: 'file:///etc/passwd',
          },
          {
            type: 'NAVIGATE',
            description: 'Valid web navigation',
            targetUrl: 'https://example.com/login',
          },
        ],
      },
    };

    const result = sanitizeAndValidatePlan(dangerousPlan);
    expect(result.plan).toBeDefined();
    // Only the valid https URL should be accepted
    expect(result.plan?.actions.length).toBe(1);
    expect(result.plan?.actions[0].targetUrl).toBe('https://example.com/login');
  });

  it('should filter out sensitive credentials (passwords, PINs, cards) from form fields', () => {
    const planWithCredentials = {
      reply: 'Filling login details',
      plan: {
        summary: 'Form filling',
        actions: [
          {
            type: 'FILL_FORM',
            description: 'Fill form inputs',
            fields: [
              { name: 'username', value: 'john_doe', label: 'Username' },
              { name: 'user_password', value: 'secret123', label: 'Password' },
              { name: 'creditcard_number', value: '4111222233334444', label: 'Card Number' },
              { name: 'email', value: 'john@example.com', label: 'Email' },
            ],
          },
        ],
      },
    };

    const result = sanitizeAndValidatePlan(planWithCredentials);
    expect(result.plan).toBeDefined();
    const fillAction = result.plan?.actions[0];
    expect(fillAction?.fields?.length).toBe(2);
    // Only username and email should remain
    const fieldNames = fillAction?.fields?.map((f) => f.name);
    expect(fieldNames).toContain('username');
    expect(fieldNames).toContain('email');
    expect(fieldNames).not.toContain('user_password');
    expect(fieldNames).not.toContain('creditcard_number');
  });

  it('should provide a graceful fallback when response cannot be parsed', () => {
    const malformed = {
      unexpectedKey: 12345,
    };

    const result = sanitizeAndValidatePlan(malformed);
    expect(result.reply).toBeDefined();
    expect(result.plan).toBeUndefined();
    expect(result.suggestedActions?.length).toBeGreaterThan(0);
  });
});
