import {
  SniffedMediaEntry,
  VideoFormatKind,
  VideoScanResult,
} from '../types/index.js';
import { BrowserActionService, isRestrictedUrl } from './browser-actions.js';
import { fetchAndParseM3u8 } from './hls-downloader.js';
import {
  mergeAndRankVideos,
  RawDomVideoCandidate,
  RawYouTubeFormatCandidate,
  selectDownloadableYouTubeFormats,
  isGenericTitle,
  extractTitleFromUrl,
} from './video-deduper.js';

/**
 * Self-contained lightweight iframe scanner injected via chrome.scripting.executeScript({ allFrames: true })
 * Must remain zero-dependency because Chrome serializes func.toString() into each frame.
 */
function frameVideoScanScript(): RawDomVideoCandidate[] {
  const candidates: RawDomVideoCandidate[] = [];
  const seen = new Set<string>();
  const baseHref = window.location.href;
  const title = document.title || '';

  const add = (
    url: string,
    format?: VideoFormatKind,
    width?: number,
    height?: number,
    durationSeconds?: number,
    thumbnailUrl?: string
  ) => {
    if (!url || url.startsWith('blob:') || seen.has(url)) return;
    seen.add(url);
    candidates.push({
      url,
      title,
      format,
      width,
      height,
      durationSeconds,
      thumbnailUrl,
      source: 'dom',
    });
  };

  const videos = document.querySelectorAll('video');
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i] as HTMLVideoElement;
    const poster = v.poster || undefined;
    const w = v.videoWidth || undefined;
    const h = v.videoHeight || undefined;
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : undefined;

    if (v.currentSrc) add(v.currentSrc, undefined, w, h, dur, poster);
    const attrSrc = v.getAttribute('src');
    if (attrSrc) {
      try {
        add(new URL(attrSrc, baseHref).toString(), undefined, w, h, dur, poster);
      } catch {
        // Ignore invalid relative URL
      }
    }
    const sources = v.querySelectorAll('source');
    for (let j = 0; j < sources.length; j++) {
      const sSrc = sources[j].getAttribute('src');
      if (sSrc) {
        try {
          add(new URL(sSrc, baseHref).toString(), undefined, w, h, dur, poster);
        } catch {
          // Ignore
        }
      }
    }
  }

  const audios = document.querySelectorAll('audio');
  for (let i = 0; i < audios.length; i++) {
    const a = audios[i] as HTMLAudioElement;
    const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : undefined;

    if (a.currentSrc) add(a.currentSrc, 'audio', undefined, undefined, dur);
    const attrSrc = a.getAttribute('src');
    if (attrSrc) {
      try {
        add(new URL(attrSrc, baseHref).toString(), 'audio', undefined, undefined, dur);
      } catch {
        // Ignore
      }
    }
    const sources = a.querySelectorAll('source');
    for (let j = 0; j < sources.length; j++) {
      const sSrc = sources[j].getAttribute('src');
      if (sSrc) {
        try {
          add(new URL(sSrc, baseHref).toString(), 'audio', undefined, undefined, dur);
        } catch {
          // Ignore
        }
      }
    }
  }

  return candidates;
}

/**
 * Extract YouTube video ID from watch, shorts, live, embed, or youtu.be URLs
 */
export function extractYouTubeVideoId(href: string): string {
  try {
    const u = new URL(href);
    const vParam = u.searchParams.get('v');
    if (vParam) return vParam;
    const parts = u.pathname.split('/').filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed')
    ) {
      return parts[1];
    }
    if (u.hostname === 'youtu.be' && parts[0]) return parts[0];
  } catch {
    // Ignore invalid URLs
  }
  return '';
}

/**
 * Parses ONLY reliably downloadable muxed (Video + Audio) streams from YouTube playerResponse.
 * Adaptive HD/4K streams are intentionally omitted on YouTube because Google gates them behind
 * BotGuard PO Tokens & SABR; users are guided to SnapYT in the UI for HD/4K YouTube downloads.
 */
