import type {
  AiOrchestratorTaskInput,
  AiOrchestratorTaskResult,
  AiDiagnosticsSnapshot,
  CapsuleActionDispatchInput,
  CapsuleStateSnapshot,
  AiHealthResult,
  AiChatStreamEvent,
  AiChatSession,
  AiRuntimeStatus,
  AiSearchIntentResult,
  AiTestResult,
  AppSettings,
  AppToastPayload,
  CaptureLauncherVisualState,
  CaptureRecordingState,
  CaptureRatioOption,
  CaptureSessionConfig,
  CaptureSelectionBounds,
  CaptureSizeOption,
  LocalModelSettingsStatus,
  OcrResult,
  PermissionCheckSource,
  PermissionState,
  PermissionSettingsTarget,
  PermissionStatusSnapshot,
  PinToggleSettings,
  RecordContent,
  RecordMetaBulkResult,
  RecordMetaPatch,
  RecordItem,
  ScreenshotAttemptDiagnostics,
  RuntimeSettings,
  SearchRecordsInput
} from '../shared/types';
import type { CutoutProcessResult, CutoutSaveInput, CutoutSaveResult, CutoutSaveAsRecordResult } from '../shared/types';
import type { AiModelCatalogItem } from '../shared/ai/modelRegistry';
import type { KnowledgeIngestRecordResult, KnowledgeRuntimeStatus } from '../shared/knowledge3';
import type {
  VkRuntimeStatus, VkCreateJobRequest,
  VkExportRequest, VkExportBatchRequest, VkExportResult, VkToolsInfo,
  VkBatchImportRequest, VkBatchImportPreviewRequest,
  VkSmartClipRequest, VkSuggestRequest, VkQualityRequest,
  VkRetryRequest, VkClipHtmlRequest, VkSendRecordRequest,
  VkApiResponse, VkJob,
} from '../shared/vaultkeeper';
import type { VKRuntimeStatus as VKRuntimeStatusV1, VKTask, VKTaskCreateInput, VKTaskListResponse } from '../shared/vk/types';
import type { WikiQueryInput, WikiQueryResult, WikiLintResult, WikiStatus } from '../shared/vk/wikiTypes';

