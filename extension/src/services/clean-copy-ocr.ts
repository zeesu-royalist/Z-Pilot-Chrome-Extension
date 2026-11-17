/**
 * Z-Pilot "Clean Copy" Studio & Instant Text/Image Extractor (OCR)
 * 100% Client-Side Text Engineering & Multimodal Vision Extraction
 */

import {
  CaseStyle,
  CleanCopyOptions,
  DetectedPageImage,
  OcrExtractMode,
  OcrExtractionResult,
  TextStats,
  WebpageVideoFrame,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// 1. "CLEAN COPY" TEXT REFINEMENT ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * List of known tracking query parameter names to strip from URLs
 */
export const TRACKING_PARAM_KEYS = new Set([
  // Google / UTM
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_reader',
  'utm_viz_id',
  'utm_pubreferrer',
  'utm_swu',
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  // Facebook / Instagram / Meta
  'fbclid',
  'igshid',
  '_hsenc',
  '_hsmi',
  // Twitter / X
  'twclid',
  // Microsoft / Bing
  'msclkid',
  // Mailchimp / Email
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  // YouTube share tracking
  'si',
  'feature',
  // Generic tracking / referral junk
  'ref',
  'ref_src',
  'ref_url',
  'spm',
  'trk',
  'trackingid',
  'aff_id',
  'affiliate',
  'zanpid',
]);

/**
 * Strips all marketing, tracking, and analytics query parameters from URLs found in text
 */
export function stripTrackingUrls(text: string): string {
  if (!text) return '';

  // Match HTTP and HTTPS URLs
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;

  return text.replace(urlRegex, (matchedUrl) => {
    try {
      // Clean trailing punctuation attached to URLs in prose (e.g. "https://example.com/.")
      let trailingPunct = '';
      let cleanUrl = matchedUrl;

      const punctMatch = cleanUrl.match(/[.,;:!?)]+$/);
      if (punctMatch) {
        trailingPunct = punctMatch[0];
        cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
      }

      const urlObj = new URL(cleanUrl);
      const params = new URLSearchParams(urlObj.search);
      let removedAny = false;

      // Check and remove tracking keys
      for (const key of Array.from(params.keys())) {
        if (TRACKING_PARAM_KEYS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
          params.delete(key);
          removedAny = true;
        }
      }

      if (!removedAny) {
        return matchedUrl;
      }

      const newSearch = params.toString();
      urlObj.search = newSearch ? `?${newSearch}` : '';

      return urlObj.toString() + trailingPunct;
    } catch {
      // If URL parsing fails, return as-is
      return matchedUrl;
    }
  });
}

/**
 * Unwraps broken lines in copied text (e.g. from PDFs, OCR, terminal logs, emails)
 * while strictly preserving true paragraph breaks, lists, code fences, and headings.
 */
export function unwrapBrokenLines(text: string): string {
  if (!text) return '';

  // Normalize Windows \r\n to \n
  const normalized = text.replace(/\r\n/g, '\n');

  // Split text into distinct paragraphs separated by 2 or more newlines
  const paragraphs = normalized.split(/\n{2,}/);

  const unwrappedParagraphs = paragraphs.map((para) => {
    // If paragraph contains code fences or markdown tables, preserve formatting
    if (para.includes('```') || /^\s*\|.+\|\s*$/m.test(para)) {
      return para;
    }

    const lines = para.split('\n');
    let merged = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if current line is a bullet item, numbered list, blockquote, or heading
      const isListItem = /^[-*+•]\s+/.test(line);
      const isNumberedItem = /^\d+[.)]\s+/.test(line);
      const isHeading = /^#{1,6}\s+/.test(line);
      const isQuote = /^>\s*/.test(line);

      if (i === 0) {
        merged = line;
      } else {
        const prevEndsWithHyphen = merged.endsWith('-');

        if (isListItem || isNumberedItem || isHeading || isQuote) {
          // Keep on a new line
          merged += '\n' + line;
        } else if (prevEndsWithHyphen && /^[a-z]/i.test(line)) {
          // Merge hyphenated word (e.g. "inter-\nnational" -> "international")
          merged = merged.slice(0, -1) + line;
        } else {
          // Join with space
          merged += ' ' + line;
        }
      }
    }

    return merged;
  });

  return unwrappedParagraphs.join('\n\n');
}

