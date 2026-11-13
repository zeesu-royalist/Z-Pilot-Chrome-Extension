export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh-CN', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'pt', label: 'Portuguese' },
];

export const LANG_LABEL: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l.label])
);

export async function translateText(params: {
  text: string;
  sourceLang: string;
  targetLang: string;
  signal?: AbortSignal;
}): Promise<{ translatedText: string; detectedLang?: string; error?: string }> {
  const { text, sourceLang, targetLang, signal } = params;
  if (!text.trim()) return { translatedText: '' };

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const translatedText = (data[0] as [string][])?.map((s) => s[0]).join('') ?? '';
    const detectedLang: string | undefined = data[2] ?? undefined;
    return { translatedText, detectedLang };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { translatedText: '', error: 'cancelled' };
    console.error('[Translator] Error:', err);
    return { translatedText: '', error: 'Translation failed. Check your connection.' };
  }
}

