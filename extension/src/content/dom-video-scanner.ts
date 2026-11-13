import type { RawDomVideoCandidate } from '../services/video-deduper.js';
import { isGenericTitle } from '../services/video-deduper.js';
import type { VideoFormatKind } from '../types/index.js';

const MEDIA_EXT_REGEX =
  /\.(mp4|m4v|webm|mov|m3u8|mpd|mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)/i;
const SCRIPT_MEDIA_URL_REGEX =
  /https?:(?:\\\/|\/){2}(?:[^\s"'<>\\]|\\\/|\\u0026)+\.(?:mp4|m4v|webm|m3u8|mp3|m4a|wav|aac|ogg)(?:\\?\?(?:[^\s"'<>\\]|\\\/|\\u0026)*)?/gi;

const MAX_SHADOW_DEPTH = 4;
const MAX_DOM_NODES_VISITED = 2500;
const MAX_SCRIPT_CHARS_PER_TAG = 120000;
const MAX_TOTAL_SCRIPT_CHARS = 300000;

function inferFormat(url: string, mimeType?: string): VideoFormatKind {
  const clean = url.toLowerCase().split('?')[0];
  if (clean.endsWith('.m3u8') || mimeType?.includes('mpegurl')) return 'hls';
  if (clean.endsWith('.mpd') || mimeType?.includes('dash+xml')) return 'dash';
  if (clean.endsWith('.webm') || mimeType?.includes('webm')) return 'webm';
  if (clean.endsWith('.mov') || mimeType?.includes('quicktime')) return 'mov';
  if (
    clean.endsWith('.mp3') ||
    clean.endsWith('.m4a') ||
    clean.endsWith('.aac') ||
    clean.endsWith('.wav') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.opus') ||
    clean.endsWith('.flac') ||
    mimeType?.startsWith('audio/')
  ) {
    return 'audio';
  }
  return 'mp4';
}

function resolveAbsoluteUrl(raw: string | null | undefined, baseHref: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'about:blank') return '';
  if (trimmed.startsWith('blob:')) return trimmed;
  try {
    const resolved = new URL(trimmed, baseHref).toString();
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      return resolved;
    }
    return '';
  } catch {
    return '';
  }
}


export function cleanTitleText(raw?: string): string {
  if (!raw) return '';
  let text = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  text = text
    .replace(/\b(video|audio|play|completed|locked|unlocked|preview)\b/gi, '')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    .replace(/[▶►|•·]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export function extractTitleFromUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    const pathname = decodeURIComponent(parsed.pathname);
    const lastSlash = pathname.lastIndexOf('/');
    const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
    const dot = filename.lastIndexOf('.');
    const base = (dot > 0 ? filename.slice(0, dot) : filename).trim();
    if (!base || base.length < 3 || isGenericTitle(base)) return undefined;
    const clean = base
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (isGenericTitle(clean)) return undefined;
    return clean.replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return undefined;
  }
}