/**
 * Cleans smart quotes, zero-width characters, Wikipedia citations, and formatting clutter
 */
export function cleanQuotesAndChars(
  text: string,
  options: {
    stripCitations?: boolean;
    stripQuotesPrefix?: boolean;
    normalizeQuotes?: boolean;
  } = {}
): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Normalize smart/curly quotes and dashes
  if (options.normalizeQuotes !== false) {
    cleaned = cleaned
      .replace(/[“”„«»]/g, '"')
      .replace(/[‘’‚‹›]/g, "'")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-');
  }

  // 2. Remove zero-width spaces, invisible unicode, and non-breaking spaces
  cleaned = cleaned
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');

  // 3. Remove Wikipedia / academic citation tags like [1], [citation needed], [edit]
  if (options.stripCitations !== false) {
    cleaned = cleaned
      .replace(/\[\d+\]/g, '')
      .replace(/\[(?:citation needed|edit|note \d+)\]/gi, '');
  }

  // 4. Remove email quote markers at line starts (> or >>)
  if (options.stripQuotesPrefix !== false) {
    cleaned = cleaned
      .split('\n')
      .map((line) => line.replace(/^[ \t]*>+[ \t]?/, ''))
      .join('\n');
  }

  // 5. Normalize multiple horizontal spaces into single space, trim line ends
  cleaned = cleaned
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n');

  // 6. Collapse excessive blank lines to max 2
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

/**
 * Clean conversion of HTML markup to clean, crisp Markdown
 */
export function convertHtmlToMarkdown(html: string): string {
  if (!html) return '';

  // If text doesn't contain HTML tags, return as-is
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html;
  }

  let md = html;

  // Remove scripts, styles, and noscript tags completely
  md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  md = md.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  // Preformatted and Code blocks
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Bold & Italic
  md = md.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  md = md.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');

  // Links
  md = md.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // List items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  md = md.replace(/<\/(?:ul|ol)>/gi, '\n');

  // Paragraphs and breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '\n$1');

  // Strip any remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Clean extra blank lines
  return md.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Transforms text case (Title Case, Sentence case, UPPERCASE, lowercase, camelCase, snake_case, kebab-case)
 */
export function transformCase(text: string, style: CaseStyle): string {
  if (!text) return '';

  switch (style) {
    case 'upper':
      return text.toUpperCase();

    case 'lower':
      return text.toLowerCase();

    case 'sentence': {
      // Capitalize first character of text and after each terminal punctuation
      return text.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, prefix, char) => {
        return prefix + char.toUpperCase();
      });
    }

    case 'title': {
      const minorWords = new Set([
        'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with', 'over', 'into', 'from'
      ]);

      return text
        .toLowerCase()
        .split('\n')
        .map((line) => {
          const words = line.split(' ');
          return words
            .map((word, idx) => {
              if (!word) return word;
              const lower = word.toLowerCase();
              if (idx > 0 && idx < words.length - 1 && minorWords.has(lower)) {
                return lower;
              }
              return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
        })
        .join('\n');
    }

    case 'camel': {
      const clean = text.replace(/[^a-zA-Z0-9\s_-]/g, ' ');
      const words = clean.split(/[\s_-]+/).filter(Boolean);
      if (words.length === 0) return '';
      return (
        words[0].toLowerCase() +
        words
          .slice(1)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('')
      );
    }

    case 'snake': {
      return text
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    }

    case 'kebab': {
      return text
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    }

    default:
      return text;
  }
}

