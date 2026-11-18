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

export interface CustomFormQA {
  id: string;
  question: string;
  answer: string;
}

export interface AutofillResult {
  success: boolean;
  filledCount: number;
  totalScanned: number;
  filledDetails: Array<{
    label: string;
    fieldName: string;
    valueSnippet: string;
  }>;
  failedFields: Array<{ name: string; reason: string }>;
}

export interface UserResumeFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  base64Data: string;
  uploadedAt: number;
}

export interface UserPhotoFile {
  fileName: string;
  fileType: string;
  fileSize: number;
  base64Data: string;
  uploadedAt: number;
}

export interface UserProfile {
  // Contact & Personal
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;

  // Social & Portfolios
  website?: string;
  portfolioUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  twitterUrl?: string;
  otherUrl?: string;

  // Work Experience & Job Details
  company?: string;
  jobTitle?: string;
  totalExperience?: string; // e.g. "4 years", "3.5"
  noticePeriod?: string; // e.g. "Immediate", "15 days", "30 days"
  currentSalary?: string; // e.g. "$95,000" or "₹12 LPA"
  expectedSalary?: string; // e.g. "$120,000" or "₹16 LPA"
  preferredWorkMode?: string; // "Remote" | "Hybrid" | "On-site" | "Flexible"
  startDate?: string; // e.g. "Immediate" or "2026-12-01"

  // Education
  degree?: string; // e.g. "Bachelor of Technology", "Master of Science"
  fieldOfStudy?: string; // Major / Branch e.g. "Computer Science"
  university?: string; // College / Institute Name
  graduationYear?: string; // e.g. "2023"
  gpa?: string; // e.g. "8.8 / 10" or "3.9 / 4.0"

  // Skills & Written Pitch
  skills?: string; // Comma separated skills e.g. "React, TypeScript, Python"
  summary?: string; // Professional summary / Bio
  coverLetter?: string; // Default cover letter / Why hire me / Note to recruiter

  // Work Authorization & Legal
  workAuthorization?: string; // "Yes" | "No"
  visaSponsorship?: string; // "No" | "Yes"
  willingToRelocate?: string; // "Yes" | "No" | "Remote Only"

  // Equal Opportunity & Demographics (Optional)
  gender?: string;
  veteranStatus?: string;
  disabilityStatus?: string;

  // Custom Job Questions / JD-Specific Q&A Pairs
  customQuestions?: CustomFormQA[];

  // Resume / CV Document (Base64 stored locally)
  resume?: UserResumeFile;

  // Passport Size Photo (Base64 stored locally)
  photo?: UserPhotoFile;

  [key: string]: any;
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

export interface QuickNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  pageUrl?: string;
  pageTitle?: string;
}

export interface SavedTranslation {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
  favorite?: boolean;
}

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: number;
  dueDate?: number; // reminder timestamp in epoch ms
  reminderSet?: boolean;
  notified?: boolean;
  priority?: TodoPriority;
  pageUrl?: string;
  pageTitle?: string;
}

export interface CalculationRecord {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

export interface ClipItem {
  id: string;
  text: string;
  timestamp: number;
  sourceUrl?: string;
  sourceTitle?: string;
  pinned?: boolean;
}

export interface AdBlockerSettings {
  enabled: boolean;
  blockCosmetic: boolean;
  skipVideoAds: boolean;
  whitelistedDomains: string[];
  totalBlockedCount: number;
}

export interface PageAdBlockStats {
  pageCount: number;
  totalCount: number;
  isWhitelisted: boolean;
  domain: string;
}

export type FriendChatMode = 'ptop' | 'group';

export interface FriendChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  isMine: boolean;
  delivered?: boolean;
  mode?: FriendChatMode;
  roomPin?: string;
}

export interface FriendChatSessionState {
  activePin: string;
  mode: FriendChatMode;
  displayName: string;
  connectedAt: number;
}

// ── Converter & World Clock Types ──

export type ConverterTab = 'currency' | 'units' | 'timezone';

export interface ExchangeRatesData {
  base: string; // e.g. 'USD'
  rates: Record<string, number>;
  lastUpdated: number; // epoch ms
  source?: string;
}

export type UnitCategory =
  | 'length'
  | 'weight'
  | 'temperature'
  | 'storage'
  | 'area'
  | 'volume'
  | 'speed'
  | 'time'
  | 'pressure';

export interface UnitDefinition {
  id: string;
  name: string;
  symbol: string;
  ratioToBase: number; // e.g. for km to m it's 1000
}

export interface TimezoneCity {
  id: string;
  name: string;
  country: string;
  timezone: string;
  flag: string;
}

export interface ConverterPreferences {
  lastTab: ConverterTab;
  currencyFrom: string;
  currencyTo: string;
  unitCategory: UnitCategory;
  unitFrom: string;
  unitTo: string;
  selectedCities: string[];
}

