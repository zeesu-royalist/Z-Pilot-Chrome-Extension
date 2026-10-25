import { describe, it, expect } from 'vitest';
import { validatePayloadSize } from '../src/middleware/security.js';
import { Request, Response } from 'express';

describe('Security & Payload Middleware', () => {
  it('should truncate excessively large pageContext extractedText', () => {
    const hugeText = 'A'.repeat(250_000); // 250 KB
    const req = {
      body: {
        message: 'Explain this page',
        pageContext: {
          url: 'https://example.com',
          title: 'Example',
          extractedText: hugeText,
        },
      },
    } as unknown as Request;

    const res = {} as Response;
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    validatePayloadSize(req, res, next);

    expect(nextCalled).toBe(true);
    expect(req.body.pageContext.extractedText.length).toBeLessThan(210_000);
    expect(req.body.pageContext.extractedText).toContain('... [truncated]');
  });

  it('should leave normal-sized payloads untouched', () => {
    const normalText = 'This is a normal web page snippet.';
    const req = {
      body: {
        message: 'Explain this page',
        pageContext: {
          url: 'https://example.com',
          title: 'Example',
          extractedText: normalText,
        },
      },
    } as unknown as Request;

    const res = {} as Response;
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    validatePayloadSize(req, res, next);

    expect(nextCalled).toBe(true);
    expect(req.body.pageContext.extractedText).toBe(normalText);
  });

  it('should scrub Gemini API keys and sensitive tokens from error messages', async () => {
    const { sanitizeErrorMessage } = await import('../src/middleware/security.js');

    const leak1 = 'Failed to connect to Google API: AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q in stack';
    const scrubbed1 = sanitizeErrorMessage(leak1);
    expect(scrubbed1).not.toContain('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q');
    expect(scrubbed1).toContain('[REDACTED_GEMINI_KEY]');

    const leak2 = 'Error with token=mySecretToken12345 in header';
    const scrubbed2 = sanitizeErrorMessage(leak2);
    expect(scrubbed2).not.toContain('mySecretToken12345');
    expect(scrubbed2).toContain('[REDACTED]');
  });
});
