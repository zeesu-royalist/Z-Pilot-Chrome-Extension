import {
  DetectedVideo,
  SniffedMediaEntry,
  VideoFormatKind,
} from '../types/index.js';
import { normalizeMediaUrl } from './media-sniffer.js';

export interface RawDomVideoCandidate {
  url: string;
  title?: string;
  format?: VideoFormatKind;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  thumbnailUrl?: string;
  source?: 'dom' | 'meta';
}

export interface RawYouTubeFormatCandidate {
  url: string;
  title: string;
  format: VideoFormatKind;
  streamKind: 'muxed' | 'video-only' | 'audio-only';
  mimeType?: string;
  quality?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  thumbnailUrl?: string;
  itag?: number;
}

/**
 * Sanitize a string into a safe cross-platform filename
 */
export function sanitizeVideoFilename(
  rawTitle: string | undefined,
  extension: string,
  quality?: string
): string {
  const base = (rawTitle || 'zpilot-video')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  const cleanBase = base || 'zpilot-video';
  const qualityTag = quality ? ` [${quality.replace(/[<>:"/\\|?*]/g, '')}]` : '';
  const ext = extension.replace(/^\./, '').toLowerCase() || 'mp4';

  return `${cleanBase}${qualityTag}.${ext}`;
}

export function getExtensionForFormat(format: VideoFormatKind, mimeType?: string): string {
  switch (format) {
    case 'mp4':
      return 'mp4';
    case 'webm':
      return 'webm';
    case 'mov':
      return 'mov';
    case 'hls':
      return 'ts';
    case 'dash':
      return 'mpd';
    case 'audio':
      if (mimeType?.includes('wav')) return 'wav';
      if (mimeType?.includes('ogg')) return 'ogg';
      if (mimeType?.includes('flac')) return 'flac';
      if (mimeType?.includes('aac')) return 'aac';
      if (mimeType?.includes('webm') || mimeType?.includes('opus')) return 'webm';
      if (mimeType?.includes('mpeg') || mimeType?.includes('mp3')) return 'mp3';
      return 'm4a';
    default:
      return 'mp4';
  }
}

/**
 * Format byte counts into human-readable string (e.g., 14.2 MB)
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
}

/**
 * Compute ranking score for sorting discovered videos (higher = better default choice)
 */
export function scoreDetectedVideo(video: Omit<DetectedVideo, 'score'>): number {
  let score = 0;

  // Stream usability priority
  if (video.streamKind === 'muxed') score += 500;
  else if (video.streamKind === 'stream') score += 420;
  else if (video.streamKind === 'video-only') score += 260;
  else if (video.streamKind === 'audio-only') score += 120;

  // Format bonus
  if (video.format === 'mp4') score += 80;
  else if (video.format === 'hls') score += 65;
  else if (video.format === 'webm') score += 50;
  else if (video.format === 'dash') score -= 80; // DASH MPD usually needs separate audio/video muxing

  // Resolution priority: highest quality HD/4K first
  if (video.height) {
    if (video.height >= 2160) score += 260;
    else if (video.height >= 1440) score += 245;
    else if (video.height >= 1080) score += 230;
    else if (video.height >= 720) score += 210;
    else score += Math.min(video.height / 10, 180);
  }

  // Known file size & duration bonus
  if (video.sizeBytes && video.sizeBytes > 0) score += 25;
  if (video.thumbnailUrl) score += 10;

  return Math.round(score);
}

function inferFormatFromUrl(url: string, mimeType?: string): VideoFormatKind {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.m3u8') || lower.endsWith('.m3u') || mimeType?.includes('mpegurl')) {
    return 'hls';
  }
  if (lower.endsWith('.mpd') || mimeType?.includes('dash+xml')) return 'dash';
  if (lower.endsWith('.webm') || mimeType?.includes('webm')) return 'webm';
  if (lower.endsWith('.mov') || mimeType?.includes('quicktime')) return 'mov';
  if (
    lower.endsWith('.mp3') ||
    lower.endsWith('.m4a') ||
    lower.endsWith('.aac') ||
    lower.endsWith('.wav') ||
    lower.endsWith('.ogg') ||
    lower.endsWith('.opus') ||
    lower.endsWith('.flac') ||
    mimeType?.startsWith('audio/')
  ) {
    return 'audio';
  }
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v') || mimeType?.includes('mp4')) {
    return 'mp4';
  }
  return 'mp4';
}