/**
 * Calculates live text statistics: characters, words, sentences, reading time
 */
export function getTextStats(text: string): TextStats {
  if (!text || !text.trim()) {
    return {
      charactersWithSpaces: 0,
      charactersNoSpaces: 0,
      words: 0,
      sentences: 0,
      paragraphs: 0,
      readingTimeMinutes: 0,
    };
  }

  const charsWith = text.length;
  const charsNo = text.replace(/\s/g, '').length;

  const wordsArray = text.trim().match(/\b[^\s]+\b/g) || [];
  const words = wordsArray.length;

  const sentencesArray = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
  const sentences = Math.max(1, sentencesArray.length);

  const paragraphsArray = text.split(/\n+/).filter((p) => p.trim().length > 0);
  const paragraphs = Math.max(1, paragraphsArray.length);

  // Average reading speed: 200 words per minute
  const readingTimeMinutes = Math.max(0.1, Math.round((words / 200) * 10) / 10);

  return {
    charactersWithSpaces: charsWith,
    charactersNoSpaces: charsNo,
    words,
    sentences,
    paragraphs,
    readingTimeMinutes,
  };
}

/**
 * Master multi-rule text cleaner: combines URL stripping, line unwrapping, quote standardization, etc.
 */
export function cleanAllText(text: string, options: CleanCopyOptions = {}): string {
  if (!text) return '';

  let result = text;

  // 1. Convert HTML to Markdown if text is HTML
  if (options.convertHtmlToMarkdown || /<[a-z][\s\S]*>/i.test(result)) {
    result = convertHtmlToMarkdown(result);
  }

  // 2. Strip tracking parameters from all URLs
  if (options.stripTrackingUrls !== false) {
    result = stripTrackingUrls(result);
  }

  // 3. Unwrap broken lines
  if (options.unwrapLines !== false) {
    result = unwrapBrokenLines(result);
  }

  // 4. Standardize quotes, invisible chars, remove citations
  result = cleanQuotesAndChars(result, {
    stripCitations: options.stripCitations !== false,
    stripQuotesPrefix: options.stripQuotesPrefix !== false,
    normalizeQuotes: options.cleanQuotesAndChars !== false,
  });

  // 5. Apply Case transformation if requested
  if (options.caseStyle) {
    result = transformCase(result, options.caseStyle);
  }

  return result.trim();
}

// ═══════════════════════════════════════════════════════════════
// 2. MULTIMODAL VISION OCR ENGINE (IMAGE & VIDEO FRAMES)
// ═══════════════════════════════════════════════════════════════

/**
 * Builds custom prompts for multimodal Gemini OCR based on chosen extraction mode
 */
export function buildOcrPrompt(mode: OcrExtractMode, targetLang: string = 'English'): string {
  switch (mode) {
    case 'markdown':
      return `Extract all text, numbers, headings, tables, and lists from this image or video frame. Format everything in clean, structured GitHub Flavored Markdown. If there are tables or charts, format them as Markdown tables. Do NOT add conversational preamble or conclusion. Return only the extracted markdown.`;

    case 'translate':
      return `Extract all text and subtitles from this image or video frame, and translate it accurately into ${targetLang}. Preserve the original structure and formatting. Return only the translated text.`;

    case 'code':
      return `Extract any programming code, JSON, configuration, terminal commands, or structured syntax shown in this image or video frame. Output in clean markdown code blocks with correct language identifiers (e.g. \`\`\`typescript, \`\`\`python). Do NOT add extra chit-chat.`;

    case 'summarize':
      return `Analyze and extract the key information, main points, and text from this image or video frame. Present the extracted content as a concise bullet-point summary.`;

    case 'raw':
    default:
      return `Extract all visible text, letters, numbers, handwriting, or subtitles in this image or video frame verbatim with exact spelling, punctuation, and capitalization. Do NOT add conversational introduction or explanation. Return only the exact text found.`;
  }
}

