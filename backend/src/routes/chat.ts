import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { geminiService } from '../services/gemini.js';
import { ChatRequestBody } from '../types/index.js';

export const chatRouter = Router();

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(5000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(30)
    .optional(),
  pageContext: z
    .object({
      url: z.string().max(2000),
      title: z.string().max(500),
      selectedText: z.string().max(10000).optional(),
      extractedText: z.string().max(250000).optional(),
      forms: z.array(z.any()).max(25).optional(),
    })
    .optional(),
  userProfile: z.record(z.string().max(1000)).optional(),
});

chatRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = ChatRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request payload',
        details: parseResult.error.format(),
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const payload: ChatRequestBody = parseResult.data;
    const response = await geminiService.planAndRespond(payload);

    res.json(response);
  } catch (err) {
    next(err);
  }
});
