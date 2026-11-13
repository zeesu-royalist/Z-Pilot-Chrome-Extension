import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../services/storage.js';

describe('ClipBot (Auto-Clipboard Feature)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await StorageService.clearClipbotItems();
  });

  it('captures and stores new clips with metadata', async () => {
    const list = await StorageService.addClipbotItem(
      'https://github.com/google/gemini',
      'https://github.com',
      'GitHub Repository'
    );

    expect(list).toHaveLength(1);
    expect(list[0].id).toBeTruthy();
    expect(list[0].text).toBe('https://github.com/google/gemini');
    expect(list[0].sourceUrl).toBe('https://github.com');
    expect(list[0].sourceTitle).toBe('GitHub Repository');

    const loaded = await StorageService.getClipbotItems();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].text).toBe('https://github.com/google/gemini');
  });

  it('strictly caps stored clips at maximum 10 items (FIFO / MRU)', async () => {
    // Add 15 different clips
    for (let i = 1; i <= 15; i++) {
      await StorageService.addClipbotItem(`Copied Text #${i}`);
    }

    const all = await StorageService.getClipbotItems();
    expect(all).toHaveLength(10);
    // Newest clip should be at index 0
    expect(all[0].text).toBe('Copied Text #15');
    // Oldest preserved clip in top 10 should be #6
    expect(all[9].text).toBe('Copied Text #6');
  });

  it('deduplicates identical copied text and bumps it to the top', async () => {
    await StorageService.addClipbotItem('First clip');
    await StorageService.addClipbotItem('Second clip');
    await StorageService.addClipbotItem('Third clip');

    expect(await StorageService.getClipbotItems()).toHaveLength(3);

    // Re-copy "First clip"
    const updated = await StorageService.addClipbotItem('First clip');
    expect(updated).toHaveLength(3);
    // "First clip" should now be at the very top (index 0)
    expect(updated[0].text).toBe('First clip');
    expect(updated[1].text).toBe('Third clip');
    expect(updated[2].text).toBe('Second clip');
  });

  it('deletes an individual clip by id', async () => {
    await StorageService.addClipbotItem('Clip A');
    const list = await StorageService.addClipbotItem('Clip B');
    expect(list).toHaveLength(2);

    const targetId = list[0].id; // Clip B
    const remaining = await StorageService.deleteClipbotItem(targetId);

    expect(remaining).toHaveLength(1);
    expect(remaining[0].text).toBe('Clip A');
  });

  it('toggles pinned status on a clip', async () => {
    const list = await StorageService.addClipbotItem('Important Token');
    const id = list[0].id;

    const pinnedList = await StorageService.togglePinClipbotItem(id);
    expect(pinnedList[0].pinned).toBe(true);

    const unpinnedList = await StorageService.togglePinClipbotItem(id);
    expect(unpinnedList[0].pinned).toBe(false);
  });

  it('clears all clips or clears unpinned only', async () => {
    await StorageService.addClipbotItem('Normal 1');
    const l2 = await StorageService.addClipbotItem('Pinned Note');
    await StorageService.togglePinClipbotItem(l2[0].id);
    await StorageService.addClipbotItem('Normal 2');

    expect(await StorageService.getClipbotItems()).toHaveLength(3);

    // Clear unpinned only
    await StorageService.clearClipbotItems(true);
    const afterPreserve = await StorageService.getClipbotItems();
    expect(afterPreserve).toHaveLength(1);
    expect(afterPreserve[0].text).toBe('Pinned Note');

    // Clear all
    await StorageService.clearClipbotItems(false);
    expect(await StorageService.getClipbotItems()).toHaveLength(0);
  });
});