interface PinStackApi {
  app: {
    getVersion: () => Promise<string>;
  };
  knowledge: {
    getStatus: () => Promise<KnowledgeRuntimeStatus>;
    openWeb: () => Promise<boolean>;
    ingestRecords: (recordIds: string[]) => Promise<KnowledgeIngestRecordResult[]>;
    scanDirectory: (options: { dirPath: string; extensions?: string[]; excludePatterns?: string[] }) => Promise<{ success: boolean; totalFiles: number; newFiles: number; modifiedFiles: number; unchangedFiles: number; skippedFiles: number; message?: string }>;
  };
  capture: {
    start: () => Promise<boolean>;
    stop: () => Promise<boolean>;
    ignoreNextCopy: (count?: number) => Promise<boolean>;
    takeScreenshot: () => Promise<boolean>;
    takeFreeScreenshot: () => Promise<boolean>;
    takeFixedScreenshot: (size: CaptureSizeOption) => Promise<boolean>;
    takeRatioScreenshot: (ratio: CaptureRatioOption) => Promise<boolean>;
    takeRegionScreenshot: (bounds: CaptureSelectionBounds) => Promise<boolean>;
    takeRegionScreenshotCopy: (bounds: CaptureSelectionBounds) => Promise<boolean>;
    takeRegionScreenshotSave: (bounds: CaptureSelectionBounds) => Promise<boolean>;
    takeRegionScreenshotPin: (bounds: CaptureSelectionBounds) => Promise<boolean>;
    takeRegionScreenshotSaveAs: (bounds: CaptureSelectionBounds) => Promise<boolean>;
    cancelRegionScreenshot: () => Promise<boolean>;
    toggleHub: () => Promise<boolean>;
    hideHub: () => Promise<boolean>;
    reportHubHeight: (height: number) => void;
    getRecordingState: () => Promise<CaptureRecordingState>;
    getLauncherVisualState: () => Promise<CaptureLauncherVisualState>;
    markRecordingStarted: () => Promise<boolean>;
    markRecordingStopped: () => Promise<boolean>;
    requestRecordingStop: () => void;
    saveRecording: (bytes: Uint8Array, mimeType?: string | null) => Promise<string>;
    launcherDragStart: (screenX: number, screenY: number) => void;
    launcherDragMove: (screenX: number, screenY: number) => void;
    launcherDragEnd: (screenX?: number, screenY?: number) => Promise<boolean>;
    getSelectionSession: () => Promise<CaptureSessionConfig>;
    getScreenPermission: () => Promise<PermissionState>;
    getScreenshotDiagnostics: () => Promise<ScreenshotAttemptDiagnostics | null>;
    getColorAtPosition: (x: number, y: number) => Promise<string>;
    onRecordingState: (listener: (state: CaptureRecordingState) => void) => () => void;
    onRecordingStopRequested: (listener: () => void) => () => void;
    onLauncherVisualState: (listener: (state: CaptureLauncherVisualState) => void) => () => void;
    onHubShown: (listener: () => void) => () => void;
  };
  records: {
    list: (limit?: number) => Promise<RecordItem[]>;
    search: (input: SearchRecordsInput) => Promise<RecordItem[]>;
    recent: (limit?: number) => Promise<RecordItem[]>;
    get: (recordId: string) => Promise<RecordItem>;
    getContent: (recordId: string) => Promise<RecordContent>;
    createText: (input: { text: string; sourceApp?: string | null; tags?: string[] }) => Promise<RecordItem>;
    copy: (recordId: string, options?: { optimize?: boolean }) => Promise<boolean>;
    touch: (recordId: string) => Promise<RecordItem>;
    startDrag: (recordId: string) => void;
    delete: (recordId: string) => Promise<boolean>;
    rename: (recordId: string, displayName: string) => Promise<RecordItem>;
    updateText: (recordId: string, text: string) => Promise<RecordItem>;
    meta: {
      update: (recordId: string, patch: RecordMetaPatch) => Promise<RecordItem>;
      bulkUpdate: (recordIds: string[], patch: RecordMetaPatch) => Promise<RecordMetaBulkResult>;
    };
    flow: {
      create: (recordIds: string[]) => Promise<RecordItem>;
    };
    bulkDelete: (recordIds: string[]) => Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }>;
    open: (recordId: string) => Promise<boolean>;
    onChanged: (listener: () => void) => () => void;
  };
  pin: {
    createFromRecord: (recordId: string) => Promise<boolean>;
    bulkCreateFromRecords: (
      recordIds: string[]
    ) => Promise<{ pinned: string[]; skipped: string[]; failed: Array<{ id: string; error: string }> }>;
    close: (cardId: string) => Promise<boolean>;
    toggleAlwaysOnTop: (cardId: string) => Promise<boolean>;
    hideAll: () => Promise<boolean>;
    showAll: () => Promise<boolean>;
  };
  ocr: {
    fromRecord: (recordId: string) => Promise<OcrResult>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (next: Partial<AppSettings>) => Promise<AppSettings>;
    listScopedApps: () => Promise<string[]>;
    localModel: {
      getStatus: (refreshPreflight?: boolean) => Promise<LocalModelSettingsStatus>;
      setModel: (model: string) => Promise<LocalModelSettingsStatus>;
    };
    openStorageRoot: () => Promise<boolean>;
    openExternalUrl: (url: string) => Promise<boolean>;
    getToggle: () => Promise<PinToggleSettings>;
    update: (next: Partial<PinToggleSettings>) => Promise<PinToggleSettings>;
    runtime: {
      get: () => Promise<RuntimeSettings>;
      update: (next: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;
    };
  };
  ai: {
    getRuntimeStatus: () => Promise<AiRuntimeStatus>;
    listModels: () => Promise<AiModelCatalogItem[]>;
    getChatSession: () => Promise<AiChatSession>;
    clearChatSession: () => Promise<AiChatSession>;
    sendChat: (text: string) => Promise<AiChatSession>;
    healthCheck: () => Promise<AiHealthResult>;
    health: () => Promise<AiHealthResult>;
    test: () => Promise<AiTestResult>;
    onChatStream: (listener: (payload: AiChatStreamEvent) => void) => () => void;
    inferSearchIntent: (query: string) => Promise<AiSearchIntentResult>;
    runOrchestratorTask: (input: AiOrchestratorTaskInput) => Promise<AiOrchestratorTaskResult>;
    migrateSecrets: () => Promise<boolean>;
    getDiagnostics: () => Promise<AiDiagnosticsSnapshot>;
    openWindow: () => Promise<boolean>;
  };
  capsule: {
    getState: () => Promise<CapsuleStateSnapshot>;
    dispatchAction: (input: CapsuleActionDispatchInput) => Promise<CapsuleStateSnapshot>;
    setUiState: (uiState: CapsuleStateSnapshot['uiState']) => Promise<CapsuleStateSnapshot>;
    getMetricsSnapshot: () => Promise<CapsuleStateSnapshot>;
    onStateUpdated: (listener: (payload: CapsuleStateSnapshot) => void) => () => void;
  };
  dashboard: {
    open: () => Promise<boolean>;
    hide: () => Promise<boolean>;
    minimize: () => Promise<boolean>;
    toggleAlwaysOnTop: () => Promise<boolean>;
    isAlwaysOnTop: () => Promise<boolean>;
    onShown: (listener: () => void) => () => void;
  };
  permissions: {
    getStatus: (source?: PermissionCheckSource, traceId?: string) => Promise<PermissionStatusSnapshot>;
    refresh: (source?: PermissionCheckSource, traceId?: string) => Promise<PermissionStatusSnapshot>;
    openSettings: (target: PermissionSettingsTarget, traceId?: string) => Promise<boolean>;
    onStatusUpdated: (listener: (payload: PermissionStatusSnapshot) => void) => () => void;
  };
  telemetry: {
    track: (event: string, payload?: Record<string, unknown>) => Promise<boolean>;
  };
  notifications: {
    onToast: (listener: (payload: AppToastPayload) => void) => () => void;
  };
  vaultkeeper: {
    getStatus: () => Promise<VkRuntimeStatus>;
    start: () => Promise<VkRuntimeStatus>;
    stop: () => Promise<VkRuntimeStatus>;
    createJob: (params: VkCreateJobRequest) => Promise<VkApiResponse<VkJob>>;
    getJob: (jobId: string) => Promise<VkApiResponse<VkJob>>;
    exportFile: (params: VkExportRequest) => Promise<VkApiResponse<VkExportResult>>;
    exportBatch: (params: VkExportBatchRequest) => Promise<VkApiResponse<{total: number; succeeded: number; failed: number; results: VkExportResult[]}>>;
    getTools: () => Promise<VkApiResponse<VkToolsInfo>>;
    batchImport: (params: VkBatchImportRequest) => Promise<VkApiResponse<unknown>>;
    batchImportPreview: (params: VkBatchImportPreviewRequest) => Promise<VkApiResponse<unknown>>;
    smartClip: (params: VkSmartClipRequest) => Promise<VkApiResponse<unknown>>;
    clipHtml: (params: VkClipHtmlRequest) => Promise<VkApiResponse<unknown>>;
    suggest: (params: VkSuggestRequest) => Promise<VkApiResponse<unknown>>;
    qualityCheck: (params: VkQualityRequest) => Promise<VkApiResponse<unknown>>;
    retryJob: (jobId: string, params?: VkRetryRequest) => Promise<VkApiResponse<unknown>>;
    sendRecord: (request: VkSendRecordRequest) => Promise<VkApiResponse<VkJob>>;
  };
  cutout: {
    processFromRecord: (recordId: string) => Promise<CutoutProcessResult>;
    saveResult: (input: CutoutSaveInput) => Promise<CutoutSaveResult>;
    openOutput: (outputPath: string) => Promise<boolean>;
    saveAsRecord: (input: CutoutSaveInput) => Promise<CutoutSaveAsRecordResult>;
  };
  vk: {
    runtime: {
      getStatus: () => Promise<VKRuntimeStatusV1>;
    };
    task: {
      create: (input: VKTaskCreateInput) => Promise<VKTask>;
      list: () => Promise<VKTaskListResponse>;
      get: (id: string) => Promise<VKTask | null>;
      retry: (id: string) => Promise<VKTask>;
      cancel: (id: string) => Promise<VKTask>;
      openOutput: (id: string) => Promise<boolean>;
      openLog: (id: string) => Promise<boolean>;
    };
  };
  wiki: {
    getStatus: () => Promise<WikiStatus>;
    query: (input: WikiQueryInput) => Promise<WikiQueryResult>;
    lint: () => Promise<WikiLintResult>;
    openDir: () => Promise<boolean>;
    openIndex: () => Promise<boolean>;
  };
  debug: {
    captureNow: (kind: 'text' | 'image') => Promise<boolean>;
    localModel: {
      rename: (recordId: string) => Promise<RecordItem>;
      dedupePair: (leftRecordId: string, rightRecordId: string) => Promise<RecordItem>;
      summary: (recordId: string) => Promise<RecordItem>;
      image: (recordId: string) => Promise<RecordItem>;
    };
  };
}

declare global {
  const __APP_VERSION__: string;

  interface Window {
    pinStack: PinStackApi;
  }
}

export {};
