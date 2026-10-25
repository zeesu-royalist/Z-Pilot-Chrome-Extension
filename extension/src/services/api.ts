import {
  ChatMessage,
  PageContext,
  UserProfile,
  UserSettings,
  ActionPlan,
} from '../types/index.js';
import { GeminiClient } from './gemini-client.js';

export interface ChatApiResult {
  reply: string;
  plan?: ActionPlan;
  suggestedActions?: string[];
  error?: boolean;
}

export const ApiService = {
  /**
   * Send a chat message directly to Google Gemini using the user's API key.
   * 100% serverless, private, and client-side.
   */
  async sendChatMessage(
    settings: UserSettings,
    params: {
      message: string;
      history: ChatMessage[];
      pageContext?: PageContext;
      userProfile?: UserProfile;
      signal?: AbortSignal;
    }
  ): Promise<ChatApiResult> {
    const apiKey = (settings.geminiApiKey || '').trim();

    if (!apiKey) {
      return {
        reply:
          '👋 Welcome to Z-Pilot! To activate your AI browser assistant, please enter your free Google Gemini API Key in Settings ⚙️.\n\nClick the Settings button at the top right to paste your key.',
        suggestedActions: ['Open Settings', 'How do I get an API key?'],
        error: true,
      };
    }

    return await GeminiClient.planAndRespond({
      apiKey,
      model: settings.geminiModel || 'gemini-3.5-flash-lite',
      message: params.message,
      history: params.history,
      pageContext: params.pageContext,
      userProfile: params.userProfile,
      signal: params.signal,
    });
  },
};
