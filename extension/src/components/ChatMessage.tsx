import React, { useState } from 'react';
import {
  Sparkles,
  User,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Clock,
} from 'lucide-react';
import { ChatMessage as ChatMessageType, BrowserAction } from '../types/index.js';
import { ActionPreview } from './ActionPreview.js';

interface ChatMessageProps {
  message: ChatMessageType;
  activeUrl?: string;
  onApproveAction?: (action: BrowserAction) => void;
  onCancelAction?: (action: BrowserAction) => void;
  onSelectPrompt?: (prompt: string) => void;
  isExecutingAction?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  activeUrl,
  onApproveAction,
  onCancelAction,
  onSelectPrompt,
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

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 text-[11px] text-pilot-text-muted italic px-4 text-center">
        {message.content}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col mb-4 animate-fade-in ${
        isUser ? 'items-end' : 'items-start'
      }`}
    >
      <div
        className={`flex items-start max-w-[92%] space-x-2 ${
          isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'
        }`}
      >
        {/* Avatar */}
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
            isUser
              ? 'bg-pilot-card border border-pilot-border text-pilot-text-secondary'
              : message.error
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-gradient-to-tr from-pilot-primary to-pilot-accent text-white shadow-sm'
          }`}
        >
          {isUser ? (
            <User className="w-3.5 h-3.5" />
          ) : message.error ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
        </div>

        {/* Bubble */}
        <div
          className={`group relative rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
            isUser
              ? 'bg-pilot-primary text-white rounded-tr-sm shadow-md shadow-pilot-primary/10'
              : message.error
              ? 'bg-rose-950/20 border border-rose-500/30 text-rose-200 rounded-tl-sm'
              : 'bg-pilot-card border border-pilot-border text-pilot-text-primary rounded-tl-sm'
          }`}
        >
          {/* Message Text with preserved lines */}
          <div className="whitespace-pre-wrap break-words">{message.content}</div>

          {/* Action Plan Progress & Steps */}
          {message.plan && message.plan.actions.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-pilot-border/60">
              <div className="flex items-center justify-between text-[11px] font-medium text-pilot-text-secondary mb-2">
                <span>{message.plan.summary}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pilot-panel text-pilot-text-muted">
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
                        className={`flex items-center justify-between p-2 rounded-lg text-[11px] border transition-colors ${
                          isRunning
                            ? 'bg-pilot-primary/10 border-pilot-primary/40 text-violet-200'
                            : isCompleted
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                            : isFailed
                            ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                            : isAwaitingApproval
                            ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                            : 'bg-pilot-panel/60 border-pilot-border/50 text-pilot-text-muted'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate mr-2">
                          {isRunning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-pilot-primary shrink-0" />
                          ) : isCompleted ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-pilot-success shrink-0" />
                          ) : isFailed ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          ) : isAwaitingApproval ? (
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border border-pilot-text-muted/40 text-[9px] flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                          )}
                          <span className="truncate">{act.description}</span>
                        </div>

                        <span className="text-[10px] font-mono uppercase shrink-0">
                          {act.status || 'pending'}
                        </span>
                      </div>

                      {/* Result message if finished or failed */}
                      {act.resultMessage && (
                        <div className="text-[10px] text-pilot-text-secondary px-2 py-0.5 italic truncate">
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

          {/* Suggested Follow-up Actions */}
          {!isUser && message.suggestedActions && message.suggestedActions.length > 0 && onSelectPrompt && (
            <div className="mt-2 pt-2 border-t border-pilot-border/50 flex flex-wrap gap-1.5">
              {message.suggestedActions.map((suggestion, sIdx) => (
                <button
                  key={sIdx}
                  onClick={() => onSelectPrompt(suggestion)}
                  className="px-2 py-0.5 rounded-md bg-pilot-panel hover:bg-pilot-primary/20 border border-pilot-border hover:border-pilot-primary/40 text-[10px] text-violet-300 transition-colors text-left"
                >
                  ✦ {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Copy and Timestamp bar */}
          <div className="flex items-center justify-between pt-1 mt-1 text-[10px] text-pilot-text-muted space-x-3">
            <span>{formatTime(message.timestamp)}</span>

            {!isUser && (
              <button
                onClick={handleCopy}
                title="Copy message"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-white"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-pilot-success" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
