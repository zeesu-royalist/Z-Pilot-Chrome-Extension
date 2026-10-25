import React, { useRef, useEffect } from 'react';
import { Send, Globe, Square, Shield, AlertTriangle } from 'lucide-react';
import { PageContext } from '../types/index.js';
import { isRestrictedUrl } from '../services/browser-actions.js';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading: boolean;
  pageContext: PageContext | null;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isLoading,
  pageContext,
  disabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim() && !disabled) {
        onSend();
      }
    }
  };

  const isRestricted = isRestrictedUrl(pageContext?.url);

  return (
    <div className="border-t border-pilot-border/80 bg-pilot-panel/90 backdrop-blur-md p-3">
      {/* Current Page Context Badge */}
      <div className="flex items-center justify-between mb-2 text-[11px] px-1">
        <div className="flex items-center space-x-1.5 truncate max-w-[75%] text-pilot-text-muted">
          {isRestricted ? (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          ) : (
            <Globe className="w-3 h-3 text-violet-400 shrink-0" />
          )}
          <span className="truncate">
            {pageContext?.title || 'No active web page'}
          </span>
        </div>

        <div
          title="Web page summary and form fields are shared securely with Gemini to plan actions."
          className="flex items-center space-x-1 text-[10px] text-pilot-text-muted hover:text-pilot-text-secondary cursor-help"
        >
          <Shield className="w-3 h-3 text-emerald-400" />
          <span className="hidden sm:inline">Context shared</span>
        </div>
      </div>

      {/* Input Box */}
      <div className="relative flex items-end rounded-xl bg-pilot-card border border-pilot-border focus-within:border-pilot-primary/70 transition-colors shadow-inner">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? 'Connecting to backend...'
              : 'Ask Z-Pilot to do something... (e.g. summarize, fill form, play song)'
          }
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent px-3.5 py-2.5 text-xs text-pilot-text-primary placeholder:text-pilot-text-muted focus:outline-none max-h-32 leading-relaxed"
        />

        <div className="p-1.5 shrink-0">
          {isLoading && onStop ? (
            <button
              onClick={onStop}
              title="Stop action"
              className="p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!input.trim() || disabled}
              title="Send command (Enter)"
              className="p-2 rounded-lg bg-pilot-primary hover:bg-pilot-primaryHover disabled:opacity-40 disabled:hover:bg-pilot-primary text-white transition-colors shadow-sm shadow-pilot-primary/30"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-pilot-text-muted">
        <span>Enter to send, Shift+Enter for new line</span>
        <span>MV3 Protected</span>
      </div>
    </div>
  );
};
