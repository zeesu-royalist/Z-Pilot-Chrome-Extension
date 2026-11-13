/**
 * High-Performance Client-Side HLS (.m3u8) Parser & Concurrent Downloader
 * - Parses Master Playlists (#EXT-X-STREAM-INF) into selectable quality variants
 * - Parses Media Playlists (#EXTINF, #EXT-X-MAP, #EXT-X-KEY, #EXT-X-BYTERANGE)
 * - Concurrent segment fetching via bounded worker pool with exponential backoff retries
 * - Supports AES-128 HLS decryption via Web Crypto API (rejects SAMPLE-AES/Widevine DRM cleanly)
 */

export interface HlsVariant {
  url: string;
  bandwidth: number;
  width?: number;
  height?: number;
  qualityLabel: string;
  codecs?: string;
}

export interface HlsKeyInfo {
  method: 'NONE' | 'AES-128' | 'SAMPLE-AES' | string;
  uri?: string;
  iv?: Uint8Array;
}

export interface HlsByteRange {
  length: number;
  offset: number;
}

export interface HlsSegment {
  url: string;
  duration: number;
  sequence: number;
  byteRange?: HlsByteRange;
  key?: HlsKeyInfo;
}

export interface HlsMediaPlaylist {
  kind: 'media';
  targetDuration: number;
  mediaSequence: number;
  initSegmentUrl?: string;
  initByteRange?: HlsByteRange;
  segments: HlsSegment[];
  isEncryptedDrm: boolean;
  totalDurationSeconds: number;
}

export interface HlsMasterPlaylist {
  kind: 'master';
  variants: HlsVariant[];
}

export type ParsedM3u8 = HlsMasterPlaylist | HlsMediaPlaylist;

export interface HlsDownloadProgress {
  completedSegments: number;
  totalSegments: number;
  bytesDownloaded: number;
  percent: number;
}

export interface HlsDownloadResult {
  blob: Blob;
  mimeType: string;
  fileExtension: 'mp4' | 'ts';
  totalBytes: number;
  segmentCount: number;
}

/**
 * Parse key=value attribute lists inside M3U8 tags (handles quoted strings properly)
 */
export function parseM3u8Attributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1];
    const value = match[3] !== undefined ? match[3] : match[4];
    attrs[key] = value.trim();
  }
  return attrs;
}

function resolvePlaylistUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).toString();
  } catch {
    return relativeOrAbsolute;
  }
}

