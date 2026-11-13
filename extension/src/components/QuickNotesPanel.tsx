import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Search,
  Copy,
  Check,
  Trash2,
  Pin,
  Download,
  ExternalLink,
  ChevronLeft,
  FileText,
  Clock,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { QuickNote } from '../types/index.js';
import { StorageService } from '../services/storage.js';

interface QuickNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPageUrl?: string;
  currentPageTitle?: string;
  onNotesCountChange?: (count: number) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const QuickNotesPanel: React.FC<QuickNotesPanelProps> = ({
  isOpen,
  onClose,
  currentPageUrl,
  currentPageTitle,
  onNotesCountChange,
}) => {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCopied, setIsCopied] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Editor working state
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notes on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    StorageService.getNotes().then((loaded) => {
      if (!isMounted) return;
      setNotes(loaded);
      onNotesCountChange?.(loaded.length);

      // If user opened and there are no notes, auto-create the first note
      if (loaded.length === 0) {
        handleCreateNewNote();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Sync active note into editor inputs
  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  useEffect(() => {
    if (activeNote) {
      setEditorTitle(activeNote.title);
      setEditorContent(activeNote.content);
      setSaveStatus('saved');
    }
  }, [activeNoteId]);

  // Debounced auto-save when user edits active note
  const triggerAutoSave = (newTitle: string, newContent: string) => {
    if (!activeNoteId) return;

    setSaveStatus('saving');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const derivedTitle =
        newTitle.trim() ||
        newContent.split('\n')[0]?.trim().slice(0, 50) ||
        'Untitled Note';

      const updated = await StorageService.updateNote(activeNoteId, {
        title: derivedTitle,
        content: newContent,
      });

      setNotes(updated);
      setSaveStatus('saved');
    }, 350);
  };

  const handleTitleChange = (val: string) => {
    setEditorTitle(val);
    triggerAutoSave(val, editorContent);
  };

  const handleContentChange = (val: string) => {
    setEditorContent(val);
    triggerAutoSave(editorTitle, val);
  };

  const handleCreateNewNote = async () => {
    // If current note is blank, just stay on it
    if (activeNote && !activeNote.content.trim() && !activeNote.title.trim()) {
      return;
    }

    const created = await StorageService.addNote({
      title: '',
      content: '',
      pageUrl: currentPageUrl,
      pageTitle: currentPageTitle,
    });

    setNotes((prev) => [created, ...prev]);
    setActiveNoteId(created.id);
    setEditorTitle('');
    setEditorContent('');
    onNotesCountChange?.(notes.length + 1);
  };

  const handleDeleteNote = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = await StorageService.deleteNote(id);
    setNotes(updated);
    onNotesCountChange?.(updated.length);

    if (activeNoteId === id) {
      if (updated.length > 0) {
        setActiveNoteId(null);
      } else {
        setActiveNoteId(null);
      }
    }
    setDeleteConfirmId(null);
  };

  const handleTogglePin = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const target = notes.find((n) => n.id === id);
    if (!target) return;

    const updated = await StorageService.updateNote(id, {
      pinned: !target.pinned,
    });
    setNotes(updated);
  };

  const handleCopyNote = async (content: string, id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(id);
      setTimeout(() => setIsCopied(null), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleDownloadNote = (note: QuickNote, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const filename = `${(note.title || 'quick-note').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 40)}.txt`;
    const blob = new Blob([note.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // Filtered and sorted notes list
  const filteredNotes = useMemo(() => {
    let result = [...notes];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.pageTitle?.toLowerCase().includes(q)
      );
    }
    // Sort pinned notes first, then latest updated
    return result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [notes, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#070201] animate-fade-in font-sans text-white select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/60 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-2.5">
          <BrandMark size={28} className="object-contain" />
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-tight text-white leading-tight">
                Quick Notes
              </span>
              <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/30 text-[10px] font-mono text-orange-300 font-semibold">
                {notes.length}
              </span>
            </div>
            <span className="text-[10px] text-white/50 leading-tight">
              Auto-saved &amp; persistent
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* New Note Button */}
          <button
            onClick={handleCreateNewNote}
            title="Create new note"
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-orange-950/40 cursor-pointer active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Note</span>
          </button>

          {/* Close Panel Button */}
          <button
            onClick={onClose}
            title="Close Quick Notes"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Body: Active Editor View vs Notes List */}
      {activeNote ? (
        /* ================= Note Editor View ================= */
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0402]">
          {/* Editor Sub-header Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-black/40 backdrop-blur-md shrink-0">
            <button
              onClick={() => setActiveNoteId(null)}
              className="text-xs text-white/70 hover:text-white flex items-center space-x-1 transition-colors cursor-pointer px-2 py-1 rounded-md hover:bg-white/5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>All Notes ({notes.length})</span>
            </button>

            <div className="flex items-center space-x-1.5">
              {/* Save Status Indicator */}
              <span className="text-[11px] font-mono text-emerald-400/90 flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <Check className="w-3 h-3 text-emerald-400" />
                <span>{saveStatus === 'saving' ? 'Saving...' : 'Saved'}</span>
              </span>

              {/* Pin Action */}
              <button
                onClick={() => handleTogglePin(activeNote.id)}
                title={activeNote.pinned ? 'Unpin note' : 'Pin note to top'}
                className={`p-1.5 rounded-md border transition-all cursor-pointer ${
                  activeNote.pinned
                    ? 'bg-orange-500/25 border-orange-500/40 text-orange-300'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>

              {/* Copy Content */}
              <button
                onClick={(e) => handleCopyNote(editorContent, activeNote.id, e)}
                title="Copy note content"
                className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
              >
                {isCopied === activeNote.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Download File */}
              <button
                onClick={(e) => handleDownloadNote(activeNote, e)}
                title="Download note as text file"
                className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {/* Delete Note */}
              <button
                onClick={(e) => handleDeleteNote(activeNote.id, e)}
                title="Delete note"
                className="p-1.5 rounded-md bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-white/60 hover:text-rose-300 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Associated Page Context Pill (if any) */}
          {activeNote.pageTitle && (
            <div className="px-4 py-1.5 bg-black/30 border-b border-white/5 flex items-center justify-between text-[11px] text-white/60 shrink-0">
              <span className="truncate max-w-[280px]">
                Linked page: <strong className="text-white/85">{activeNote.pageTitle}</strong>
              </span>
              {activeNote.pageUrl && (
                <a
                  href={activeNote.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open source page"
                  className="text-orange-400 hover:text-orange-300 flex items-center space-x-1 shrink-0 ml-2"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Note Title Input */}
          <div className="px-4 pt-3 pb-1 shrink-0">
            <input
              type="text"
              value={editorTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Note title..."
              className="w-full bg-transparent text-base font-bold text-white placeholder-white/30 focus:outline-none border-b border-white/10 pb-2 transition-all focus:border-orange-500/40"
            />
          </div>

          {/* Note Content Textarea */}
          <div className="flex-1 px-4 py-2 overflow-hidden flex flex-col">
            <textarea
              value={editorContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Write your note here... Thoughts, lecture notes, video links, snippets or code..."
              autoFocus
              className="w-full flex-1 bg-transparent resize-none text-xs text-white/90 placeholder-white/30 focus:outline-none leading-relaxed font-sans overflow-y-auto"
            />
          </div>

          {/* Bottom Editor Footer */}
          <div className="px-4 py-2 border-t border-white/10 bg-black/40 flex items-center justify-between text-[10px] text-white/45 shrink-0">
            <span>
              {editorContent.trim() ? `${editorContent.trim().split(/\s+/).length} words` : '0 words'} •{' '}
              {editorContent.length} chars
            </span>
            <span className="font-mono">
              Updated: {formatRelativeTime(activeNote.updatedAt)}
            </span>
          </div>
        </div>
      ) : (
        /* ================= Notes List View ================= */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Input Bar */}
          <div className="px-4 py-2.5 border-b border-white/10 bg-black/40 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="w-full pl-8 pr-8 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-orange-500/50 transition-all font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Notes Cards Scrollable Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center space-y-3 px-6">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shadow-inner">
                  <FileText className="w-6 h-6 stroke-[1.75]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">
                    {searchQuery ? 'No matching notes found' : 'No notes yet'}
                  </h3>
                  <p className="text-xs text-white/50 max-w-xs leading-normal">
                    {searchQuery
                      ? 'Try searching with different keywords.'
                      : 'Create your first quick note to jot down thoughts, ideas, or links while browsing.'}
                  </p>
                </div>
                {!searchQuery && (
                  <button
                    onClick={handleCreateNewNote}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-semibold shadow-md shadow-orange-950/40 cursor-pointer active:scale-95 transition-all flex items-center space-x-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create First Note</span>
                  </button>
                )}
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isDeleteConfirm = deleteConfirmId === note.id;

                return (
                  <div
                    key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    className={`p-3.5 rounded-2xl transition-all cursor-pointer group text-left relative border ${
                      note.pinned
                        ? 'bg-gradient-to-br from-[#1c0c05] to-[#120703] border-orange-500/40 shadow-lg shadow-orange-950/20 hover:border-orange-500/60'
                        : 'bg-black/40 hover:bg-black/60 border-white/10 hover:border-orange-500/30'
                    }`}
                  >
                    {/* Header Row: Title & Actions */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        {note.pinned && (
                          <Pin className="w-3 h-3 text-orange-400 shrink-0 fill-orange-400/20" />
                        )}
                        <h4 className="text-xs font-bold text-white group-hover:text-orange-200 transition-colors truncate">
                          {note.title || 'Untitled Note'}
                        </h4>
                      </div>

                      {/* Quick Hover Actions */}
                      <div className="flex items-center space-x-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        {/* Pin */}
                        <button
                          onClick={(e) => handleTogglePin(note.id, e)}
                          title={note.pinned ? 'Unpin' : 'Pin to top'}
                          className={`p-1 rounded transition-colors ${
                            note.pinned
                              ? 'text-orange-400 hover:text-orange-300'
                              : 'text-white/40 hover:text-white'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                        </button>

                        {/* Copy */}
                        <button
                          onClick={(e) => handleCopyNote(note.content, note.id, e)}
                          title="Copy content"
                          className="p-1 rounded text-white/40 hover:text-white transition-colors"
                        >
                          {isCopied === note.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>

                        {/* Delete with inline confirmation */}
                        {isDeleteConfirm ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center space-x-1 bg-rose-950/80 border border-rose-500/40 px-1.5 py-0.5 rounded text-[10px]"
                          >
                            <span className="text-rose-300">Delete?</span>
                            <button
                              onClick={(e) => handleDeleteNote(note.id, e)}
                              className="text-rose-400 hover:text-rose-200 font-bold px-1"
                            >
                              Yes
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(null);
                              }}
                              className="text-white/60 hover:text-white px-0.5"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(note.id);
                            }}
                            title="Delete note"
                            className="p-1 rounded text-white/40 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Content Snippet */}
                    <p className="text-[11px] text-white/65 line-clamp-2 leading-relaxed mb-2.5">
                      {note.content.trim() || <span className="italic text-white/30">Empty note...</span>}
                    </p>

                    {/* Footer Row: Timestamp & Source Link */}
                    <div className="flex items-center justify-between text-[10px] text-white/45 pt-1 border-t border-white/5">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-2.5 h-2.5 text-white/40" />
                        <span>{formatRelativeTime(note.updatedAt)}</span>
                      </div>

                      {note.pageTitle && (
                        <span
                          className="truncate max-w-[140px] text-orange-400/80 hover:text-orange-300"
                          title={note.pageTitle}
                        >
                          {note.pageTitle}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