function parseDownloadableYouTubeMuxedFormats(
  playerResponse: Record<string, unknown>,
  fallbackTitle: string
): {
  title: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  formats: RawYouTubeFormatCandidate[];
} {
  const videoDetails = (playerResponse.videoDetails || {}) as {
    title?: string;
    lengthSeconds?: string;
    thumbnail?: { thumbnails?: Array<{ url: string; width?: number }> };
  };
  const streamingData = (playerResponse.streamingData || {}) as {
    formats?: Array<Record<string, unknown>>;
  };

  const title = videoDetails.title || fallbackTitle;
  const durationSeconds = Number(videoDetails.lengthSeconds) || undefined;
  const thumbs = videoDetails.thumbnail?.thumbnails || [];
  const thumbnailUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : undefined;
  const formats: RawYouTubeFormatCandidate[] = [];

  if (!Array.isArray(streamingData.formats)) {
    return { title, durationSeconds, thumbnailUrl, formats };
  }

  for (const f of streamingData.formats) {
    const directUrl = typeof f.url === 'string' ? f.url : '';
    if (!directUrl) continue;
    // Skip WEB client URLs that fail direct browser downloads with 403
    if (directUrl.includes('c=WEB') || directUrl.includes('alr=yes')) continue;

    const mimeType = typeof f.mimeType === 'string' ? f.mimeType : '';
    if (!mimeType.startsWith('video/')) continue;

    const format: VideoFormatKind = mimeType.includes('webm') ? 'webm' : 'mp4';
    const qualityLabel = typeof f.qualityLabel === 'string' ? f.qualityLabel : '360p';

    let sizeBytes = f.contentLength ? Number(f.contentLength) : undefined;
    if (!sizeBytes || !Number.isFinite(sizeBytes)) {
      try {
        const clen = new URL(directUrl).searchParams.get('clen');
        if (clen && /^\d+$/.test(clen)) sizeBytes = Number(clen);
      } catch {
        // Ignore
      }
    }

    formats.push({
      url: directUrl,
      title,
      format,
      streamKind: 'muxed',
      mimeType: mimeType.split(';')[0],
      quality: qualityLabel,
      width: typeof f.width === 'number' ? f.width : undefined,
      height: typeof f.height === 'number' ? f.height : undefined,
      durationSeconds,
      sizeBytes: sizeBytes && Number.isFinite(sizeBytes) ? sizeBytes : undefined,
      thumbnailUrl,
      itag: typeof f.itag === 'number' ? f.itag : undefined,
    });
  }

  return { title, durationSeconds, thumbnailUrl, formats };
}

/**
 * Fetches YouTube's reliable progressive muxed MP4 stream (Video + Audio, typically 360p)
 * and verifies that the stream responds cleanly (not 403/text) before surfacing it.
 */
