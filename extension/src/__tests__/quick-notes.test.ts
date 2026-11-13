import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../services/storage.js';

describe('Quick Notes Feature', () => {
  beforeEach(async () => {
    localStorage.clear();
    await StorageService.saveNotes([]);
  });

  it('creates and persists a new quick note with title and content', async () => {
    const note = await StorageService.addNote({
      title: 'Key Insights from Apna College',
      content: 'Learn Python fundamentals, Anaconda setup, Conda prompts and Jupyter Lab.',
      pageUrl: 'https://apnacollege.in/course/python',
      pageTitle: 'Apna College Python Course',
    });

    expect(note.id).toBeTruthy();
    expect(note.title).toBe('Key Insights from Apna College');
    expect(note.content).toContain('Learn Python fundamentals');
    expect(note.pageTitle).toBe('Apna College Python Course');

    const all = await StorageService.getNotes();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(note.id);
  });

  it('auto-derives title from first line when title is not provided', async () => {
    const note = await StorageService.addNote({
      content: 'Important meeting at 5 PM\nDiscuss new chrome extension features and deployment.',
    });

    expect(note.title).toBe('Important meeting at 5 PM');
  });

  it('updates an existing note with new content and pin status', async () => {
    const note = await StorageService.addNote({
      title: 'Initial Note',
      content: 'Initial Content',
    });

    const updatedList = await StorageService.updateNote(note.id, {
      content: 'Updated Content with code snippet',
      pinned: true,
    });

    expect(updatedList).toHaveLength(1);
    expect(updatedList[0].content).toBe('Updated Content with code snippet');
    expect(updatedList[0].pinned).toBe(true);
  });

  it('deletes an existing note', async () => {
    const note1 = await StorageService.addNote({ title: 'Note 1', content: 'C1' });
    const note2 = await StorageService.addNote({ title: 'Note 2', content: 'C2' });

    expect(await StorageService.getNotes()).toHaveLength(2);

    const remaining = await StorageService.deleteNote(note1.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(note2.id);
  });
});
