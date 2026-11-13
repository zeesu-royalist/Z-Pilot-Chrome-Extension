import { describe, it, expect } from 'vitest';
import {
  mergeAndRankVideos,
  sanitizeVideoFilename,
  formatBytes,
  formatDuration,
  selectDownloadableYouTubeFormats,
} from '../services/video-deduper.js';

describe('video-deduper', () => {
  it('sanitizes unsafe filename characters and preserves quality tags', () => {
    expect(sanitizeVideoFilename('My: Awesome / Video? *2026*', 'mp4', '1080p')).toBe(
      'My Awesome Video 2026 [1080p].mp4'
    );
    expect(sanitizeVideoFilename('', 'ts')).toBe('zpilot-video.ts');
  });

  it('formats bytes and durations cleanly', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3665)).toBe('1:01:05');
  });

  it('ignores blob: MSE URLs and suppresses recording fallback when real streams exist', () => {
    const videos = mergeAndRankVideos({
      pageTitle: 'Sample Video Page',
      domCandidates: [
        {
          url: 'blob:https://example.com/1234',
          thumbnailUrl: 'https://example.com/poster.jpg',
          durationSeconds: 180,
        },
        {
          url: 'https://cdn.example.com/video.mp4',
          format: 'mp4',
          width: 1280,
          height: 720,
          source: 'dom',
        },
      ],
      networkEntries: [
        {
          url: 'https://cdn.example.com/video.mp4',
          canonicalUrl: 'https://cdn.example.com/video.mp4',
          tabId: 1,
          format: 'mp4',
          streamKind: 'muxed',
          sizeBytes: 15_000_000,
          detectedAt: 100,
        },
        {
          url: 'https://cdn.example.com/master.m3u8',
          canonicalUrl: 'https://cdn.example.com/master.m3u8',
          tabId: 1,
          format: 'hls',
          streamKind: 'stream',
          detectedAt: 101,
        },
      ],
      hlsVariants: [
        {
          parentUrl: 'https://cdn.example.com/master.m3u8',
          url: 'https://cdn.example.com/1080p.m3u8',
          qualityLabel: '1080p',
          width: 1920,
          height: 1080,
          bandwidth: 5_000_000,
        },
        {
          parentUrl: 'https://cdn.example.com/master.m3u8',
          url: 'https://cdn.example.com/480p.m3u8',
          qualityLabel: '480p',
          width: 854,
          height: 480,
          bandwidth: 1_000_000,
        },
      ],
    });

    // Blob URLs are never listed; master.m3u8 replaced by 2 variants
    expect(videos).toHaveLength(3);
    expect(videos.some((v) => v.url.startsWith('blob:'))).toBe(false);
    // Muxed MP4 with 720p & size ranks first
    expect(videos[0].url).toBe('https://cdn.example.com/video.mp4');
    expect(videos[0].sizeBytes).toBe(15_000_000);
    // 1080p HLS variant ranks above 480p variant
    expect(videos[1].quality).toBe('1080p');
    expect(videos[2].quality).toBe('480p');
  });

  it('never exposes blob: live-capture entries even when no direct stream exists', () => {
    const videos = mergeAndRankVideos({
      pageTitle: 'Encrypted Player',
      domCandidates: [
        {
          url: 'blob:https://example.com/only-blob',
          width: 1280,
          height: 720,
        },
      ],
      networkEntries: [],
    });

    expect(videos).toHaveLength(0);
  });

  it('ranks YouTube muxed formats above video-only and audio-only streams', () => {
    const videos = mergeAndRankVideos({
      pageTitle: 'YT Song',
      domCandidates: [],
      networkEntries: [],
      youtubeCandidates: [
        {
          url: 'https://googlevideo.com/audio',
          title: 'YT Song',
          format: 'audio',
          streamKind: 'audio-only',
          quality: '128kbps',
        },
        {
          url: 'https://googlevideo.com/1080',
          title: 'YT Song',
          format: 'mp4',
          streamKind: 'video-only',
          quality: '1080p',
          height: 1080,
        },
        {
          url: 'https://googlevideo.com/360mux',
          title: 'YT Song',
          format: 'mp4',
          streamKind: 'muxed',
          quality: '360p',
          height: 360,
        },
      ],
    });

    expect(videos[0].streamKind).toBe('muxed');
    expect(videos[1].streamKind).toBe('video-only');
    expect(videos[2].streamKind).toBe('audio-only');
  });

  it('keeps only downloadable muxed YouTube formats (preferring MP4) and drops adaptive streams', () => {
    const raw = [
      {
        url: 'https://googlevideo.com/360mux-webm',
        title: 'Demo',
        format: 'webm' as const,
        streamKind: 'muxed' as const,
        mimeType: 'video/webm',
        quality: '360p',
        height: 360,
        sizeBytes: 4_500_000,
        itag: 43,
      },
      {
        url: 'https://googlevideo.com/360mux-mp4',
        title: 'Demo',
        format: 'mp4' as const,
        streamKind: 'muxed' as const,
        mimeType: 'video/mp4',
        quality: '360p',
        height: 360,
        sizeBytes: 5_000_000,
        itag: 18,
      },
      {
        url: 'https://googlevideo.com/1080-avc',
        title: 'Demo',
        format: 'mp4' as const,
        streamKind: 'video-only' as const,
        mimeType: 'video/mp4; codecs="avc1"',
        quality: '1080p',
        height: 1080,
        sizeBytes: 40_000_000,
        itag: 137,
      },
      {
        url: 'https://googlevideo.com/audio-140',
        title: 'Demo',
        format: 'audio' as const,
        streamKind: 'audio-only' as const,
        mimeType: 'audio/mp4',
        quality: 'MEDIUM',
        sizeBytes: 3_000_000,
        itag: 140,
      },
    ];

    const curated = selectDownloadableYouTubeFormats(raw);
    expect(curated).toHaveLength(1);
    expect(curated[0].itag).toBe(18);
    expect(curated[0].format).toBe('mp4');
    expect(curated[0].streamKind).toBe('muxed');
  });

  it('ranks higher resolution HLS variants (2160p > 1080p > 720p) on general websites', () => {
    const videos = mergeAndRankVideos({
      pageTitle: 'Non-YT 4K Site',
      domCandidates: [],
      networkEntries: [
        {
          url: 'https://cdn.example.com/master.m3u8',
          canonicalUrl: 'https://cdn.example.com/master.m3u8',
          tabId: 1,
          format: 'hls',
          streamKind: 'stream',
          detectedAt: 1,
        },
      ],
      hlsVariants: [
        {
          parentUrl: 'https://cdn.example.com/master.m3u8',
          url: 'https://cdn.example.com/720.m3u8',
          qualityLabel: '720p',
          width: 1280,
          height: 720,
          bandwidth: 2_500_000,
        },
        {
          parentUrl: 'https://cdn.example.com/master.m3u8',
          url: 'https://cdn.example.com/2160.m3u8',
          qualityLabel: '2160p',
          width: 3840,
          height: 2160,
          bandwidth: 14_000_000,
        },
        {
          parentUrl: 'https://cdn.example.com/master.m3u8',
          url: 'https://cdn.example.com/1080.m3u8',
          qualityLabel: '1080p',
          width: 1920,
          height: 1080,
          bandwidth: 5_000_000,
        },
      ],
    });

    expect(videos.map((v) => v.quality)).toEqual(['2160p', '1080p', '720p']);
  });
});

