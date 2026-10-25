import React, { useRef, useEffect } from 'react';
import { SendHorizontal, Globe, Square, Shield, AlertTriangle, Paperclip } from 'lucide-react';
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
        96
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
    <div className="p-3 bg-transparent">
      {/* Page Context Badge */}
      <div className="flex items-center justify-between mb-2 text-[11px] px-2 text-white/50">
        <div className="flex items-center space-x-1.5 truncate max-w-[75%]">
          {isRestricted ? (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          ) : (
            <Globe className="w-3 h-3 text-orange-400 shrink-0" />
          )}
          <span className="truncate">
            {pageContext?.title || 'Active Web Page Context'}
          </span>
        </div>

        <div
          title="Web page context is shared securely with Gemini to plan actions."
          className="flex items-center space-x-1 text-[10px] text-white/40 hover:text-white/80 cursor-help"
        >
          <Shield className="w-3 h-3 text-orange-400" />
          <span className="hidden sm:inline">Protected</span>
        </div>
      </div>

      {/* Floating Capsule Bar (Screenshot 2 exact match) */}
      <div className="relative flex items-center rounded-full bg-black/70 border border-white/15 focus-within:border-orange-500/50 backdrop-blur-xl px-3.5 py-2 shadow-2xl shadow-black/90 transition-all">
        {/* Left Paperclip icon button */}
        <button
          type="button"
          onClick={() => {
            if (textareaRef.current) textareaRef.current.focus();
          }}
          title="Attach context or prompt"
          className="p-1 rounded-full text-white/60 hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <Paperclip className="w-4 h-4 stroke-[1.75]" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Z-Pilot to summarize, fill forms, or search..."
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent px-3 py-0.5 text-xs text-white placeholder-white/45 focus:outline-none max-h-24 leading-relaxed font-sans"
        />

        {/* Right Send/Stop Action (Always Centered) */}
        <div className="flex items-center shrink-0">
          {isLoading && onStop ? (
            <button
              onClick={onStop}
              title="Stop action"
              className="w-8 h-8 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!input.trim() || disabled}
              title="Send message (Enter)"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md ${
                input.trim() && !disabled
                  ? 'bg-gradient-to-tr from-[#EA580C] to-[#FB923C] hover:from-[#F97316] hover:to-[#FED7AA] text-white shadow-orange-600/40 active:scale-95'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              <SendHorizontal className="w-4 h-4 translate-x-[0.5px] stroke-[2.2]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