function inferQualityLabel(width?: number, height?: number): string | undefined {
  if (height && height > 0) return `${height}p`;
  if (width && width >= 1920) return '1080p';
  if (width && width >= 1280) return '720p';
  return undefined;
}

/**
 * Keep ONLY reliably downloadable YouTube muxed (Video + Audio) streams,
 * deduplicated to 1 entry per resolution height (typically 360p MP4).
 */
export function selectDownloadableYouTubeFormats(
  rawFormats: RawYouTubeFormatCandidate[]
): RawYouTubeFormatCandidate[] {
  if (!rawFormats || rawFormats.length === 0) return [];

  const muxedByHeight = new Map<number, RawYouTubeFormatCandidate>();
  for (const item of rawFormats) {
    if (item.streamKind !== 'muxed' || !item.url) continue;
    const h = item.height || 360;
    const existing = muxedByHeight.get(h);
    // Prefer MP4 over WebM if both exist at the same height
    if (!existing || (item.format === 'mp4' && existing.format !== 'mp4')) {
      muxedByHeight.set(h, item);
    }
  }

  return Array.from(muxedByHeight.values()).sort((a, b) => (b.height || 0) - (a.height || 0));
}

/**
 * Merge, deduplicate, and rank all videos discovered from DOM, Network Sniffer,
 * YouTube player data, and expanded HLS variants.
 */