function parseHexIv(hex: string): Uint8Array | undefined {
  const clean = hex.replace(/^0x/i, '').padStart(32, '0');
  if (clean.length !== 32 || !/^[0-9a-fA-F]+$/.test(clean)) return undefined;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function sequenceToIv(sequence: number): Uint8Array {
  const iv = new Uint8Array(16);
  const view = new DataView(iv.buffer);
  view.setUint32(12, sequence >>> 0, false);
  return iv;
}

function parseByteRange(raw: string, previousEndOffset: number): HlsByteRange | undefined {
  const [lenStr, offsetStr] = raw.split('@');
  const length = Number(lenStr);
  if (!Number.isFinite(length) || length <= 0) return undefined;
  const offset = offsetStr !== undefined ? Number(offsetStr) : previousEndOffset;
  if (!Number.isFinite(offset) || offset < 0) return undefined;
  return { length, offset };
}

/**
 * Parse an M3U8 text body as either Master Playlist or Media Playlist
 */
export function parseM3u8Playlist(content: string, baseUrl: string): ParsedM3u8 {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Check if Master Playlist
  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF:'));
  if (isMaster) {
    const variants: HlsVariant[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

      const attrs = parseM3u8Attributes(line.slice('#EXT-X-STREAM-INF:'.length));
      // Find next non-comment line as variant URL
      let uriLine = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].startsWith('#')) {
          uriLine = lines[j];
          i = j;
          break;
        }
      }
      if (!uriLine) continue;

      const bandwidth = Number(attrs.BANDWIDTH || attrs['AVERAGE-BANDWIDTH'] || 0);
      let width: number | undefined;
      let height: number | undefined;
      if (attrs.RESOLUTION && attrs.RESOLUTION.includes('x')) {
        const [w, h] = attrs.RESOLUTION.split('x').map(Number);
        if (Number.isFinite(w) && Number.isFinite(h)) {
          width = w;
          height = h;
        }
      }

      const qualityLabel = height
        ? `${height}p`
        : bandwidth > 0
        ? `${Math.round(bandwidth / 1000)} kbps`
        : 'Auto';

      variants.push({
        url: resolvePlaylistUrl(uriLine, baseUrl),
        bandwidth: Number.isFinite(bandwidth) ? bandwidth : 0,
        width,
        height,
        qualityLabel,
        codecs: attrs.CODECS,
      });
    }

    // Sort highest resolution / bandwidth first
    variants.sort((a, b) => {
      const resDiff = (b.height || 0) - (a.height || 0);
      if (resDiff !== 0) return resDiff;
      return b.bandwidth - a.bandwidth;
    });

    return { kind: 'master', variants };
  }

  // Parse Media Playlist
  let targetDuration = 10;
  let mediaSequence = 0;
  let currentDuration = 0;
  let currentKey: HlsKeyInfo | undefined;
  let currentByteRange: HlsByteRange | undefined;
  let previousByteEnd = 0;
  let initSegmentUrl: string | undefined;
  let initByteRange: HlsByteRange | undefined;
  let isEncryptedDrm = false;
  let totalDurationSeconds = 0;
  const segments: HlsSegment[] = [];

  for (const line of lines) {
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = Number(line.slice('#EXT-X-TARGETDURATION:'.length)) || 10;
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = Number(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length)) || 0;
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = parseM3u8Attributes(line.slice('#EXT-X-MAP:'.length));
      if (attrs.URI) {
        initSegmentUrl = resolvePlaylistUrl(attrs.URI, baseUrl);
      }
      if (attrs.BYTERANGE) {
        initByteRange = parseByteRange(attrs.BYTERANGE, 0);
      }
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseM3u8Attributes(line.slice('#EXT-X-KEY:'.length));
      const method = (attrs.METHOD || 'NONE').toUpperCase();
      if (method === 'NONE') {
        currentKey = undefined;
      } else {
        if (method === 'SAMPLE-AES' || method === 'SAMPLE-AES-CTR' || method === 'SAMPLE-AES-CENC') {
          isEncryptedDrm = true;
        }
        currentKey = {
          method,
          uri: attrs.URI ? resolvePlaylistUrl(attrs.URI, baseUrl) : undefined,
          iv: attrs.IV ? parseHexIv(attrs.IV) : undefined,
        };
      }
    } else if (line.startsWith('#EXTINF:')) {
      const durStr = line.slice('#EXTINF:'.length).split(',')[0];
      currentDuration = Number(durStr) || 0;
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      currentByteRange = parseByteRange(line.slice('#EXT-X-BYTERANGE:'.length), previousByteEnd);
      if (currentByteRange) {
        previousByteEnd = currentByteRange.offset + currentByteRange.length;
      }
    } else if (!line.startsWith('#')) {
      const seq = mediaSequence + segments.length;
      segments.push({
        url: resolvePlaylistUrl(line, baseUrl),
        duration: currentDuration,
        sequence: seq,
        byteRange: currentByteRange,
        key: currentKey ? { ...currentKey } : undefined,
      });
      totalDurationSeconds += currentDuration;
      currentDuration = 0;
      currentByteRange = undefined;
    }
  }

  return {
    kind: 'media',
    targetDuration,
    mediaSequence,
    initSegmentUrl,
    initByteRange,
    segments,
    isEncryptedDrm,
    totalDurationSeconds,
  };
}

/**
 * Fetch and parse an M3U8 playlist with timeout
 */