async function fetchYouTubeDownloadableMuxed(
  videoId: string,
  fallbackTitle: string,
  signal?: AbortSignal
): Promise<{
  title: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  formats: RawYouTubeFormatCandidate[];
  needsAuthFallback?: boolean;
} | null> {
  if (!videoId) return null;

  await new Promise<void>((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'ENSURE_YT_DNR_RULES' }, () => resolve());
    } else {
      resolve();
    }
  });

  let status: string | undefined;
  try {
    const res = await fetch(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false&__zp_client=android',
      {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '20.10.38',
              androidSdkVersion: 34,
              osName: 'Android',
              osVersion: '14',
              hl: 'en',
              gl: 'US',
            },
          },
          videoId,
        }),
        signal,
      }
    );

    if (!res.ok) return null;
    const playerRes = (await res.json()) as Record<string, unknown>;
    status = (playerRes?.playabilityStatus as { status?: string } | undefined)?.status;

    if (status === 'OK' && playerRes.streamingData) {
      const parsed = parseDownloadableYouTubeMuxedFormats(playerRes, fallbackTitle);
      const verified: RawYouTubeFormatCandidate[] = [];

      for (const fmt of parsed.formats) {
        try {
          const probe = new URL(fmt.url);
          probe.searchParams.set('range', '0-1023');
          const probeRes = await fetch(probe.toString(), { signal });
          const ct = probeRes.headers.get('content-type')?.toLowerCase() || '';
          if (probeRes.ok && !ct.startsWith('text/')) {
            verified.push(fmt);
          }
        } catch {
          // Skip unverified formats
        }
      }

      const verifiedWithAudio: RawYouTubeFormatCandidate[] = [...verified];
      for (const fmt of verified) {
        verifiedWithAudio.push({
          url: fmt.url,
          title: `${fmt.title} (Audio)`,
          format: 'audio',
          streamKind: 'audio-only',
          mimeType: 'audio/mp4',
          quality: '128kbps Audio',
          durationSeconds: fmt.durationSeconds,
          sizeBytes: fmt.sizeBytes ? Math.round(fmt.sizeBytes * 0.25) : undefined,
          thumbnailUrl: fmt.thumbnailUrl,
          itag: fmt.itag,
        });
      }

      return { ...parsed, formats: verifiedWithAudio };
    }
  } catch {
    return null;
  }

  return {
    title: fallbackTitle,
    formats: [],
    needsAuthFallback: status === 'LOGIN_REQUIRED',
  };
}

/**
 * Lightweight MAIN-world fallback used only when a YouTube video requires logged-in cookies.
 */
