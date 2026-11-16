import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../services/storage.js';

describe('Clipboard (Auto-Clipboard Feature)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await StorageService.clearClipboardItems();
  });

  it('captures and stores new clips with metadata', async () => {
    const list = await StorageService.addClipboardItem(
      'https://github.com/google/gemini',
      'https://github.com',
      'GitHub Repository'
    );

    expect(list).toHaveLength(1);
    expect(list[0].id).toBeTruthy();
    expect(list[0].text).toBe('https://github.com/google/gemini');
    expect(list[0].sourceUrl).toBe('https://github.com');
    expect(list[0].sourceTitle).toBe('GitHub Repository');

    const loaded = await StorageService.getClipboardItems();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].text).toBe('https://github.com/google/gemini');
  });

  it('strictly caps stored clips at maximum 10 items (FIFO / MRU)', async () => {
    // Add 15 different clips
    for (let i = 1; i <= 15; i++) {
      await StorageService.addClipboardItem(`Copied Text #${i}`);
    }

    const all = await StorageService.getClipboardItems();
    expect(all).toHaveLength(10);
    // Newest clip should be at index 0
    expect(all[0].text).toBe('Copied Text #15');
    // Oldest preserved clip in top 10 should be #6
    expect(all[9].text).toBe('Copied Text #6');
  });

  it('deduplicates identical copied text and bumps it to the top', async () => {
    await StorageService.addClipboardItem('First clip');
    await StorageService.addClipboardItem('Second clip');
    await StorageService.addClipboardItem('Third clip');

    expect(await StorageService.getClipboardItems()).toHaveLength(3);

    // Re-copy "First clip"
    const updated = await StorageService.addClipboardItem('First clip');
    expect(updated).toHaveLength(3);
    // "First clip" should now be at the very top (index 0)
    expect(updated[0].text).toBe('First clip');
    expect(updated[1].text).toBe('Third clip');
    expect(updated[2].text).toBe('Second clip');
  });

  it('deletes an individual clip by id', async () => {
    await StorageService.addClipboardItem('Clip A');
    const list = await StorageService.addClipboardItem('Clip B');
    expect(list).toHaveLength(2);

    const targetId = list[0].id; // Clip B
    const remaining = await StorageService.deleteClipboardItem(targetId);

    expect(remaining).toHaveLength(1);
    expect(remaining[0].text).toBe('Clip A');
  });

  it('toggles pinned status on a clip', async () => {
    const list = await StorageService.addClipboardItem('Important Token');
    const id = list[0].id;

    const pinnedList = await StorageService.togglePinClipboardItem(id);
    expect(pinnedList[0].pinned).toBe(true);

    const unpinnedList = await StorageService.togglePinClipboardItem(id);
    expect(unpinnedList[0].pinned).toBe(false);
  });

  it('clears all clips or clears unpinned only', async () => {
    await StorageService.addClipboardItem('Normal 1');
    const l2 = await StorageService.addClipboardItem('Pinned Note');
    await StorageService.togglePinClipboardItem(l2[0].id);
    await StorageService.addClipboardItem('Normal 2');

    expect(await StorageService.getClipboardItems()).toHaveLength(3);

    // Clear unpinned only
    await StorageService.clearClipboardItems(true);
    const afterPreserve = await StorageService.getClipboardItems();
    expect(afterPreserve).toHaveLength(1);
    expect(afterPreserve[0].text).toBe('Pinned Note');

    // Clear all
    await StorageService.clearClipboardItems(false);
    expect(await StorageService.getClipboardItems()).toHaveLength(0);
  });
});
