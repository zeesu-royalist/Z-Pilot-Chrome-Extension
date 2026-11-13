import { DetectedVideo, VideoDownloadProgress } from '../types/index.js';
import { downloadHlsStream } from './hls-downloader.js';
import { sanitizeVideoFilename } from './video-deduper.js';

type ProgressCallback = (progress: VideoDownloadProgress) => void;

interface ActiveTask {
  abortController: AbortController;
  chromeDownloadId?: number;
}

const activeTasks = new Map<string, ActiveTask>();

function writeAsciiString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Losslessly convert an AudioBuffer (from Chromium's native decodeAudioData)
 * into a standard 16-bit PCM RIFF/WAVE Blob that plays anywhere.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const length = buffer.length;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // RIFF Chunk Descriptor
  writeAsciiString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeAsciiString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" sub-chunk
  writeAsciiString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Decode a media blob with Chromium native audio decoder and return a pure WAV audio blob
 */
export async function extractAudioFromBlob(
  mediaBlob: Blob
): Promise<{ blob: Blob; extension: 'wav' | 'm4a' }> {
  if (typeof window === 'undefined') {
    return { blob: mediaBlob, extension: 'm4a' };
  }
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return { blob: mediaBlob, extension: 'm4a' };
  }

  try {
    const audioCtx = new AudioContextClass();
    try {
      const arrayBuffer = await mediaBlob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      const wavBlob = audioBufferToWavBlob(audioBuffer);
      return { blob: wavBlob, extension: 'wav' };
    } finally {
      if (audioCtx.state !== 'closed' && typeof audioCtx.close === 'function') {
        audioCtx.close().catch(() => {});
      }
    }
  } catch {
    // If Web Audio decoding fails, fallback gracefully to saving original blob with .m4a extension
    return { blob: mediaBlob, extension: 'm4a' };
  }
}

function isPlainAudioUrl(url: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('audio/')) return true;
  const clean = url.toLowerCase().split('?')[0];
  return (
    clean.endsWith('.mp3') ||
    clean.endsWith('.m4a') ||
    clean.endsWith('.aac') ||
    clean.endsWith('.wav') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.flac')
  );
}

function triggerBackgroundDownload(params: {
  url: string;
  filename: string;
  videoId: string;
}): Promise<{ success: boolean; downloadId?: number; error?: string }> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve({ success: false, error: 'Chrome runtime unavailable' });
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'START_VIDEO_DOWNLOAD',
        url: params.url,
        filename: params.filename,
        videoId: params.videoId,
      },
      (res) => {
        if (chrome.runtime.lastError || !res) {
          resolve({
            success: false,
            error: chrome.runtime.lastError?.message || 'Failed to reach background downloader',
          });
        } else {
          resolve(res);
        }
      }
    );
  });
}

async function verifyDirectMediaUrl(
  url: string,
  signal: AbortSignal
): Promise<{ ok: boolean; status: number; contentType?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const combined = AbortSignal.any([signal, controller.signal]);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: combined });
      const ct = res.headers.get('content-type') || undefined;
      const lowerCt = ct?.split(';')[0].trim().toLowerCase() || '';
      const isTextOrHtml =
        lowerCt.startsWith('text/') || lowerCt.includes('html') || lowerCt.includes('json');
      return { ok: res.ok && !isTextOrHtml, status: res.status, contentType: ct };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // HEAD may be disabled on some CDNs; let download proceed
    return { ok: true, status: 200 };
  }
}

function triggerBrowserBlobDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const cleanName = filename.split('/').pop() || filename;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = cleanName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function fetchAsBlobFallback(
  url: string,
  video: DetectedVideo,
  signal: AbortSignal,
  onProgress: ProgressCallback
): Promise<Blob> {
  const response = await fetch(url, { signal, credentials: 'include' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching video`);
  }

  const ct = response.headers.get('content-type');
  const lowerCt = ct?.split(';')[0].trim().toLowerCase() || '';
  if (lowerCt.startsWith('text/') || lowerCt.includes('html') || lowerCt.includes('json')) {
    throw new Error(`Server returned "${lowerCt}" instead of a video file`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : video.sizeBytes;

  if (!response.body) {
    const b = await response.blob();
    if (b.size < 512) {
      throw new Error('Server returned an empty/invalid media response');
    }
    return b;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesDownloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      bytesDownloaded += value.byteLength;
      const percent = totalBytes
        ? Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100))
        : -1;
      onProgress({
        videoId: video.id,
        status: 'downloading',
        percent,
        bytesDownloaded,
        totalBytes,
      });
    }
  }

  if (bytesDownloaded < 512) {
    throw new Error('Downloaded response was too small to be a valid video');
  }

  return new Blob(chunks as BlobPart[], { type: video.mimeType || 'video/mp4' });
}

function sendRuntimeMessageSafe(payload: Record<string, unknown>): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return Promise.resolve();
  }
  return Promise.race([
    new Promise<void>((resolve) => {
      chrome.runtime.sendMessage(payload, () => resolve());
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 80)),
  ]);
}

export const VideoDownloaderService = {
  /**
   * 2nd-Click Download Entry Point:
   * - HLS (.m3u8) -> Concurrent segment downloader + AES-128 decryption + Blob save
   * - Progressive (MP4/WebM/MOV/Audio/YT 360p) -> Native chrome.downloads + Referer-backed fetch fallback
   */
  async downloadVideo(
    video: DetectedVideo,
    _tabId: number,
    onProgress: ProgressCallback,
    pageUrl?: string,
    options?: { audioOnly?: boolean }
  ): Promise<void> {
    if (activeTasks.has(video.id)) {
      return;
    }

    const isAudioOnly = Boolean(
      options?.audioOnly || video.format === 'audio' || video.streamKind === 'audio-only'
    );
    const mode: 'video' | 'audio' = isAudioOnly ? 'audio' : 'video';

    // Enforce strictly one download at a time
    if (activeTasks.size > 0) {
      onProgress({
        videoId: video.id,
        status: 'failed',
        percent: 0,
        bytesDownloaded: 0,
        mode,
        message: 'Another download is in progress. Only one download at a time is allowed.',
      });
      return;
    }

    const abortController = new AbortController();
    activeTasks.set(video.id, { abortController });

    try {
      // Ensure MV3 declarativeNetRequest header rules are active before network fetch
      if (video.source === 'youtube' || video.url.includes('googlevideo.com')) {
        await sendRuntimeMessageSafe({ type: 'ENSURE_YT_DNR_RULES' });
      } else if (pageUrl && video.url.startsWith('http')) {
        await sendRuntimeMessageSafe({
          type: 'SET_DOWNLOAD_REFERER_RULE',
          mediaUrl: video.url,
          pageUrl,
        });
      }

      // Strategy 1: Concurrent HLS (.m3u8) Stream Downloader (HD/4K for general websites)
      if (video.format === 'hls') {
        onProgress({
          videoId: video.id,
          status: 'preparing',
          percent: 0,
          bytesDownloaded: 0,
          mode,
          message: isAudioOnly ? 'Parsing audio stream...' : 'Parsing HLS playlist...',
        });

        const hlsResult = await downloadHlsStream({
          url: video.url,
          concurrency: 5,
          signal: abortController.signal,
          onProgress: (p) => {
            onProgress({
              videoId: video.id,
              status: 'downloading',
              percent: p.percent,
              bytesDownloaded: p.bytesDownloaded,
              completedSegments: p.completedSegments,
              totalSegments: p.totalSegments,
              mode,
              message: isAudioOnly
                ? `Segment ${p.completedSegments}/${p.totalSegments} (Audio)`
                : `Segment ${p.completedSegments}/${p.totalSegments}`,
            });
          },
        });

        if (isAudioOnly) {
          onProgress({
            videoId: video.id,
            status: 'muxing',
            percent: 99,
            bytesDownloaded: hlsResult.totalBytes,
            totalBytes: hlsResult.totalBytes,
            mode,
            message: 'Extracting audio track...',
          });

          const audioExtract = await extractAudioFromBlob(hlsResult.blob);
          const finalFilename = sanitizeVideoFilename(
            video.title,
            audioExtract.extension,
            'Audio'
          );
          const blobUrl = URL.createObjectURL(audioExtract.blob);
          const dlRes = await triggerBackgroundDownload({
            url: blobUrl,
            filename: finalFilename,
            videoId: video.id,
          });

          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

          if (!dlRes.success) {
            throw new Error(dlRes.error || 'Failed to save assembled audio file');
          }

          const task = activeTasks.get(video.id);
          if (task) task.chromeDownloadId = dlRes.downloadId;

          onProgress({
            videoId: video.id,
            status: 'completed',
            percent: 100,
            bytesDownloaded: audioExtract.blob.size,
            totalBytes: audioExtract.blob.size,
            chromeDownloadId: dlRes.downloadId,
            mode: 'audio',
            message: `Saved ${finalFilename}`,
          });
          activeTasks.delete(video.id);
          return;
        }

        onProgress({
          videoId: video.id,
          status: 'muxing',
          percent: 99,
          bytesDownloaded: hlsResult.totalBytes,
          totalBytes: hlsResult.totalBytes,
          mode,
          message: 'Saving assembled video...',
        });

        const finalFilename = sanitizeVideoFilename(
          video.title,
          hlsResult.fileExtension,
          video.quality
        );
        const blobUrl = URL.createObjectURL(hlsResult.blob);
        const dlRes = await triggerBackgroundDownload({
          url: blobUrl,
          filename: finalFilename,
          videoId: video.id,
        });

        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

        if (!dlRes.success) {
          throw new Error(dlRes.error || 'Failed to save assembled HLS file');
        }

        const task = activeTasks.get(video.id);
        if (task) task.chromeDownloadId = dlRes.downloadId;

        onProgress({
          videoId: video.id,
          status: 'completed',
          percent: 100,
          bytesDownloaded: hlsResult.totalBytes,
          totalBytes: hlsResult.totalBytes,
          chromeDownloadId: dlRes.downloadId,
          mode: 'video',
          message: `Saved ${finalFilename}`,
        });
        activeTasks.delete(video.id);
        return;
      }

      // Strategy 2: Direct / Progressive File Download (MP4, WebM, MOV, Audio, YouTube 360p)
      onProgress({
        videoId: video.id,
        status: 'preparing',
        percent: 0,
        bytesDownloaded: 0,
        totalBytes: video.sizeBytes,
        mode,
        message: isAudioOnly ? 'Preparing audio download...' : 'Starting video download...',
      });

      const isDirectAudio =
        isAudioOnly &&
        isPlainAudioUrl(video.url, video.mimeType) &&
        video.source !== 'youtube' &&
        !video.url.includes('googlevideo.com');

      let canUseDirectChromeDownload = !isAudioOnly || isDirectAudio;
      if (video.url.includes('googlevideo.com/videoplayback')) {
        const preCheck = await verifyDirectMediaUrl(video.url, abortController.signal);
        if (!preCheck.ok) {
          canUseDirectChromeDownload = false;
        }
      }

      // If user wants audio extraction from video stream, we stream via fetch to extract pure audio
      if (isAudioOnly && !isDirectAudio) {
        canUseDirectChromeDownload = false;
      }

      const directRes = canUseDirectChromeDownload
        ? await triggerBackgroundDownload({
            url: video.url,
            filename: video.filename,
            videoId: video.id,
          })
        : { success: false, error: 'Direct URL rejected' };

      if (directRes.success) {
        const task = activeTasks.get(video.id);
        if (task) task.chromeDownloadId = directRes.downloadId;
        onProgress({
          videoId: video.id,
          status: 'downloading',
          percent: 5,
          bytesDownloaded: 0,
          totalBytes: video.sizeBytes,
          chromeDownloadId: directRes.downloadId,
          mode,
          message: isAudioOnly ? 'Downloading audio...' : 'Downloading video...',
        });
        return;
      }

      // Fallback: Stream via extension fetch (receives Referer/Origin DNR rules) and save Blob
      const blob = await fetchAsBlobFallback(video.url, video, abortController.signal, onProgress);

      if (isAudioOnly && !isDirectAudio) {
        onProgress({
          videoId: video.id,
          status: 'muxing',
          percent: 99,
          bytesDownloaded: blob.size,
          totalBytes: blob.size,
          mode: 'audio',
          message: 'Extracting audio track...',
        });

        const audioExtract = await extractAudioFromBlob(blob);
        const finalFilename = sanitizeVideoFilename(
          video.title,
          audioExtract.extension,
          'Audio'
        );
        const blobUrl = URL.createObjectURL(audioExtract.blob);
        const fallbackRes = await triggerBackgroundDownload({
          url: blobUrl,
          filename: finalFilename,
          videoId: video.id,
        });
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

        if (!fallbackRes.success) {
          triggerBrowserBlobDownload(audioExtract.blob, finalFilename);
        }

        onProgress({
          videoId: video.id,
          status: 'completed',
          percent: 100,
          bytesDownloaded: audioExtract.blob.size,
          totalBytes: audioExtract.blob.size,
          chromeDownloadId: fallbackRes.downloadId,
          mode: 'audio',
          message: `Saved ${finalFilename}`,
        });
        activeTasks.delete(video.id);
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      const fallbackRes = await triggerBackgroundDownload({
        url: blobUrl,
        filename: video.filename,
        videoId: video.id,
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

      if (!fallbackRes.success) {
        triggerBrowserBlobDownload(blob, video.filename);
      }

      onProgress({
        videoId: video.id,
        status: 'completed',
        percent: 100,
        bytesDownloaded: blob.size,
        totalBytes: blob.size,
        chromeDownloadId: fallbackRes.downloadId,
        mode: 'video',
        message: `Saved ${video.filename}`,
      });
      activeTasks.delete(video.id);
    } catch (err: unknown) {
      activeTasks.delete(video.id);
      const isAbort = (err as Error)?.name === 'AbortError';
      onProgress({
        videoId: video.id,
        status: isAbort ? 'cancelled' : 'failed',
        percent: 0,
        bytesDownloaded: 0,
        mode,
        message: isAbort
          ? 'Download cancelled'
          : (err as Error)?.message || 'Download failed',
      });
    }
  },

  async downloadAudioOnly(
    video: DetectedVideo,
    tabId: number,
    onProgress: ProgressCallback,
    pageUrl?: string
  ): Promise<void> {
    return this.downloadVideo(video, tabId, onProgress, pageUrl, { audioOnly: true });
  },

  cancelDownload(videoId: string): void {
    const task = activeTasks.get(videoId);
    if (!task) return;

    task.abortController.abort();
    if (task.chromeDownloadId && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'CANCEL_VIDEO_DOWNLOAD',
        downloadId: task.chromeDownloadId,
      });
    }
    activeTasks.delete(videoId);
  },

  markFinished(videoId: string): void {
    activeTasks.delete(videoId);
  },
};