/**
 * Sends image or video frame base64 data to Gemini Multimodal API for high-precision OCR
 */
export async function extractTextWithGeminiVision(params: {
  apiKey: string;
  base64Data: string; // can be data URL or pure base64
  mimeType?: string;
  mode?: OcrExtractMode;
  targetLang?: string;
  sourceType?: 'image' | 'video' | 'screen';
  signal?: AbortSignal;
}): Promise<OcrExtractionResult> {
  const {
    apiKey,
    base64Data,
    mode = 'raw',
    targetLang = 'English',
    sourceType = 'image',
    signal,
  } = params;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API key is required for OCR extraction. Please configure your key in Settings.');
  }

  // Parse mime type and clean pure base64 string
  let mimeType = params.mimeType || 'image/jpeg';
  let cleanBase64 = base64Data;

  const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    cleanBase64 = dataUrlMatch[2];
  } else if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
    try {
      const imgRes = await fetch(base64Data);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        if (blob.type) {
          mimeType = blob.type;
        }
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
          binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        cleanBase64 = btoa(binary);
      }
    } catch {
      // If direct fetch fails, proceed with fallback
    }
  }

  const promptText = buildOcrPrompt(mode, targetLang);

  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite',
  ];

  let lastError: Error | null = null;

  for (const modelName of candidateModels) {
    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim(),
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
        signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const rawErr = errJson?.error?.message || response.statusText;

        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid Gemini API Key. Please verify your key in Settings.');
        }
        if (response.status === 429) {
          throw new Error('Gemini API quota exceeded. Please wait a moment and try again.');
        }

        // Try next candidate model if 503 or 404
        if (response.status === 503 || response.status === 404) {
          continue;
        }

        throw new Error(rawErr || `OCR Request failed with status ${response.status}`);
      }

      const resData = await response.json();
      const extractedText =
        resData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

      if (!extractedText) {
        return {
          text: 'No readable text was detected in the provided image or video frame.',
          mode,
          sourceType,
          isAiGenerated: true,
          timestamp: Date.now(),
        };
      }

      return {
        text: extractedText,
        mode,
        sourceType,
        isAiGenerated: true,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('Failed to extract text using Gemini Vision.');
}

/**
 * Capture visible browser tab as an image using Chrome extension API
 */
export async function captureTabScreenshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        reject(new Error('Chrome runtime extension API not available'));
        return;
      }

      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (res && res.ok && res.dataUrl) {
          resolve(res.dataUrl);
        } else {
          reject(new Error(res?.error || 'Failed to capture browser tab screenshot'));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Requests content script on active tab to capture current video frame & subtitles
 */
export async function captureActiveVideoFrame(): Promise<WebpageVideoFrame> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        reject(new Error('Chrome tabs API not available'));
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          reject(new Error('No active browser tab found'));
          return;
        }

        chrome.tabs.sendMessage(
          activeTab.id,
          { type: 'CAPTURE_VIDEO_FRAME' },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(
                new Error(
                  'Could not communicate with webpage. Try reloading the page first.'
                )
              );
              return;
            }

            if (response && response.ok && response.dataUrl) {
              resolve({
                dataUrl: response.dataUrl,
                videoTitle: response.videoTitle || activeTab.title,
                currentTime: response.currentTime,
                duration: response.duration,
                width: response.width,
                height: response.height,
                domSubtitles: response.domSubtitles || [],
              });
            } else {
              reject(
                new Error(response?.error || 'No active video found on this webpage.')
              );
            }
          }
        );
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Requests detected images on active tab from content script
 */
export async function getDetectedPageImages(): Promise<DetectedPageImage[]> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        resolve([]);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          resolve([]);
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_IMAGES' }, (res) => {
          if (chrome.runtime.lastError || !res || !Array.isArray(res.images)) {
            resolve([]);
          } else {
            resolve(res.images);
          }
        });
      });
    } catch {
      resolve([]);
    }
  });
}
