import type {
  LocalModelError,
  LocalModelMeta,
  LocalModelMode,
  LocalModelName,
  LocalModelProviderName
} from './ai/localModel/types';
import type { WikiSettings } from './vk/wikiTypes';

export type RecordType = 'text' | 'image' | 'video';
export type RecordCategory = 'image' | 'text' | 'flow' | 'video';
export type RecordUseCase = 'prompt' | 'output' | 'fix' | 'flow' | 'reference' | 'unclassified';
export type ObjectLifecycle = 'active' | 'archived';
export type ExplainStatus = 'idle' | 'pending' | 'done';

export interface CaptureSizeOption {
  width: number;
  height: number;
}

export interface CaptureRatioOption {
  label: string;
  width: number;
  height: number;
}

export interface CaptureLauncherPosition {
  displayId: number;
  relativeX: number;
  relativeY: number;
}

export type CaptureLauncherEdge = 'left' | 'right' | 'top' | 'bottom' | null;

export interface CaptureLauncherVisualState {
  weakened: boolean;
  edge: CaptureLauncherEdge;
  edgeDistance: number;
  hubOpen: boolean;
}

export type DashboardDefaultView = 'all' | 'text' | 'images' | 'ai';
export type AppScopeMode = 'global' | 'blacklist' | 'whitelist';
export type PinBehaviorMode = 'auto' | 'custom' | 'off';
export type CaptureDefaultSizePreset = 'recent' | '1080x1350' | '1920x1080' | 'custom';

export type CaptureSelectionMode = 'free' | 'fixed' | 'ratio';

export interface CaptureSessionConfig {
  mode: CaptureSelectionMode;
  size?: CaptureSizeOption | null;
  ratio?: CaptureRatioOption | null;
}

export interface RecordItem {
  id: string;
  type: RecordType;
  category: RecordCategory;
  path: string;
  displayName?: string;
  previewText?: string;
  ocrText?: string;
  sourceApp?: string | null;
  source: 'clipboard' | 'screenshot' | 'recording';
  useCase: RecordUseCase;
  tags: string[];
  explainStatus?: ExplainStatus;
  explainText?: string;
  originalUrl?: string;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  pinned: boolean;
  localModel?: LocalModelMeta;
}

export interface PinCardState {
  id: string;
  recordId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  alwaysOnTop: boolean;
  visible: boolean;
}

export interface AppSettings {
  pollIntervalMs: number;
  autoPin: boolean;
  storageRoot: string;
  screenshotShortcut: string;
  dashboardShortcut: string;
  captureHubShortcut: string;
  modeToggleShortcut: string;
  trayOpenDashboardShortcut: string;
  trayCycleModeShortcut: string;
  trayQuitShortcut: string;
  dashboardFocusOnShow: boolean;
  aiCloudEnabled: boolean;
  launchAtLogin: boolean;
  defaultDashboardView: DashboardDefaultView;
  defaultScreenshotFormat: 'png';
  scopeMode: AppScopeMode;
  scopedApps: string[];
  aiHub: AiHubSettings;
  vaultkeeper?: {
    enabled: boolean;
    autoStart: boolean;
    projectRoot: string;
    port: number;
    draftDir?: string;
    inboxDir?: string;
    libraryDir?: string;
    attachmentsDir?: string;
    defaultAiEnhance?: boolean;
    enableWhisperX?: boolean;
    webpageMode?: 'readable' | 'fuller';
    namingRule?: string;
    autoFrontmatter?: boolean;
    autoTags?: boolean;
    autoMarkdownlint?: boolean;
    wiki?: WikiSettings;
  };
}

export type AiNamingTemplate = 'category_title_keyword_source' | 'category_source_title';
export type AiSortStrategy = 'category_then_time' | 'source_then_time';
export type AiProviderType = 'local' | 'cloud';
export type AiEntryVisibilityPolicy = 'always' | 'enabled_only' | 'hidden';
export type AiPersonaTemplateId = 'productivity-default' | 'taxonomy-strict' | 'naming-strict';
export type AiConnectionState = 'connected' | 'unavailable' | 'model_missing' | 'timeout' | 'error';
export type AiResponseMode = 'live' | 'degraded' | 'unavailable';
export type AiProviderReachability = 'reachable' | 'degraded' | 'unreachable' | 'unknown';

export interface AiPersonaSlot {
  id: 'persona_1' | 'persona_2' | 'persona_3';
  enabled: boolean;
  templateId: AiPersonaTemplateId;
  title: string;
  markdown: string;
}

