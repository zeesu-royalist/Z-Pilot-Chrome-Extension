import {
  BackendHealth,
  ChatMessage,
  PageContext,
  UserProfile,
  ActionPlan,
} from '../types/index.js';

export interface ChatApiResult {
  reply: string;
  plan?: ActionPlan;
  suggestedActions?: string[];
  error?: boolean;
}

export const ApiService = {
  async checkHealth(backendUrl: string): Promise<BackendHealth | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${backendUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      return (await res.json()) as BackendHealth;
    } catch {
      return null;
    }
  },

  async sendChatMessage(
    backendUrl: string,
    params: {
      message: string;
      history: ChatMessage[];
      pageContext?: PageContext;
      userProfile?: UserProfile;
      signal?: AbortSignal;
    }
  ): Promise<ChatApiResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      // If external signal is triggered, abort local controller
      if (params.signal) {
        if (params.signal.aborted) {
          clearTimeout(timeoutId);
          return { reply: 'Request cancelled by user.', error: false };
        }
        params.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
      }

      // Format clean history for backend
      const formattedHistory = params.history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // Filter empty user profile fields
      const cleanProfile: Record<string, string> = {};
      if (params.userProfile) {
        for (const [k, v] of Object.entries(params.userProfile)) {
          if (v && v.trim() !== '') {
            cleanProfile[k] = v.trim();
          }
        }
      }

      const res = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: params.message,
          history: formattedHistory,
          pageContext: params.pageContext,
          userProfile: Object.keys(cleanProfile).length > 0 ? cleanProfile : undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 429) {
          return {
            reply: '⚠️ Request rate limit reached. Please wait a minute before sending another request.',
            error: true,
          };
        }
        const errorData = await res.json().catch(() => ({}));
        return {
          reply:
            errorData.error ||
            `Backend returned error (${res.status}): ${res.statusText}`,
          error: true,
        };
      }

      const data = await res.json();
      return {
        reply: data.reply || 'Action plan formulated.',
        plan: data.plan,
        suggestedActions: data.suggestedActions,
      };
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        return {
          reply: '⏱️ Request timed out after 30 seconds. The backend or Gemini took too long to respond.',
          error: true,
        };
      }

      return {
        reply: `🔌 Cannot connect to Z-Pilot backend at ${backendUrl}.\n\nPlease ensure your Node.js backend server is running (\`npm run dev\` in \`backend/\`).`,
        error: true,
      };
    }
  },
};
