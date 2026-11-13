import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '../services/storage.js';
import { translateText, SUPPORTED_LANGUAGES, LANG_LABEL } from '../services/translator.js';

describe('Translator Service & Storage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await StorageService.clearTranslations();
  });

  it('provides supported languages including English, Hindi, and others', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(10);
    expect(LANG_LABEL['en']).toBe('English');
    expect(LANG_LABEL['hi']).toBe('Hindi');
    expect(LANG_LABEL['es']).toBe('Spanish');
  });

  it('translates text using google translate endpoint (mocked fetch)', async () => {
    const mockResponse = [
      [['नमस्ते दुनिया', 'Hello world', null, null]],
      null,
      'en',
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await translateText({
      text: 'Hello world',
      sourceLang: 'en',
      targetLang: 'hi',
    });

    expect(result.translatedText).toBe('नमस्ते दुनिया');
    expect(result.detectedLang).toBe('en');
    fetchSpy.mockRestore();
  });

  it('returns empty text when input text is empty or whitespace', async () => {
    const result = await translateText({
      text: '   ',
      sourceLang: 'en',
      targetLang: 'hi',
    });

    expect(result.translatedText).toBe('');
  });

  it('saves translations and retrieves them from storage', async () => {
    const saved = await StorageService.saveTranslation({
      sourceText: 'Hello',
      translatedText: 'नमस्ते',
      sourceLang: 'en',
      targetLang: 'hi',
    });

    expect(saved.id).toBeTruthy();
    expect(saved.sourceText).toBe('Hello');
    expect(saved.translatedText).toBe('नमस्ते');

    const all = await StorageService.getTranslations();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(saved.id);
  });

  it('toggles favorite and deletes translations', async () => {
    const t1 = await StorageService.saveTranslation({
      sourceText: 'Good morning',
      translatedText: 'शुभ प्रभात',
      sourceLang: 'en',
      targetLang: 'hi',
    });

    // Toggle favorite
    const afterFav = await StorageService.toggleFavTranslation(t1.id);
    expect(afterFav[0].favorite).toBe(true);

    // Delete
    const afterDelete = await StorageService.deleteTranslation(t1.id);
    expect(afterDelete).toHaveLength(0);
  });

  it('clears all translations', async () => {
    await StorageService.saveTranslation({
      sourceText: 'One',
      translatedText: 'एक',
      sourceLang: 'en',
      targetLang: 'hi',
    });
    await StorageService.saveTranslation({
      sourceText: 'Two',
      translatedText: 'दो',
      sourceLang: 'en',
      targetLang: 'hi',
    });

    expect(await StorageService.getTranslations()).toHaveLength(2);
    await StorageService.clearTranslations();
    expect(await StorageService.getTranslations()).toHaveLength(0);
  });
});

