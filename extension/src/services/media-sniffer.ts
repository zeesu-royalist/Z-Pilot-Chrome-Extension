import { SniffedMediaEntry, VideoFormatKind, VideoStreamKind } from '../types/index.js';

const MEDIA_EXTENSION_MAP: Readonly<Record<string, VideoFormatKind>> = {
  mp4: 'mp4',
  m4v: 'mp4',
  webm: 'webm',
  mov: 'mov',
  m3u8: 'hls',
  m3u: 'hls',
  mpd: 'dash',
  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  opus: 'audio',
};

const IGNORED_EXTENSIONS = new Set([
  'ts',
  'm4s',
  'js',
  'css',
  'json',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'woff',
  'woff2',
  'vtt',
  'srt',
  'html',
  'htm',
  'txt',
]);

/** Minimum progressive media file size (20 KB) to filter out tracking pixels / tiny ads */
const MIN_PROGRESSIVE_SIZE_BYTES = 20 * 1024;

/**
 * Extract lowercase extension from URL path without allocating regex arrays
 */
export function extractUrlExtension(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname.toLowerCase();
    const lastSlash = pathname.lastIndexOf('/');
    const segment = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
    const dot = segment.lastIndexOf('.');
    if (dot <= 0 || dot === segment.length - 1) return '';
    return segment.slice(dot + 1);
  } catch {
    return '';
  }
}

/**
 * Normalize a media URL for deduplication.
 * Preserves auth/signature query parameters while stripping URL hash fragments.
 */
export function normalizeMediaUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Classify a MIME type string into a VideoFormatKind
 */