export function mergeAndRankVideos(params: {
  pageTitle: string;
  domCandidates: RawDomVideoCandidate[];
  networkEntries: SniffedMediaEntry[];
  youtubeCandidates?: RawYouTubeFormatCandidate[];
  hlsVariants?: Array<{
    parentUrl: string;
    url: string;
    qualityLabel: string;
    width?: number;
    height?: number;
    bandwidth: number;
  }>;
}): DetectedVideo[] {
  const {
    pageTitle,
    domCandidates,
    networkEntries,
    youtubeCandidates = [],
    hlsVariants = [],
  } = params;

  const byCanonical = new Map<string, Omit<DetectedVideo, 'score'>>();
  const expandedMasterUrls = new Set(hlsVariants.map((v) => normalizeMediaUrl(v.parentUrl)));

  const upsert = (candidate: Omit<DetectedVideo, 'score'>) => {
    const existing = byCanonical.get(candidate.canonicalUrl);
    if (!existing) {
      byCanonical.set(candidate.canonicalUrl, candidate);
      return;
    }

    // Prefer richer metadata across sources
    byCanonical.set(candidate.canonicalUrl, {
      ...existing,
      title:
        existing.title && existing.title !== pageTitle
          ? existing.title
          : candidate.title || pageTitle,
      quality: existing.quality || candidate.quality,
      width: existing.width || candidate.width,
      height: existing.height || candidate.height,
      durationSeconds: existing.durationSeconds || candidate.durationSeconds,
      sizeBytes: existing.sizeBytes || candidate.sizeBytes,
      thumbnailUrl: existing.thumbnailUrl || candidate.thumbnailUrl,
      mimeType: existing.mimeType || candidate.mimeType,
      streamKind:
        existing.streamKind === 'muxed' || candidate.streamKind !== 'muxed'
          ? existing.streamKind
          : candidate.streamKind,
      filename: candidate.filename || existing.filename,
      note: existing.note || candidate.note,
    });
  };

  let idCounter = 1;
  const nextId = () => `vid_${idCounter++}`;

  // 1. YouTube reliably downloadable formats (muxed MP4 Video + Audio)
  for (const yt of youtubeCandidates) {
    const canonicalUrl =
      yt.streamKind === 'audio-only'
        ? `${normalizeMediaUrl(yt.url)}#audio`
        : normalizeMediaUrl(yt.url);
    const ext = getExtensionForFormat(yt.format, yt.mimeType);

    upsert({
      id: nextId(),
      url: yt.url,
      canonicalUrl,
      title: yt.title || pageTitle,
      format: yt.format,
      streamKind: yt.streamKind,
      source: 'youtube',
      mimeType: yt.mimeType,
      quality: yt.quality || inferQualityLabel(yt.width, yt.height),
      width: yt.width,
      height: yt.height,
      durationSeconds: yt.durationSeconds,
      sizeBytes: yt.sizeBytes,
      thumbnailUrl: yt.thumbnailUrl,
      filename: sanitizeVideoFilename(yt.title || pageTitle, ext, yt.quality),
      note:
        yt.streamKind === 'muxed'
          ? 'Video + Audio (MP4)'
          : yt.streamKind === 'video-only'
          ? 'Video stream only (no audio track)'
          : yt.streamKind === 'audio-only'
          ? 'Audio Track • High Quality (M4A / MP3)'
          : undefined,
      detectedAt: Date.now(),
    });
  }

  // 2. Expanded HLS Quality Variants (deduplicated by qualityLabel, keeping highest bandwidth)
  const dedupedHlsVariants = new Map<string, (typeof hlsVariants)[number]>();
  for (const variant of hlsVariants) {
    const key = `${normalizeMediaUrl(variant.parentUrl)}::${variant.qualityLabel}`;
    const existing = dedupedHlsVariants.get(key);
    if (!existing || variant.bandwidth > existing.bandwidth) {
      dedupedHlsVariants.set(key, variant);
    }
  }
  for (const variant of dedupedHlsVariants.values()) {
    const canonicalUrl = normalizeMediaUrl(variant.url);
    upsert({
      id: nextId(),
      url: variant.url,
      canonicalUrl,
      title: pageTitle,
      format: 'hls',
      streamKind: 'stream',
      source: 'hls-variant',
      mimeType: 'application/vnd.apple.mpegurl',
      quality: variant.qualityLabel,
      width: variant.width,
      height: variant.height,
      filename: sanitizeVideoFilename(pageTitle, 'ts', variant.qualityLabel),
      detectedAt: Date.now(),
    });
  }

  // 3. Network-sniffed entries
  for (const net of networkEntries) {
    // If this was a master HLS playlist we already expanded into variants, skip duplicate parent
    if (expandedMasterUrls.has(net.canonicalUrl)) continue;

    const ext = getExtensionForFormat(net.format, net.mimeType);
    upsert({
      id: nextId(),
      url: net.url,
      canonicalUrl: net.canonicalUrl,
      title: net.titleHint || pageTitle,
      format: net.format,
      streamKind: net.streamKind,
      source: 'network',
      mimeType: net.mimeType,
      quality: net.quality || inferQualityLabel(net.width, net.height),
      width: net.width,
      height: net.height,
      durationSeconds: net.durationSeconds,
      sizeBytes: net.sizeBytes,
      filename: sanitizeVideoFilename(net.titleHint || pageTitle, ext, net.quality),
      note:
        net.streamKind === 'video-only'
          ? 'Video stream only (no audio track)'
          : net.format === 'dash'
          ? 'DASH manifest (.mpd)'
          : undefined,
      detectedAt: net.detectedAt,
    });
  }

  // 4. DOM & Metadata candidates (blob: URLs are excluded — direct/streamable media only)
  for (const dom of domCandidates) {
    if (!dom.url || dom.url.startsWith('blob:')) continue;

    const canonicalUrl = normalizeMediaUrl(dom.url);
    if (expandedMasterUrls.has(canonicalUrl)) continue;

    const format = dom.format || inferFormatFromUrl(dom.url, dom.mimeType);
    const ext = getExtensionForFormat(format, dom.mimeType);
    const quality = inferQualityLabel(dom.width, dom.height);
    const filename = sanitizeVideoFilename(dom.title || pageTitle, ext, quality);

    upsert({
      id: nextId(),
      url: dom.url,
      canonicalUrl,
      title: dom.title || pageTitle,
      format,
      streamKind: format === 'hls' || format === 'dash' ? 'stream' : 'muxed',
      source: dom.source || 'dom',
      mimeType: dom.mimeType,
      quality,
      width: dom.width,
      height: dom.height,
      durationSeconds: dom.durationSeconds,
      thumbnailUrl: dom.thumbnailUrl,
      filename,
      detectedAt: Date.now(),
    });
  }

  return Array.from(byCanonical.values())
    .map((v) => ({
      ...v,
      score: scoreDetectedVideo(v),
    }))
    .sort((a, b) => b.score - a.score);
}

