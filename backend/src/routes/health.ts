import { Router, Request, Response } from 'express';
import { geminiService } from '../services/gemini.js';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  const geminiReady = geminiService.isConfigured();

  res.json({
    status: 'ok',
    service: 'Z-Pilot Backend',
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    gemini: {
      configured: geminiReady,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      status: geminiReady ? 'ready' : 'missing_api_key',
    },
  });
});