async function extractYouTubeAuthedMuxedScript(): Promise<Record<string, unknown> | null> {
  try {
    const u = new URL(window.location.href);
    const parts = u.pathname.split('/').filter(Boolean);
    const vid =
      u.searchParams.get('v') ||
      (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed' ? parts[1] : '');
    if (!vid) return null;

    const res = await fetch('/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
            androidSdkVersion: 34,
            osName: 'Android',
            osVersion: '14',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId: vid,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const VideoScannerService = {
  /**
   * 1-Click high-performance parallel scan of the active tab.
   * - General websites: deep DOM + all-frames iframe scan + passive network sniffer + HLS 4K/1080p/720p expansion.
   * - YouTube: exposes only verified reliably downloadable muxed MP4 stream(s) + flags `isYouTube` for SnapYT HD UI.
   */
  async scanActiveTab(signal?: AbortSignal): Promise<VideoScanResult> {
    const startTime = performance.now();
    const tab = await BrowserActionService.getActiveTab();

    if (!tab || !tab.id || !tab.url) {
      return {
        tabId: 0,
        pageUrl: '',
        pageTitle: 'No Active Tab',
        videos: [],
        scannedAt: Date.now(),
        scanDurationMs: Math.round(performance.now() - startTime),
        sourcesChecked: {
          domFrames: 0,
          networkEntries: 0,
          youtubeExtracted: false,
          hlsVariantsExpanded: 0,
        },
        error: 'No active browser tab detected.',
      };
    }

    const tabId = tab.id;
    const pageUrl = tab.url;
    const pageTitle = tab.title || 'Current Page';

    if (isRestrictedUrl(pageUrl)) {
      return {
        tabId,
        pageUrl,
        pageTitle,
        videos: [],
        scannedAt: Date.now(),
        scanDurationMs: Math.round(performance.now() - startTime),
        sourcesChecked: {
          domFrames: 0,
          networkEntries: 0,
          youtubeExtracted: false,
          hlsVariantsExpanded: 0,
        },
        error: 'Protected browser pages (chrome://, extensions store) cannot be scanned.',
      };
    }

    const isYouTube =
      pageUrl.includes('youtube.com/watch') ||
      pageUrl.includes('youtube.com/shorts') ||
      pageUrl.includes('youtube.com/live') ||
      pageUrl.includes('youtu.be/');

    const topDomPromise = (async (): Promise<{
      candidates: RawDomVideoCandidate[];
      pageTitle?: string;
    }> => {
      const ready = await BrowserActionService.ensureContentScript(tabId, pageUrl);
      if (!ready) return { candidates: [] };
      return new Promise<{ candidates: RawDomVideoCandidate[]; pageTitle?: string }>((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'SCAN_VIDEOS' }, (res) => {
          if (chrome.runtime.lastError || !res?.videos) {
            resolve({ candidates: [] });
          } else {
            resolve({
              candidates: (res.videos || []) as RawDomVideoCandidate[],
              pageTitle: (res.title || undefined) as string | undefined,
            });
          }
        });
      });
    })();

    const allFramesPromise = (async (): Promise<{
      candidates: RawDomVideoCandidate[];
      frameCount: number;
    }> => {
      if (!chrome.scripting?.executeScript) return { candidates: [], frameCount: 0 };
      try {
        const injections = await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: frameVideoScanScript,
        });
        const merged: RawDomVideoCandidate[] = [];
        for (const frameRes of injections) {
          if (Array.isArray(frameRes.result)) {
            merged.push(...frameRes.result);
          }
        }
        return { candidates: merged, frameCount: injections.length };
      } catch {
        return { candidates: [], frameCount: 0 };
      }
    })();

    const networkPromise = new Promise<SniffedMediaEntry[]>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SNIFFED_MEDIA', tabId }, (res) => {
        if (chrome.runtime.lastError || !Array.isArray(res?.entries)) {
          resolve([]);
        } else {
          resolve(res.entries as SniffedMediaEntry[]);
        }
      });
    });

    const youtubePromise = (async () => {
      if (!isYouTube) return null;
      const videoId = extractYouTubeVideoId(pageUrl);
      const fallbackTitle = pageTitle.replace(/ - YouTube$/, '').trim();
      const res = await fetchYouTubeDownloadableMuxed(videoId, fallbackTitle, signal);

      if (res?.needsAuthFallback && chrome.scripting?.executeScript) {
        try {
          const authed = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: extractYouTubeAuthedMuxedScript,
          });
          const rawRes = authed?.[0]?.result;
          if (rawRes) {
            return parseDownloadableYouTubeMuxedFormats(rawRes, fallbackTitle);
          }
        } catch {
          // Ignore auth fallback failure
        }
      }

      return res;
    })();

    const [topDomRes, framesRes, networkRes, youtubeRes] = await Promise.allSettled([
      topDomPromise,
      allFramesPromise,
      networkPromise,
      youtubePromise,
    ]);

    const topDomData = topDomRes.status === 'fulfilled' ? topDomRes.value : { candidates: [] };
    const rawDomCandidates: RawDomVideoCandidate[] = [
      ...topDomData.candidates,
      ...(framesRes.status === 'fulfilled' ? framesRes.value.candidates : []),
    ];
    const domFrames = framesRes.status === 'fulfilled' ? framesRes.value.frameCount : 1;
    const networkEntries = networkRes.status === 'fulfilled' ? networkRes.value : [];
    const ytData = youtubeRes.status === 'fulfilled' ? youtubeRes.value : null;

    const domBestTitle =
      topDomData.pageTitle && !isGenericTitle(topDomData.pageTitle, pageUrl)
        ? topDomData.pageTitle
        : rawDomCandidates.find((c) => c.title && !isGenericTitle(c.title, pageUrl))?.title;

    const effectiveTitle = ytData?.title || domBestTitle || pageTitle;
    const curatedYoutubeFormats = selectDownloadableYouTubeFormats(ytData?.formats || []);

    // On YouTube, show ONLY verified downloadable muxed videos (ignore raw googlevideo/DOM fragments)
    const domCandidates = isYouTube
      ? rawDomCandidates.filter(
          (d) => !d.url.includes('youtube.com') && !d.url.includes('googlevideo.com')
        )
      : rawDomCandidates;

    const filteredNetwork = isYouTube
      ? networkEntries.filter((e) => !e.url.includes('googlevideo.com/videoplayback'))
      : networkEntries;

    const enrichedNetwork = filteredNetwork.map((entry) => {
      const urlTitle = extractTitleFromUrl(entry.url);
      const titleHint =
        entry.titleHint && !isGenericTitle(entry.titleHint, pageUrl)
          ? entry.titleHint
          : effectiveTitle && !isGenericTitle(effectiveTitle, pageUrl)
          ? effectiveTitle
          : urlTitle || pageTitle;

      return {
        ...entry,
        titleHint,
        durationSeconds: entry.durationSeconds || ytData?.durationSeconds,
      };
    });

    // Expand up to 4 HLS master playlists in parallel so other websites show full HD/4K choices
    const hlsUrls = new Set<string>();
    for (const net of enrichedNetwork) {
      if (net.format === 'hls') hlsUrls.add(net.url);
    }
    for (const dom of domCandidates) {
      if (dom.format === 'hls' && dom.url.startsWith('http')) hlsUrls.add(dom.url);
    }

    const hlsVariants: Array<{
      parentUrl: string;
      url: string;
      qualityLabel: string;
      width?: number;
      height?: number;
      bandwidth: number;
    }> = [];

    const hlsUrlsToExpand = Array.from(hlsUrls).slice(0, 4);
    if (hlsUrlsToExpand.length > 0) {
      // Set Referer/Origin rule per distinct HLS CDN host before expanding master playlists
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const seenHosts = new Set<string>();
        const refererTargets: string[] = [];
        for (const u of hlsUrlsToExpand) {
          try {
            const host = new URL(u).hostname;
            if (host && !seenHosts.has(host)) {
              seenHosts.add(host);
              refererTargets.push(u);
            }
          } catch {
            // Ignore malformed URL
          }
        }
        await Promise.all(
          refererTargets.map((mediaUrl) =>
            Promise.race([
              new Promise<void>((resolve) => {
                chrome.runtime.sendMessage(
                  { type: 'SET_DOWNLOAD_REFERER_RULE', mediaUrl, pageUrl },
                  () => resolve()
                );
              }),
              new Promise<void>((resolve) => setTimeout(resolve, 80)),
            ])
          )
        );
      }

      const expansions = await Promise.allSettled(
        hlsUrlsToExpand.map(async (m3u8Url) => {
          const parsed = await fetchAndParseM3u8(m3u8Url, signal, 3000);
          if (parsed.kind === 'master') {
            return parsed.variants.map((v) => ({
              parentUrl: m3u8Url,
              url: v.url,
              qualityLabel: v.qualityLabel,
              width: v.width,
              height: v.height,
              bandwidth: v.bandwidth,
            }));
          }
          return [];
        })
      );
      for (const exp of expansions) {
        if (exp.status === 'fulfilled') {
          hlsVariants.push(...exp.value);
        }
      }
    }

    const videos = mergeAndRankVideos({
      pageTitle: effectiveTitle,
      domCandidates,
      networkEntries: enrichedNetwork,
      youtubeCandidates: curatedYoutubeFormats,
      hlsVariants,
    });

    return {
      tabId,
      pageUrl,
      pageTitle: effectiveTitle,
      videos,
      scannedAt: Date.now(),
      scanDurationMs: Math.round(performance.now() - startTime),
      isYouTube,
      sourcesChecked: {
        domFrames,
        networkEntries: enrichedNetwork.length,
        youtubeExtracted: Boolean(ytData && ytData.formats.length > 0),
        hlsVariantsExpanded: hlsVariants.length,
      },
    };
  },

  /**
   * Query passive sniffer count for active tab badge (instant, zero DOM cost)
   */
  async getSniffedCount(tabId: number): Promise<number> {
    if (!tabId || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return 0;
    return new Promise<number>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SNIFFED_COUNT', tabId }, (res) => {
        if (chrome.runtime.lastError || typeof res?.count !== 'number') {
          resolve(0);
        } else {
          resolve(res.count);
        }
      });
    });
  },
};