export interface AiRuntimeStatus {
  enabled: boolean;
  configuredProvider: AiProviderType;
  effectiveProvider: AiProviderType;
  configuredModel: string;
  effectiveModel: string;
  selectedModelLabel: string;
  connectionState: AiConnectionState;
  responseMode: AiResponseMode;
  message: string;
  reachable: boolean;
  fallbackReason?: 'preflight' | 'provider' | 'schema' | 'timeout';
  lastError?: string;
  errorCode?: string;
  requestId?: string;
  providerReachability?: AiProviderReachability;
  latencyMs?: number;
  checkedAt?: number;
}

export interface AiChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  text: string;
  createdAt: number;
  provider: AiProviderType;
  model: string;
  kind?: 'message' | 'error';
}

export interface AiChatSession {
  sessionId: string;
  messages: AiChatMessage[];
  updatedAt: number;
}

export interface AiChatStreamEvent {
  phase: 'start' | 'delta' | 'done' | 'error';
  model: string;
  delta?: string;
  text?: string;
  errorMessage?: string;
}

export interface AiCloudSetupHint {
  title: string;
  description: string;
  requiredFields: string[];
}

export interface AiSearchIntentResult {
  normalizedQuery: string;
  suggestedSource?: string;
  suggestedType?: 'all' | 'text' | 'image';
  suggestedTags?: string[];
  suggestedAction?: string;
}

export type AiOrchestratorTaskType =
  | 'organize_current'
  | 'generate_summary'
  | 'enrich_metadata'
  | 'format_markdown'
  | 'write_formal_doc'
  | 'open_vaultkeeper';
export type AiOrchestratorTaskStatus = 'success' | 'warning' | 'error';
export type AiOrchestratorStrategy = 'local_first' | 'balanced' | 'high_quality';

export interface AiOrchestratorTaskInput {
  taskType: AiOrchestratorTaskType;
  recordId?: string;
}

export interface AiOrchestratorTaskRoute {
  provider: 'local' | 'cloud';
  model: string;
  strategy: AiOrchestratorStrategy;
  timeoutMs?: number;
  retryLimit?: number;
  outputTarget?: string;
}

export interface AiOrchestratorTaskResult {
  taskId: string;
  taskType: AiOrchestratorTaskType;
  status: AiOrchestratorTaskStatus;
  message: string;
  route: AiOrchestratorTaskRoute;
  recordId: string;
  outputTarget: string;
  updatedFields: string[];
  actionHint?: 'navigate_vaultkeeper' | 'open_ai_chat';
  nextAction?: 'select_record' | 'open_ai_chat' | 'open_settings' | 'configure_cloud';
  latencyMs?: number;
  errorCode?: string;
  finishedAt: number;
}

export interface AiHealthResult {
  ok: boolean;
  provider: AiProviderType;
  model: string;
  connectionStatus: AiConnectionState;
  responseMode: AiResponseMode;
  message: string;
  requestId?: string;
  errorCode?: string;
  latencyMs?: number;
  checkedAt: number;
}

export interface AiTestResult {
  ok: boolean;
  provider: AiProviderType;
  model: string;
  mode: AiResponseMode;
  text?: string;
  requestId?: string;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
}

export interface AiDiagnosticsSnapshot {
  provider: AiProviderType;
  model: string;
  timeoutMs: number;
  fallbackReason?: 'preflight' | 'provider' | 'schema' | 'timeout';
  lastErrorCode?: string;
  requestId?: string;
  checkedAt: number;
}

export interface AiHubSettings {
  enabled: boolean;
  entryVisibility: AiEntryVisibilityPolicy;
  defaultProvider: AiProviderType;
  defaultModelId: string;
  preferredLocalModelId?: string;
  preferredCloudModelId?: string;
  aiFirstSearch: boolean;
  suggestionOnly: boolean;
  allowFallback: boolean;
  processImages: boolean;
  processOnlyUntitled: boolean;
  namingTemplate: AiNamingTemplate;
  sortStrategy: AiSortStrategy;
  personaSlots: AiPersonaSlot[];
  categoryDictionary: string[];
  sourceDictionary: string[];
  cloudProvider?: string;
  cloudApiKey?: string;
  cloudBaseUrl?: string;
  cloudModelId?: string;
}


export interface PinToggleSettings {
  enableImagePin: boolean;
  enableTextPin: boolean;
  enableFlowPin: boolean;
}

export interface LocalModelSettingsStatus {
  enabled: boolean;
  configuredMode: LocalModelMode;
  effectiveMode: LocalModelMode;
  provider: LocalModelProviderName;
  configuredModel: string;
  effectiveModel: string;
  model: LocalModelName;
  ollamaBaseUrl: string;
  connectionStatus: 'reachable' | 'unreachable' | 'unknown';
  modelStatus: 'installed' | 'missing' | 'unknown';
  fallbackReason?: 'preflight' | 'provider' | 'schema' | 'timeout';
  lastError?: LocalModelError;
  checkedAt?: number;
}

