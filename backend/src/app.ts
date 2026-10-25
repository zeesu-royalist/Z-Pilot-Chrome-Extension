import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { apiRateLimiter, validatePayloadSize, errorHandler } from './middleware/security.js';
import { healthRouter } from './routes/health.js';
import { chatRouter } from './routes/chat.js';

dotenv.config();

export const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration: differentiates development from production
const isDev = process.env.NODE_ENV !== 'production';
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || (isDev ? '*' : '');
const allowedOrigins = rawAllowedOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // 1. Allow non-browser requests (curl, server-to-server, postman)
      if (!origin) {
        return callback(null, true);
      }

      // 2. Allow wildcard in development or when explicitly enabled
      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // 3. Exact origin match (e.g. specific chrome-extension://<id> or http://localhost:5173)
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // 4. In development, permit unpacked extensions and local loops
      if (isDev && (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost:'))) {
        return callback(null, true);
      }

      // 5. Reject other origins cleanly (blocks request without crashing server)
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400, // Cache preflight for 24h
  })
);

// JSON body parser with sensible limit
app.use(express.json({ limit: '500kb' }));

// Request validation & payload size inspection
app.use(validatePayloadSize);

// Rate limiting
app.use('/api/', apiRateLimiter);

// API routes
app.use('/api/health', healthRouter);
app.use('/api/chat', chatRouter);

// Root informational endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Z-Pilot Backend API',
    description: 'AI Browser Assistant Server powered by Google Gemini',
    status: 'online',
    endpoints: {
      health: '/api/health',
      chat: 'POST /api/chat',
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
  });
});

// Global error handler
app.use(errorHandler);
