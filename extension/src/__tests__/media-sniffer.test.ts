import { describe, it, expect } from 'vitest';
import {
  extractUrlExtension,
  normalizeMediaUrl,
  classifyMimeType,
  inspectNetworkMedia,
  TabMediaStore,
} from '../services/media-sniffer.js';

describe('media-sniffer', () => {
  it('extracts lowercase extensions cleanly and ignores query strings', () => {
    expect(extractUrlExtension('https://cdn.example.com/videos/Demo.MP4?token=abc')).toBe('mp4');
    expect(extractUrlExtension('https://cdn.example.com/hls/master.m3u8?exp=123')).toBe('m3u8');
    expect(extractUrlExtension('https://cdn.example.com/no-ext')).toBe('');
  });

  it('normalizes URLs by stripping hash fragments while keeping auth tokens', () => {
    const raw = 'https://cdn.example.com/video.mp4?token=xyz#t=10';
    expect(normalizeMediaUrl(raw)).toBe('https://cdn.example.com/video.mp4?token=xyz');
  });

  it('classifies valid media MIME types and rejects text/html/json/protobuf', () => {
    expect(classifyMimeType('video/mp4; codecs="avc1"')).toBe('mp4');
    expect(classifyMimeType('application/vnd.apple.mpegurl')).toBe('hls');
    expect(classifyMimeType('video/webm')).toBe('webm');
    expect(classifyMimeType('text/plain')).toBeNull();
    expect(classifyMimeType('text/html')).toBeNull();
    expect(classifyMimeType('application/json')).toBeNull();
  });

  it('ignores raw YouTube googlevideo playback requests in generic network sniffer', () => {
    expect(
      inspectNetworkMedia({
        url: 'https://rr2---sn.googlevideo.com/videoplayback?c=ANDROID&itag=18&mime=video%2Fmp4&clen=4500000',
        tabId: 12,
      })
    ).toBeNull();
  });

  it('rejects text/plain or html responses even when URL has a media extension', () => {
    expect(
      inspectNetworkMedia({
        url: 'https://cdn.example.com/blocked.mp4',
        tabId: 5,
        contentType: 'text/plain',
        contentLength: 50000,
      })
    ).toBeNull();
  });

  it('detects HLS manifests, MP4 files, and filters out tiny tracking assets or .ts segments', () => {
    const hls = inspectNetworkMedia({
      url: 'https://stream.example.com/live/master.m3u8',
      tabId: 5,
      contentType: 'application/vnd.apple.mpegurl',
      contentLength: 850,
    });
    expect(hls?.format).toBe('hls');
    expect(hls?.streamKind).toBe('stream');

    const tinyMp4 = inspectNetworkMedia({
      url: 'https://ads.example.com/pixel.mp4',
      tabId: 5,
      contentType: 'video/mp4',
      contentLength: 1024, // < 20KB threshold
    });
    expect(tinyMp4).toBeNull();

    const tsSegment = inspectNetworkMedia({
      url: 'https://stream.example.com/seg-001.ts',
      tabId: 5,
      contentType: 'video/mp2t',
      contentLength: 250000,
    });
    expect(tsSegment).toBeNull();

    const validMp4 = inspectNetworkMedia({
      url: 'https://cdn.example.com/movie.mp4',
      tabId: 5,
      contentType: 'video/mp4',
      contentLength: 5_000_000,
    });
    expect(validMp4?.format).toBe('mp4');
    expect(validMp4?.sizeBytes).toBe(5_000_000);
  });

  it('maintains bounded LRU per-tab cache and serializes/hydrates cleanly', () => {
    const store = new TabMediaStore(2, 2);
    store.add({
      url: 'https://a.com/1.mp4',
      canonicalUrl: 'https://a.com/1.mp4',
      tabId: 1,
      format: 'mp4',
      streamKind: 'muxed',
      detectedAt: 1,
    });
    store.add({
      url: 'https://a.com/2.mp4',
      canonicalUrl: 'https://a.com/2.mp4',
      tabId: 1,
      format: 'mp4',
      streamKind: 'muxed',
      detectedAt: 2,
    });
    store.add({
      url: 'https://a.com/3.mp4',
      canonicalUrl: 'https://a.com/3.mp4',
      tabId: 1,
      format: 'mp4',
      streamKind: 'muxed',
      detectedAt: 3,
    });
    // Per-tab cap = 2
    expect(store.count(1)).toBe(2);
    expect(store.get(1).map((e) => e.url)).toEqual([
      'https://a.com/2.mp4',
      'https://a.com/3.mp4',
    ]);

    // Tab capacity = 2 -> adding tab 2 and tab 3 evicts tab 1
    store.add({
      url: 'https://b.com/1.mp4',
      canonicalUrl: 'https://b.com/1.mp4',
      tabId: 2,
      format: 'mp4',
      streamKind: 'muxed',
      detectedAt: 4,
    });
    store.add({
      url: 'https://c.com/1.mp4',
      canonicalUrl: 'https://c.com/1.mp4',
      tabId: 3,
      format: 'mp4',
      streamKind: 'muxed',
      detectedAt: 5,
    });
    expect(store.count(1)).toBe(0);

    const snapshot = store.serialize();
    const restored = new TabMediaStore(2, 2);
    restored.hydrate(snapshot);
    expect(restored.count(2)).toBe(1);
    expect(restored.count(3)).toBe(1);
  });
});

