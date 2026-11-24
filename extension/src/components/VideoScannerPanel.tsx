import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Film,
  Download,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Headphones,
  Info,
  ArrowUpRight,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import {
  DetectedVideo,
  VideoDownloadProgress,
  VideoScanResult,
} from '../types/index.js';
import { formatBytes, formatDuration, dedupeToBestPerVideo } from '../services/video-deduper.js';
import { Y2MATE_YOUTUBE_URL, SAVEFROM_INSTAGRAM_URL } from '../services/y2mate-autofill.js';

interface VideoScannerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isScanning: boolean;
  scanResult: VideoScanResult | null;
  progressMap: Record<string, VideoDownloadProgress>;
  onScan: () => void;
  onDownload: (video: DetectedVideo) => void;
  onDownloadAudio?: (video: DetectedVideo) => void;
  onCancelDownload: (video: DetectedVideo) => void;
}

type FilterTab = 'all' | 'video' | 'hls' | 'audio';

function getFormatBadgeLabel(video: DetectedVideo): string {
  if (video.streamKind === 'audio-only' || video.format === 'audio') {
    const ext = video.filename.split('.').pop()?.toUpperCase() || 'M4A';
    return video.source === 'youtube' ? `YT • AUDIO (${ext})` : `AUDIO • ${ext}`;
  }
  const fmt = video.format.toUpperCase();
  if (video.source === 'youtube') return `YT • ${fmt}`;
  if (video.format === 'hls') return 'HLS STREAM';
  return fmt;
}