// ── Clean Copy & Instant Text/Image/Video Extractor (OCR) Types ──

export type CleanCopyTab = 'clipboard' | 'clean_copy' | 'ocr_extractor';

export type CaseStyle =
  | 'title'
  | 'sentence'
  | 'upper'
  | 'lower'
  | 'camel'
  | 'snake'
  | 'kebab';

export type OcrExtractMode =
  | 'raw'
  | 'markdown'
  | 'translate'
  | 'code'
  | 'summarize';

export interface CleanCopyOptions {
  stripTrackingUrls?: boolean;
  unwrapLines?: boolean;
  cleanQuotesAndChars?: boolean;
  stripCitations?: boolean;
  stripQuotesPrefix?: boolean;
  convertHtmlToMarkdown?: boolean;
  caseStyle?: CaseStyle;
}

export interface TextStats {
  charactersWithSpaces: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  readingTimeMinutes: number;
}

export interface WebpageVideoFrame {
  dataUrl: string;
  videoTitle?: string;
  currentTime?: number;
  duration?: number;
  width?: number;
  height?: number;
  domSubtitles?: string[];
}

export interface DetectedPageImage {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface OcrExtractionResult {
  text: string;
  mode: OcrExtractMode;
  confidence?: string;
  sourceType: 'image' | 'video' | 'screen';
  isAiGenerated: boolean;
  timestamp: number;
}

export interface CleanCopyOcrPreferences {
  lastTab: CleanCopyTab;
  autoCleanOnPaste: boolean;
  lastOcrMode: OcrExtractMode;
  targetTranslateLang?: string;
}

// ── Web Privacy & Blur Shield Types ──

export type BlurStyle = 'blur' | 'blackout' | 'stealth';

export interface PrivacyBlurBoxData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrivacyBlurStats {
  blurredElementCount: number;
  customBoxCount: number;
  financialsBlurred: boolean;
  piiBlurred: boolean;
  mediaBlurred: boolean;
  privacyScreenActive: boolean;
  blurIntensity: number; // 4 to 30 px
  blurStyle: BlurStyle;
  hoverToReveal: boolean;
}

export interface PrivacyBlurPreferences {
  blurIntensity: number;
  blurStyle: BlurStyle;
  hoverToReveal: boolean;
  autoBlurFinancials: boolean;
  autoBlurPii: boolean;
  autoBlurMedia: boolean;
  rememberPerDomain: boolean;
}

// ── E-Commerce Shopping Assistant Types ──

export type ShoppingTab = 'price_tracker' | 'fake_reviews' | 'coupons';

export interface PriceHistoryPoint {
  date: string; // YYYY-MM-DD
  price: number;
  label?: string; // 'Lowest' | 'Highest' | 'Typical'
}

export interface ProductInfo {
  title: string;
  url: string;
  domain: string;
  imageUrl?: string;
  currentPrice: number;
  originalPrice?: number;
  lowestPrice?: number;
  currency: string;
  rating?: number;
  reviewCount?: number;
  inStock?: boolean;
  seller?: string;
  rawPriceText?: string;
  rawListPriceText?: string;
  rawLowPriceText?: string;
  dealBadge?: string;
  pageReviews?: string[];
}

export interface FakeReviewMetric {
  name: string;
  score: number; // 0 - 100
  status: 'safe' | 'warning' | 'danger';
  detail: string;
}

export interface FakeReviewAnalysis {
  trustGrade: 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';
  trustScore: number; // 0 - 100
  originalRating: number;
  adjustedRating: number;
  suspiciousCount: number;
  totalAnalyzed: number;
  verdict: 'Genuine & Reliable' | 'Moderate Concern' | 'High Risk / Likely Inauthentic' | 'No Reviews Detected';
  summary: string;
  pros: string[];
  cons: string[];
  redFlags: string[];
  sampleQuotes?: string[];
  metrics: FakeReviewMetric[];
}

export interface CouponCode {
  code: string;
  discount: string;
  description: string;
  store: string;
  expiry?: string;
  verified: boolean;
  successRate?: number;
  source: 'page_found' | 'store_database';
}

export interface TrackedProduct {
  id: string;
  url: string;
  domain: string;
  title: string;
  imageUrl?: string;
  currency: string;
  initialPrice: number;
  currentPrice: number;
  targetPrice?: number;
  highestPrice: number;
  lowestPrice: number;
  history: PriceHistoryPoint[];
  dateAdded: number;
  lastChecked: number;
  priceDropAlert: boolean;
}

export interface ShoppingPreferences {
  activeTab: ShoppingTab;
  autoDetectProduct: boolean;
  notifyOnPriceDrop: boolean;
}





