import React, { useRef, useEffect } from 'react';
import { ChatMessage as ChatMessageType, BrowserAction } from '../types/index.js';
import { ChatMessage } from './ChatMessage.js';
import { WelcomeScreen } from './WelcomeScreen.js';
import { BrandMark } from './BrandLogo.js';

interface ChatWindowProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  activeUrl?: string;
  currentPageTitle?: string;
  isApiKeyConfigured?: boolean;
  onOpenSettings?: () => void;
  onSaveApiKey?: (apiKey: string) => void;
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
  isApiKeyConfigured = false,
  onOpenSettings,
  onSaveApiKey,
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
          isApiKeyConfigured={isApiKeyConfigured}
          onOpenSettings={onOpenSettings}
          onSaveApiKey={onSaveApiKey}
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
          onOpenSettings={onOpenSettings}
          isExecutingAction={isExecutingAction}
        />
      ))}

      {/* AI Processing Status */}
      {isLoading && (
        <div className="flex items-center space-x-2 text-white/50 text-xs px-2 py-1.5 animate-fade-in">
          <BrandMark size={16} className="object-contain animate-pulse shrink-0" />
          <span className="font-light italic tracking-wide">Z-Pilot is working....</span>
        </div>
      )}
    </div>
  );
};