export const VideoScannerPanel: React.FC<VideoScannerPanelProps> = ({
  isOpen,
  onClose,
  isScanning,
  scanResult,
  progressMap,
  onScan,
  onDownload,
  onDownloadAudio,
  onCancelDownload,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isOpeningY2mate, setIsOpeningY2mate] = useState(false);
  const [ytUrlInput, setYtUrlInput] = useState(scanResult?.pageUrl || '');
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [downloadModeMap, setDownloadModeMap] = useState<Record<string, 'video' | 'audio'>>({});
  const completedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Auto-reset completed buttons back to idle after 3.5 seconds
  useEffect(() => {
    for (const [id, progress] of Object.entries(progressMap)) {
      if (progress?.status === 'completed') {
        if (completedMap[id] === undefined && !completedTimersRef.current[id]) {
          setCompletedMap((prev) => ({ ...prev, [id]: true }));
          completedTimersRef.current[id] = setTimeout(() => {
            setCompletedMap((prev) => ({ ...prev, [id]: false }));
            delete completedTimersRef.current[id];
          }, 3500);
        }
      } else {
        if (completedMap[id] !== undefined) {
          setCompletedMap((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
        if (completedTimersRef.current[id]) {
          clearTimeout(completedTimersRef.current[id]);
          delete completedTimersRef.current[id];
        }
      }
    }
  }, [progressMap, completedMap]);

  useEffect(() => {
    return () => {
      for (const t of Object.values(completedTimersRef.current)) {
        clearTimeout(t);
      }
    };
  }, []);

  useEffect(() => {
    if (scanResult?.pageUrl) {
      setYtUrlInput(scanResult.pageUrl);
    }
  }, [scanResult?.pageUrl]);

  const isAnyDownloadActive = useMemo(() => {
    return Object.values(progressMap).some(
      (p) => p && (p.status === 'preparing' || p.status === 'downloading' || p.status === 'muxing')
    );
  }, [progressMap]);

  const handleDownloadClick = (video: DetectedVideo) => {
    if (isAnyDownloadActive) return;
    setDownloadModeMap((prev) => ({ ...prev, [video.id]: 'video' }));
    setCompletedMap((prev) => {
      const next = { ...prev };
      delete next[video.id];
      return next;
    });
    onDownload(video);
  };

  const handleAudioDownloadClick = (video: DetectedVideo) => {
    if (isAnyDownloadActive) return;
    setDownloadModeMap((prev) => ({ ...prev, [video.id]: 'audio' }));
    setCompletedMap((prev) => {
      const next = { ...prev };
      delete next[video.id];
      return next;
    });
    if (onDownloadAudio) {
      onDownloadAudio(video);
    } else {
      onDownload(video);
    }
  };

  const rawVideos = scanResult?.videos || [];

  const videos = useMemo(() => {
    return dedupeToBestPerVideo(rawVideos);
  }, [rawVideos]);

  const counts = useMemo(() => {
    let videoCount = 0;
    let hlsCount = 0;
    let audioCount = 0;
    for (const v of videos) {
      if (v.streamKind === 'audio-only' || v.format === 'audio') audioCount++;
      else if (v.format === 'hls') hlsCount++;
      else videoCount++;
    }
    return { all: videos.length, video: videoCount, hls: hlsCount, audio: audioCount };
  }, [videos]);

  const filteredVideos = useMemo(() => {
    if (activeFilter === 'all') return videos;
    if (activeFilter === 'audio') {
      return videos.filter((v) => v.streamKind === 'audio-only' || v.format === 'audio');
    }
    if (activeFilter === 'hls') {
      return videos.filter((v) => v.format === 'hls');
    }
    return videos.filter(
      (v) => v.streamKind !== 'audio-only' && v.format !== 'audio' && v.format !== 'hls'
    );
  }, [videos, activeFilter]);

  const isInstagram = useMemo(() => {
    return /instagram\.com/i.test(ytUrlInput) || /instagram\.com/i.test(scanResult?.pageUrl || '');
  }, [ytUrlInput, scanResult?.pageUrl]);

  const isYouTube = useMemo(() => {
    if (isInstagram) return false;
    return (
      /youtube\.com|youtu\.be/i.test(ytUrlInput) ||
      /youtube\.com|youtu\.be/i.test(scanResult?.pageUrl || '') ||
      Boolean(scanResult?.isYouTube)
    );
  }, [isInstagram, ytUrlInput, scanResult?.pageUrl, scanResult?.isYouTube]);

  const activeDownloaderUrl = isInstagram ? SAVEFROM_INSTAGRAM_URL : (isYouTube ? Y2MATE_YOUTUBE_URL : SAVEFROM_INSTAGRAM_URL);
  const activeDownloaderDomain = (isInstagram || !isYouTube) ? 'en1.savefrom.net' : 'v42.www-y2mate.com';

  const cardTitle = isInstagram
    ? 'Download Instagram Video / Reel in HD'
    : isYouTube
    ? "Why 720p / 1080p / 4K isn't shown here"
    : 'Download in 720p / 1080p / 4K or MP3';

  const cardDescription = isInstagram
    ? 'Instagram restricts direct video downloads through browsers. To download high quality videos or reels, click below.'
    : isYouTube
    ? 'YouTube restricts HD video downloads through browsers. To download high quality videos, click below.'
    : 'Websites often restrict direct HD video downloads through browsers. To download high quality videos, click below.';

  const cardPlaceholder = isInstagram
    ? 'https://www.instagram.com/p/...'
    : isYouTube
    ? 'https://www.youtube.com/watch?v=...'
    : 'https://...';

  const buttonLabel = isInstagram
    ? 'Open In SaveFrom (HD)'
    : isYouTube
    ? 'Open For High Quality'
    : 'Open In SaveFrom (HD)';

  const openingLabel = isYouTube
    ? 'Opening Y2mate & Auto-Filling...'
    : 'Opening SaveFrom & Auto-Filling...';

  const copiedLabel = isYouTube
    ? 'Link Copied & Y2mate Opened'
    : 'Link Copied & SaveFrom Opened';

  if (!isOpen) return null;

  const handleCopyUrl = (video: DetectedVideo) => {
    navigator.clipboard?.writeText(video.url).catch(() => { });
    setCopiedId(video.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyPageLink = async () => {
    const link = ytUrlInput.trim() || scanResult?.pageUrl;
    if (!link) return;
    try {
      await navigator.clipboard?.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleOpenY2mateAutoFill = async () => {
    const targetVideoUrl = (ytUrlInput.trim() || scanResult?.pageUrl || '').trim();
    if (!targetVideoUrl) return;

    // Copy as handy backup in case user needs it manually
    navigator.clipboard?.writeText(targetVideoUrl).catch(() => { });

    const isInsta = /instagram\.com/i.test(targetVideoUrl);
    const isYt = !isInsta && (/youtube\.com|youtu\.be/i.test(targetVideoUrl) || Boolean(scanResult?.isYouTube));
    const actionType = isYt ? 'OPEN_Y2MATE_WITH_URL' : 'OPEN_SAVEFROM_WITH_URL';
    const fallbackBaseUrl = isYt ? Y2MATE_YOUTUBE_URL : SAVEFROM_INSTAGRAM_URL;

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      setIsOpeningY2mate(true);
      chrome.runtime.sendMessage(
        {
          type: actionType,
          targetVideoUrl,
        },
        () => {
          setIsOpeningY2mate(false);
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2500);
        }
      );
      return;
    }

    const fallbackUrl = `${fallbackBaseUrl}#url=${encodeURIComponent(targetVideoUrl)}`;
    window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#070201] animate-fade-in font-sans text-white select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-orange-500/20 bg-[#0d0301]/95 backdrop-blur-xl">
        <div className="flex items-center space-x-2.5 min-w-0">
          <BrandMark size={28} className="object-contain shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight text-white leading-tight">
              Media Downloader
            </h2>
            <p className="text-[10px] text-white/50 truncate max-w-[210px]" title={scanResult?.pageTitle}>
              {scanResult?.pageTitle || 'Active Webpage'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onScan}
            disabled={isScanning}
            title="Rescan current webpage for videos and audios"
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-medium text-white/90 hover:text-white flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Rescan'}</span>
          </button>

          <button
            onClick={onClose}
            title="Close Media Downloader"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scan Summary + Filter Segmented Bar */}
      <div className="px-4 py-2.5 border-b border-white/10 bg-black/60 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] text-white/60">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-white/80">
              {isScanning
                ? 'Scanning webpage for media...'
                : scanResult
                  ? `${videos.length} downloadable media file${videos.length === 1 ? '' : 's'} ready`
                  : 'Ready to scan'}
            </span>
          </div>
          {scanResult && !isScanning && (
            <span className="text-[10px] font-mono text-white/40">
              {scanResult.scanDurationMs}ms
            </span>
          )}
        </div>

        {/* Filter Tabs - whitespace-nowrap prevents broken line wrapping */}
        {videos.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {(
              [
                { key: 'all', label: `All (${counts.all})` },
                { key: 'video', label: `Videos (${counts.video})` },
                { key: 'hls', label: `Streams (${counts.hls})` },
                { key: 'audio', label: `Audio (${counts.audio})` },
              ] as const
            ).map((tab) => {
              const isSelected = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${isSelected
                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold'
                      : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-transparent'
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {isScanning && videos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
            <div className="text-xs font-semibold text-white/90">
              Scanning webpage for downloadable videos & audios...
            </div>
            <div className="text-[11px] text-white/45 max-w-[250px] leading-relaxed">
              Checking HTML5 video/audio players, iframes, HLS manifests, and active network media.
            </div>
          </div>
        )}

        {scanResult?.error && !isScanning && (
          <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-start space-x-2.5 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{scanResult.error}</span>
          </div>
        )}

        {!isScanning && !scanResult?.error && !scanResult?.isYouTube && filteredVideos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 px-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
              {activeFilter === 'audio' ? (
                <Headphones className="w-6 h-6 text-amber-400" />
              ) : (
                <Film className="w-6 h-6" />
              )}
            </div>
            <div className="text-xs font-semibold text-white/85">
              {activeFilter === 'audio'
                ? 'No standalone audio files detected'
                : 'No downloadable videos detected yet'}
            </div>
            <p className="text-[11px] text-white/55 leading-relaxed max-w-[270px]">
              {activeFilter === 'audio' ? (
                <span>
                  Switch to the <strong>All</strong> or <strong>Videos</strong> tab and click the{' '}
                  <span className="text-amber-300 font-semibold">Audio (MP3)</span> button on any video card to extract its audio track!
                </span>
              ) : (
                <span>
                  Modern players often load media on demand. Click <strong>Play</strong> on the video on the webpage for 1–2 seconds, then tap <strong>Rescan</strong>.
                </span>
              )}
            </p>
            {activeFilter !== 'audio' && (
              <button
                onClick={onScan}
                className="mt-1 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-xs font-semibold text-white shadow-lg shadow-orange-600/30 cursor-pointer active:scale-95 transition-all"
              >
                Scan Webpage Again
              </button>
            )}
          </div>
        )}

        {filteredVideos.map((video) => {
          const progress = progressMap[video.id];
          const rawStatus = progress?.status || 'idle';
          const isCompleted = rawStatus === 'completed' && completedMap[video.id] !== false;
          const isActive =
            rawStatus === 'preparing' || rawStatus === 'downloading' || rawStatus === 'muxing';
          const isFailed = rawStatus === 'failed';
          const sizeLabel = formatBytes(video.sizeBytes || progress?.totalBytes);
          const durationLabel = formatDuration(video.durationSeconds);
          const isAudioNative = video.streamKind === 'audio-only' || video.format === 'audio';

          // Determine whether current action/download is Audio or Video
          const currentMode: 'video' | 'audio' =
            progress?.mode ||
            downloadModeMap[video.id] ||
            (isAudioNative ? 'audio' : 'video');
          const isAudioAction = currentMode === 'audio';

          return (
            <div
              key={video.id}
              className="p-3.5 rounded-2xl bg-gradient-to-b from-[#140603] via-[#0d0302] to-[#070201] border border-white/10 hover:border-orange-500/40 transition-all space-y-3 shadow-xl shadow-black/60 overflow-hidden"
            >
              {/* Top Row: Thumbnail + Metadata */}
              <div className="flex items-start space-x-3">
                <div className="relative w-24 h-16 rounded-xl bg-black/70 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center shadow-inner">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : isAudioNative ? (
                    <Headphones className="w-6 h-6 text-amber-400" />
                  ) : (
                    <Film className="w-6 h-6 text-orange-400/80" />
                  )}

                  {durationLabel && (
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/85 text-[9px] font-mono text-white/90 border border-white/10">
                      {durationLabel}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div
                    className="text-xs font-semibold text-white/95 leading-snug line-clamp-2"
                    title={video.title}
                  >
                    {video.title}
                  </div>

                  {/* Badges Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded-md bg-orange-500/15 border border-orange-500/30 text-[10px] font-mono font-bold text-orange-300 whitespace-nowrap">
                      {getFormatBadgeLabel(video)}
                    </span>

                    {video.quality && (
                      <span className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 text-[10px] font-mono font-medium text-white/90 whitespace-nowrap">
                        {video.quality}
                      </span>
                    )}

                    {sizeLabel && (
                      <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-[10px] font-mono text-white/65 whitespace-nowrap">
                        {sizeLabel}
                      </span>
                    )}
                  </div>

                  {video.note && video.note !== 'Video + Audio (MP4)' && (
                    <div className="text-[10px] text-white/50 leading-tight">
                      {video.note}
                    </div>
                  )}
                </div>
              </div>

              {/* Active Progress Bar */}
              {progress && rawStatus !== 'idle' && (
                <div className="space-y-1 bg-black/40 p-2 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span
                      className={
                        isFailed
                          ? 'text-rose-300 font-medium'
                          : isCompleted
                            ? isAudioAction ? 'text-amber-300 font-medium' : 'text-emerald-300 font-medium'
                            : 'text-orange-200'
                      }
                    >
                      {progress.message ||
                        (isCompleted
                          ? isAudioAction ? 'Audio downloaded' : 'Video downloaded'
                          : isActive
                            ? isAudioAction ? 'Extracting audio...' : 'Downloading video...'
                            : '')}
                    </span>
                    {progress.percent >= 0 && (
                      <span className="font-mono text-white/80 font-semibold">{progress.percent}%</span>
                    )}
                  </div>

                  {isActive && (
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 transition-all duration-200 ${progress.percent < 0 ? 'w-1/2 animate-pulse' : ''
                          }`}
                        style={
                          progress.percent >= 0 ? { width: `${progress.percent}%` } : undefined
                        }
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Action Row: Responsive Dual Buttons (Video & Audio) + Utilities */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {isActive ? (
                  <button
                    onClick={() => onCancelDownload(video)}
                    className="flex-1 min-w-0 py-2 px-3 rounded-lg bg-white/10 hover:bg-rose-950/60 border border-white/15 hover:border-rose-500/40 text-white/90 hover:text-rose-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />
                    <span className="whitespace-nowrap">Cancel Download</span>
                  </button>
                ) : isCompleted ? (
                  <div
                    className={`flex-1 min-w-0 py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 animate-fade-in shadow-md whitespace-nowrap ${isAudioAction
                        ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                        : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                      }`}
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isAudioAction ? 'text-amber-400' : 'text-emerald-400'}`} />
                    <span className="whitespace-nowrap">{isAudioAction ? 'Audio Downloaded!' : 'Video Downloaded!'}</span>
                  </div>
                ) : (
                  <>
                    {/* If item is purely an Audio stream, show 1 large "Download Audio" button */}
                    {isAudioNative ? (
                      <button
                        onClick={() => handleDownloadClick(video)}
                        disabled={isAnyDownloadActive}
                        title={isAnyDownloadActive ? 'Another download is in progress' : undefined}
                        className={`flex-1 min-w-0 py-2 px-3 rounded-lg text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors whitespace-nowrap ${isAnyDownloadActive
                            ? 'bg-orange-600/40 opacity-50 cursor-not-allowed'
                            : 'bg-orange-600 hover:bg-orange-500 cursor-pointer active:scale-[0.98]'
                          }`}
                      >
                        <Headphones className="w-3.5 h-3.5 shrink-0" />
                        <span className="whitespace-nowrap">Download Audio</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                        {/* Video Download Button */}
                        <button
                          onClick={() => handleDownloadClick(video)}
                          disabled={isAnyDownloadActive}
                          title={isAnyDownloadActive ? 'Another download is in progress' : undefined}
                          className={`flex-1 min-w-0 py-2 px-2.5 rounded-lg text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors whitespace-nowrap ${isAnyDownloadActive
                              ? 'bg-orange-600/40 opacity-50 cursor-not-allowed'
                              : 'bg-orange-600 hover:bg-orange-500 cursor-pointer active:scale-[0.98]'
                            }`}
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Download Video</span>
                        </button>

                        {/* Dedicated Audio Button on Video card */}
                        <button
                          onClick={() => handleAudioDownloadClick(video)}
                          disabled={isAnyDownloadActive}
                          title={
                            isAnyDownloadActive
                              ? 'Another download is in progress'
                              : 'Download pure audio track (MP3/M4A) from this video'
                          }
                          className={`py-2 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shrink-0 whitespace-nowrap ${isAnyDownloadActive
                              ? 'bg-white/5 border-white/5 text-white/30 opacity-50 cursor-not-allowed'
                              : 'bg-white/10 hover:bg-white/15 border-white/15 text-white/90 hover:text-white cursor-pointer active:scale-[0.98]'
                            }`}
                        >
                          <Headphones className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="whitespace-nowrap">Audio (MP3)</span>
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Utility Buttons: Copy Link & Open Link */}
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  <button
                    onClick={() => handleCopyUrl(video)}
                    title="Copy media URL"
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    {copiedId === video.id ? (
                      <Check className="w-3.5 h-3.5 text-orange-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open media URL in new tab"
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}

        {/* Universal HD Downloader Card (Y2mate for YouTube, SaveFrom for Instagram & Web) */}
        {!isScanning && !scanResult?.error && (
          <div className="p-3.5 rounded-xl bg-[#120502] border border-orange-500/25 shadow-lg space-y-2.5 overflow-hidden">
            <div className="flex items-start space-x-2.5">
              <div className="w-6 h-6 rounded-lg bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400 shrink-0 mt-0.5">
                <Info className="w-3.5 h-3.5" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-xs font-semibold text-white leading-snug">
                    {cardTitle}
                  </h3>
                  <a
                    href={activeDownloaderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-400 hover:text-orange-300 underline underline-offset-2 font-mono text-[11px] inline-flex items-center gap-0.5 font-medium shrink-0"
                  >
                    <span>{activeDownloaderDomain}</span>
                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                <p className="text-[11px] text-white/60 leading-normal">
                  {cardDescription}
                </p>
              </div>
            </div>

            {/* Editable Video Link Input + Copy Button */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 focus-within:border-orange-500/40">
              <input
                type="url"
                value={ytUrlInput}
                onChange={(e) => setYtUrlInput(e.target.value)}
                aria-label={isInstagram ? 'Instagram video link' : isYouTube ? 'YouTube video link' : 'Video link'}
                placeholder={cardPlaceholder}
                className="bg-transparent text-[11px] font-mono text-white/85 flex-1 min-w-0 focus:outline-none"
              />
              <button
                onClick={handleCopyPageLink}
                title={isInstagram ? 'Copy Instagram link' : isYouTube ? 'Copy YouTube link' : 'Copy link'}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-medium text-white/85 hover:text-white flex items-center gap-1 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {linkCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-300">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={handleOpenY2mateAutoFill}
              disabled={isOpeningY2mate || !ytUrlInput.trim()}
              className="w-full py-2.5 px-3 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-orange-950/50 flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-[0.99]"
            >
              {isOpeningY2mate ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="whitespace-nowrap">{openingLabel}</span>
                </>
              ) : linkCopied ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">{copiedLabel}</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">{buttonLabel}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