export type RuntimeMode = 'auto' | 'silent' | 'off';
export type DashboardSizePreset = 'small' | 'medium' | 'large';
export type DashboardUIMode = 'legacy' | 'modern';
export type CapsuleSurfaceMode = 'glass' | 'vibrant' | 'solid';
export type CapsuleAnchorDisplayPolicy = 'active-display' | 'primary-display' | 'all-spaces';
export type CapsuleAnimationPreset = 'smooth' | 'snappy';

export interface QuickAppConfig {
  id: string;
  name: string;
  icon: string;        // SF Symbol name
  appPath: string;     // macOS app path (for reference)
  actionType: 'app' | 'url' | 'command';
  actionValue: string; // path / URL / command
}

export interface CapsuleRuntimeSettings {
  enabled: boolean;
  surfaceMode: CapsuleSurfaceMode;
  anchorDisplayPolicy: CapsuleAnchorDisplayPolicy;
  hoverEnabled: boolean;
  animationPreset: CapsuleAnimationPreset;
  expandedAutoCollapseMs: number;
  balancedEntryOrder: Array<'screenshot' | 'ai' | 'workspace'>;
  displayTitle: string;
  quickApps: QuickAppConfig[];
  enabledModules: string[];
  showMusicContent: boolean;  // true = show music player info, false = show displayTitle only
  showQuickApps: boolean;    // true = show quick app icons in capsule header, false = hide them
}

export interface DashboardBounds {
  width: number;
  height: number;
}

export interface RuntimeSettings extends PinToggleSettings {
  mode: RuntimeMode;
  pinBehaviorMode: PinBehaviorMode;
  dashboardSizePreset: DashboardSizePreset;
  uiMode: DashboardUIMode;
  dashboardAlwaysOnTop: boolean;
  dashboardBounds?: DashboardBounds;
  enableCaptureLauncher: boolean;
  rememberCaptureRecentSizes: boolean;
  defaultCaptureSizePreset: CaptureDefaultSizePreset;
  defaultCaptureCustomSize?: CaptureSizeOption;
  showStatusHints: boolean;
  captureRecentSizes: CaptureSizeOption[];
  captureLauncherPosition?: CaptureLauncherPosition;
  capsule: CapsuleRuntimeSettings;
}

export type CapsuleUIState = 'collapsed' | 'hover' | 'expanded';
export type CapsuleStatusPriority = 'low' | 'medium' | 'high' | 'critical';
export type CapsuleBusinessState =
  | 'idle'
  | 'screenshot_completed'
  | 'clipboard_captured'
  | 'ai_processing'
  | 'ai_completed';

export type CapsuleEventType =
  | 'screenshotCompleted'
  | 'clipboardCaptured'
  | 'aiProcessingStarted'
  | 'aiProcessingCompleted'
  | 'workspaceOpenRequested'
  | 'capsuleExpanded'
  | 'capsuleCollapsed';

export interface CapsuleEvent {
  id: string;
  type: CapsuleEventType;
  createdAt: number;
  priority: CapsuleStatusPriority;
  payload?: Record<string, unknown>;
}

export interface CapsuleRecentContent {
  recordId: string;
  title: string;
  useCase: RecordUseCase;
  source: RecordItem['source'];
  createdAt: number;
}

export interface CapsuleStateSnapshot {
  uiState: CapsuleUIState;
  businessState: CapsuleBusinessState;
  lastEvent?: CapsuleEvent;
  queueSize: number;
  recentContent?: CapsuleRecentContent;
  aiConnectionState?: AiConnectionState;
  updatedAt: number;
}

export type CapsuleActionType = 'screenshot' | 'open_ai' | 'open_workspace' | 'expand' | 'collapse';

export interface CapsuleActionDispatchInput {
  action: CapsuleActionType;
  meta?: Record<string, unknown>;
}

export type SearchRecordType = 'all' | RecordCategory;
export type DashboardRecordTab = 'all' | RecordUseCase;
export type SearchTimePreset = 'all' | 'today' | '7d' | '30d';

export interface SearchRecordsInput {
  query?: string;
  keyword?: string;
  type?: SearchRecordType;
  types?: RecordType[];
  useCase?: RecordUseCase[];
  tags?: string[];
  sourceApps?: string[];
  preset?: SearchTimePreset;
  from?: number;
  to?: number;
  limit?: number;
  smart?: boolean;
}

