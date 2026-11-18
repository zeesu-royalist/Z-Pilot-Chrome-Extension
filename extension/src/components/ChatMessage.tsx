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
  ExternalLink,
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

/**
 * Code Block view with copy-to-clipboard functionality
 */
const CodeBlockView: React.FC<{ language?: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-xl border border-white/10 bg-black/75 overflow-hidden shadow-inner">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10 text-[10px] text-white/60">
        <span className="font-mono uppercase font-semibold text-orange-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center space-x-1 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono leading-relaxed text-orange-100/95 scrollbar-thin">
        <code>{code}</code>
      </pre>
    </div>
  );
};

/**
 * Parses inline markdown tokens: bold, italic, code, links, and strips stray asterisks
 */
export function parseInlineMarkdown(text: string, isUser = false): React.ReactNode[] {
  if (!text) return [];

  // Match:
  // 1. Markdown link: [text](url)
  // 2. Bare URL: https://...
  // 3. Inline code: `code`
  // 4. Bold + Italic: ***text***
  // 5. Bold: **text** or __text__
  // 6. Italic: *text* or _text_
  const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+[^<.,:;"')\]\s]|`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;

  const parts = text.split(tokenRegex).filter(Boolean);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Markdown link: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isUser
              ? 'underline underline-offset-2 text-white font-medium break-all'
              : 'text-amber-400 hover:text-amber-300 underline underline-offset-2 break-all transition-colors cursor-pointer'
          }
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Bare URL: https://...
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isUser
              ? 'underline underline-offset-2 text-white font-medium break-all'
              : 'text-amber-400 hover:text-amber-300 underline underline-offset-2 break-all transition-colors cursor-pointer'
          }
        >
          {part}
        </a>
      );
    }

    // Inline code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className={`px-1.5 py-0.5 mx-0.5 rounded font-mono text-[11px] border ${
            isUser
              ? 'bg-black/25 text-white border-white/20'
              : 'bg-white/10 text-orange-300 border-white/10'
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold + Italic: ***text***
    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      return (
        <strong key={idx} className="font-bold italic text-white">
          {part.slice(3, -3)}
        </strong>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Bold: __text__
    if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-white/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Italic: _text_
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-white/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Plain text segment: strip any leftover stray unclosed '**' so raw stars never appear!
    const sanitized = part.replace(/\*\*/g, '');
    return sanitized;
  });
}

/**
 * Rich Markdown formatter: parses headers, bullet points, numbered lists, blockquotes, code blocks
 */
export const MarkdownMessageView: React.FC<{ content: string; isUser?: boolean }> = ({
  content,
  isUser = false,
}) => {
  if (!content) return null;

  // Separate fenced code blocks from regular text blocks
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const renderTextSection = (section: string, baseKey: string | number) => {
    const lines = section.split(/\r?\n/);
    return lines.map((line, lineIdx) => {
      const key = `${baseKey}-l-${lineIdx}`;

      // Empty line / paragraph break
      if (line.trim() === '') {
        return <div key={key} className="h-1.5" />;
      }

      // Horizontal separator
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        return <hr key={key} className="my-2 border-white/10" />;
      }

      // Headings
      if (line.startsWith('### ')) {
        return (
          <h4 key={key} className="text-xs font-bold text-orange-300 mt-2.5 mb-1 tracking-tight">
            {parseInlineMarkdown(line.slice(4).trim(), isUser)}
          </h4>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h3 key={key} className="text-xs font-extrabold text-orange-400 mt-3 mb-1 tracking-tight">
            {parseInlineMarkdown(line.slice(3).trim(), isUser)}
          </h3>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <h2 key={key} className="text-sm font-extrabold text-orange-400 mt-3.5 mb-1.5 tracking-tight">
            {parseInlineMarkdown(line.slice(2).trim(), isUser)}
          </h2>
        );
      }

      // Blockquote
      if (line.startsWith('> ')) {
        return (
          <blockquote
            key={key}
            className="border-l-2 border-orange-500/50 pl-2.5 my-1 text-white/80 italic text-[11px]"
          >
            {parseInlineMarkdown(line.slice(2), isUser)}
          </blockquote>
        );
      }

      // Bullet points (-, *, +, •)
      const bulletMatch = line.match(/^[\*\-\+•]\s+(.*)$/);
      if (bulletMatch) {
        return (
          <div key={key} className="flex items-start space-x-2 my-0.5 pl-1">
            <span className="text-orange-400 text-xs shrink-0 select-none leading-relaxed">•</span>
            <div className="flex-1 leading-relaxed">
              {parseInlineMarkdown(bulletMatch[1], isUser)}
            </div>
          </div>
        );
      }

      // Numbered lists (1., 2., etc.)
      const numberMatch = line.match(/^(\d+)[\.\)]\s+(.*)$/);
      if (numberMatch) {
        return (
          <div key={key} className="flex items-start space-x-2 my-0.5 pl-1">
            <span className="text-orange-300/90 font-mono text-[11px] font-semibold shrink-0 select-none leading-relaxed">
              {numberMatch[1]}.
            </span>
            <div className="flex-1 leading-relaxed">
              {parseInlineMarkdown(numberMatch[2], isUser)}
            </div>
          </div>
        );
      }

      // Normal text line
      return (
        <div key={key} className="leading-relaxed my-0.5">
          {parseInlineMarkdown(line, isUser)}
        </div>
      );
    });
  };

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = content.slice(lastIndex, match.index);
      elements.push(
        <div key={`text-${lastIndex}`}>{renderTextSection(textChunk, lastIndex)}</div>
      );
    }
    const lang = match[1]?.trim() || '';
    const code = match[2] || '';
    elements.push(<CodeBlockView key={`code-${match.index}`} language={lang} code={code} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const textChunk = content.slice(lastIndex);
    elements.push(
      <div key={`text-${lastIndex}`}>{renderTextSection(textChunk, lastIndex)}</div>
    );
  }

  return <div className="space-y-0.5 break-words">{elements}</div>;
};

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
    if (
      lower.includes('how do i get an api key') ||
      lower.includes('google ai studio') ||
      lower.includes('get api')
    ) {
      if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
        chrome.tabs.create({ url: 'https://aistudio.google.com/app/apikey' });
      } else {
        window.open('https://aistudio.google.com/app/apikey', '_blank');
      }
      return;
    }
    if ((lower.includes('setting') || lower.includes('key')) && onOpenSettings) {
      onOpenSettings();
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
            {/* Message Text with Markdown Rendering */}
            <div className="break-words leading-relaxed">
              <MarkdownMessageView content={message.content} isUser={isUser} />
            </div>

            {/* Quick action buttons inside error bubble */}
            {isApiKeyIssue && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer active:scale-95"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Configure API Key</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
                      chrome.tabs.create({ url: 'https://aistudio.google.com/app/apikey' });
                    } else {
                      window.open('https://aistudio.google.com/app/apikey', '_blank');
                    }
                  }}
                  title="Open Google AI Studio to get your free Gemini API Key"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 hover:border-orange-500/40 text-amber-300 hover:text-amber-200 text-xs font-semibold transition-all shadow-sm cursor-pointer active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                  <span>Get API</span>
                </button>
              </div>
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
