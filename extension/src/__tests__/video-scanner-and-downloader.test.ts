import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { sanitizeAndValidatePlan } from '../services/agent-planner.js';
import { extractYouTubeVideoId, VideoScannerService } from '../services/video-scanner.js';
import { audioBufferToWavBlob, VideoDownloaderService } from '../services/video-downloader.js';
import { autoFillY2matePage } from '../services/y2mate-autofill.js';
import { VideoScannerPanel } from '../components/VideoScannerPanel.js';
import type { DetectedVideo, VideoScanResult } from '../types/index.js';

describe('Z-Pilot v2 integration: planner, scanner, downloader & UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts YouTube video IDs cleanly across watch, shorts, live, embed, and youtu.be URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=XTp5jaRU3Ws&t=12s')).toBe(
      'XTp5jaRU3Ws'
    );
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/abcDEF12345')).toBe(
      'abcDEF12345'
    );
    expect(extractYouTubeVideoId('https://youtu.be/_ijaEtNzZgw?si=xyz')).toBe('_ijaEtNzZgw');
    expect(extractYouTubeVideoId('https://www.youtube.com/live/liveId99887')).toBe(
      'liveId99887'
    );
  });

  it('allows SCAN_VIDEOS in agent-planner while blocking arbitrary unknown actions', () => {
    const validated = sanitizeAndValidatePlan({
      reply: 'Scanning page videos now.',
      plan: {
        summary: 'Scan Page Videos',
        actions: [
          { type: 'SCAN_VIDEOS', description: 'Scan videos on current page' },
          { type: 'EVAL_JS', description: 'Should be skipped' },
        ],
      },
    });

    expect(validated.plan?.actions).toHaveLength(1);
    expect(validated.plan?.actions[0].type).toBe('SCAN_VIDEOS');
  });

  it('runs parallel scan across DOM, frames, network sniffer, and HLS variant expansion', async () => {
    const mockChrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          { id: 7, url: 'https://example.com/video-page', title: 'Cool Video' },
        ]),
        sendMessage: vi.fn((_tabId, msg, cb) => {
          if (msg.type === 'PING') cb({ status: 'ok' });
          else if (msg.type === 'SCAN_VIDEOS') {
            cb({
              videos: [
                {
                  url: 'https://cdn.example.com/clip.mp4',
                  title: 'Cool Video',
                  format: 'mp4',
                  width: 1280,
                  height: 720,
                  source: 'dom',
                },
              ],
            });
          }
        }),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([
          { result: [{ url: 'https://cdn.example.com/iframe.mp4', format: 'mp4', source: 'dom' }] },
        ]),
      },
      runtime: {
        lastError: null,
        sendMessage: vi.fn((msg, cb) => {
          if (msg.type === 'GET_SNIFFED_MEDIA') {
            cb({
              entries: [
                {
                  url: 'https://cdn.example.com/master.m3u8',
                  canonicalUrl: 'https://cdn.example.com/master.m3u8',
                  tabId: 7,
                  format: 'hls',
                  streamKind: 'stream',
                  detectedAt: Date.now(),
                },
              ],
            });
          }
        }),
      },
    };

    vi.stubGlobal('chrome', mockChrome);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
