/**
 * Extension TypeScript Types
 */

export type BrowserActionType =
  | 'NAVIGATE'
  | 'SEARCH_WEB'
  | 'SEARCH_YOUTUBE'
  | 'READ_CURRENT_PAGE'
  | 'SUMMARIZE_PAGE'
  | 'FILL_FORM'
  | 'SCAN_VIDEOS'
  | 'WAIT_FOR_PAGE'
  | 'ASK_USER'
  | 'REPORT_RESULT';

export type ActionStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FormFieldValue {
  fieldId?: string;
  selector?: string;
  name?: string;
  label?: string;
  value: string;
  fieldType?: string;
}

export interface BrowserAction {
  id: string;
  type: BrowserActionType;
  description: string;
  targetUrl?: string;
  query?: string;
  fields?: FormFieldValue[];
  selector?: string;
  milliseconds?: number;
  question?: string;
  options?: string[];
  message?: string;
  success?: boolean;
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  status?: ActionStatus;
  resultMessage?: string;
}

export interface ActionPlan {
  summary: string;
  estimatedSteps: number;
  actions: BrowserAction[];
}

export interface DiscoveredFormField {
  id?: string;
  name?: string;
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  selector?: string;
}

export interface DiscoveredForm {
  id?: string;
  name?: string;
  action?: string;
  fields: DiscoveredFormField[];
}

export interface PageContext {
  url: string;
  title: string;
  selectedText?: string;
  extractedText?: string;
  forms?: DiscoveredForm[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  plan?: ActionPlan;
  suggestedActions?: string[];
  error?: boolean;
  actionProgress?: {
    currentStep: number;
    totalSteps: number;
    statusText: string;
  };
}

export interface UserProfile {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
  [key: string]: string | undefined;
}

export interface UserSettings {
  geminiApiKey?: string;
  geminiModel?: string;
  theme: 'dark' | 'light';
  autoReadContext: boolean;
}

export interface ActionResult {
  actionId: string;
  type: BrowserActionType;
  success: boolean;
  message: string;
  data?: unknown;
}

// ============================================================================
// Video Scanner & Downloader Types (Z-Pilot v2)
// ============================================================================

export type VideoFormatKind =
  | 'mp4'
  | 'webm'
  | 'mov'
  | 'hls'
  | 'dash'
  | 'audio'
  | 'unknown';

export type VideoStreamKind = 'muxed' | 'video-only' | 'audio-only' | 'stream';

export type VideoDetectionSource = 'dom' | 'network' | 'youtube' | 'hls-variant' | 'meta';

export interface DetectedVideo {
  id: string;
  url: string;
  /** Cleaned URL used for deduplication */
  canonicalUrl: string;
  title: string;
  format: VideoFormatKind;
  streamKind: VideoStreamKind;
  source: VideoDetectionSource;
  mimeType?: string;
  quality?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  thumbnailUrl?: string;
  filename: string;
  /** Optional note if protected / audio-only / DASH */
  note?: string;
  /** Priority score computed during ranking */
  score: number;
  /** Timestamp discovered */
  detectedAt: number;
}

export interface SniffedMediaEntry {
  url: string;
  canonicalUrl: string;
  tabId: number;
  format: VideoFormatKind;
  streamKind: VideoStreamKind;
  mimeType?: string;
  quality?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  titleHint?: string;
  itag?: number;
  detectedAt: number;
}

export interface VideoScanResult {
  tabId: number;
  pageUrl: string;
  pageTitle: string;
  videos: DetectedVideo[];
  scannedAt: number;
  scanDurationMs: number;
  sourcesChecked: {
    domFrames: number;
    networkEntries: number;
    youtubeExtracted: boolean;
    hlsVariantsExpanded: number;
  };
  /** True when the scanned active tab is a YouTube watch/shorts/youtu.be page */
  isYouTube?: boolean;
  error?: string;
}

export type VideoDownloadStatus =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'muxing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface VideoDownloadProgress {
  videoId: string;
  status: VideoDownloadStatus;
  /** 0 to 100, or -1 if indeterminate */
  percent: number;
  bytesDownloaded: number;
  totalBytes?: number;
  completedSegments?: number;
  totalSegments?: number;
  message?: string;
  chromeDownloadId?: number;
  mode?: 'video' | 'audio';
}
