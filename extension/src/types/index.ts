/**
 * Extension TypeScript Types
 */

export type BrowserActionType =
  | 'NAVIGATE'
  | 'SEARCH_WEB'
  | 'SEARCH_YOUTUBE'
  | 'READ_CURRENT_PAGE'
  | 'SUMMARIZE_PAGE'
  | 'FILL_FORM'
  | 'WAIT_FOR_PAGE'
  | 'ASK_USER'
  | 'REPORT_RESULT';

export type ActionStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FormFieldValue {
  fieldId?: string;
  selector?: string;
  name?: string;
  label?: string;
  value: string;
  fieldType?: string;
}

export interface BrowserAction {
  id: string;
  type: BrowserActionType;
  description: string;
  targetUrl?: string;
  query?: string;
  fields?: FormFieldValue[];
  selector?: string;
  milliseconds?: number;
  question?: string;
  options?: string[];
  message?: string;
  success?: boolean;
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  status?: ActionStatus;
  resultMessage?: string;
}

export interface ActionPlan {
  summary: string;
  estimatedSteps: number;
  actions: BrowserAction[];
}

export interface DiscoveredFormField {
  id?: string;
  name?: string;
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  selector?: string;
}

export interface DiscoveredForm {
  id?: string;
  name?: string;
  action?: string;
  fields: DiscoveredFormField[];
}

export interface PageContext {
  url: string;
  title: string;
  selectedText?: string;
  extractedText?: string;
  forms?: DiscoveredForm[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  plan?: ActionPlan;
  suggestedActions?: string[];
  error?: boolean;
  actionProgress?: {
    currentStep: number;
    totalSteps: number;
    statusText: string;
  };
}

export interface UserProfile {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
  [key: string]: string | undefined;
}

export interface UserSettings {
  backendUrl: string;
  theme: 'dark' | 'light';
  autoReadContext: boolean;
}

export interface BackendHealth {
  status: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  gemini: {
    configured: boolean;
    model: string;
    status: string;
  };
}

export interface ActionResult {
  actionId: string;
  type: BrowserActionType;
  success: boolean;
  message: string;
  data?: unknown;
}
