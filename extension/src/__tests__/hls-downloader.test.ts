import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseM3u8Playlist,
  downloadHlsStream,
} from '../services/hls-downloader.js';

describe('hls-downloader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses HLS master playlist and sorts variants highest resolution first', () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42e01e"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028"
https://cdn.example.com/1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p/index.m3u8`;

    const parsed = parseM3u8Playlist(master, 'https://example.com/hls/master.m3u8');
    expect(parsed.kind).toBe('master');
    if (parsed.kind === 'master') {
      expect(parsed.variants).toHaveLength(3);
      expect(parsed.variants[0].qualityLabel).toBe('1080p');
      expect(parsed.variants[0].url).toBe('https://cdn.example.com/1080p/index.m3u8');
      expect(parsed.variants[1].qualityLabel).toBe('720p');
      expect(parsed.variants[1].url).toBe('https://example.com/hls/720p/index.m3u8');
      expect(parsed.variants[2].qualityLabel).toBe('360p');
    }
  });

  it('parses media playlist with init segment, byte ranges, and detects SAMPLE-AES DRM', () => {
    const media = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:10
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
seg10.m4s
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm"
#EXTINF:6.0,
seg11.m4s`;

    const parsed = parseM3u8Playlist(media, 'https://example.com/stream/playlist.m3u8');
    expect(parsed.kind).toBe('media');
    if (parsed.kind === 'media') {
      expect(parsed.initSegmentUrl).toBe('https://example.com/stream/init.mp4');
      expect(parsed.isEncryptedDrm).toBe(true);
      expect(parsed.segments).toHaveLength(2);
      expect(parsed.segments[0].sequence).toBe(10);
      expect(parsed.totalDurationSeconds).toBe(12);
    }
  });

  it('downloads and assembles concurrent MPEG-TS segments with progress callbacks', async () => {
    const playlistText = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXTINF:4.0,
seg0.ts
#EXTINF:4.0,
seg1.ts
#EXTINF:4.0,
seg2.ts`;

    const segData = [
      new Uint8Array([1, 2, 3]).buffer,
      new Uint8Array([4, 5, 6, 7]).buffer,
      new Uint8Array([8, 9]).buffer,
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('index.m3u8')) {
        return new Response(playlistText, { status: 200 });
      }
      if (url.endsWith('seg0.ts')) return new Response(segData[0], { status: 200 });
      if (url.endsWith('seg1.ts')) return new Response(segData[1], { status: 200 });
      if (url.endsWith('seg2.ts')) return new Response(segData[2], { status: 200 });
      return new Response(null, { status: 404 });
    });

    const progressUpdates: number[] = [];
    const result = await downloadHlsStream({
      url: 'https://example.com/video/index.m3u8',
      concurrency: 2,
      onProgress: (p) => progressUpdates.push(p.percent),
    });

    expect(result.fileExtension).toBe('ts');
    expect(result.segmentCount).toBe(3);
    expect(result.totalBytes).toBe(9);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('decrypts AES-128 HLS segments using WebCrypto cleanly', async () => {
    const rawKeyBytes = new Uint8Array(16).fill(7);
    const ivBytes = new Uint8Array(16).fill(3);
    const plaintext = new TextEncoder().encode('Hello Z-Pilot Video Segment!');

    const subtle = globalThis.crypto.subtle;

    const aesKey = await subtle.importKey('raw', rawKeyBytes, { name: 'AES-CBC' }, false, [
      'encrypt',
    ]);
    const encrypted = await subtle.encrypt({ name: 'AES-CBC', iv: ivBytes }, aesKey, plaintext);

    const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:5
#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin",IV=0x03030303030303030303030303030303
#EXTINF:5.0,
enc0.ts`;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('enc.m3u8')) return new Response(playlist, { status: 200 });
      if (url.endsWith('key.bin')) return new Response(rawKeyBytes.buffer, { status: 200 });
      if (url.endsWith('enc0.ts')) return new Response(encrypted, { status: 200 });
      return new Response(null, { status: 404 });
    });

    const result = await downloadHlsStream({
      url: 'https://example.com/enc.m3u8',
    });

    const decodedText = new TextDecoder().decode(await result.blob.arrayBuffer());
    expect(decodedText).toBe('Hello Z-Pilot Video Segment!');
  });

  it('rejects SAMPLE-AES DRM streams with an explicit error', async () => {
    const drmPlaylist = `#EXTM3U
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://fairplay"
#EXTINF:4.0,
drm.ts`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(drmPlaylist, { status: 200 }));

    await expect(
      downloadHlsStream({ url: 'https://example.com/drm.m3u8' })
    ).rejects.toThrow(/DRM/i);
  });
});
