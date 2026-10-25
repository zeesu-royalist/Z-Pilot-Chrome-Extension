import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

/**
 * Rate limiting middleware for local & extension requests.
 * Allows 60 requests per minute per IP to avoid accidental loops or abuse.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Sanitize and validate request payloads.
 * Protects against oversized context dumps and malformed requests.
 */
export const validatePayloadSize = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    // Check if extracted text is excessively large (> 200KB)
    const pageContext = req.body.pageContext;
    if (pageContext?.extractedText && typeof pageContext.extractedText === 'string') {
      if (pageContext.extractedText.length > 200_000) {
        // Truncate to safe size instead of crashing
        pageContext.extractedText = pageContext.extractedText.slice(0, 200_000) + '... [truncated]';
      }
    }
  }
  next();
};

/**
 * Redact sensitive secrets (e.g. Gemini API keys, tokens) from error strings
 */
export function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return '';
  return msg
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/(key|token|auth|secret|password)=([^\s&]+)/gi, '$1=[REDACTED]');
}

/**
 * Global error handler middleware with secret redacting
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const safeMessage = sanitizeErrorMessage(err.message || 'Unknown error');
  console.error('[Z-Pilot Backend Error]:', safeMessage);

  // Avoid leaking internal paths, secrets, or implementation details to clients
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: 'An internal server error occurred while processing your request.',
    details: isDev ? safeMessage : undefined,
    code: 'INTERNAL_SERVER_ERROR',
  });
};
