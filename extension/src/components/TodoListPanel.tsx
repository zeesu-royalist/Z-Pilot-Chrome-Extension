import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CheckSquare,
  Square,
  Plus,
  Bell,
  BellRing,
  Trash2,
  Clock,
  ExternalLink,
  Flame,
  Search,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { StorageService } from '../services/storage.js';
import { TodoItem, TodoPriority } from '../types/index.js';

interface TodoListPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageUrl?: string;
  currentPageTitle?: string;
  onTodosCountChange?: (count: number) => void;
}

export function playReminderChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Audio might be blocked without user interaction
  }
}

function formatRelativeDue(dueMs: number): { text: string; isOverdue: boolean } {
  const diffSec = Math.floor((dueMs - Date.now()) / 1000);
  if (diffSec < 0) {
    const overdueMin = Math.abs(Math.floor(diffSec / 60));
    if (overdueMin < 1) return { text: 'Due just now', isOverdue: true };
    if (overdueMin < 60) return { text: `Overdue by ${overdueMin}m`, isOverdue: true };
    const overdueHours = Math.floor(overdueMin / 60);
    return { text: `Overdue by ${overdueHours}h`, isOverdue: true };
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { text: `In ${Math.max(1, diffMin)}m`, isOverdue: false };
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return { text: `In ${diffHours}h`, isOverdue: false };
  const days = Math.floor(diffHours / 24);
  return { text: `In ${days}d`, isOverdue: false };
}

function formatDateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeHHMM(d: Date): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function parseYMDAndHHMM(ymd: string, hhmm: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hours, minutes] = hhmm.split(':').map(Number);
  const d = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  return d.getTime();
}

