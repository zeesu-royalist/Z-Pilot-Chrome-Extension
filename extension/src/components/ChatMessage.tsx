import React, { useState } from 'react';
import {
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock,
  Key,
  Sparkles,
} from 'lucide-react';
import { ChatMessage as ChatMessageType, BrowserAction } from '../types/index.js';
import { ActionPreview } from './ActionPreview.js';
import { BrandMark } from './BrandLogo.js';

interface ChatMessageProps {
  message: ChatMessageType;
  activeUrl?: string;
  onApproveAction?: (action: BrowserAction) => void;
  onCancelAction?: (action: BrowserAction) => void;
  onSelectPrompt?: (prompt: string) => void;
  onOpenSettings?: () => void;
  isExecutingAction?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  activeUrl,
  onApproveAction,
  onCancelAction,
  onSelectPrompt,
  onOpenSettings,
  isExecutingAction,
}) => {
  const [copied, setCopied] = useState(false);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSuggestionClick = (suggestion: string) => {
    const lower = suggestion.toLowerCase();
    if ((lower.includes('setting') || lower.includes('key')) && onOpenSettings) {
      onOpenSettings();
      return;
    }
    if (lower.includes('how do i get an api key') || lower.includes('google ai studio')) {
      window.open('https://aistudio.google.com/app/apikey', '_blank');
      return;
    }
    if (onSelectPrompt) {
      onSelectPrompt(suggestion);
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 text-[11px] text-slate-500 italic px-4 text-center">
        {message.content}
      </div>
    );
  }

  const isApiKeyIssue =
    message.error &&
    (message.content.includes('API Key') ||
      message.content.includes('API key') ||
      message.content.includes('Settings'));

  return (
    <div
      className={`flex flex-col mb-4 animate-fade-in ${
        isUser ? 'items-end' : 'items-start'
      }`}
    >
      <div
        className={`flex items-start max-w-[90%] space-x-2.5 ${
          isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'
        }`}
      >
        {/* Favicon / Brand Logo Avatar for Assistant (No surrounding circle) */}
        {!isUser && (
          <div className="mt-0.5 shrink-0">
            <BrandMark size={22} className="object-contain" />
          </div>
        )}

        {/* Message Container */}
        <div className="flex flex-col space-y-1.5 flex-1 min-w-0">
          {/* Bubble (Screenshot 2: User has radiant fiery gradient, Assistant has dark frosted glass) */}
          <div
            className={`group relative rounded-2xl px-4 py-3 text-xs leading-relaxed border transition-all ${
              isUser
                ? 'user-bubble-ember text-white border-transparent rounded-tr-sm font-normal self-end shadow-lg shadow-orange-950/30'
                : message.error
                ? 'bg-rose-950/40 border-rose-500/30 text-rose-200 rounded-tl-sm backdrop-blur-md'
                : 'bg-black/60 border-white/10 text-white/95 rounded-tl-sm shadow-xl shadow-black/50 backdrop-blur-md'
            }`}
          >
            {/* Message Text */}
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </div>

            {/* Quick action button inside error bubble */}
            {isApiKeyIssue && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="mt-2.5 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Configure API Key</span>
              </button>
            )}

            {/* Action Plan Progress & Steps */}
            {message.plan && message.plan.actions.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-white/10">
                <div className="flex items-center justify-between text-[11px] font-semibold text-white mb-2">
                  <span className="text-orange-300">{message.plan.summary}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/10">
                    {message.plan.actions.length} step(s)
                  </span>
                </div>

                <div className="space-y-1.5">
                  {message.plan.actions.map((act, index) => {
                    const isRunning = act.status === 'running';
                    const isCompleted = act.status === 'completed';
                    const isFailed = act.status === 'failed';
                    const isAwaitingApproval = act.status === 'awaiting_approval';

                    return (
                      <div key={act.id || index}>
                        <div
                          className={`flex items-center justify-between p-2 rounded-xl text-[11px] border transition-colors ${
                            isRunning
                              ? 'bg-orange-950/40 border-orange-400/50 text-white'
                              : isCompleted
                              ? 'bg-orange-950/40 border-orange-500/40 text-orange-200'
                              : isFailed
                              ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                              : isAwaitingApproval
                              ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                              : 'bg-black/40 border-white/10 text-white/80'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate mr-2">
                            {isRunning ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />
                            ) : isCompleted ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            ) : isFailed ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            ) : isAwaitingApproval ? (
                              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-white/20 text-[9px] flex items-center justify-center shrink-0 text-white/50">
                                {index + 1}
                              </span>
                            )}
                            <span className="truncate">{act.description}</span>
                          </div>

                          <span className="text-[9px] font-mono uppercase tracking-wider shrink-0 text-white/50">
                            {act.status || 'pending'}
                          </span>
                        </div>

                        {/* Result message if finished or failed */}
                        {act.resultMessage && (
                          <div className="text-[10px] text-white/60 px-2 py-0.5 italic truncate">
                            ↳ {act.resultMessage}
                          </div>
                        )}

                        {/* Approval Box if this action requires approval */}
                        {isAwaitingApproval && onApproveAction && onCancelAction && (
                          <ActionPreview
                            action={act}
                            activeUrl={activeUrl}
                            onConfirm={() => onApproveAction(act)}
                            onCancel={() => onCancelAction(act)}
                            isExecuting={isExecutingAction}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Feedback & utility bar */}
          {!isUser && !message.error && (
            <div className="flex items-center justify-between px-1 text-white/40">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleCopy}
                  title="Copy message"
                  className="p-1 rounded-md hover:text-white transition-colors cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-orange-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>

              <span className="text-[10px] text-white/40 font-mono">
                {formatTime(message.timestamp)}
              </span>
            </div>
          )}

          {/* User message timestamp */}
          {isUser && (
            <div className="text-[10px] text-slate-500 px-1 font-mono">
              {formatTime(message.timestamp)}
            </div>
          )}

          {/* Suggested Follow-up Actions (Ember Frosted Pills) */}
          {!isUser && message.suggestedActions && message.suggestedActions.length > 0 && (
            <div className="pt-1 flex flex-wrap gap-1.5">
              {message.suggestedActions.map((suggestion, sIdx) => (
                <button
                  key={sIdx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 hover:border-orange-500/40 text-[11px] text-white/80 hover:text-white transition-all text-left cursor-pointer shadow-sm active:scale-95 flex items-center"
                >
                  <Sparkles className="w-3 h-3 text-orange-400 mr-1.5 shrink-0 stroke-[1.75]" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
