import React, { useState, useEffect, useRef } from 'react';
import {
  ChatMessage,
  BrowserAction,
  PageContext,
  BackendHealth,
  UserSettings,
  UserProfile,
} from './types/index.js';
import { StorageService } from './services/storage.js';
import { ApiService } from './services/api.js';
import { BrowserActionService } from './services/browser-actions.js';
import { Header } from './components/Header.js';
import { ChatWindow } from './components/ChatWindow.js';
import { ChatInput } from './components/ChatInput.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { ProfileModal } from './components/ProfileModal.js';

export const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    backendUrl: 'http://localhost:3000',
    theme: 'dark',
    autoReadContext: true,
  });
  const [profile, setProfile] = useState<UserProfile>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Cancellation ref for ongoing action sequence
  const cancelExecutionRef = useRef(false);
  // Abort controller ref for ongoing backend request
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initial load
  useEffect(() => {
    async function init() {
      // Load stored settings and profile
      const [savedSettings, savedProfile, savedMessages] = await Promise.all([
        StorageService.getSettings(),
        StorageService.getProfile(),
        StorageService.getMessages(),
      ]);

      setSettings(savedSettings);
      setProfile(savedProfile);
      setMessages(savedMessages);

      // Check health
      await checkBackend(savedSettings.backendUrl);

      // Refresh active tab context
      await refreshContext();
    }

    init();

    // Listen to tab activation and navigation updates if extension APIs are available
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleActivated = () => {
        refreshContext();
      };
      const handleUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (changeInfo.status === 'complete') {
          refreshContext();
        }
      };

      if (chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(handleActivated);
      if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.addListener(handleUpdated);

      return () => {
        if (chrome.tabs.onActivated) chrome.tabs.onActivated.removeListener(handleActivated);
        if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.removeListener(handleUpdated);
      };
    }
  }, []);

  // Sync messages to storage whenever updated
  useEffect(() => {
    if (messages.length > 0) {
      StorageService.saveMessages(messages);
    }
  }, [messages]);

  const checkBackend = async (url: string) => {
    setCheckingHealth(true);
    const result = await ApiService.checkHealth(url);
    setHealth(result);
    setCheckingHealth(false);
  };

  const refreshContext = async () => {
    try {
      const ctx = await BrowserActionService.getPageContext();
      setPageContext(ctx);
    } catch (err) {
      console.warn('[App] Error refreshing page context:', err);
    }
  };

  /**
   * Send a user command to Z-Pilot
   */
  const handleSendMessage = async (textToSend?: string) => {
    const messageText = (textToSend || input).trim();
    if (!messageText || isLoading || isExecutingPlan) return;

    setInput('');

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Refresh context right before querying
    let currentContext = pageContext;
    try {
      currentContext = await BrowserActionService.getPageContext();
      setPageContext(currentContext);
    } catch {
      // Fallback to existing
    }

    // Call backend API with cancellation signal
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const response = await ApiService.sendChatMessage(settings.backendUrl, {
      message: messageText,
      history: [...messages, userMessage],
      pageContext: currentContext || undefined,
      userProfile: profile,
      signal: controller.signal,
    });

    abortControllerRef.current = null;
    setIsLoading(false);

    // Prepare assistant message
    const assistantMessageId = `msg_${Date.now()}_assistant`;

    // Process plan actions and assign initial statuses
    let initializedPlan = response.plan;
    if (initializedPlan && initializedPlan.actions.length > 0) {
      initializedPlan = {
        ...initializedPlan,
        actions: initializedPlan.actions.map((act, index) => ({
          ...act,
          status: index === 0 && act.requiresApproval ? 'awaiting_approval' : 'pending',
        })),
      };
    }

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: response.reply,
      timestamp: Date.now(),
      plan: initializedPlan,
      suggestedActions: response.suggestedActions,
      error: response.error,
    };

    setMessages((prev) => [...prev, assistantMessage]);

    // If an action plan is present and doesn't immediately wait for approval on step 0, execute it
    if (initializedPlan && initializedPlan.actions.length > 0) {
      const firstAction = initializedPlan.actions[0];
      if (!firstAction.requiresApproval) {
        executePlan(assistantMessageId, initializedPlan.actions);
      }
    }
  };

  /**
   * Sequentially execute browser actions in a plan
   */
  const executePlan = async (messageId: string, actions: BrowserAction[]) => {
    setIsExecutingPlan(false);
    cancelExecutionRef.current = false;

    const activeTab = await BrowserActionService.getActiveTab();
    if (!activeTab || !activeTab.id) {
      updateMessageAction(messageId, actions[0]?.id, {
        status: 'failed',
        resultMessage: 'No active browser tab found to perform action.',
      });
      return;
    }

    setIsExecutingPlan(true);

    for (let i = 0; i < actions.length; i++) {
      if (cancelExecutionRef.current) {
        // User cancelled
        updateMessageAction(messageId, actions[i].id, {
          status: 'cancelled',
          resultMessage: 'Action cancelled by user.',
        });
        break;
      }

      const currentAction = actions[i];

      // If action requires approval and is not yet approved, pause and await user confirmation
      if (currentAction.requiresApproval && currentAction.status !== 'running') {
        updateMessageAction(messageId, currentAction.id, {
          status: 'awaiting_approval',
        });
        setIsExecutingPlan(false);
        return; // Pause execution until user clicks approve
      }

      // Mark running
      updateMessageAction(messageId, currentAction.id, {
        status: 'running',
      });

      // Execute action
      const result = await BrowserActionService.executeSingleAction(
        currentAction,
        activeTab.id
      );

      // Refresh page context after navigation or form actions
      if (currentAction.type === 'NAVIGATE' || currentAction.type === 'SEARCH_YOUTUBE' || currentAction.type === 'FILL_FORM') {
        await refreshContext();
      }

      if (result.success) {
        updateMessageAction(messageId, currentAction.id, {
          status: 'completed',
          resultMessage: result.message,
        });
      } else {
        updateMessageAction(messageId, currentAction.id, {
          status: 'failed',
          resultMessage: result.message,
        });

        // Safe failure stop: do not continue subsequent actions if a prerequisite fails
        setIsExecutingPlan(false);
        return;
      }
    }

    setIsExecutingPlan(false);
  };

  /**
   * Helper to update status and resultMessage of a specific action inside a message
   */
  const updateMessageAction = (
    messageId: string,
    actionId: string,
    updates: Partial<BrowserAction>
  ) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId || !msg.plan) return msg;

        const updatedActions = msg.plan.actions.map((act) =>
          act.id === actionId ? { ...act, ...updates } : act
        );

        return {
          ...msg,
          plan: {
            ...msg.plan,
            actions: updatedActions,
          },
        };
      })
    );
  };

  /**
   * Handle user approval of a sensitive action (e.g. form filling)
   */
  const handleApproveAction = async (action: BrowserAction) => {
    // Find the message containing this action
    const targetMsg = messages.find((m) =>
      m.plan?.actions.some((a) => a.id === action.id)
    );
    if (!targetMsg || !targetMsg.plan) return;

    // Mark as running in UI state
    updateMessageAction(targetMsg.id, action.id, { status: 'running' });

    const actionIndex = targetMsg.plan.actions.findIndex((a) => a.id === action.id);
    // CRITICAL: Ensure the in-memory array passed to executePlan marks this approved action as running
    const remainingActions = targetMsg.plan.actions.slice(actionIndex).map((act, idx) =>
      idx === 0 ? { ...act, status: 'running' as const } : act
    );

    executePlan(targetMsg.id, remainingActions);
  };

  /**
   * Handle user cancellation of a sensitive action
   */
  const handleCancelAction = (action: BrowserAction) => {
    const targetMsg = messages.find((m) =>
      m.plan?.actions.some((a) => a.id === action.id)
    );
    if (!targetMsg) return;

    updateMessageAction(targetMsg.id, action.id, {
      status: 'cancelled',
      resultMessage: 'Action dismissed by user.',
    });
  };

  /**
   * Stop currently running action sequence or ongoing network request
   */
  const handleStopExecution = () => {
    cancelExecutionRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsExecutingPlan(false);
  };

  /**
   * Reset conversation to fresh state
   */
  const handleNewChat = async () => {
    setMessages([]);
    await StorageService.clearMessages();
  };

  /**
   * Clear chat history from settings
   */
  const handleClearHistory = async () => {
    await StorageService.clearMessages();
    setMessages([]);
    setIsSettingsOpen(false);
  };

  /**
   * Save updated profile
   */
  const handleSaveProfile = async (updated: UserProfile) => {
    setProfile(updated);
    await StorageService.saveProfile(updated);
  };

  /**
   * Save updated settings
   */
  const handleUpdateSettings = async (updated: UserSettings) => {
    setSettings(updated);
    await StorageService.saveSettings(updated);
    checkBackend(updated.backendUrl);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-pilot-bg text-pilot-text-primary overflow-hidden font-sans select-none">
      {/* Header */}
      <Header
        health={health}
        checkingHealth={checkingHealth}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNewChat={handleNewChat}
      />

      {/* Main Chat Conversation Area */}
      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        activeUrl={pageContext?.url}
        currentPageTitle={pageContext?.title}
        onSelectPrompt={(prompt) => handleSendMessage(prompt)}
        onApproveAction={handleApproveAction}
        onCancelAction={handleCancelAction}
        isExecutingAction={isExecutingPlan}
      />

      {/* Fixed Bottom Input Bar */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={() => handleSendMessage()}
        onStop={handleStopExecution}
        isLoading={isLoading || isExecutingPlan}
        pageContext={pageContext}
        disabled={checkingHealth}
      />

      {/* Settings Panel Modal */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        health={health}
        checkingHealth={checkingHealth}
        onRefreshHealth={() => checkBackend(settings.backendUrl)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClearHistory={handleClearHistory}
        onOpenProfile={() => {
          setIsSettingsOpen(false);
          setIsProfileOpen(true);
        }}
      />

      {/* User Autofill Profile Modal */}
      <ProfileModal
        profile={profile}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onSave={handleSaveProfile}
      />
    </div>
  );
};