function formatDisplayDate(ymd: string, hhmm: string): string {
  const ts = parseYMDAndHHMM(ymd, hhmm);
  const d = new Date(ts);
  const todayYMD = formatDateToYMD(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowYMD = formatDateToYMD(tomorrow);

  let prefix = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (ymd === todayYMD) prefix = 'Today';
  else if (ymd === tomorrowYMD) prefix = 'Tomorrow';

  let h = d.getHours();
  const p = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const m = String(d.getMinutes()).padStart(2, '0');

  return `${prefix} at ${h}:${m} ${p}`;
}

export const TodoListPanel: React.FC<TodoListPanelProps> = ({
  isOpen,
  onClose,
  currentPageUrl,
  currentPageTitle,
  onTodosCountChange,
}) => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reminders' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Task Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showDescInput, setShowDescInput] = useState(false);
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [attachCurrentPage, setAttachCurrentPage] = useState(false);

  // INLINE Reminder State for Add Task form
  const [showReminderInline, setShowReminderInline] = useState(false);
  const nowPlus1Hour = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);
  const [reminderDate, setReminderDate] = useState(() => formatDateToYMD(nowPlus1Hour));
  const [reminderTime, setReminderTime] = useState(() => formatTimeHHMM(nowPlus1Hour));

  // INLINE Editing for Existing Tasks
  const [inlineEditTaskId, setInlineEditTaskId] = useState<string | null>(null);
  const [inlineEditDate, setInlineEditDate] = useState('');
  const [inlineEditTime, setInlineEditTime] = useState('');

  // Active in-app notification banner
  const [activeAlert, setActiveAlert] = useState<TodoItem | null>(null);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  const todayYMD = useMemo(() => formatDateToYMD(new Date()), []);

  // Load todos
  useEffect(() => {
    if (isOpen) {
      StorageService.getTodos().then((list) => {
        setTodos(list);
        const pendingCount = list.filter((t) => !t.completed).length;
        onTodosCountChange?.(pendingCount);
      });
    }
  }, [isOpen]);

  // Periodic reminder checker (fires sound & banner if any task hits due time while panel is open)
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setTodos((current) => {
        let hasChanges = false;
        const updated = current.map((item) => {
          if (
            !item.completed &&
            item.reminderSet &&
            item.dueDate &&
            item.dueDate <= now &&
            !item.notified &&
            !notifiedIdsRef.current.has(item.id)
          ) {
            notifiedIdsRef.current.add(item.id);
            setActiveAlert(item);
            playReminderChime();
            hasChanges = true;
            return { ...item, notified: true };
          }
          return item;
        });

        if (hasChanges) {
          StorageService.saveTodos(updated);
          return updated;
        }
        return current;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Listen to background service worker alarms broadcast
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    const handleMessage = (msg: { type?: string; todo?: TodoItem }) => {
      if (msg.type === 'TODO_REMINDER_ALERT' && msg.todo) {
        setActiveAlert(msg.todo);
        playReminderChime();
        StorageService.getTodos().then((list) => {
          setTodos(list);
          onTodosCountChange?.(list.filter((t) => !t.completed).length);
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Add Task
  const handleAddTodo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) return;

    let finalDue: number | undefined;
    if (showReminderInline) {
      const calculated = parseYMDAndHHMM(reminderDate, reminderTime);
      if (calculated > Date.now()) {
        finalDue = calculated;
      } else if (calculated > Date.now() - 60000) {
        // Schedule for next 5 seconds if chosen time is the current minute
        finalDue = Date.now() + 5000;
      }
    }

    const created = await StorageService.addTodo({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      dueDate: finalDue,
      reminderSet: !!finalDue,
      priority,
      pageUrl: attachCurrentPage ? currentPageUrl : undefined,
      pageTitle: attachCurrentPage ? currentPageTitle : undefined,
    });

    const updated = [created, ...todos];
    setTodos(updated);
    onTodosCountChange?.(updated.filter((t) => !t.completed).length);

    // Reset Form
    setNewTitle('');
    setNewDesc('');
    setShowDescInput(false);
    setShowReminderInline(false);
    setAttachCurrentPage(false);
    setPriority('medium');
    const resetTarget = new Date(Date.now() + 60 * 60 * 1000);
    setReminderDate(formatDateToYMD(resetTarget));
    setReminderTime(formatTimeHHMM(resetTarget));
  };

  const handleToggle = async (id: string) => {
    const updated = await StorageService.toggleTodo(id);
    setTodos(updated);
    onTodosCountChange?.(updated.filter((t) => !t.completed).length);
    if (activeAlert?.id === id) {
      setActiveAlert(null);
    }
  };

  const handleDelete = async (id: string) => {
    const updated = await StorageService.deleteTodo(id);
    setTodos(updated);
    onTodosCountChange?.(updated.filter((t) => !t.completed).length);
    if (activeAlert?.id === id) {
      setActiveAlert(null);
    }
    if (inlineEditTaskId === id) {
      setInlineEditTaskId(null);
    }
  };

  const handleClearCompleted = async () => {
    const updated = await StorageService.clearCompletedTodos();
    setTodos(updated);
  };

  const handleSnoozeAlert = async (todo: TodoItem, minutes: number) => {
    const newDue = Date.now() + minutes * 60 * 1000;
    const updated = await StorageService.updateTodo(todo.id, {
      dueDate: newDue,
      reminderSet: true,
      notified: false,
    });
    setTodos(updated);
    setActiveAlert(null);
    notifiedIdsRef.current.delete(todo.id);
  };

  // Quick preset helper for Add Task form
  const applyAddPreset = (minutesFromNow: number) => {
    const target = new Date(Date.now() + minutesFromNow * 60 * 1000);
    setReminderDate(formatDateToYMD(target));
    setReminderTime(formatTimeHHMM(target));
    setShowReminderInline(true);
  };

  // Open inline edit for an existing task
  const handleOpenInlineEdit = (item: TodoItem) => {
    if (inlineEditTaskId === item.id) {
      setInlineEditTaskId(null);
      return;
    }
    const target = item.dueDate ? new Date(item.dueDate) : new Date(Date.now() + 60 * 60 * 1000);
    setInlineEditDate(formatDateToYMD(target));
    setInlineEditTime(formatTimeHHMM(target));
    setInlineEditTaskId(item.id);
  };

  // Save inline edit for existing task
  const handleSaveInlineEdit = async (taskId: string) => {
    const ts = parseYMDAndHHMM(inlineEditDate, inlineEditTime);
    const finalTs = ts <= Date.now() && ts > Date.now() - 60000 ? Date.now() + 5000 : ts;
    if (finalTs <= Date.now()) return;

    const updated = await StorageService.updateTodo(taskId, {
      dueDate: finalTs,
      reminderSet: true,
      notified: false,
    });
    setTodos(updated);
    setInlineEditTaskId(null);
  };

  // Remove reminder from existing task
  const handleRemoveInlineReminder = async (taskId: string) => {
    const updated = await StorageService.updateTodo(taskId, {
      dueDate: undefined,
      reminderSet: false,
      notified: false,
    });
    setTodos(updated);
    setInlineEditTaskId(null);
  };

  const filteredTodos = useMemo(() => {
    return todos.filter((item) => {
      if (filter === 'pending' && item.completed) return false;
      if (filter === 'completed' && !item.completed) return false;
      if (filter === 'reminders' && (!item.reminderSet || item.completed)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description?.toLowerCase().includes(q);
        return matchesTitle || matchesDesc;
      }
      return true;
    });
  }, [todos, filter, searchQuery]);

  const counts = useMemo(() => {
    const total = todos.length;
    const pending = todos.filter((t) => !t.completed).length;
    const reminders = todos.filter((t) => !t.completed && t.reminderSet).length;
    const completed = total - pending;
    return { total, pending, reminders, completed };
  }, [todos]);

  // Current calculated timestamp in add form
  const addFormDueMs = useMemo(() => {
    if (!showReminderInline) return null;
    return parseYMDAndHHMM(reminderDate, reminderTime);
  }, [showReminderInline, reminderDate, reminderTime]);

  const addFormIsPast = addFormDueMs ? addFormDueMs <= Date.now() : false;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0502] overflow-hidden font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-orange-500/20 bg-gradient-to-r from-black/80 via-[#180a04]/90 to-black/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="shrink-0" />
          <div className="flex items-center space-x-2">
            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-bold text-white tracking-tight">Tasks &amp; Reminders</span>
                {counts.pending > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-orange-500/30 border border-orange-500/50 text-[10px] font-mono text-orange-300 font-bold">
                    {counts.pending}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-white/50">Auto-notified to-do manager</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close tasks"
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 hover:text-white transition-all active:scale-95 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* In-App Reminder Alert Toast */}
      {activeAlert && (
        <div className="mx-4 mt-3 p-3 rounded-2xl bg-gradient-to-r from-amber-600/35 via-orange-600/25 to-black/80 border border-amber-400/50 backdrop-blur-xl shadow-xl shadow-orange-950/40 animate-fade-in shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start space-x-2.5 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-amber-500/30 border border-amber-400/50 flex items-center justify-center text-amber-200 shrink-0 mt-0.5 animate-pulse">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Reminder Due
                </span>
                <p className="text-xs font-bold text-white truncate">{activeAlert.title}</p>
                {activeAlert.description && (
                  <p className="text-[11px] text-white/70 truncate">{activeAlert.description}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setActiveAlert(null)}
              className="text-white/40 hover:text-white p-1 rounded-md cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-end space-x-2 mt-2 pt-2 border-t border-white/10">
            <button
              onClick={() => handleSnoozeAlert(activeAlert, 10)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white font-medium cursor-pointer transition-colors"
            >
              Snooze 10m
            </button>
            <button
              onClick={() => handleToggle(activeAlert.id)}
              className="px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-[11px] text-white font-bold cursor-pointer transition-all active:scale-95 flex items-center space-x-1 shadow-sm"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Mark Done</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Quick Add Task Box */}
        <form
          onSubmit={handleAddTodo}
          className="p-3.5 rounded-2xl bg-gradient-to-b from-[#180e06] to-[#0e0703] border border-orange-500/25 shadow-lg shadow-black/30 space-y-2.5 overflow-hidden w-full"
        >
          {/* Title Input */}
          <div className="flex items-center space-x-2 w-full">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What do you want to accomplish?"
              className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0 flex items-center space-x-1 cursor-pointer shadow-md shadow-orange-600/30 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add</span>
            </button>
          </div>

          {/* Description Input if toggled */}
          {showDescInput && (
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Add optional notes or details..."
              rows={2}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/40 resize-none"
            />
          )}

          {/* INLINE REMINDER SETTER (SAME HI JAGAH PE, ZERO MODALS) */}
          {showReminderInline && (
            <div className="p-2.5 rounded-xl bg-black/60 border border-orange-500/35 space-y-2 animate-fade-in shadow-inner overflow-hidden w-full">
              {/* Quick 1-tap presets */}
              <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[10px] text-orange-400/90 font-bold shrink-0">Quick:</span>
                {[
                  { label: '+2m', mins: 2 },
                  { label: '+5m', mins: 5 },
                  { label: '+15m', mins: 15 },
                  { label: '+30m', mins: 30 },
                  { label: '+1h', mins: 60 },
                  { label: 'Tonight 8 PM', mins: (() => {
                    const now = new Date();
                    const night = new Date();
                    night.setHours(20, 0, 0, 0);
                    if (night.getTime() <= now.getTime()) night.setDate(night.getDate() + 1);
                    return Math.max(15, Math.floor((night.getTime() - now.getTime()) / 60000));
                  })() },
                  { label: 'Tomorrow 9 AM', mins: (() => {
                    const now = new Date();
                    const tmr = new Date();
                    tmr.setDate(tmr.getDate() + 1);
                    tmr.setHours(9, 0, 0, 0);
                    return Math.max(15, Math.floor((tmr.getTime() - now.getTime()) / 60000));
                  })() },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyAddPreset(preset.mins)}
                    className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-[10px] text-white/80 hover:text-white shrink-0 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Date & Time Inputs */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-white/10 w-full">
                {/* Date */}
                <div className="flex items-center space-x-1.5 flex-1 min-w-0 bg-black/40 border border-white/15 rounded-xl px-2 py-1.5 focus-within:border-orange-500/50">
                  <CalendarDays className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <input
                    type="date"
                    value={reminderDate}
                    min={todayYMD}
                    onChange={(e) => setReminderDate(e.target.value)}
                    className="bg-transparent text-xs text-white focus:outline-none w-full min-w-0 [color-scheme:dark] cursor-pointer"
                  />
                </div>

                {/* Time */}
                <div className="flex items-center space-x-1.5 flex-1 min-w-0 bg-black/40 border border-white/15 rounded-xl px-2 py-1.5 focus-within:border-orange-500/50">
                  <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="bg-transparent text-xs text-white focus:outline-none w-full min-w-0 [color-scheme:dark] cursor-pointer"
                  />
                </div>

                {/* Clear reminder */}
                <button
                  type="button"
                  onClick={() => setShowReminderInline(false)}
                  title="Remove reminder"
                  className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Live preview */}
              <div className="text-[10px] text-amber-300 font-medium flex items-center space-x-1 overflow-hidden">
                <Bell className="w-3 h-3 text-orange-400 shrink-0" />
                <span className="truncate">
                  {addFormIsPast ? (
                    <span className="text-red-400">⚠️ Time is in the past! Pick a future time.</span>
                  ) : (
                    <span>
                      {formatDisplayDate(reminderDate, reminderTime)} ({formatRelativeDue(addFormDueMs!).text})
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Options Toolbar - Responsive wrapping toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/10 text-xs w-full">
            {/* Left: Reminder & Priority */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 1. Reminder Button */}
              <button
                type="button"
                onClick={() => setShowReminderInline(!showReminderInline)}
                className={`h-7 px-2.5 flex items-center space-x-1.5 rounded-xl border text-[11px] font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  showReminderInline
                    ? 'bg-amber-500/25 border-amber-500/50 text-amber-300 font-semibold shadow-sm'
                    : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:border-orange-500/40'
                }`}
                title="Set Reminder"
              >
                <Bell className="w-3 h-3 text-orange-400 shrink-0" />
                <span>
                  {showReminderInline
                    ? formatDisplayDate(reminderDate, reminderTime)
                    : 'Reminder'}
                </span>
              </button>

              {/* 2. Priority Selector (LOW / MED / HIGH) */}
              <div className="h-7 flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10 shrink-0">
                {(['low', 'medium', 'high'] as TodoPriority[]).map((p) => {
                  const isSel = priority === p;
                  const label = p === 'medium' ? 'MED' : p.toUpperCase();
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`px-2 h-full rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center whitespace-nowrap ${
                        isSel
                          ? p === 'high'
                            ? 'bg-red-500/30 text-red-300 border border-red-500/40 shadow-sm'
                            : p === 'medium'
                            ? 'bg-orange-500/30 text-orange-300 border border-orange-500/40 shadow-sm'
                            : 'bg-blue-500/30 text-blue-300 border border-blue-500/40 shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Notes & Link */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 3. Notes Toggle Button */}
              <button
                type="button"
                onClick={() => setShowDescInput(!showDescInput)}
                className={`h-7 px-2.5 flex items-center space-x-1 rounded-xl border text-[11px] font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  showDescInput
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-semibold'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-orange-500/30'
                }`}
                title="Add Notes"
              >
                <span>Note</span>
              </button>

              {/* 4. Page Link Button */}
              {currentPageUrl && (
                <button
                  type="button"
                  onClick={() => setAttachCurrentPage(!attachCurrentPage)}
                  title={currentPageTitle || currentPageUrl}
                  className={`h-7 px-2.5 flex items-center space-x-1 rounded-xl border text-[11px] font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                    attachCurrentPage
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-semibold'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-orange-500/30'
                  }`}
                >
                  <ExternalLink className="w-3 h-3 text-orange-400 shrink-0" />
                  <span>Link</span>
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Filter Tabs Bar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: `All (${counts.total})` },
              { id: 'pending', label: `Pending (${counts.pending})` },
              { id: 'reminders', label: `Reminders (${counts.reminders})` },
              { id: 'completed', label: `Done (${counts.completed})` },
            ].map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id as typeof filter)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-sm'
                      : 'bg-white/5 hover:bg-white/10 text-white/55 hover:text-white border border-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {counts.completed > 0 && filter === 'completed' && (
            <button
              type="button"
              onClick={handleClearCompleted}
              className="text-[11px] text-white/40 hover:text-red-400 transition-colors cursor-pointer"
            >
              Clear Done
            </button>
          )}
        </div>

        {/* Search Bar if > 3 todos */}
        {todos.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/40"
            />
          </div>
        )}

        {/* Todo Items List */}
        <div className="space-y-2">
          {filteredTodos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center opacity-60">
              <CheckSquare className="w-8 h-8 text-orange-400/60" />
              <p className="text-xs text-white/60 font-medium">
                {filter === 'completed'
                  ? 'No completed tasks yet'
                  : filter === 'reminders'
                  ? 'No tasks with reminders'
                  : 'No tasks found. Add one above!'}
              </p>
            </div>
          ) : (
            filteredTodos.map((item) => {
              const dueInfo =
                item.reminderSet && item.dueDate ? formatRelativeDue(item.dueDate) : null;
              const isInlineEditing = inlineEditTaskId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition-all shadow-sm ${
                    item.completed
                      ? 'bg-black/30 border-white/10 opacity-60'
                      : 'bg-gradient-to-b from-[#180e06] to-[#100703] border-white/15 hover:border-orange-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item.id)}
                      className="mt-0.5 text-orange-400 hover:text-orange-300 transition-colors cursor-pointer shrink-0"
                    >
                      {item.completed ? (
                        <CheckSquare className="w-4 h-4 fill-orange-500 text-black" />
                      ) : (
                        <Square className="w-4 h-4 text-white/40 hover:text-orange-400" />
                      )}
                    </button>

                    {/* Task Title & Details */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold leading-snug break-words ${
                          item.completed ? 'line-through text-white/40' : 'text-white'
                        }`}
                      >
                        {item.title}
                      </p>

                      {item.description && (
                        <p
                          className={`text-[11px] mt-0.5 leading-relaxed break-words ${
                            item.completed ? 'text-white/30' : 'text-white/60'
                          }`}
                        >
                          {item.description}
                        </p>
                      )}

                      {/* Badges Row */}
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 mt-1.5">
                        {/* Priority Badge */}
                        {item.priority === 'high' && (
                          <span className="px-1.5 py-0.2 rounded bg-red-500/20 border border-red-500/40 text-[9px] font-bold text-red-300 flex items-center space-x-0.5">
                            <Flame className="w-2.5 h-2.5" />
                            <span>High</span>
                          </span>
                        )}
                        {item.priority === 'medium' && (
                          <span className="px-1.5 py-0.2 rounded bg-orange-500/20 border border-orange-500/35 text-[9px] font-bold text-orange-300">
                            Medium
                          </span>
                        )}
                        {item.priority === 'low' && (
                          <span className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] text-white/50">
                            Low
                          </span>
                        )}

                        {/* Reminder Due Pill (clickable to toggle inline editor) */}
                        {dueInfo && !item.completed && (
                          <button
                            type="button"
                            onClick={() => handleOpenInlineEdit(item)}
                            title="Click to edit reminder time"
                            className={`px-2 py-0.2 rounded-full border text-[9px] font-semibold flex items-center space-x-1 cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                              dueInfo.isOverdue
                                ? 'bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30'
                                : 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                            }`}
                          >
                            <Bell className="w-2.5 h-2.5" />
                            <span>{dueInfo.text}</span>
                          </button>
                        )}

                        {/* Attached Webpage Link */}
                        {item.pageUrl && (
                          <a
                            href={item.pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={item.pageTitle || item.pageUrl}
                            className="px-2 py-0.2 rounded bg-white/10 hover:bg-white/20 text-[9px] text-white/70 hover:text-white flex items-center space-x-1 transition-colors"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            <span className="truncate max-w-[120px]">
                              {item.pageTitle || 'Linked Page'}
                            </span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions: Bell (Inline Edit) + Delete */}
                    <div className="flex items-center space-x-1 shrink-0">
                      {!item.completed && (
                        <button
                          type="button"
                          onClick={() => handleOpenInlineEdit(item)}
                          title={item.reminderSet ? 'Change reminder time' : 'Set reminder time'}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                            item.reminderSet
                              ? 'text-amber-400 bg-amber-500/20 border border-amber-500/35 hover:bg-amber-500/30'
                              : 'text-white/30 hover:text-orange-400 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <Bell className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        title="Delete task"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 bg-white/5 hover:bg-red-500/20 transition-all active:scale-95 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* INLINE REMINDER EDITOR FOR THIS EXISTING TASK (NO NEW WINDOW) */}
                  {isInlineEditing && (
                    <div className="mt-2.5 pt-2 border-t border-white/10 p-2.5 rounded-xl bg-black/60 border border-orange-500/30 space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between text-[11px] font-bold text-orange-300">
                        <span>Change Reminder Time:</span>
                        <button
                          type="button"
                          onClick={() => setInlineEditTaskId(null)}
                          className="text-white/40 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 w-full">
                        {/* Date */}
                        <div className="flex items-center space-x-1 flex-1 min-w-0 bg-black/40 border border-white/15 rounded-lg px-2 py-1">
                          <input
                            type="date"
                            value={inlineEditDate}
                            min={todayYMD}
                            onChange={(e) => setInlineEditDate(e.target.value)}
                            className="bg-transparent text-xs text-white focus:outline-none w-full min-w-0 [color-scheme:dark]"
                          />
                        </div>

                        {/* Time */}
                        <div className="flex items-center space-x-1 flex-1 min-w-0 bg-black/40 border border-white/15 rounded-lg px-2 py-1">
                          <input
                            type="time"
                            value={inlineEditTime}
                            onChange={(e) => setInlineEditTime(e.target.value)}
                            className="bg-transparent text-xs text-white focus:outline-none w-full min-w-0 [color-scheme:dark]"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {item.reminderSet ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveInlineReminder(item.id)}
                            className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            Remove Reminder
                          </button>
                        ) : (
                          <span />
                        )}

                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setInlineEditTaskId(null)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-white/60 hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveInlineEdit(item.id)}
                            className="px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-500 text-white text-[11px] font-bold cursor-pointer transition-all active:scale-95 shadow-sm"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
