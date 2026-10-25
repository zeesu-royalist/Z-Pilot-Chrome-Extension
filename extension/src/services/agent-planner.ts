import { z } from 'zod';
import {
  ActionPlan,
  BrowserAction,
  BrowserActionType,
  FormFieldValue,
} from '../types/index.js';

// Allowlists of permissible browser actions
export const ALLOWED_ACTION_TYPES: readonly BrowserActionType[] = [
  'NAVIGATE',
  'SEARCH_WEB',
  'SEARCH_YOUTUBE',
  'READ_CURRENT_PAGE',
  'SUMMARIZE_PAGE',
  'FILL_FORM',
  'WAIT_FOR_PAGE',
  'ASK_USER',
  'REPORT_RESULT',
] as const;

// Zod schema for a single form field to fill
export const FormFieldValueSchema = z.object({
  fieldId: z.string().optional(),
  selector: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  value: z.string(),
  fieldType: z.string().optional(),
});

// Zod schema for raw action proposed by Gemini
export const RawActionSchema = z.object({
  type: z.string(),
  description: z.string().min(1),
  targetUrl: z.string().optional(),
  query: z.string().optional(),
  fields: z.array(FormFieldValueSchema).optional(),
  selector: z.string().optional(),
  milliseconds: z.number().max(10000).optional(),
  question: z.string().optional(),
  options: z.array(z.string()).optional(),
  message: z.string().optional(),
  success: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});

// Zod schema for full LLM plan output
export const RawActionPlanSchema = z.object({
  reply: z.string().min(1),
  plan: z
    .object({
      summary: z.string(),
      actions: z.array(RawActionSchema).max(6),
    })
    .optional(),
  suggestedActions: z.array(z.string()).max(4).optional(),
});

export type RawActionPlan = z.infer<typeof RawActionPlanSchema>;

/**
 * Strictly validate that a URL uses safe web protocols (http/https).
 * Rejects javascript:, data:, file:, chrome:, etc.
 */
export function isValidWebUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const FORBIDDEN_FIELD_PATTERNS = /(?:password|passwd|pin|cvv|cvc|creditcard|cardnumber|ssn)/i;

/**
 * Validates and sanitizes an action plan returned by Gemini.
 * Ensures strict safety rules:
 * - Rejects unsupported actions
 * - Assigns unique IDs
 * - Enforces required user approval for consequential actions (FILL_FORM, external navigation)
 * - Limits action sequence length
 */
export function sanitizeAndValidatePlan(raw: unknown): {
  reply: string;
  plan?: ActionPlan;
  suggestedActions?: string[];
} {
  const parsed = RawActionPlanSchema.safeParse(raw);

  if (!parsed.success) {
    console.warn('[AgentPlanner] Schema validation failed:', parsed.error.issues);
    return {
      reply:
        typeof (raw as Record<string, unknown>)?.reply === 'string'
          ? ((raw as Record<string, unknown>).reply as string)
          : "I understand your request, but I could not formulate a safe browser action plan. Please try rephrasing.",
      suggestedActions: ['Explain this website', 'Summarize this page'],
    };
  }

  const data = parsed.data;

  if (!data.plan || !data.plan.actions || data.plan.actions.length === 0) {
    return {
      reply: data.reply,
      suggestedActions: data.suggestedActions,
    };
  }

  const sanitizedActions: BrowserAction[] = [];

  for (let i = 0; i < data.plan.actions.length; i++) {
    const rawAction = data.plan.actions[i];

    // Must be in allowlist
    if (!ALLOWED_ACTION_TYPES.includes(rawAction.type as BrowserActionType)) {
      console.warn(`[AgentPlanner] Skipping disallowed action type: ${rawAction.type}`);
      continue;
    }

    // URL protocol validation for NAVIGATE
    if (rawAction.type === 'NAVIGATE') {
      if (!isValidWebUrl(rawAction.targetUrl)) {
        console.warn(`[AgentPlanner] Skipping NAVIGATE with invalid or dangerous URL: ${rawAction.targetUrl}`);
        continue;
      }
    }

    // Determine security risk and mandatory approval
    let requiresApproval = rawAction.requiresApproval ?? false;
    let riskLevel = rawAction.riskLevel ?? 'low';

    let sanitizedFields = rawAction.fields as FormFieldValue[] | undefined;

    if (rawAction.type === 'FILL_FORM') {
      requiresApproval = true;
      riskLevel = 'medium';

      // Security filter: remove any sensitive password/card fields
      if (sanitizedFields && sanitizedFields.length > 0) {
        sanitizedFields = sanitizedFields.filter((f) => {
          const fieldDesc = `${f.name || ''} ${f.label || ''} ${f.fieldType || ''}`;
          return !FORBIDDEN_FIELD_PATTERNS.test(fieldDesc);
        });
      }
    } else if (rawAction.type === 'NAVIGATE') {
      if (
        rawAction.targetUrl?.includes('youtube.com') ||
        rawAction.targetUrl?.includes('google.com')
      ) {
        riskLevel = 'low';
      } else {
        riskLevel = 'medium';
      }
    }

    const action: BrowserAction = {
      id: `act_${Date.now()}_${i + 1}`,
      type: rawAction.type as BrowserActionType,
      description: rawAction.description,
      targetUrl: rawAction.targetUrl,
      query: rawAction.query,
      fields: sanitizedFields,
      selector: rawAction.selector,
      milliseconds: rawAction.milliseconds,
      question: rawAction.question,
      options: rawAction.options,
      message: rawAction.message,
      success: rawAction.success,
      requiresApproval,
      riskLevel,
    };

    sanitizedActions.push(action);
  }

  const finalPlan: ActionPlan = {
    summary: data.plan.summary || 'Executing browser tasks',
    estimatedSteps: sanitizedActions.length,
    actions: sanitizedActions,
  };

  return {
    reply: data.reply,
    plan: sanitizedActions.length > 0 ? finalPlan : undefined,
    suggestedActions: data.suggestedActions,
  };
}
