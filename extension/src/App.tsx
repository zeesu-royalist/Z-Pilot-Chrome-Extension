import React, { useState, useEffect, useRef } from 'react';
import {
  ChatMessage,
  BrowserAction,
  PageContext,
  UserSettings,
  UserProfile,
  DetectedVideo,
  VideoScanResult,
  VideoDownloadProgress,
} from './types/index.js';
import { StorageService } from './services/storage.js';
import { ApiService } from './services/api.js';
import { BrowserActionService } from './services/browser-actions.js';
import { VideoScannerService } from './services/video-scanner.js';
import { VideoDownloaderService } from './services/video-downloader.js';
import { Header } from './components/Header.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ChatWindow } from './components/ChatWindow.js';
import { ChatInput } from './components/ChatInput.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { ProfileModal } from './components/ProfileModal.js';
import { VideoScannerPanel } from './components/VideoScannerPanel.js';

export const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    geminiApiKey: '',
    geminiModel: 'gemini-3.5-flash-lite',
    theme: 'dark',
    autoReadContext: true,
  });
  const [profile, setProfile] = useState<UserProfile>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Video Scanner & Downloader v2 State
  const [isVideoScannerOpen, setIsVideoScannerOpen] = useState(false);
  const [isScanningVideos, setIsScanningVideos] = useState(false);
  const [videoScanResult, setVideoScanResult] = useState<VideoScanResult | null>(null);
  const [downloadProgressMap, setDownloadProgressMap] = useState<
    Record<string, VideoDownloadProgress>
  >({});
  const [sniffedCount, setSniffedCount] = useState(0);
  const activeTabIdRef = useRef<number>(0);
  const scanAbortRef = useRef<AbortController | null>(null);

  // Cancellation ref for ongoing action sequence
  const cancelExecutionRef = useRef(false);
  // Abort controller ref for ongoing Gemini request
  const abortControllerRef = useRef<AbortController | null>(null);

  const isApiKeyConfigured = !!(settings.geminiApiKey && settings.geminiApiKey.trim() !== '');

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

      const handleRuntimeMessage = (msg: {
        type?: string;
        tabId?: number;
        count?: number;
        progress?: VideoDownloadProgress;
      }) => {
        if (msg.type === 'SNIFFED_MEDIA_UPDATED' && msg.tabId === activeTabIdRef.current) {
          setSniffedCount(msg.count || 0);
        } else if (msg.type === 'DOWNLOAD_PROGRESS' && msg.progress) {
          const p = msg.progress;
          if (p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled') {
            VideoDownloaderService.markFinished(p.videoId);
            if (p.status === 'completed') {
              setTimeout(() => {
                setDownloadProgressMap((prev) => {
                  if (!prev[p.videoId] || prev[p.videoId].status !== 'completed') return prev;
                  const next = { ...prev };
                  delete next[p.videoId];
                  return next;
                });
              }, 3500);
            }
          }
          setDownloadProgressMap((prev) => ({
            ...prev,
            [p.videoId]: p,
          }));
        }
      };

      if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener(handleRuntimeMessage);
      }

      return () => {
        if (chrome.tabs.onActivated) chrome.tabs.onActivated.removeListener(handleActivated);
        if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.removeListener(handleUpdated);
        if (chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
        }
      };
    }
  }, []);

  // Sync messages to storage whenever updated
  useEffect(() => {
    if (messages.length > 0) {
      StorageService.saveMessages(messages);
    }
  }, [messages]);

  const refreshContext = async () => {
    try {
      const [ctx, tab] = await Promise.all([
        BrowserActionService.getPageContext(),
        BrowserActionService.getActiveTab(),
      ]);
      setPageContext(ctx);
      if (tab?.id) {
        activeTabIdRef.current = tab.id;
        const count = await VideoScannerService.getSniffedCount(tab.id);
        setSniffedCount(count);
      }
    } catch (err) {
      console.warn('[App] Error refreshing page context:', err);
    }
  };

  /**
   * 1-Click Video Scan: opens panel and immediately runs parallel DOM + Network + YouTube + HLS scan
   */
  const runVideoScan = async () => {
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
    }
    const controller = new AbortController();
    scanAbortRef.current = controller;

    setIsScanningVideos(true);
    try {
      const result = await VideoScannerService.scanActiveTab(controller.signal);
      if (!controller.signal.aborted) {
        setVideoScanResult(result);
        if (result.tabId) activeTabIdRef.current = result.tabId;
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsScanningVideos(false);
      }
    }
  };

  const handleOpenVideoScanner = () => {
    setIsVideoScannerOpen(true);
    runVideoScan();
  };

  /**
   * 2nd-Click Video Download
   */
  const handleDownloadVideo = (video: DetectedVideo) => {
    const isBusy = Object.values(downloadProgressMap).some(
      (p) => p && (p.status === 'preparing' || p.status === 'downloading' || p.status === 'muxing')
    );
    if (isBusy) return;

    const tabId = videoScanResult?.tabId || activeTabIdRef.current;
    const pageUrl = videoScanResult?.pageUrl || pageContext?.url;
    VideoDownloaderService.downloadVideo(
      video,
      tabId,
      (progress) => {
        setDownloadProgressMap((prev) => ({
          ...prev,
          [progress.videoId]: progress,
        }));
        if (progress.status === 'completed') {
          setTimeout(() => {
            setDownloadProgressMap((prev) => {
              if (!prev[progress.videoId] || prev[progress.videoId].status !== 'completed') return prev;
              const next = { ...prev };
              delete next[progress.videoId];
              return next;
            });
          }, 3500);
        }
      },
      pageUrl
    );
  };

  const handleDownloadAudio = (video: DetectedVideo) => {
    const isBusy = Object.values(downloadProgressMap).some(
      (p) => p && (p.status === 'preparing' || p.status === 'downloading' || p.status === 'muxing')
    );
    if (isBusy) return;

    const tabId = videoScanResult?.tabId || activeTabIdRef.current;
    const pageUrl = videoScanResult?.pageUrl || pageContext?.url;
    VideoDownloaderService.downloadAudioOnly(
      video,
      tabId,
      (progress) => {
        setDownloadProgressMap((prev) => ({
          ...prev,
          [progress.videoId]: progress,
        }));
        if (progress.status === 'completed') {
          setTimeout(() => {
            setDownloadProgressMap((prev) => {
              if (!prev[progress.videoId] || prev[progress.videoId].status !== 'completed') return prev;
              const next = { ...prev };
              delete next[progress.videoId];
              return next;
            });
          }, 3500);
        }
      },
      pageUrl
    );
  };

  const handleCancelVideoDownload = (video: DetectedVideo) => {
    VideoDownloaderService.cancelDownload(video.id);
    setDownloadProgressMap((prev) => ({
      ...prev,
      [video.id]: {
        videoId: video.id,
        status: 'cancelled',
        percent: 0,
        bytesDownloaded: 0,
        message: 'Download cancelled',
      },
    }));
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

    // Call API with cancellation signal
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const response = await ApiService.sendChatMessage(settings, {
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

    // If an action plan exists and first action doesn't require manual approval, execute automatically
    if (
      initializedPlan &&
      initializedPlan.actions.length > 0 &&
      !initializedPlan.actions[0].requiresApproval
    ) {
      executePlan(assistantMessageId, initializedPlan.actions);
    }
  };

  /**
   * Execute an action sequence step-by-step
   */
  const executePlan = async (messageId: string, actionsToRun: BrowserAction[]) => {
    if (isExecutingPlan || actionsToRun.length === 0) return;

    setIsExecutingPlan(true);
    cancelExecutionRef.current = false;

    // Get active tab ID
    const activeTab = await BrowserActionService.getActiveTab();
    const activeTabId = activeTab?.id || 0;

    for (let i = 0; i < actionsToRun.length; i++) {
      // Check cancellation signal
      if (cancelExecutionRef.current) {
        updateActionStatus(messageId, actionsToRun[i].id, 'cancelled', 'Execution cancelled by user');
        break;
      }

      const currentAction = actionsToRun[i];

      // If action requires user approval and is not approved, stop execution and wait
      if (currentAction.requiresApproval && currentAction.status !== 'running') {
        updateActionStatus(messageId, currentAction.id, 'awaiting_approval');
        setIsExecutingPlan(false);
        return;
      }

      // Mark current action as running
      updateActionStatus(messageId, currentAction.id, 'running');

      // Execute single action
      const result = await BrowserActionService.executeSingleAction(
        currentAction,
        activeTabId
      );

      // Check cancellation again
      if (cancelExecutionRef.current) {
        updateActionStatus(messageId, currentAction.id, 'cancelled', 'Execution cancelled by user');
        break;
      }

      if (result.success) {
        updateActionStatus(messageId, currentAction.id, 'completed', result.message);
        if (currentAction.type === 'SCAN_VIDEOS' && result.data) {
          setVideoScanResult(result.data as VideoScanResult);
          setIsVideoScannerOpen(true);
        }
      } else {
        updateActionStatus(messageId, currentAction.id, 'failed', result.message);
        // On failure, abort subsequent actions
        for (let j = i + 1; j < actionsToRun.length; j++) {
          updateActionStatus(
            messageId,
            actionsToRun[j].id,
            'failed',
            'Skipped due to earlier step failure'
          );
        }
        break;
      }

      // Small pause between multiple steps
      if (i < actionsToRun.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    setIsExecutingPlan(false);
    // Refresh context after plan completes
    await refreshContext();
  };

  /**
   * Update the status of a specific action in a specific message
   */
  const updateActionStatus = (
    messageId: string,
    actionId: string,
    status: BrowserAction['status'],
    resultMessage?: string
  ) => {
    setMessages((prevMessages) =>
      prevMessages.map((msg) => {
        if (msg.id !== messageId || !msg.plan) return msg;

        const updatedActions = msg.plan.actions.map((act) => {
          if (act.id === actionId) {
            return {
              ...act,
              status,
              resultMessage: resultMessage || act.resultMessage,
            };
          }
          return act;
        });

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
   * User explicitly approves a flagged action
   */
  const handleApproveAction = (action: BrowserAction) => {
    const targetMsg = messages.find((m) =>
      m.plan?.actions.some((a) => a.id === action.id)
    );
    if (!targetMsg || !targetMsg.plan) return;

    const actionIndex = targetMsg.plan.actions.findIndex((a) => a.id === action.id);
    if (actionIndex === -1) return;

    const remainingActions = targetMsg.plan.actions.slice(actionIndex).map((act, idx) =>
      idx === 0 ? { ...act, status: 'running' as const } : act
    );

    // Update status in state immediately
    updateActionStatus(targetMsg.id, action.id, 'running');

    // Resume execution
    executePlan(targetMsg.id, remainingActions);
  };

  /**
   * User cancels a flagged action
   */
  const handleCancelAction = (action: BrowserAction) => {
    const targetMsg = messages.find((m) =>
      m.plan?.actions.some((a) => a.id === action.id)
    );
    if (!targetMsg || !targetMsg.plan) return;

    updateActionStatus(targetMsg.id, action.id, 'cancelled', 'Rejected by user');
    setIsExecutingPlan(false);
  };

  /**
   * User clicks Stop button while processing
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
   * Clear chat history
   */
  const handleClearHistory = async () => {
    await StorageService.clearMessages();
    setMessages([]);
    setIsSettingsOpen(false);
  };

  /**
   * Update user settings
   */
  const handleUpdateSettings = async (updated: UserSettings) => {
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  /**
   * Save user autofill profile
   */
  const handleSaveProfile = async (newProfile: UserProfile) => {
    setProfile(newProfile);
    await StorageService.saveProfile(newProfile);
  };

  const handleSaveApiKey = async (apiKey: string) => {
    const updated = { ...settings, geminiApiKey: apiKey };
    setSettings(updated);
    await StorageService.saveSettings(updated);
  };

  const handleNewChat = () => {
    handleClearHistory();
  };

  return (
    <div
      className={`flex flex-col h-screen w-full text-white overflow-hidden font-sans select-none relative transition-colors duration-500 ${
        messages.length === 0 ? 'ember-bg-home' : 'ember-bg-chat'
      }`}
    >
      {/* Header (Screenshot 1 in Home view, Screenshot 2 'Close chat' in Chat view) */}
      <Header
        isApiKeyConfigured={isApiKeyConfigured}
        geminiModel={settings.geminiModel}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNewChat={handleNewChat}
        onOpenVideoScanner={handleOpenVideoScanner}
        detectedVideoCount={sniffedCount}
        hasMessages={messages.length > 0}
      />

      {/* Main View: Screenshot 1 Home Screen vs Screenshot 2 Active Chat Stream */}
      {messages.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <WelcomeScreen
            onSelectPrompt={(prompt: string) => handleSendMessage(prompt)}
            currentPageTitle={pageContext?.title}
            geminiModel={settings.geminiModel}
            isApiKeyConfigured={isApiKeyConfigured}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSaveApiKey={handleSaveApiKey}
            onOpenVideoScanner={handleOpenVideoScanner}
            detectedVideoCount={sniffedCount}
          />
        </div>
      ) : (
        <>
          {/* Main Chat Conversation Area (Screenshot 2) */}
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            activeUrl={pageContext?.url}
            currentPageTitle={pageContext?.title}
            isApiKeyConfigured={isApiKeyConfigured}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSaveApiKey={handleSaveApiKey}
            onSelectPrompt={(prompt) => handleSendMessage(prompt)}
            onApproveAction={handleApproveAction}
            onCancelAction={handleCancelAction}
            isExecutingAction={isExecutingPlan}
          />

          {/* Floating Bottom Input Bar (Screenshot 2) */}
          <ChatInput
            input={input}
            setInput={setInput}
            onSend={() => handleSendMessage()}
            onStop={handleStopExecution}
            isLoading={isLoading || isExecutingPlan}
            pageContext={pageContext}
            disabled={false}
          />
        </>
      )}

      {/* Settings Panel Modal */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        userProfile={profile}
        onUpdateSettings={handleUpdateSettings}
        onClearHistory={handleClearHistory}
        onOpenProfile={() => {
          setIsSettingsOpen(false);
          setIsProfileOpen(true);
        }}
      />

      {/* Video Scanner & Downloader Modal */}
      <VideoScannerPanel
        isOpen={isVideoScannerOpen}
        onClose={() => setIsVideoScannerOpen(false)}
        isScanning={isScanningVideos}
        scanResult={videoScanResult}
        progressMap={downloadProgressMap}
        onScan={runVideoScan}
        onDownload={handleDownloadVideo}
        onDownloadAudio={handleDownloadAudio}
        onCancelDownload={handleCancelVideoDownload}
      />

      {/* User Autofill Profile Modal */}
      <ProfileModal
        profile={profile}
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false);
          setIsSettingsOpen(true);
        }}
        onSave={handleSaveProfile}
      />
    </div>
  );
};