1080p.m3u8`,
        { status: 200 }
      )
    );

    const result = await VideoScannerService.scanActiveTab();
    expect(result.error).toBeUndefined();
    expect(result.videos.map((v) => v.url)).toContain('https://cdn.example.com/clip.mp4');
    expect(result.videos.map((v) => v.url)).toContain('https://cdn.example.com/iframe.mp4');
    expect(result.videos.map((v) => v.url)).toContain('https://cdn.example.com/1080p.m3u8');
    expect(result.sourcesChecked.hlsVariantsExpanded).toBe(1);
  });

  it('triggers background chrome.downloads on 2nd-click direct download', async () => {
    const sendMessageMock = vi.fn((msg, cb) => {
      if (msg.type === 'START_VIDEO_DOWNLOAD') {
        cb({ success: true, downloadId: 42 });
      }
    });
    vi.stubGlobal('chrome', {
      runtime: { lastError: null, sendMessage: sendMessageMock },
    });

    const video: DetectedVideo = {
      id: 'vid_1',
      url: 'https://cdn.example.com/sample.mp4',
      canonicalUrl: 'https://cdn.example.com/sample.mp4',
      title: 'Sample MP4',
      format: 'mp4',
      streamKind: 'muxed',
      source: 'dom',
      filename: 'Sample MP4.mp4',
      score: 600,
      detectedAt: Date.now(),
    };

    const statuses: string[] = [];
    await VideoDownloaderService.downloadVideo(video, 7, (p) => statuses.push(p.status));

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_VIDEO_DOWNLOAD',
        url: 'https://cdn.example.com/sample.mp4',
        filename: 'Sample MP4.mp4',
      }),
      expect.any(Function)
    );
    expect(statuses).toContain('downloading');
    VideoDownloaderService.markFinished('vid_1');
  });

  it('renders VideoScannerPanel and wires Rescan (click 1) and Download (click 2)', () => {
    const onScan = vi.fn();
    const onDownload = vi.fn();
    const scanResult: VideoScanResult = {
      tabId: 1,
      pageUrl: 'https://example.com',
      pageTitle: 'Test Page',
      scannedAt: Date.now(),
      scanDurationMs: 25,
      sourcesChecked: {
        domFrames: 1,
        networkEntries: 1,
        youtubeExtracted: false,
        hlsVariantsExpanded: 0,
      },
      videos: [
        {
          id: 'vid_1',
          url: 'https://cdn.example.com/demo.mp4',
          canonicalUrl: 'https://cdn.example.com/demo.mp4',
          title: 'Demo HD Video',
          format: 'mp4',
          streamKind: 'muxed',
          source: 'dom',
          quality: '1080p',
          sizeBytes: 10_485_760,
          filename: 'Demo HD Video [1080p].mp4',
          score: 700,
          detectedAt: Date.now(),
        },
      ],
    };

    render(
      React.createElement(VideoScannerPanel, {
        isOpen: true,
        onClose: vi.fn(),
        isScanning: false,
        scanResult,
        progressMap: {},
        onScan,
        onDownload,
        onCancelDownload: vi.fn(),
      })
    );

    expect(screen.getByText('Demo HD Video')).toBeTruthy();
    expect(screen.getByText('1080p')).toBeTruthy();
    expect(screen.getByText('10 MB')).toBeTruthy();

    fireEvent.click(screen.getByText('Rescan'));
    expect(onScan).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Download Video'));
    expect(onDownload).toHaveBeenCalledWith(scanResult.videos[0]);
  });

  it('shows YouTube HD explanation note and 1-click Auto-Fill Y2mate action on YouTube pages', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const sendMessageMock = vi.fn((_msg, cb) => cb?.({ success: true, filled: true, submitted: true }));
    vi.stubGlobal('navigator', {
      clipboard: { writeText: writeTextMock },
    });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: sendMessageMock },
    });

    const ytUrl = 'https://www.youtube.com/watch?v=XTp5jaRU3Ws';
    const scanResult: VideoScanResult = {
      tabId: 3,
      pageUrl: ytUrl,
      pageTitle: 'WAVY - YouTube',
      scannedAt: Date.now(),
      scanDurationMs: 42,
      isYouTube: true,
      sourcesChecked: {
        domFrames: 1,
        networkEntries: 0,
        youtubeExtracted: true,
        hlsVariantsExpanded: 0,
      },
      videos: [
        {
          id: 'vid_yt_360',
          url: 'https://rr1---sn.googlevideo.com/videoplayback?itag=18',
          canonicalUrl: 'https://rr1---sn.googlevideo.com/videoplayback?itag=18',
          title: 'WAVY (Official Video)',
          format: 'mp4',
          streamKind: 'muxed',
          source: 'youtube',
          quality: '360p',
          sizeBytes: 8_500_000,
          filename: 'WAVY (Official Video) [360p].mp4',
          score: 600,
          detectedAt: Date.now(),
        },
      ],
    };

    render(
      React.createElement(VideoScannerPanel, {
        isOpen: true,
        onClose: vi.fn(),
        isScanning: false,
        scanResult,
        progressMap: {},
        onScan: vi.fn(),
        onDownload: vi.fn(),
        onCancelDownload: vi.fn(),
      })
    );

    expect(screen.getByText('WAVY (Official Video)')).toBeTruthy();
    expect(screen.getByText('360p')).toBeTruthy();
    expect(screen.getByText(/Why 720p \/ 1080p \/ 4K isn't shown here/i)).toBeTruthy();
    expect(screen.getByText('v42.www-y2mate.com')).toBeTruthy();

    fireEvent.click(screen.getByText(/Open Y2mate & Auto-Fill HD/i));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(ytUrl);
      expect(sendMessageMock).toHaveBeenCalledWith(
        {
          type: 'OPEN_Y2MATE_WITH_URL',
          targetVideoUrl: ytUrl,
        },
        expect.any(Function)
      );
    });
  });

  it('autoFillY2matePage fills #txt-url, fires input/change events, and clicks #btn-submit', async () => {
    document.body.innerHTML = `
      <form id="search-form">
        <input id="txt-url" name="url" type="text" />
        <button id="btn-submit" type="button">Start</button>
      </form>
    `;

    const inputEl = document.getElementById('txt-url') as HTMLInputElement;
    const submitBtn = document.getElementById('btn-submit') as HTMLButtonElement;
    const onInput = vi.fn();
    const onChange = vi.fn();
    const onSubmitClick = vi.fn();

    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('change', onChange);
    submitBtn.addEventListener('click', onSubmitClick);

    const ytUrl = 'https://www.youtube.com/watch?v=XTp5jaRU3Ws';
    const result = await autoFillY2matePage(ytUrl);

    expect(result).toEqual({ filled: true, submitted: true });
    expect(inputEl.value).toBe(ytUrl);
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSubmitClick).toHaveBeenCalledTimes(1);
  });

  it('losslessly encodes decoded AudioBuffer to standard 16-bit PCM WAV Blob', async () => {
    const sampleRate = 44100;
    const numChannels = 2;
    const length = 50;
    const ch0 = new Float32Array(length).fill(0.5);
    const ch1 = new Float32Array(length).fill(-0.5);

    const mockAudioBuffer = {
      numberOfChannels: numChannels,
      sampleRate,
      length,
      duration: length / sampleRate,
      getChannelData: (c: number) => (c === 0 ? ch0 : ch1),
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWavBlob(mockAudioBuffer);
    expect(wavBlob.type).toBe('audio/wav');
    // 44-byte RIFF header + 50 samples * 2 channels * 2 bytes = 244 bytes
    expect(wavBlob.size).toBe(44 + 50 * 2 * 2);

    const arrayBuffer = await wavBlob.arrayBuffer();
    const view = new DataView(arrayBuffer);
    const decoder = new TextDecoder();
    expect(decoder.decode(new Uint8Array(arrayBuffer, 0, 4))).toBe('RIFF');
    expect(decoder.decode(new Uint8Array(arrayBuffer, 8, 4))).toBe('WAVE');
    expect(decoder.decode(new Uint8Array(arrayBuffer, 12, 4))).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // Stereo
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint16(34, true)).toBe(16); // 16-bit
    expect(decoder.decode(new Uint8Array(arrayBuffer, 36, 4))).toBe('data');
  });

  it('provides dedicated "Audio" download button on video cards and filters in Audio tab', () => {
    const onDownload = vi.fn();
    const onDownloadAudio = vi.fn();

    const scanResult: VideoScanResult = {
      tabId: 5,
      pageUrl: 'https://example.com/stream-page',
      pageTitle: 'Media Studio',
      scannedAt: Date.now(),
      scanDurationMs: 15,
      sourcesChecked: {
        domFrames: 1,
        networkEntries: 1,
        youtubeExtracted: false,
        hlsVariantsExpanded: 0,
      },
      videos: [
        {
          id: 'vid_vid1',
          url: 'https://cdn.example.com/lecture.mp4',
          canonicalUrl: 'https://cdn.example.com/lecture.mp4',
          title: 'Lecture Video',
          format: 'mp4',
          streamKind: 'muxed',
          source: 'dom',
          quality: '720p',
          filename: 'Lecture Video [720p].mp4',
          score: 600,
          detectedAt: Date.now(),
        },
        {
          id: 'vid_aud1',
          url: 'https://cdn.example.com/podcast.mp3',
          canonicalUrl: 'https://cdn.example.com/podcast.mp3',
          title: 'Podcast Episode',
          format: 'audio',
          streamKind: 'audio-only',
          source: 'dom',
          quality: '192kbps',
          filename: 'Podcast Episode.mp3',
          score: 300,
          detectedAt: Date.now(),
        },
      ],
    };

    render(
      React.createElement(VideoScannerPanel, {
        isOpen: true,
        onClose: vi.fn(),
        isScanning: false,
        scanResult,
        progressMap: {},
        onScan: vi.fn(),
        onDownload,
        onDownloadAudio,
        onCancelDownload: vi.fn(),
      })
    );

    // Both video and audio should be visible initially (All tab)
    expect(screen.getByText('Lecture Video')).toBeTruthy();
    expect(screen.getByText('Podcast Episode')).toBeTruthy();

    // Video card has both Download and Audio buttons
    const audioBtn = screen.getByTitle(/Download pure audio track/i);
    expect(audioBtn).toBeTruthy();
    fireEvent.click(audioBtn);
    expect(onDownloadAudio).toHaveBeenCalledWith(scanResult.videos[0]);

    // Switch to Audio filter tab
    fireEvent.click(screen.getByText(/Audio \(1\)/i));
    expect(screen.queryByText('Lecture Video')).toBeNull();
    expect(screen.getByText('Podcast Episode')).toBeTruthy();
    expect(screen.getByText('Download Audio')).toBeTruthy();
  });

  it('automatically reverts the download button back to idle after download completes', async () => {
    vi.useFakeTimers();
    const scanResult: VideoScanResult = {
      tabId: 9,
      pageUrl: 'https://example.com/test',
      pageTitle: 'Test Page',
      scannedAt: Date.now(),
      scanDurationMs: 10,
      sourcesChecked: {
        domFrames: 1,
        networkEntries: 0,
        youtubeExtracted: false,
        hlsVariantsExpanded: 0,
      },
      videos: [
        {
          id: 'vid_revert',
          url: 'https://cdn.example.com/movie.mp4',
          canonicalUrl: 'https://cdn.example.com/movie.mp4',
          title: 'Action Movie',
          format: 'mp4',
          streamKind: 'muxed',
          source: 'dom',
          filename: 'Action Movie.mp4',
          score: 500,
          detectedAt: Date.now(),
        },
      ],
    };

    const { rerender } = render(
      React.createElement(VideoScannerPanel, {
        isOpen: true,
        onClose: vi.fn(),
        isScanning: false,
        scanResult,
        progressMap: {
          vid_revert: {
            videoId: 'vid_revert',
            status: 'completed',
            percent: 100,
            bytesDownloaded: 1000,
            message: 'Saved Action Movie.mp4',
          },
        },
        onScan: vi.fn(),
        onDownload: vi.fn(),
        onCancelDownload: vi.fn(),
      })
    );

    // Shows completed state initially
    expect(screen.getByText('Video Downloaded!')).toBeTruthy();

    // Fast forward 3.6 seconds
    act(() => {
      vi.advanceTimersByTime(3600);
    });

    rerender(
      React.createElement(VideoScannerPanel, {
        isOpen: true,
        onClose: vi.fn(),
        isScanning: false,
        scanResult,
        progressMap: {
          vid_revert: {
            videoId: 'vid_revert',
            status: 'completed',
            percent: 100,
            bytesDownloaded: 1000,
            message: 'Saved Action Movie.mp4',
          },
        },
        onScan: vi.fn(),
        onDownload: vi.fn(),
        onCancelDownload: vi.fn(),
      })
    );

    // After timer fires, button has reverted back to idle "Download Video"
    expect(screen.getByText('Download Video')).toBeTruthy();
    expect(screen.queryByText('Video Downloaded!')).toBeNull();

    vi.useRealTimers();
  });

  it('displays "Audio Downloaded!" when user downloads audio from a video card', () => {
    const scanResult: VideoScanResult = {
      tabId: 10,
      pageUrl: 'https://example.com/watch',
      pageTitle: 'Music Video',
      scannedAt: Date.now(),
      scanDurationMs: 12,
      sourcesChecked: {
        domFrames: 1,
        networkEntries: 0,
        youtubeExtracted: false,
        hlsVariantsExpanded: 0,
      },
      videos: [
        {
          id: 'vid_mv',
          url: 'https://cdn.example.com/song.mp4',
          canonicalUrl: 'https://cdn.example.com/song.mp4',
          title: 'Popular Song',
          format: 'mp4',
          streamKind: 'muxed',
          source: 'dom',
          filename: 'Popular Song.mp4',
          score: 500,
          detectedAt: Date.now(),
        },
      ],
    };

    const { rerender } = render(
      React.createElement(VideoScannerPanel, {
        isOpen: true,
        onClose: vi.fn(),
        isScanning: false,
        scanResult,
        progressMap: {},
        onScan: vi.fn(),
        onDownload: vi.fn(),
        onDownloadAudio: vi.fn(),
        onCancelDownload: vi.fn(),
      })
    );

    // Click the Audio (MP3) button on the video card
    const audioBtn = screen.getByText('Audio (MP3)');
    fireEvent.click(audioBtn);

    // Simulate completion with mode: 'audio'
    rerender(
      React.createElement(VideoScannerPanel, {
        isOpen: true,
        onClose: vi.fn(),
        isScanning: false,
        scanResult,
        progressMap: {
          vid_mv: {
            videoId: 'vid_mv',
            status: 'completed',
            percent: 100,
            bytesDownloaded: 500000,
            mode: 'audio',
            message: 'Saved Popular Song [Audio].wav',
          },
        },
        onScan: vi.fn(),
        onDownload: vi.fn(),
        onDownloadAudio: vi.fn(),
        onCancelDownload: vi.fn(),
      })
    );

    // Must show "Audio Downloaded!" and NOT "Video Downloaded!"
    expect(screen.getByText('Audio Downloaded!')).toBeTruthy();
    expect(screen.queryByText('Video Downloaded!')).toBeNull();
  });
});

