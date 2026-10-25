import React, { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ChatMessage as ChatMessageType, BrowserAction } from '../types/index.js';
import { ChatMessage } from './ChatMessage.js';
import { WelcomeScreen } from './WelcomeScreen.js';

interface ChatWindowProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  activeUrl?: string;
  currentPageTitle?: string;
  onSelectPrompt: (prompt: string) => void;
  onApproveAction: (action: BrowserAction) => void;
  onCancelAction: (action: BrowserAction) => void;
  isExecutingAction: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  isLoading,
  activeUrl,
  currentPageTitle,
  onSelectPrompt,
  onApproveAction,
  onCancelAction,
  isExecutingAction,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isExecutingAction]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <WelcomeScreen
          onSelectPrompt={onSelectPrompt}
          currentPageTitle={currentPageTitle}
        />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scroll-smooth"
    >
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          activeUrl={activeUrl}
          onApproveAction={onApproveAction}
          onCancelAction={onCancelAction}
          onSelectPrompt={onSelectPrompt}
          isExecutingAction={isExecutingAction}
        />
      ))}

      {/* AI Processing Bubble */}
      {isLoading && (
        <div className="flex items-center space-x-2 text-pilot-text-muted text-xs p-2 animate-fade-in">
          <Loader2 className="w-4 h-4 animate-spin text-pilot-primary" />
          <span>Z-Pilot is thinking and planning actions...</span>
        </div>
      )}
    </div>
  );
};