export function extractBestPageVideoTitle(
  doc: Document = document,
  baseHref: string = typeof window !== 'undefined' ? window.location.href : ''
): string {
  // 1. Look for active syllabus / lesson / playlist item in LMS / course players (Apna College, Coursera, etc.)
  const activeSelectors = [
    '[class*="active"][class*="lesson"]',
    '[class*="active"][class*="video"]',
    '[class*="active"][class*="lecture"]',
    '[class*="active"][class*="item"]',
    '[class*="active"][class*="topic"]',
    '[class*="selected"][class*="lesson"]',
    '[class*="selected"][class*="video"]',
    '[class*="current"][class*="lesson"]',
    '[class*="current"][class*="video"]',
    '[aria-current="page"]',
    '[aria-current="true"]',
    '[aria-selected="true"]',
    '.active [class*="title"]',
    '[class*="active"] [class*="title"]',
    '[class*="is-active"]',
    '[class*="playing"]',
  ];

  for (const sel of activeSelectors) {
    try {
      const el = doc.querySelector(sel);
      if (el) {
        const text = cleanTitleText(el.textContent || '');
        if (text && text.length >= 3 && !isGenericTitle(text, baseHref)) {
          return text;
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Look for primary heading / video title in the DOM
  const headingSelectors = [
    'h1[class*="title"]',
    'h1[class*="lesson"]',
    'h1[class*="video"]',
    'h1[class*="lecture"]',
    '[class*="video-title"]',
    '[class*="videoTitle"]',
    '[class*="lesson-title"]',
    '[class*="lessonTitle"]',
    '[class*="lecture-title"]',
    '[class*="lectureTitle"]',
    '[data-testid*="video-title"]',
    '[data-testid*="lesson-title"]',
    'main h1',
    'article h1',
    '[role="main"] h1',
    '.content h1',
    'h1',
    'h2[class*="title"]',
    'h2[class*="lesson"]',
    'h2[class*="video"]',
  ];

  for (const sel of headingSelectors) {
    try {
      const el = doc.querySelector(sel);
      if (el) {
        const text = cleanTitleText(el.textContent || '');
        if (text && text.length >= 3 && !isGenericTitle(text, baseHref)) {
          return text;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Inspect <video> element attributes & container headings
  const videos = doc.querySelectorAll('video');
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const attrTitle =
      v.getAttribute('title') ||
      v.getAttribute('aria-label') ||
      v.getAttribute('data-title') ||
      v.getAttribute('data-lesson-title');
    if (attrTitle) {
      const text = cleanTitleText(attrTitle);
      if (text && !isGenericTitle(text, baseHref)) return text;
    }

    const figCaption = v.closest('figure')?.querySelector('figcaption')?.textContent;
    if (figCaption) {
      const text = cleanTitleText(figCaption);
      if (text && !isGenericTitle(text, baseHref)) return text;
    }

    const container = v.closest('[class*="player"], [class*="video"], [class*="media"]')?.parentElement;
    if (container) {
      const heading = container.querySelector('h1, h2, h3, [class*="title"]')?.textContent;
      if (heading) {
        const text = cleanTitleText(heading);
        if (text && !isGenericTitle(text, baseHref)) return text;
      }
    }
  }

  // 4. Meta tags (og:title, twitter:title)
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle) {
    const text = cleanTitleText(ogTitle);
    if (text && !isGenericTitle(text, baseHref)) return text;
  }
  const twTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
  if (twTitle) {
    const text = cleanTitleText(twTitle);
    if (text && !isGenericTitle(text, baseHref)) return text;
  }

  // 5. Clean document title (strip brand suffix if delimited by | or - or •)
  const rawDocTitle = doc.title?.trim() || '';
  if (rawDocTitle) {
    const parts = rawDocTitle.split(/\s*[-|—•»·:]\s*/).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        const cleanedPart = cleanTitleText(part);
        if (cleanedPart && !isGenericTitle(cleanedPart, baseHref)) {
          return cleanedPart;
        }
      }
    }
    const cleanDoc = cleanTitleText(rawDocTitle);
    if (cleanDoc && !isGenericTitle(cleanDoc, baseHref)) {
      return cleanDoc;
    }
  }

  // 6. Fallback to URL path title
  const urlTitle = extractTitleFromUrl(baseHref);
  if (urlTitle) return urlTitle;

  return rawDocTitle || 'Web Video';
}

/**
 * Collect <video> and <audio> elements across Document + open ShadowRoots (bounded for O(N) safety)
 */
function collectMediaElements(root: Document | ShadowRoot): {
  videos: HTMLVideoElement[];
  audios: HTMLAudioElement[];
} {
  const videos: HTMLVideoElement[] = [];
  const audios: HTMLAudioElement[] = [];
  const seenVideos = new Set<HTMLVideoElement>();
  const seenAudios = new Set<HTMLAudioElement>();
  let visited = 0;

  const walk = (nodeRoot: Document | ShadowRoot, depth: number) => {
    if (depth > MAX_SHADOW_DEPTH || visited > MAX_DOM_NODES_VISITED) return;

    const directVideos = nodeRoot.querySelectorAll('video');
    for (let i = 0; i < directVideos.length; i++) {
      const v = directVideos[i] as HTMLVideoElement;
      if (!seenVideos.has(v)) {
        seenVideos.add(v);
        videos.push(v);
      }
    }

    const directAudios = nodeRoot.querySelectorAll('audio');
    for (let i = 0; i < directAudios.length; i++) {
      const a = directAudios[i] as HTMLAudioElement;
      if (!seenAudios.has(a)) {
        seenAudios.add(a);
        audios.push(a);
      }
    }

    if (depth < MAX_SHADOW_DEPTH) {
      const all = nodeRoot.querySelectorAll('*');
      for (let i = 0; i < all.length && visited < MAX_DOM_NODES_VISITED; i++) {
        visited++;
        const shadow = (all[i] as HTMLElement).shadowRoot;
        if (shadow) {
          walk(shadow, depth + 1);
        }
      }
    }
  };

  walk(root, 0);
  return { videos, audios };
}

/**
 * Extract downloadable video and audio candidates from a Document (DOM, Shadow DOM, Meta tags, JSON-LD, Scripts)
 */
export function scanDocumentVideos(
  doc: Document = document,
  baseHref: string = typeof window !== 'undefined' ? window.location.href : 'https://localhost/'
): RawDomVideoCandidate[] {
  const results: RawDomVideoCandidate[] = [];
  const seenUrls = new Set<string>();
  const pageVideoTitle = extractBestPageVideoTitle(doc, baseHref);
  const fallbackTitle = pageVideoTitle || doc.title?.trim() || 'Web Video';
  const pageTitle = fallbackTitle;

  const pushCandidate = (candidate: RawDomVideoCandidate) => {
    if (!candidate.url) return;
    if (seenUrls.has(candidate.url)) return;
    seenUrls.add(candidate.url);
    results.push(candidate);
  };

  const { videos, audios } = collectMediaElements(doc);

  // 1a. Inspect <video> elements & nested <source> tags
  videos.forEach((video) => {
    const poster = resolveAbsoluteUrl(video.getAttribute('poster'), baseHref) || undefined;
    const width = video.videoWidth || Number(video.getAttribute('width')) || undefined;
    const height = video.videoHeight || Number(video.getAttribute('height')) || undefined;
    const durationSeconds =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
    const attrTitle =
      video.getAttribute('title') ||
      video.getAttribute('aria-label') ||
      video.getAttribute('data-title') ||
      video.getAttribute('data-lesson-title');
    const cleanedAttr = cleanTitleText(attrTitle || '');
    const title = cleanedAttr && !isGenericTitle(cleanedAttr, baseHref) ? cleanedAttr : fallbackTitle;

    const srcCandidates: Array<{ url: string; type?: string }> = [];

    if (video.currentSrc) {
      srcCandidates.push({ url: video.currentSrc });
    }
    const attrSrc = video.getAttribute('src');
    if (attrSrc) {
      srcCandidates.push({ url: attrSrc });
    }

    const sources = video.querySelectorAll('source');
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const sUrl = s.getAttribute('src') || s.getAttribute('data-src');
      if (sUrl) {
        srcCandidates.push({ url: sUrl, type: s.getAttribute('type') || undefined });
      }
    }

    // Check common lazy-loading data attributes on <video>
    for (const attr of ['data-src', 'data-video-src', 'data-mp4', 'data-hls']) {
      const val = video.getAttribute(attr);
      if (val) srcCandidates.push({ url: val });
    }

    for (const sc of srcCandidates) {
      const resolved = resolveAbsoluteUrl(sc.url, baseHref);
      if (!resolved || resolved.startsWith('blob:')) continue;
      pushCandidate({
        url: resolved,
        title,
        format: inferFormat(resolved, sc.type),
        mimeType: sc.type,
        width,
        height,
        durationSeconds,
        thumbnailUrl: poster,
        source: 'dom',
      });
    }
  });

  // 1b. Inspect <audio> elements & nested <source> tags
  audios.forEach((audio) => {
    const durationSeconds =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined;
    const title =
      audio.getAttribute('title') ||
      audio.getAttribute('aria-label') ||
      `${pageTitle} (Audio)`;

    const srcCandidates: Array<{ url: string; type?: string }> = [];
    if (audio.currentSrc) {
      srcCandidates.push({ url: audio.currentSrc });
    }
    const attrSrc = audio.getAttribute('src');
    if (attrSrc) {
      srcCandidates.push({ url: attrSrc });
    }

    const sources = audio.querySelectorAll('source');
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const sUrl = s.getAttribute('src') || s.getAttribute('data-src');
      if (sUrl) {
        srcCandidates.push({ url: sUrl, type: s.getAttribute('type') || undefined });
      }
    }

    for (const attr of ['data-src', 'data-audio-src', 'data-mp3', 'data-m4a']) {
      const val = audio.getAttribute(attr);
      if (val) srcCandidates.push({ url: val });
    }

    for (const sc of srcCandidates) {
      const resolved = resolveAbsoluteUrl(sc.url, baseHref);
      if (!resolved || resolved.startsWith('blob:')) continue;
      pushCandidate({
        url: resolved,
        title,
        format: 'audio',
        mimeType: sc.type || 'audio/mpeg',
        durationSeconds,
        source: 'dom',
      });
    }
  });

  // 2. OpenGraph & Twitter Card video/audio meta tags
  const metaSelectors = [
    'meta[property="og:video"]',
    'meta[property="og:video:url"]',
    'meta[property="og:video:secure_url"]',
    'meta[property="og:audio"]',
    'meta[property="og:audio:secure_url"]',
    'meta[name="twitter:player:stream"]',
  ];
  const ogTitle =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || pageTitle;
  const ogImage = resolveAbsoluteUrl(
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    baseHref
  ) || undefined;

  for (const sel of metaSelectors) {
    const metas = doc.querySelectorAll(sel);
    for (let i = 0; i < metas.length; i++) {
      const content = metas[i].getAttribute('content');
      const resolved = resolveAbsoluteUrl(content, baseHref);
      if (!resolved) continue;
      // Only include direct media files/streams from og:video / og:audio (skip HTML embed player pages)
      if (!MEDIA_EXT_REGEX.test(resolved)) continue;
      pushCandidate({
        url: resolved,
        title: ogTitle,
        format: inferFormat(resolved),
        thumbnailUrl: ogImage,
        source: 'meta',
      });
    }
  }

  // 3. JSON-LD VideoObject / AudioObject structured data
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    const rawJson = jsonLdScripts[i].textContent;
    if (!rawJson || rawJson.length > 100000) continue;
    try {
      const parsed = JSON.parse(rawJson);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
        ? parsed['@graph']
        : [parsed];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'];
        const isMediaObj =
          type === 'VideoObject' ||
          type === 'AudioObject' ||
          (Array.isArray(type) && (type.includes('VideoObject') || type.includes('AudioObject')));
        if (!isMediaObj) continue;

        const contentUrl = resolveAbsoluteUrl(item.contentUrl, baseHref);
        if (contentUrl) {
          pushCandidate({
            url: contentUrl,
            title: typeof item.name === 'string' ? item.name.trim() : ogTitle,
            format: inferFormat(contentUrl),
            thumbnailUrl:
              typeof item.thumbnailUrl === 'string'
                ? resolveAbsoluteUrl(item.thumbnailUrl, baseHref) || ogImage
                : ogImage,
            source: 'meta',
          });
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  // 4. Direct video & audio anchor links
  const mediaLinks = doc.querySelectorAll(
    'a[href*=".mp4"], a[href*=".webm"], a[href*=".m3u8"], a[href*=".mp3"], a[href*=".m4a"], a[href*=".wav"], a[href*=".aac"], a[href*=".ogg"], [data-video-url], [data-audio-url], [data-mp4], [data-mp3], [data-hls]'
  );
  for (let i = 0; i < Math.min(mediaLinks.length, 60); i++) {
    const el = mediaLinks[i];
    const candidateUrl =
      el.getAttribute('href') ||
      el.getAttribute('data-video-url') ||
      el.getAttribute('data-audio-url') ||
      el.getAttribute('data-mp4') ||
      el.getAttribute('data-mp3') ||
      el.getAttribute('data-hls');
    const resolved = resolveAbsoluteUrl(candidateUrl, baseHref);
    if (!resolved || (!MEDIA_EXT_REGEX.test(resolved) && !resolved.includes('.m3u8'))) continue;

    const itemTitle =
      el.textContent?.trim() ||
      el.getAttribute('title') ||
      pageTitle;

    pushCandidate({
      url: resolved,
      title: itemTitle,
      format: inferFormat(resolved),
      thumbnailUrl: ogImage,
      source: 'dom',
    });
  }

  // 5. Bounded inline script scan for embedded media URLs
  // Skip on YouTube where script tags contain unrelated config URLs; handled by MAIN-world extractor
  const isYouTube = baseHref.includes('youtube.com') || baseHref.includes('youtu.be');
  if (!isYouTube) {
    const inlineScripts = doc.querySelectorAll('script:not([src])');
    let scannedChars = 0;
    for (let i = 0; i < inlineScripts.length && scannedChars < MAX_TOTAL_SCRIPT_CHARS; i++) {
      const content = inlineScripts[i].textContent || '';
      if (!content || content.length > MAX_SCRIPT_CHARS_PER_TAG) continue;
      if (
        !content.includes('.mp4') &&
        !content.includes('.m3u8') &&
        !content.includes('.webm') &&
        !content.includes('.mp3') &&
        !content.includes('.m4a')
      ) {
        continue;
      }
      scannedChars += content.length;

      SCRIPT_MEDIA_URL_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      let matchCount = 0;
      while ((match = SCRIPT_MEDIA_URL_REGEX.exec(content)) !== null && matchCount < 15) {
        matchCount++;
        const unescaped = match[0].replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
        const resolved = resolveAbsoluteUrl(unescaped, baseHref);
        if (!resolved) continue;
        pushCandidate({
          url: resolved,
          title: pageTitle,
          format: inferFormat(resolved),
          thumbnailUrl: ogImage,
          source: 'dom',
        });
      }
    }
  }

  return results;
}