export interface RecordMetaPatch {
  useCase?: RecordUseCase;
  tags?: string[];
  originalUrl?: string;
}

export interface RecordMetaBulkResult {
  updated: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface OcrResult {
  recordId: string;
  text: string;
}


export type PermissionKey =
  | 'clipboard'
  | 'globalShortcut'
  | 'accessibility'
  | 'inputMonitoring'
  | 'screenCapture'
  | 'notifications'
  | 'fileAccess'
  | 'automationDependency';
export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'requires-restart' | 'unknown';
export type PermissionProbeStatus = 'success' | 'failed' | 'not-run';
export type PermissionCheckSource =
  | 'startup'
  | 'refresh'
  | 'focus'
  | 'activate'
  | 'settings-return'
  | 'permission-dialog'
  | 'dashboard-permissions'
  | 'capture-hub'
  | 'renderer-query'
  | 'manual-refresh';
export type PermissionSettingsTarget =
  | 'privacyGeneral'
  | 'privacyAccessibility'
  | 'privacyInputMonitoring'
  | 'keyboardShortcuts'
  | 'privacyScreenCapture';

export interface PermissionItemStatus {
  key: PermissionKey;
  title: string;
  state: PermissionState;
  lastCheckedAt: number;
  message: string;
  detail: string;
  actionLabel?: string;
  canRetry: boolean;
  canOpenSystemSettings: boolean;
  needsAttention: boolean;
  blocking: boolean;
  settingsTarget: PermissionSettingsTarget;
  systemStatus?: string;
  probeStatus?: PermissionProbeStatus;
  probeError?: string;
  desktopProbeStatus?: PermissionProbeStatus;
  desktopProbeError?: string;
  recommendedAction?: string;
}

export interface PermissionDiagnostics {
  appName: string;
  executablePath: string;
  appPath: string;
  appBundlePath?: string;
  bundleId: string;
  isDev: boolean;
  isPackaged: boolean;
  lastSource: PermissionCheckSource;
  instanceMismatchSuspected: boolean;
  instanceMismatchMessage?: string;
  installLocationStable?: boolean;
  installLocationMessage?: string;
  identityFingerprint?: string;
  automationCapability: 'available' | 'partial' | 'unavailable';
}

export interface PermissionStatusSnapshot {
  items: PermissionItemStatus[];
  hasIssues: boolean;
  hasBlockingIssues: boolean;
  updatedAt: number;
  source: PermissionCheckSource;
  diagnostics: PermissionDiagnostics;
}

export interface ScreenshotAttemptDiagnostics {
  timestamp: number;
  appPath: string;
  bundleId: string;
  rawScreenStatus: string;
  accessibilityTrusted: boolean;
  captureMode: CaptureSelectionMode;
  trigger: string;
  executionPath: 'desktopCapturer-crop' | 'screencapture-fallback' | 'permission-gate' | 'not-run';
  command?: string;
  success: boolean;
  error?: string;
  stack?: string;
  region?: CaptureSelectionBounds | null;
}

export type AppToastLevel = 'error' | 'warning' | 'info';

export interface AppToastPayload {
  id: string;
  level: AppToastLevel;
  message: string;
  createdAt: number;
}

export interface CaptureSelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureRecordingState {
  active: boolean;
  startedAt?: number | null;
}

export type AppErrorCode =
  | 'FILE_WRITE_FAILED'
  | 'FILE_MISSING'
  | 'IMAGE_DECODE_FAILED'
  | 'OCR_FAILED'
  | 'PERMISSION_REQUIRED'
  | 'SHORTCUT_REGISTRATION_FAILED'
  | 'WINDOW_CREATE_FAILED'
  | 'RECORD_NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'INTERNAL_ERROR';

export interface AppErrorPayload {
  code: AppErrorCode;
  message: string;
  details?: string;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppErrorPayload };

export interface RecordContentText {
  type: 'text';
  text: string;
}

export interface RecordContentImage {
  type: 'image';
  dataUrl: string;
}

export interface RecordContentVideo {
  type: 'video';
  filePath: string;
}

export type RecordContent = RecordContentText | RecordContentImage | RecordContentVideo;

export type CutoutStage = 'local' | 'cloud';

export interface CutoutProcessResult {
  recordId: string;
  stage: CutoutStage;
  dataUrl: string;
  width: number;
  height: number;
  fileNameSuggestion: string;
  notes?: string[];
}

export interface CutoutSaveInput {
  recordId: string;
  dataUrl: string;
  fileNameSuggestion?: string;
}

export interface CutoutSaveResult {
  outputPath: string;
  fileName: string;
}

export interface CutoutSaveAsRecordResult {
  recordId: string;
  outputPath: string;
}