export async function fetchAndParseM3u8(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 8000
): Promise<ParsedM3u8> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(url, { signal: combinedSignal, credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Failed to fetch playlist (${res.status})`);
    }
    const text = await res.text();
    return parseM3u8Playlist(text, res.url || url);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBufferWithRetry(
  url: string,
  byteRange?: HlsByteRange,
  signal?: AbortSignal,
  maxRetries = 2
): Promise<ArrayBuffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Download cancelled', 'AbortError');
    }
    try {
      const headers: Record<string, string> = {};
      if (byteRange) {
        const end = byteRange.offset + byteRange.length - 1;
        headers['Range'] = `bytes=${byteRange.offset}-${end}`;
      }
      const res = await fetch(url, { headers, signal, credentials: 'include' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} on segment`);
      }
      return await res.arrayBuffer();
    } catch (err) {
      lastErr = err;
      if ((err as Error)?.name === 'AbortError' || signal?.aborted) {
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch segment');
}

/**
 * Download an HLS stream (Master or Media playlist) using a concurrent worker pool
 * and assemble into a single playable Blob (.mp4 for fMP4 or .ts for MPEG-TS).
 */
export async function downloadHlsStream(params: {
  url: string;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: HlsDownloadProgress) => void;
}): Promise<HlsDownloadResult> {
  const { url, concurrency = 5, signal, onProgress } = params;

  let parsed = await fetchAndParseM3u8(url, signal);

  // If master playlist, pick highest-quality variant automatically
  if (parsed.kind === 'master') {
    if (parsed.variants.length === 0) {
      throw new Error('HLS master playlist contains no playable variants.');
    }
    parsed = await fetchAndParseM3u8(parsed.variants[0].url, signal);
    if (parsed.kind === 'master') {
      throw new Error('Nested HLS master playlists are unsupported.');
    }
  }

  if (parsed.isEncryptedDrm) {
    throw new Error('This stream uses DRM (SAMPLE-AES) protection and cannot be downloaded.');
  }

  if (parsed.segments.length === 0) {
    throw new Error('HLS playlist contains 0 media segments.');
  }

  const totalSegments = parsed.segments.length;
  const buffers: ArrayBuffer[] = new Array(totalSegments);
  const keyCache = new Map<string, CryptoKey>();

  // Fetch optional fMP4 init segment first
  let initBuffer: ArrayBuffer | null = null;
  if (parsed.initSegmentUrl) {
    initBuffer = await fetchBufferWithRetry(parsed.initSegmentUrl, parsed.initByteRange, signal);
  }

  let completedSegments = 0;
  let bytesDownloaded = initBuffer ? initBuffer.byteLength : 0;
  let nextIndex = 0;

  const getCryptoKey = async (keyUri: string): Promise<CryptoKey> => {
    const cached = keyCache.get(keyUri);
    if (cached) return cached;
    const rawKey = await fetchBufferWithRetry(keyUri, undefined, signal);
    const imported = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );
    keyCache.set(keyUri, imported);
    return imported;
  };

  // Bounded concurrent worker pool
  const workerCount = Math.min(Math.max(1, concurrency), totalSegments);

  const runWorker = async () => {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }
      const idx = nextIndex++;
      if (idx >= totalSegments) break;

      const segment = parsed.segments[idx];
      let data = await fetchBufferWithRetry(segment.url, segment.byteRange, signal);

      // Decrypt AES-128 segment if encrypted
      if (segment.key && segment.key.method === 'AES-128' && segment.key.uri) {
        const cryptoKey = await getCryptoKey(segment.key.uri);
        const iv = segment.key.iv ?? sequenceToIv(segment.sequence);
        data = await crypto.subtle.decrypt(
          { name: 'AES-CBC', iv: iv as BufferSource },
          cryptoKey,
          data
        );
      }

      buffers[idx] = data;
      completedSegments++;
      bytesDownloaded += data.byteLength;

      if (onProgress) {
        onProgress({
          completedSegments,
          totalSegments,
          bytesDownloaded,
          percent: Math.round((completedSegments / totalSegments) * 100),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  const isFmp4 = Boolean(initBuffer);
  const mimeType = isFmp4 ? 'video/mp4' : 'video/mp2t';
  const fileExtension: 'mp4' | 'ts' = isFmp4 ? 'mp4' : 'ts';

  const parts: BlobPart[] = initBuffer ? [initBuffer, ...buffers] : buffers;
  const blob = new Blob(parts, { type: mimeType });

  return {
    blob,
    mimeType,
    fileExtension,
    totalBytes: blob.size,
    segmentCount: totalSegments,
  };
}

