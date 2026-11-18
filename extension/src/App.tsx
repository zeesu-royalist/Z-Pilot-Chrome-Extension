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
  CleanCopyTab,
  TodoItem,
} from './types/index.js';
import { Bell, Check, Clock, X } from 'lucide-react';
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
import { QuickNotesPanel } from './components/QuickNotesPanel.js';
import { TranslatorPanel } from './components/TranslatorPanel.js';
import { TodoListPanel, playReminderChime } from './components/TodoListPanel.js';
import { CalculatorPanel } from './components/CalculatorPanel.js';
import { ConverterPanel } from './components/ConverterPanel.js';
import { CleanCopyOcrPanel } from './components/CleanCopyOcrPanel.js';
import { PrivacyBlurPanel } from './components/PrivacyBlurPanel.js';
import { ShoppingAssistantPanel } from './components/ShoppingAssistantPanel.js';
import { ClipboardPanel } from './components/ClipBotPanel.js';
import { ChatPanel } from './components/ChatPanel.js';
import { AdBlockerPanel } from './components/AdBlockerPanel.js';
import { friendChatManager } from './services/instant-chat.js';

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

  // Quick Notes State
  const [isQuickNotesOpen, setIsQuickNotesOpen] = useState(false);
  const [notesCount, setNotesCount] = useState(0);

  // Translator State
  const [isTranslatorOpen, setIsTranslatorOpen] = useState(false);
  const [translationsCount, setTranslationsCount] = useState(0);

  // Tasks & Reminders State
  const [isTodoListOpen, setIsTodoListOpen] = useState(false);
  const [todosCount, setTodosCount] = useState(0);
  const [activeReminder, setActiveReminder] = useState<TodoItem | null>(null);

  // Advanced Calculator State
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  // Currency, Unit & Timezone Converter State
  const [isConverterOpen, setIsConverterOpen] = useState(false);

  // Clean Copy Studio, OCR & Clipboard History State
  const [isCleanCopyOcrOpen, setIsCleanCopyOcrOpen] = useState(false);
  const [cleanCopyInitialTab, setCleanCopyInitialTab] = useState<CleanCopyTab>('clipboard');

  const handleOpenCleanCopyOcr = (tab: CleanCopyTab = 'clipboard') => {
    setCleanCopyInitialTab(tab);
    setIsCleanCopyOcrOpen(true);
  };

  // Web Privacy & Blur Shield State
  const [isPrivacyBlurOpen, setIsPrivacyBlurOpen] = useState(false);

  // E-Commerce Shopping Assistant State
  const [isShoppingOpen, setIsShoppingOpen] = useState(false);

  // Clipboard (Auto-Clipboard) State
  const [isClipboardOpen, setIsClipboardOpen] = useState(false);
  const [clipsCount, setClipsCount] = useState(0);

  // Friend Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Add Blocker Ad Blocker State
  const [isAdBlockerOpen, setIsAdBlockerOpen] = useState(false);
  const [blockedAdsCount, setBlockedAdsCount] = useState(0);

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
      // Load stored settings, profile, and notes
      const [savedSettings, savedProfile, savedMessages, savedNotes] = await Promise.all([
        StorageService.getSettings(),
        StorageService.getProfile(),
        StorageService.getMessages(),
        StorageService.getNotes(),
      ]);

      setSettings(savedSettings);
      setProfile(savedProfile);
      setMessages(savedMessages);
      setNotesCount(savedNotes.length);

      // Load translations count
      StorageService.getTranslations().then((t) => setTranslationsCount(t.length));

      // Load pending todos count
      StorageService.getTodos().then((t) =>
        setTodosCount(t.filter((item) => !item.completed).length)
      );

      // Load Clipboard clips count
      StorageService.getClipboardItems().then((c) => setClipsCount(c.length));

      // Query active tab ad blocking stats
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_AD_BLOCK_STATS' }, (res) => {
              if (!chrome.runtime.lastError && res && typeof res.pageCount === 'number') {
                setBlockedAdsCount(res.pageCount);
              }
            });
          }
        });
      }

      // Check if user clicked a friend chat notification to open panel
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        chrome.storage.session.get('zpilot_open_chat_pending').then((res) => {
          if (res?.zpilot_open_chat_pending) {
            setIsChatOpen(true);
            friendChatManager.setPanelOpen(true);
            setUnreadChatCount(0);
            chrome.storage.session.remove('zpilot_open_chat_pending').catch(() => {});
          }
        }).catch(() => {});
      }

      // Refresh active tab context
      await refreshContext();
    }

    init();

    // Listen to tab activation and navigation updates if extension APIs are available
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const queryTabAdStats = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_AD_BLOCK_STATS' }, (res) => {
              if (!chrome.runtime.lastError && res && typeof res.pageCount === 'number') {
                setBlockedAdsCount(res.pageCount);
              } else {
                setBlockedAdsCount(0);
              }
            });
          }
        });
      };

      const handleActivated = () => {
        refreshContext();
        queryTabAdStats();
      };
      const handleUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (changeInfo.status === 'complete') {
          refreshContext();
          queryTabAdStats();
        }
      };

      if (chrome.tabs.onActivated) chrome.tabs.onActivated.addListener(handleActivated);
      if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.addListener(handleUpdated);

      const handleRuntimeMessage = (msg: {
        type?: string;
        tabId?: number;
        count?: number;
        progress?: VideoDownloadProgress;
        items?: unknown[];
        todo?: TodoItem;
      }) => {
        if (msg.type === 'OPEN_FRIEND_CHAT') {
          setIsChatOpen(true);
          friendChatManager.setPanelOpen(true);
          setUnreadChatCount(0);
        } else if (msg.type === 'AD_ELEMENTS_BLOCKED' && typeof msg.count === 'number') {
          setBlockedAdsCount((prev) => prev + (msg.count || 0));
        } else if (msg.type === 'CLIPBOT_UPDATED' && Array.isArray(msg.items)) {
          setClipsCount(msg.items.length);
        } else if (msg.type === 'TODO_REMINDER_ALERT' && msg.todo) {
          setActiveReminder(msg.todo);
          playReminderChime();
          StorageService.getTodos().then((list) => {
            setTodosCount(list.filter((t) => !t.completed).length);
          });
        } else if (msg.type === 'OPEN_TODO_PANEL') {
          setIsTodoListOpen(true);
        } else if (msg.type === 'TODO_UPDATED') {
          StorageService.getTodos().then((list) => {
            setTodosCount(list.filter((t) => !t.completed).length);
          });
        } else if (msg.type === 'SNIFFED_MEDIA_UPDATED' && msg.tabId === activeTabIdRef.current) {
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

      const handleStorageChange = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string
      ) => {
        if (areaName === 'local' && changes['zpilot_Clipboard_items']) {
          const val = changes['zpilot_Clipboard_items'].newValue;
          if (Array.isArray(val)) {
            setClipsCount(val.length);
          }
        }
        if (areaName === 'local' && changes['zpilot_todos']) {
          const val = changes['zpilot_todos'].newValue;
          if (Array.isArray(val)) {
            setTodosCount(val.filter((t: any) => !t.completed).length);
          }
        }
      };

      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChange);
      }

      return () => {
        if (chrome.tabs.onActivated) chrome.tabs.onActivated.removeListener(handleActivated);
        if (chrome.tabs.onUpdated) chrome.tabs.onUpdated.removeListener(handleUpdated);
        if (chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
        }
        if (chrome.storage?.onChanged) {
          chrome.storage.onChanged.removeListener(handleStorageChange);
        }
      };
    }
  }, []);

  // Listen to Friend Chat updates & unread badges
  useEffect(() => {
    friendChatManager.initialize();
    const unsub = friendChatManager.subscribe(() => {
      setUnreadChatCount(friendChatManager.getState().unreadCount);
    });
    return unsub;
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

  // Periodic scanner to catch overdue reminders while sidepanel is active
  useEffect(() => {
    const checkOverdue = async () => {
      try {
        const todos = await StorageService.getTodos();
        const now = Date.now();
        let changed = false;
        const updated = todos.map((t) => {
          if (!t.completed && t.reminderSet && t.dueDate && t.dueDate <= now && !t.notified) {
            setActiveReminder(t);
            playReminderChime();
            changed = true;
            return { ...t, notified: true };
          }
          return t;
        });
        if (changed) {
          await StorageService.saveTodos(updated);
          setTodosCount(updated.filter((t) => !t.completed).length);
        }
      } catch {
        // Ignore
      }
    };

    const interval = setInterval(checkOverdue, 4000);
    checkOverdue();
    return () => clearInterval(interval);
  }, []);

  const handleCompleteReminder = async () => {
    if (!activeReminder) return;
    const id = activeReminder.id;
    setActiveReminder(null);
    try {
      const updated = await StorageService.updateTodo(id, { completed: true });
      setTodosCount(updated.filter((t) => !t.completed).length);
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        chrome.alarms.clear(`todo_${id}`);
      }
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        chrome.notifications.clear(`notif_${id}`);
      }
    } catch {
      // Ignore
    }
  };

  const handleSnoozeReminder = async () => {
    if (!activeReminder) return;
    const id = activeReminder.id;
    const newDue = Date.now() + 10 * 60 * 1000;
    setActiveReminder(null);
    try {
      const updated = await StorageService.updateTodo(id, {
        dueDate: newDue,
        reminderSet: true,
        notified: false,
      });
      setTodosCount(updated.filter((t) => !t.completed).length);
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        chrome.alarms.create(`todo_${id}`, { when: newDue });
      }
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        chrome.notifications.clear(`notif_${id}`);
      }
    } catch {
      // Ignore
    }
  };

  return (
    <div
      className={`flex flex-col h-screen w-full text-white overflow-hidden font-sans select-none relative transition-colors duration-500 ${messages.length === 0 ? 'ember-bg-home' : 'ember-bg-chat'
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
        onOpenQuickNotes={() => setIsQuickNotesOpen(true)}
        notesCount={notesCount}
        onOpenTranslator={() => setIsTranslatorOpen(true)}
        translationsCount={translationsCount}
        onOpenTodoList={() => setIsTodoListOpen(true)}
        todosCount={todosCount}
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        onOpenConverter={() => setIsConverterOpen(true)}
        onOpenCleanCopyOcr={() => handleOpenCleanCopyOcr('clipboard')}
        onOpenPrivacyBlur={() => setIsPrivacyBlurOpen(true)}
        onOpenShopping={() => setIsShoppingOpen(true)}
        onOpenClipboard={() => handleOpenCleanCopyOcr('clipboard')}
        onOpenClipBot={() => handleOpenCleanCopyOcr('clipboard')}
        clipsCount={clipsCount}
        onOpenChat={() => {
          setIsChatOpen(true);
          friendChatManager.setPanelOpen(true);
          setUnreadChatCount(0);
        }}
        unreadChatCount={unreadChatCount}
        onOpenAdBlocker={() => setIsAdBlockerOpen(true)}
        blockedAdsCount={blockedAdsCount}
        onOpenAutofillProfile={() => setIsProfileOpen(true)}
        hasMessages={messages.length > 0}
      />

      {/* Global Task Reminder Alert Banner (visible across all views if a reminder fires) */}
      {activeReminder && (
        <div className="relative z-40 mx-3 my-2 p-3 bg-gradient-to-r from-[#241006] via-[#1c0c04] to-[#241006] border border-orange-500/50 rounded-xl shadow-[0_8px_24px_rgba(249,115,22,0.25)] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start space-x-2.5 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-4 h-4 text-orange-400 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-bold tracking-wider text-orange-400 uppercase">
                    ⏰ Task Reminder
                  </span>
                </div>
                <div className="text-xs font-semibold text-white truncate mt-0.5">
                  {activeReminder.title}
                </div>
                {activeReminder.description && (
                  <div className="text-[11px] text-orange-200/70 truncate mt-0.5">
                    {activeReminder.description}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setActiveReminder(null)}
              className="p-1 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-orange-500/20">
            <button
              onClick={handleCompleteReminder}
              className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium shadow-sm transition-all active:scale-[0.98]"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark Done</span>
            </button>
            <button
              onClick={handleSnoozeReminder}
              className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-orange-500/30 text-orange-200 rounded-lg text-xs font-medium transition-all active:scale-[0.98]"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Snooze 10m</span>
            </button>
            <button
              onClick={() => {
                setIsTodoListOpen(true);
                setActiveReminder(null);
              }}
              className="px-2.5 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 rounded-lg text-xs font-medium transition-all"
            >
              View
            </button>
          </div>
        </div>
      )}

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
            onOpenQuickNotes={() => setIsQuickNotesOpen(true)}
            notesCount={notesCount}
            onOpenTranslator={() => setIsTranslatorOpen(true)}
            translationsCount={translationsCount}
            onOpenTodoList={() => setIsTodoListOpen(true)}
            todosCount={todosCount}
            onOpenCalculator={() => setIsCalculatorOpen(true)}
            onOpenConverter={() => setIsConverterOpen(true)}
            onOpenCleanCopyOcr={() => handleOpenCleanCopyOcr('clipboard')}
            onOpenPrivacyBlur={() => setIsPrivacyBlurOpen(true)}
            onOpenShopping={() => setIsShoppingOpen(true)}
            onOpenClipboard={() => handleOpenCleanCopyOcr('clipboard')}
            onOpenClipBot={() => handleOpenCleanCopyOcr('clipboard')}
            clipsCount={clipsCount}
            onOpenAutofillProfile={() => setIsProfileOpen(true)}
            userProfile={profile}
            onOpenChat={() => {
              setIsChatOpen(true);
              friendChatManager.setPanelOpen(true);
              setUnreadChatCount(0);
            }}
            unreadChatCount={unreadChatCount}
            onOpenAdBlocker={() => setIsAdBlockerOpen(true)}
            blockedAdsCount={blockedAdsCount}
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

      {/* Quick Notes Modal */}
      <QuickNotesPanel
        isOpen={isQuickNotesOpen}
        onClose={() => setIsQuickNotesOpen(false)}
        currentPageUrl={pageContext?.url}
        currentPageTitle={pageContext?.title}
        onNotesCountChange={(count) => setNotesCount(count)}
      />

      {/* Translator Panel */}
      <TranslatorPanel
        isOpen={isTranslatorOpen}
        onClose={() => setIsTranslatorOpen(false)}
        onHistoryCountChange={(count) => setTranslationsCount(count)}
      />

      {/* Tasks & Reminders Panel */}
      <TodoListPanel
        isOpen={isTodoListOpen}
        onClose={() => setIsTodoListOpen(false)}
        currentPageUrl={pageContext?.url}
        currentPageTitle={pageContext?.title}
        onTodosCountChange={(count) => setTodosCount(count)}
      />

      {/* Advanced Calculator Panel */}
      <CalculatorPanel
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* Currency, Unit & Timezone Converter Panel */}
      <ConverterPanel
        isOpen={isConverterOpen}
        onClose={() => setIsConverterOpen(false)}
      />

      {/* Clean Copy Studio, OCR Extractor & Clipboard History Panel */}
      <CleanCopyOcrPanel
        isOpen={isCleanCopyOcrOpen}
        onClose={() => setIsCleanCopyOcrOpen(false)}
        geminiApiKey={settings.geminiApiKey}
        onOpenSettings={() => {
          setIsCleanCopyOcrOpen(false);
          setIsSettingsOpen(true);
        }}
        onSendToChat={(text) => handleSendMessage(`Analyze and format this extracted text:\n\n${text}`)}
        currentPageTitle={pageContext?.title}
        currentPageUrl={pageContext?.url}
        initialTab={cleanCopyInitialTab}
        onClipsCountChange={(count) => setClipsCount(count)}
      />

      {/* Web Privacy & Blur Shield Panel */}
      <PrivacyBlurPanel
        isOpen={isPrivacyBlurOpen}
        onClose={() => setIsPrivacyBlurOpen(false)}
        currentPageUrl={pageContext?.url}
      />

      {/* Smart Shopping Assistant: Price Tracker, Fake Reviews & Coupons */}
      <ShoppingAssistantPanel
        isOpen={isShoppingOpen}
        onClose={() => setIsShoppingOpen(false)}
        currentPageUrl={pageContext?.url}
        currentPageTitle={pageContext?.title}
        geminiApiKey={settings.geminiApiKey}
      />

      {/* Clipboard / ClipBot Panel */}
      <ClipboardPanel
        isOpen={isClipboardOpen}
        onClose={() => {
          setIsClipboardOpen(false);
          StorageService.getClipboardItems().then((c) => setClipsCount(c.length));
        }}
      />

      {/* Friend Chat Panel */}
      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => {
          setIsChatOpen(false);
          friendChatManager.setPanelOpen(false);
        }}
      />

      {/* Add Blocker Ad Blocker Panel */}
      <AdBlockerPanel
        isOpen={isAdBlockerOpen}
        onClose={() => setIsAdBlockerOpen(false)}
        currentPageUrl={pageContext?.url}
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
