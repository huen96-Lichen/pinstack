import { contextBridge, ipcRenderer } from 'electron';
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
  Result,
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

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, args)) as Result<T>;

  if (!result.ok) {
    const error = new Error(result.error.message);
    (error as Error & { code?: string; details?: string }).code = result.error.code;
    (error as Error & { code?: string; details?: string }).details = result.error.details;
    throw error;
  }

  return result.data;
}

const api = {
  app: {
    getVersion: (): Promise<string> => invoke<string>('app.version.get')
  },
  knowledge: {
    getStatus: (): Promise<KnowledgeRuntimeStatus> => invoke<KnowledgeRuntimeStatus>('knowledge.status.get'),
    openWeb: (): Promise<boolean> => invoke<boolean>('knowledge.web.open'),
    ingestRecords: (recordIds: string[]): Promise<KnowledgeIngestRecordResult[]> =>
      invoke<KnowledgeIngestRecordResult[]>('knowledge.ingest.records', { recordIds }),
    scanDirectory: (options: { dirPath: string; extensions?: string[]; excludePatterns?: string[] }) =>
      invoke<{ success: boolean; totalFiles: number; newFiles: number; modifiedFiles: number; unchangedFiles: number; skippedFiles: number; message?: string }>('knowledge.scan.directory', options)
  },
  capture: {
    start: (): Promise<boolean> => invoke<boolean>('capture.start'),
    stop: (): Promise<boolean> => invoke<boolean>('capture.stop'),
    ignoreNextCopy: (count?: number): Promise<boolean> =>
      invoke<boolean>('capture.ignoreNextCopy', { count }),
    takeScreenshot: (): Promise<boolean> => invoke<boolean>('capture.takeScreenshot'),
    takeFreeScreenshot: (): Promise<boolean> => invoke<boolean>('capture.takeScreenshot'),
    takeFixedScreenshot: (size: CaptureSizeOption): Promise<boolean> =>
      invoke<boolean>('capture.takeFixedScreenshot', size),
    takeRatioScreenshot: (ratio: CaptureRatioOption): Promise<boolean> =>
      invoke<boolean>('capture.takeRatioScreenshot', ratio),
    takeRegionScreenshot: (bounds: CaptureSelectionBounds): Promise<boolean> =>
      invoke<boolean>('capture.takeRegionScreenshot', bounds),
    takeRegionScreenshotCopy: (bounds: CaptureSelectionBounds): Promise<boolean> =>
      invoke<boolean>('capture.takeRegionScreenshot.copy', bounds),
    takeRegionScreenshotSave: (bounds: CaptureSelectionBounds): Promise<boolean> =>
      invoke<boolean>('capture.takeRegionScreenshot.save', bounds),
    takeRegionScreenshotPin: (bounds: CaptureSelectionBounds): Promise<boolean> =>
      invoke<boolean>('capture.takeRegionScreenshot.pin', bounds),
    takeRegionScreenshotSaveAs: (bounds: CaptureSelectionBounds): Promise<boolean> =>
      invoke<boolean>('capture.takeRegionScreenshot.saveAs', bounds),
    cancelRegionScreenshot: (): Promise<boolean> => invoke<boolean>('capture.cancelRegionScreenshot'),
    toggleHub: (): Promise<boolean> => invoke<boolean>('capture.toggleHub'),
    hideHub: (): Promise<boolean> => invoke<boolean>('capture.hideHub'),
    reportHubHeight: (height: number): void => {
      ipcRenderer.send('capture.hub.height', { height });
    },
    getRecordingState: (): Promise<CaptureRecordingState> =>
      invoke<CaptureRecordingState>('capture.recording.state.get'),
    getLauncherVisualState: (): Promise<CaptureLauncherVisualState> =>
      invoke<CaptureLauncherVisualState>('capture.launcher.visualState.get'),
    markRecordingStarted: (): Promise<boolean> => invoke<boolean>('capture.recording.markStarted'),
    markRecordingStopped: (): Promise<boolean> => invoke<boolean>('capture.recording.markStopped'),
    requestRecordingStop: (): void => {
      ipcRenderer.send('capture.recording.stopRequest');
    },
    saveRecording: (bytes: Uint8Array, mimeType?: string | null): Promise<string> =>
      invoke<string>('capture.recording.save', { bytes, mimeType }),
    launcherDragStart: (screenX: number, screenY: number): void => {
      ipcRenderer.send('capture.launcher.drag.start', { screenX, screenY });
    },
    launcherDragMove: (screenX: number, screenY: number): void => {
      ipcRenderer.send('capture.launcher.drag.move', { screenX, screenY });
    },
    launcherDragEnd: (screenX?: number, screenY?: number): Promise<boolean> =>
      invoke<boolean>('capture.launcher.drag.end', { screenX, screenY }),
    getSelectionSession: (): Promise<CaptureSessionConfig> => invoke<CaptureSessionConfig>('capture.selectionSession.get'),
    getScreenPermission: (): Promise<PermissionState> =>
      invoke<PermissionState>('capture.screenPermission.get'),
    getScreenshotDiagnostics: (): Promise<ScreenshotAttemptDiagnostics | null> =>
      invoke<ScreenshotAttemptDiagnostics | null>('capture.screenshotDiagnostics.get'),
    getColorAtPosition: (x: number, y: number): Promise<string> =>
      invoke<string>('capture.getColorAtPosition', { x, y }),
    onRecordingState: (listener: (state: CaptureRecordingState) => void): (() => void) => {
      const wrapped = (_event: unknown, state: CaptureRecordingState) => listener(state);
      ipcRenderer.on('capture.recording.state', wrapped);
      return () => {
        ipcRenderer.removeListener('capture.recording.state', wrapped);
      };
    },
    onRecordingStopRequested: (listener: () => void): (() => void) => {
      const wrapped = () => listener();
      ipcRenderer.on('capture.recording.stopRequested', wrapped);
      return () => {
        ipcRenderer.removeListener('capture.recording.stopRequested', wrapped);
      };
    },
    onLauncherVisualState: (listener: (state: CaptureLauncherVisualState) => void): (() => void) => {
      const wrapped = (_event: unknown, state: CaptureLauncherVisualState) => listener(state);
      ipcRenderer.on('capture.launcher.visualState', wrapped);
      return () => {
        ipcRenderer.removeListener('capture.launcher.visualState', wrapped);
      };
    },
    onHubShown: (listener: () => void): (() => void) => {
      const wrapped = () => listener();
      ipcRenderer.on('capture.hub.shown', wrapped);
      return () => {
        ipcRenderer.removeListener('capture.hub.shown', wrapped);
      };
    }
  },
  records: {
    list: (limit?: number): Promise<RecordItem[]> => invoke<RecordItem[]>('records.list', { limit }),
    search: (input: SearchRecordsInput): Promise<RecordItem[]> =>
      invoke<RecordItem[]>('records.search', input),
    recent: (limit?: number): Promise<RecordItem[]> => invoke<RecordItem[]>('records.recent', { limit }),
    get: (recordId: string): Promise<RecordItem> => invoke<RecordItem>('records.get', { recordId }),
    getContent: (recordId: string): Promise<RecordContent> => invoke<RecordContent>('records.getContent', { recordId }),
    createText: (input: { text: string; sourceApp?: string | null; tags?: string[] }): Promise<RecordItem> =>
      invoke<RecordItem>('records.createText', input),
    copy: (recordId: string, options?: { optimize?: boolean }): Promise<boolean> =>
      invoke<boolean>('records.copy', { recordId, optimize: options?.optimize === true }),
    touch: (recordId: string): Promise<RecordItem> => invoke<RecordItem>('records.touch', { recordId }),
    startDrag: (recordId: string): void => {
      ipcRenderer.send('records.startDrag', { recordId });
    },
    delete: (recordId: string): Promise<boolean> => invoke<boolean>('records.delete', { recordId }),
    rename: (recordId: string, displayName: string): Promise<RecordItem> =>
      invoke<RecordItem>('records.rename', { recordId, displayName }),
    updateText: (recordId: string, text: string): Promise<RecordItem> =>
      invoke<RecordItem>('records.updateText', { recordId, text }),
    meta: {
      update: (recordId: string, patch: RecordMetaPatch): Promise<RecordItem> =>
        invoke<RecordItem>('records.meta.update', { recordId, patch }),
      bulkUpdate: (recordIds: string[], patch: RecordMetaPatch): Promise<RecordMetaBulkResult> =>
        invoke<RecordMetaBulkResult>('records.meta.bulkUpdate', { recordIds, patch })
    },
    flow: {
      create: (recordIds: string[]): Promise<RecordItem> =>
        invoke<RecordItem>('records.flow.create', { recordIds })
    },
    bulkDelete: (
      recordIds: string[]
    ): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> =>
      invoke<{ deleted: string[]; failed: Array<{ id: string; error: string }> }>('records.bulkDelete', { recordIds }),
    open: (recordId: string): Promise<boolean> => invoke<boolean>('records.open', { recordId }),
    onChanged: (listener: () => void): (() => void) => {
      const wrapped = () => listener();
      ipcRenderer.on('records.changed', wrapped);
      return () => {
        ipcRenderer.removeListener('records.changed', wrapped);
      };
    }
  },
  pin: {
    createFromRecord: (recordId: string): Promise<boolean> =>
      invoke<boolean>('pin.createFromRecord', { recordId }),
    bulkCreateFromRecords: (
      recordIds: string[]
    ): Promise<{ pinned: string[]; skipped: string[]; failed: Array<{ id: string; error: string }> }> =>
      invoke<{ pinned: string[]; skipped: string[]; failed: Array<{ id: string; error: string }> }>(
        'pin.bulkCreateFromRecords',
        { recordIds }
      ),
    close: (cardId: string): Promise<boolean> => invoke<boolean>('pin.close', { cardId }),
    toggleAlwaysOnTop: (cardId: string): Promise<boolean> =>
      invoke<boolean>('pin.toggleAlwaysOnTop', { cardId }),
    hideAll: (): Promise<boolean> => invoke<boolean>('pin.hideAll'),
    showAll: (): Promise<boolean> => invoke<boolean>('pin.showAll')
  },
  ocr: {
    fromRecord: (recordId: string): Promise<OcrResult> => invoke<OcrResult>('ocr.fromRecord', { recordId })
  },
  settings: {
    get: (): Promise<AppSettings> => invoke<AppSettings>('settings.get'),
    set: (next: Partial<AppSettings>): Promise<AppSettings> => invoke<AppSettings>('settings.set', next),
    listScopedApps: (): Promise<string[]> => invoke<string[]>('settings.scope.listApps'),
    localModel: {
      getStatus: (refreshPreflight?: boolean): Promise<LocalModelSettingsStatus> =>
        invoke<LocalModelSettingsStatus>('settings.localModel.status', { refreshPreflight }),
      setModel: (model: string): Promise<LocalModelSettingsStatus> =>
        invoke<LocalModelSettingsStatus>('settings.localModel.model.set', { model })
    },
    openStorageRoot: (): Promise<boolean> => invoke<boolean>('settings.openStorageRoot'),
    openExternalUrl: (url: string): Promise<boolean> => invoke<boolean>('settings.openExternalUrl', { url }),
    pickApp: (): Promise<string | null> => invoke<string | null>('settings.pickApp'),
    getAppIcon: (appPath: string): Promise<string | null> => invoke<string | null>('settings.getAppIcon', { appPath }),
    getToggle: (): Promise<PinToggleSettings> => invoke<PinToggleSettings>('settings.getToggle'),
    update: (next: Partial<PinToggleSettings>): Promise<PinToggleSettings> =>
      invoke<PinToggleSettings>('settings.update', next),
    runtime: {
      get: (): Promise<RuntimeSettings> => invoke<RuntimeSettings>('settings.runtime.get'),
      update: (next: Partial<RuntimeSettings>): Promise<RuntimeSettings> =>
        invoke<RuntimeSettings>('settings.runtime.update', next)
    }
  },
  ai: {
    getRuntimeStatus: (): Promise<AiRuntimeStatus> => invoke<AiRuntimeStatus>('ai.runtime.status'),
    listModels: (): Promise<AiModelCatalogItem[]> => invoke<AiModelCatalogItem[]>('ai.models.list'),
    getChatSession: (): Promise<AiChatSession> => invoke<AiChatSession>('ai.chat.session.get'),
    clearChatSession: (): Promise<AiChatSession> => invoke<AiChatSession>('ai.chat.session.clear'),
    sendChat: (text: string): Promise<AiChatSession> => invoke<AiChatSession>('ai.chat.send', { text }),
    healthCheck: (): Promise<AiHealthResult> => invoke<AiHealthResult>('ai.healthCheck'),
    health: (): Promise<AiHealthResult> => invoke<AiHealthResult>('ai.health'),
    test: (): Promise<AiTestResult> => invoke<AiTestResult>('ai.test'),
    onChatStream: (listener: (payload: AiChatStreamEvent) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: AiChatStreamEvent) => listener(payload);
      ipcRenderer.on('ai.chat.stream', wrapped);
      return () => {
        ipcRenderer.removeListener('ai.chat.stream', wrapped);
      };
    },
    inferSearchIntent: (query: string): Promise<AiSearchIntentResult> =>
      invoke<AiSearchIntentResult>('ai.search.intent', { query }),
    runOrchestratorTask: (input: AiOrchestratorTaskInput): Promise<AiOrchestratorTaskResult> =>
      invoke<AiOrchestratorTaskResult>('ai.orchestrate.run', input),
    migrateSecrets: (): Promise<boolean> => invoke<boolean>('ai.config.migrateSecrets'),
    getDiagnostics: (): Promise<AiDiagnosticsSnapshot> =>
      invoke<AiDiagnosticsSnapshot>('ai.diagnostics.snapshot'),
    openWindow: (): Promise<boolean> => invoke<boolean>('ai.window.open')
  },
  capsule: {
    getState: (): Promise<CapsuleStateSnapshot> => invoke<CapsuleStateSnapshot>('capsule.state.get'),
    dispatchAction: (input: CapsuleActionDispatchInput): Promise<CapsuleStateSnapshot> =>
      invoke<CapsuleStateSnapshot>('capsule.action.dispatch', input),
    setUiState: (uiState: CapsuleStateSnapshot['uiState']): Promise<CapsuleStateSnapshot> =>
      invoke<CapsuleStateSnapshot>('capsule.ui.state.set', { uiState }),
    getMetricsSnapshot: (): Promise<CapsuleStateSnapshot> =>
      invoke<CapsuleStateSnapshot>('capsule.metrics.snapshot'),
    onStateUpdated: (listener: (payload: CapsuleStateSnapshot) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: CapsuleStateSnapshot) => listener(payload);
      ipcRenderer.on('capsule.state.updated', wrapped);
      return () => {
        ipcRenderer.removeListener('capsule.state.updated', wrapped);
      };
    }
  },
  dashboard: {
    open: (): Promise<boolean> => invoke<boolean>('dashboard.open'),
    hide: (): Promise<boolean> => invoke<boolean>('dashboard.hide'),
    minimize: (): Promise<boolean> => invoke<boolean>('dashboard.minimize'),
    toggleAlwaysOnTop: (): Promise<boolean> => invoke<boolean>('dashboard.toggleAlwaysOnTop'),
    isAlwaysOnTop: (): Promise<boolean> => invoke<boolean>('dashboard.isAlwaysOnTop'),
    onShown: (listener: () => void): (() => void) => {
      const wrapped = () => listener();
      ipcRenderer.on('dashboard.shown', wrapped);
      return () => {
        ipcRenderer.removeListener('dashboard.shown', wrapped);
      };
    }
  },
  permissions: {
    getStatus: (source?: PermissionCheckSource, traceId?: string): Promise<PermissionStatusSnapshot> =>
      invoke<PermissionStatusSnapshot>('permissions.status.get', { source, traceId }),
    refresh: (source: PermissionCheckSource = 'manual-refresh', traceId?: string): Promise<PermissionStatusSnapshot> =>
      invoke<PermissionStatusSnapshot>('permissions.refresh', { source, traceId }),
    openSettings: (target: PermissionSettingsTarget, traceId?: string): Promise<boolean> =>
      invoke<boolean>('permissions.openSettings', { target, traceId }),
    onStatusUpdated: (listener: (payload: PermissionStatusSnapshot) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: PermissionStatusSnapshot) => listener(payload);
      ipcRenderer.on('permissions.status.updated', wrapped);
      return () => {
        ipcRenderer.removeListener('permissions.status.updated', wrapped);
      };
    }
  },
  telemetry: {
    track: (event: string, payload?: Record<string, unknown>): Promise<boolean> =>
      invoke<boolean>('telemetry.track', { event, payload })
  },
  notifications: {
    onToast: (listener: (payload: AppToastPayload) => void): (() => void) => {
      const wrapped = (_event: unknown, payload: AppToastPayload) => listener(payload);
      ipcRenderer.on('app.toast', wrapped);
      return () => {
        ipcRenderer.removeListener('app.toast', wrapped);
      };
    }
  },
  vaultkeeper: {
    getStatus: (): Promise<VkRuntimeStatus> => invoke<VkRuntimeStatus>('vk.status'),
    start: (): Promise<VkRuntimeStatus> => invoke<VkRuntimeStatus>('vk.start'),
    stop: (): Promise<VkRuntimeStatus> => invoke<VkRuntimeStatus>('vk.stop'),
    createJob: (params: VkCreateJobRequest): Promise<VkApiResponse<VkJob>> =>
      invoke<VkApiResponse<VkJob>>('vk.job.create', params),
    getJob: (jobId: string): Promise<VkApiResponse<VkJob>> =>
      invoke<VkApiResponse<VkJob>>('vk.job.get', { jobId }),
    exportFile: (params: VkExportRequest): Promise<VkApiResponse<VkExportResult>> =>
      invoke<VkApiResponse<VkExportResult>>('vk.export', params),
    exportBatch: (params: VkExportBatchRequest): Promise<VkApiResponse<{total: number; succeeded: number; failed: number; results: VkExportResult[]}>> =>
      invoke<VkApiResponse<{total: number; succeeded: number; failed: number; results: VkExportResult[]}>>('vk.export.batch', params),
    getTools: (): Promise<VkApiResponse<VkToolsInfo>> =>
      invoke<VkApiResponse<VkToolsInfo>>('vk.tools'),
    batchImport: (params: VkBatchImportRequest): Promise<VkApiResponse<unknown>> =>
      invoke<VkApiResponse<unknown>>('vk.batchImport', params),
    batchImportPreview: (params: VkBatchImportPreviewRequest): Promise<VkApiResponse<unknown>> =>
      invoke<VkApiResponse<unknown>>('vk.batchImport.preview', params),
    smartClip: (params: VkSmartClipRequest): Promise<VkApiResponse<unknown>> =>
      invoke<VkApiResponse<unknown>>('vk.smartClip', params),
    clipHtml: (params: VkClipHtmlRequest): Promise<VkApiResponse<unknown>> =>
      invoke<VkApiResponse<unknown>>('vk.clipHtml', params),
    suggest: (params: VkSuggestRequest): Promise<VkApiResponse<unknown>> =>
      invoke<VkApiResponse<unknown>>('vk.suggest', params),
    qualityCheck: (params: VkQualityRequest): Promise<VkApiResponse<unknown>> =>
      invoke<VkApiResponse<unknown>>('vk.quality', params),
    retryJob: (jobId: string, params?: VkRetryRequest): Promise<VkApiResponse<unknown>> =>
      invoke<VkApiResponse<unknown>>('vk.retry', { jobId, params }),
    sendRecord: (request: VkSendRecordRequest): Promise<VkApiResponse<VkJob>> =>
      invoke<VkApiResponse<VkJob>>('vk.record.send', request)
  },
  cutout: {
    processFromRecord: (recordId: string): Promise<CutoutProcessResult> =>
      invoke<CutoutProcessResult>('cutout.processFromRecord', { recordId }),
    saveResult: (input: CutoutSaveInput): Promise<CutoutSaveResult> =>
      invoke<CutoutSaveResult>('cutout.saveResult', input),
    openOutput: (outputPath: string): Promise<boolean> =>
      invoke<boolean>('cutout.openOutput', { outputPath }),
    saveAsRecord: (input: CutoutSaveInput): Promise<CutoutSaveAsRecordResult> =>
      invoke<CutoutSaveAsRecordResult>('cutout.saveAsRecord', input)
  },
  vk: {
    runtime: {
      getStatus: (): Promise<VKRuntimeStatusV1> => invoke<VKRuntimeStatusV1>('vk.runtime.getStatus'),
    },
    task: {
      create: (input: VKTaskCreateInput): Promise<VKTask> => invoke<VKTask>('vk.task.create', input),
      list: (): Promise<VKTaskListResponse> => invoke<VKTaskListResponse>('vk.task.list'),
      get: (id: string): Promise<VKTask | null> => invoke<VKTask | null>('vk.task.get', { id }),
      retry: (id: string): Promise<VKTask> => invoke<VKTask>('vk.task.retry', { id }),
      cancel: (id: string): Promise<VKTask> => invoke<VKTask>('vk.task.cancel', { id }),
      openOutput: (id: string): Promise<boolean> => invoke<boolean>('vk.task.openOutput', { id }),
      openLog: (id: string): Promise<boolean> => invoke<boolean>('vk.task.openLog', { id }),
    },
  },
  debug: {
    captureNow: (kind: 'text' | 'image'): Promise<boolean> =>
      invoke<boolean>('capture.debugCaptureNow', { kind }),
    localModel: {
      rename: (recordId: string): Promise<RecordItem> =>
        invoke<RecordItem>('localModel.debug.rename', { recordId }),
      dedupePair: (leftRecordId: string, rightRecordId: string): Promise<RecordItem> =>
        invoke<RecordItem>('localModel.debug.dedupePair', { leftRecordId, rightRecordId }),
      summary: (recordId: string): Promise<RecordItem> =>
        invoke<RecordItem>('localModel.debug.summary', { recordId }),
      image: (recordId: string): Promise<RecordItem> =>
        invoke<RecordItem>('localModel.debug.image', { recordId })
    }
  }
};

contextBridge.exposeInMainWorld('pinStack', api);