export function classifyMimeType(contentType?: string): VideoFormatKind | null {
  if (!contentType) return null;
  const mime = contentType.split(';')[0].trim().toLowerCase();

  // Never classify text, HTML, JSON, or binary protobuf/stream responses as downloadable video
  if (
    mime.startsWith('text/') ||
    mime.includes('html') ||
    mime.includes('json') ||
    mime.includes('yt-ump') ||
    mime.includes('protobuf') ||
    mime.includes('octet-stream')
  ) {
    return null;
  }

  if (mime === 'application/vnd.apple.mpegurl' || mime === 'application/x-mpegurl') {
    return 'hls';
  }
  if (mime === 'application/dash+xml') {
    return 'dash';
  }
  if (mime === 'video/mp4' || mime === 'video/m4v') {
    return 'mp4';
  }
  if (mime === 'video/webm') {
    return 'webm';
  }
  if (mime === 'video/quicktime') {
    return 'mov';
  }
  if (mime.startsWith('video/')) {
    return 'mp4';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  return null;
}

/**
 * Inspect network URL + response headers and return a SniffedMediaEntry if it represents a downloadable video/stream.
 */
export function inspectNetworkMedia(params: {
  url: string;
  tabId: number;
  contentType?: string;
  contentLength?: number;
  now?: number;
}): SniffedMediaEntry | null {
  const { url, tabId, contentType, contentLength, now = Date.now() } = params;

  if (!url || tabId < 0) return null;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;

  // Skip extension's own Gemini API requests and raw YouTube googlevideo chunk requests
  // (YouTube's downloadable muxed MP4 is extracted directly via VideoScannerService)
  if (
    url.includes('generativelanguage.googleapis.com') ||
    url.includes('googlevideo.com/videoplayback')
  ) {
    return null;
  }

  // Reject explicit non-media response types even if the URL ends with a media extension
  if (contentType) {
    const lowerCt = contentType.split(';')[0].trim().toLowerCase();
    if (
      lowerCt.startsWith('text/') ||
      lowerCt.includes('html') ||
      lowerCt.includes('json') ||
      lowerCt.includes('yt-ump')
    ) {
      return null;
    }
  }

  const ext = extractUrlExtension(url);
  if (ext && IGNORED_EXTENSIONS.has(ext)) {
    return null;
  }

  const extFormat = ext ? MEDIA_EXTENSION_MAP[ext] : undefined;
  const mimeFormat = classifyMimeType(contentType);
  const format = mimeFormat || extFormat;

  if (!format) return null;

  // Skip tiny progressive files (ads/beacons) unless manifest (.m3u8 / .mpd)
  if (
    format !== 'hls' &&
    format !== 'dash' &&
    typeof contentLength === 'number' &&
    contentLength > 0 &&
    contentLength < MIN_PROGRESSIVE_SIZE_BYTES
  ) {
    return null;
  }

  // Filter obvious segment chunk URLs inside query/path
  const lowerUrl = url.toLowerCase();
  if (
    (lowerUrl.includes('/seg-') || lowerUrl.includes('/chunk-') || lowerUrl.includes('segment_')) &&
    format !== 'hls' &&
    format !== 'dash'
  ) {
    return null;
  }

  const streamKind: VideoStreamKind =
    format === 'hls' || format === 'dash'
      ? 'stream'
      : format === 'audio'
      ? 'audio-only'
      : 'muxed';

  return {
    url,
    canonicalUrl: normalizeMediaUrl(url),
    tabId,
    format,
    streamKind,
    mimeType: contentType?.split(';')[0].trim(),
    sizeBytes: contentLength && contentLength > 0 ? contentLength : undefined,
    detectedAt: now,
  };
}

/**
 * Bounded LRU per-tab cache for sniffed media URLs.
 * Prevents unbounded memory growth in the background service worker.
 */
export class TabMediaStore {
  private readonly maxTabs: number;
  private readonly maxEntriesPerTab: number;
  private readonly store = new Map<number, Map<string, SniffedMediaEntry>>();

  constructor(maxTabs = 30, maxEntriesPerTab = 60) {
    this.maxTabs = maxTabs;
    this.maxEntriesPerTab = maxEntriesPerTab;
  }

  add(entry: SniffedMediaEntry): boolean {
    let tabMap = this.store.get(entry.tabId);
    if (!tabMap) {
      // Evict oldest tab if capacity exceeded
      if (this.store.size >= this.maxTabs) {
        const oldestTabId = this.store.keys().next().value;
        if (oldestTabId !== undefined) {
          this.store.delete(oldestTabId);
        }
      }
      tabMap = new Map<string, SniffedMediaEntry>();
      this.store.set(entry.tabId, tabMap);
    } else {
      // Refresh LRU order for this tab
      this.store.delete(entry.tabId);
      this.store.set(entry.tabId, tabMap);
    }

    const existing = tabMap.get(entry.canonicalUrl);
    if (existing) {
      // Merge richer metadata (e.g. contentLength or mimeType from headers)
      tabMap.set(entry.canonicalUrl, {
        ...existing,
        ...entry,
        sizeBytes: entry.sizeBytes ?? existing.sizeBytes,
        mimeType: entry.mimeType ?? existing.mimeType,
        quality: entry.quality ?? existing.quality,
        detectedAt: entry.detectedAt,
      });
      return false; // Already tracked
    }

    if (tabMap.size >= this.maxEntriesPerTab) {
      const oldestKey = tabMap.keys().next().value;
      if (oldestKey !== undefined) {
        tabMap.delete(oldestKey);
      }
    }

    tabMap.set(entry.canonicalUrl, entry);
    return true;
  }

  get(tabId: number): SniffedMediaEntry[] {
    const tabMap = this.store.get(tabId);
    if (!tabMap) return [];
    return Array.from(tabMap.values());
  }

  count(tabId: number): number {
    return this.store.get(tabId)?.size ?? 0;
  }

  clearTab(tabId: number): void {
    this.store.delete(tabId);
  }

  serialize(): Record<string, SniffedMediaEntry[]> {
    const out: Record<string, SniffedMediaEntry[]> = {};
    for (const [tabId, map] of this.store.entries()) {
      out[String(tabId)] = Array.from(map.values());
    }
    return out;
  }

  hydrate(data: Record<string, SniffedMediaEntry[]> | undefined): void {
    if (!data || typeof data !== 'object') return;
    for (const [tabIdStr, entries] of Object.entries(data)) {
      const tabId = Number(tabIdStr);
      if (Number.isNaN(tabId) || !Array.isArray(entries)) continue;
      for (const entry of entries) {
        this.add(entry);
      }
    }
  }
}
