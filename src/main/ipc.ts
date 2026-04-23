import { promises as fs } from 'node:fs';
import { app, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron';
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
  PermissionCheckSource,
  CaptureRatioOption,
  CaptureSelectionBounds,
  CaptureSizeOption,
  LocalModelSettingsStatus,
  OcrResult,
  PermissionSettingsTarget,
  PermissionStatusSnapshot,
  PinToggleSettings,
  RecordMetaBulkResult,
  RecordMetaPatch,
  RecordItem,
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
import { AppError, fail, ok, toErrorPayload } from './errors';
import type { FailureFeedbackContext } from './failureFeedback';
import type { ClipboardWatcher } from './clipboardWatcher';
import type { OcrService } from './ocrService';
import type { PinWindowManager } from './windows/pinWindowManager';
import type { SettingsService } from './settings';
import type { StorageService } from './storage';
import type { CaptureController } from './captureController';
import type { DashboardWindowController } from './windows/dashboardWindowController';
import { optimizeTextForCopy } from './copyOptimizer';
import { isTelemetryEvent, logTelemetry, type TelemetryEvent } from './telemetry';
import { processCutoutFromRecord, saveCutoutResult } from './cutout/cutoutService';

// ---------------------------------------------------------------------------
// IpcDependencies — simplified with direct object references
// ---------------------------------------------------------------------------

export interface IpcDependencies {
  // Core services
  storage: StorageService;
  watcher: ClipboardWatcher;
  pinManager: PinWindowManager;
  settings: SettingsService;
  ocrService: OcrService;
  captureController: CaptureController;
  dashboardController: DashboardWindowController;

  // Runtime settings
  getRuntimeSettings: () => RuntimeSettings;
  updateRuntimeSettings: (next: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;

  // Permissions
  getPermissionStatus: (source: PermissionCheckSource, traceId?: string) => Promise<PermissionStatusSnapshot>;
  openPermissionSettings: (target: PermissionSettingsTarget, traceId?: string) => Promise<boolean>;

  // Notifications
  notifyToast: (message: string, level?: 'error' | 'warning' | 'info') => void;
  reportFailure: (context: FailureFeedbackContext, error: unknown) => Promise<void>;

  // Settings lifecycle
  onSettingsUpdated: (next: AppSettings) => Promise<void>;
  onRecordsChanged: () => void;

  // Utility
  listRunningApps: () => Promise<string[]>;
  openStorageRoot: () => Promise<boolean>;
  openExternalUrl: (url: string) => Promise<boolean>;
  getAppVersion: () => string;
  trackTelemetry?: (event: TelemetryEvent, payload?: Record<string, unknown>) => void | Promise<void>;

  // Knowledge
  getKnowledgeRuntimeStatus: () => Promise<KnowledgeRuntimeStatus>;
  openKnowledgeWeb: () => Promise<boolean>;
  ingestKnowledgeRecords: (recordIds: string[]) => Promise<KnowledgeIngestRecordResult[]>;
  scanKnowledgeDirectory: (options: { dirPath: string; extensions?: string[]; excludePatterns?: string[] }) => Promise<{ success: boolean; totalFiles: number; newFiles: number; modifiedFiles: number; unchangedFiles: number; skippedFiles: number; message?: string }>;

  // Local model
  getLocalModelStatus: (refreshPreflight?: boolean) => Promise<LocalModelSettingsStatus>;
  setLocalModelName: (model: string) => Promise<LocalModelSettingsStatus>;

  // AI
  getAiRuntimeStatus: () => Promise<AiRuntimeStatus>;
  getAiModelCatalog: () => Promise<AiModelCatalogItem[]>;
  getAiChatSession: () => Promise<AiChatSession>;
  clearAiChatSession: () => Promise<AiChatSession>;
  sendAiChat: (text: string, onStream?: (payload: AiChatStreamEvent) => void) => Promise<AiChatSession>;
  runAiHealthCheck: () => Promise<AiHealthResult>;
  runAiTest: () => Promise<AiTestResult>;
  inferAiSearchIntent: (query: string) => Promise<AiSearchIntentResult>;
  runAiOrchestratorTask: (input: AiOrchestratorTaskInput) => Promise<AiOrchestratorTaskResult>;
  migrateAiSecrets: () => Promise<boolean>;
  getAiDiagnostics: () => Promise<AiDiagnosticsSnapshot>;
  openAiAssistantWindow: () => void;
  setAiCloudApiKey: (provider: string, apiKey: string) => Promise<void>;
  clearAiCloudApiKey: (provider: string) => Promise<void>;
  getCapsuleState: () => Promise<CapsuleStateSnapshot>;
  dispatchCapsuleAction: (input: CapsuleActionDispatchInput) => Promise<CapsuleStateSnapshot>;
  updateCapsuleUiState: (state: CapsuleStateSnapshot['uiState']) => Promise<CapsuleStateSnapshot>;

  // VaultKeeper
  getVaultKeeperStatus: () => Promise<VkRuntimeStatus>;
  startVaultKeeper: () => Promise<VkRuntimeStatus>;
  stopVaultKeeper: () => Promise<VkRuntimeStatus>;
  vkCreateJob: (params: VkCreateJobRequest) => Promise<VkApiResponse<VkJob>>;
  vkGetJob: (jobId: string) => Promise<VkApiResponse<VkJob>>;
  vkExportFile: (params: VkExportRequest) => Promise<VkApiResponse<VkExportResult>>;
  vkExportBatch: (params: VkExportBatchRequest) => Promise<VkApiResponse<{total: number; succeeded: number; failed: number; results: VkExportResult[]}>>;
  vkGetTools: () => Promise<VkApiResponse<VkToolsInfo>>;
  vkBatchImport: (params: VkBatchImportRequest) => Promise<VkApiResponse<unknown>>;
  vkBatchImportPreview: (params: VkBatchImportPreviewRequest) => Promise<VkApiResponse<unknown>>;
  vkSmartClip: (params: VkSmartClipRequest) => Promise<VkApiResponse<unknown>>;
  vkClipHtml: (params: VkClipHtmlRequest) => Promise<VkApiResponse<unknown>>;
  vkSuggest: (params: VkSuggestRequest) => Promise<VkApiResponse<unknown>>;
  vkQualityCheck: (params: VkQualityRequest) => Promise<VkApiResponse<unknown>>;
  vkRetryJob: (jobId: string, params?: VkRetryRequest) => Promise<VkApiResponse<unknown>>;
  vkSendRecord: (request: VkSendRecordRequest) => Promise<VkApiResponse<VkJob>>;

  // VaultKeeper v1 task bridge
  vkRuntimeGetStatus: () => Promise<VKRuntimeStatusV1>;
  vkTaskCreate: (input: VKTaskCreateInput) => Promise<VKTask>;
  vkTaskList: () => Promise<VKTaskListResponse>;
  vkTaskGet: (id: string) => Promise<VKTask | null>;
  vkTaskRetry: (id: string) => Promise<VKTask>;
  vkTaskCancel: (id: string) => Promise<VKTask>;
  vkTaskOpenOutput: (id: string) => Promise<boolean>;
  vkTaskOpenLog: (id: string) => Promise<boolean>;

  // WikiAgent (knowledge base)
  wikiGetStatus: () => Promise<WikiStatus>;
  wikiQuery: (input: WikiQueryInput) => Promise<WikiQueryResult>;
  wikiLint: () => Promise<WikiLintResult>;
  wikiOpenDir: () => Promise<boolean>;
  wikiOpenIndex: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Creates a lightweight drag icon for text, image, or video content. */
function createFallbackDragIcon(kind: 'text' | 'image' | 'video') {
  const label = kind === 'image' ? 'IMG' : kind === 'video' ? 'VID' : 'TXT';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect x="4" y="4" width="88" height="88" rx="20" fill="rgba(20,20,24,0.75)"/><text x="48" y="54" text-anchor="middle" fill="#e2e8f0" font-size="24" font-family="Arial,Helvetica,sans-serif">${label}</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
}

/** Type alias for the wrap function returned by createWrapFn. */
export type WrapFn = <TArgs, TResult>(
  channel: string,
  handler: (args: TArgs) => Promise<TResult>,
) => void;

export function createWrapFn(deps: IpcDependencies): WrapFn {
  return <TArgs, TResult>(channel: string, handler: (args: TArgs) => Promise<TResult>) => {
    ipcMain.handle(channel, async (_event, args: TArgs) => {
      try {
        const data = await handler(args);
        return ok(data);
      } catch (error) {
        const payload = toErrorPayload(error);
        console.error(`[ipc:${channel}]`, error);
        await deps.reportFailure(`ipc:${channel}` as FailureFeedbackContext, error);
        return fail(payload);
      }
    });
  };
}


import { registerRecordHandlers } from './ipc/recordHandlers';

import { registerCaptureHandlers } from './ipc/captureHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerVaultKeeperHandlers } from './ipc/vaultkeeperHandlers';

// ---------------------------------------------------------------------------
// Pin handlers
// ---------------------------------------------------------------------------

function registerPinHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  wrap<{ recordId: string }, boolean>('pin.createFromRecord', async (args) => {
    const record = deps.storage.getRecord(args.recordId);
    await deps.pinManager.createPinWindow(record);
    deps.onRecordsChanged();
    return true;
  });

  wrap<{ recordIds: string[] }, { pinned: string[]; skipped: string[]; failed: Array<{ id: string; error: string }> }>(
    'pin.bulkCreateFromRecords',
    async (args) => {
      const pinned: string[] = [];
      const skipped: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const recordId of args.recordIds) {
        try {
          const record = deps.storage.getRecord(recordId);
          const existed = deps.pinManager.getWindowMap().has(recordId);
          await deps.pinManager.createPinWindow(record);
          if (existed) {
            skipped.push(recordId);
          } else {
            pinned.push(recordId);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          failed.push({ id: recordId, error: message });
          console.error(`[pin.bulkCreateFromRecords] failed: ${recordId}`, error);
        }
      }

      deps.onRecordsChanged();
      return { pinned, skipped, failed };
    }
  );

  wrap<{ cardId: string }, boolean>('pin.close', async (args) => {
    deps.pinManager.closePin(args.cardId);
    return true;
  });

  wrap<{ cardId: string }, boolean>('pin.toggleAlwaysOnTop', async (args) => {
    return deps.pinManager.toggleAlwaysOnTop(args.cardId);
  });

  wrap<undefined, boolean>('pin.hideAll', async () => {
    deps.pinManager.hideAll();
    return true;
  });

  wrap<undefined, boolean>('pin.showAll', async () => {
    deps.pinManager.showAll();
    return true;
  });
}

// ---------------------------------------------------------------------------
// AI handlers
// ---------------------------------------------------------------------------

function registerAiHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  wrap<undefined, AiRuntimeStatus>('ai.runtime.status', async () => {
    return deps.getAiRuntimeStatus();
  });

  wrap<undefined, AiModelCatalogItem[]>('ai.models.list', async () => {
    return deps.getAiModelCatalog();
  });

  wrap<undefined, AiChatSession>('ai.chat.session.get', async () => {
    return deps.getAiChatSession();
  });

  wrap<undefined, AiChatSession>('ai.chat.session.clear', async () => {
    return deps.clearAiChatSession();
  });

  // ai.chat.send uses a custom handler because it needs event.sender.send for streaming,
  // but still follows the same error-reporting pattern as wrap.
  ipcMain.handle('ai.chat.send', async (event, args: { text: string }) => {
    try {
      if (!args?.text?.trim()) {
        throw new AppError('INVALID_ARGUMENT', 'Chat text is required');
      }
      const data = await deps.sendAiChat(args.text, (payload) => {
        event.sender.send('ai.chat.stream', payload);
      });
      return ok(data);
    } catch (error) {
      const payload = toErrorPayload(error);
      console.error('[ipc:ai.chat.send]', error);
      await deps.reportFailure('ipc:ai.chat.send' as FailureFeedbackContext, error);
      return fail(payload);
    }
  });

  wrap<undefined, AiHealthResult>('ai.healthCheck', async () => {
    return deps.runAiHealthCheck();
  });

  wrap<undefined, AiHealthResult>('ai.health', async () => {
    return deps.runAiHealthCheck();
  });

  wrap<undefined, AiTestResult>('ai.test', async () => {
    return deps.runAiTest();
  });

  wrap<{ query: string }, AiSearchIntentResult>('ai.search.intent', async (args) => {
    return deps.inferAiSearchIntent(args?.query ?? '');
  });

  wrap<AiOrchestratorTaskInput, AiOrchestratorTaskResult>('ai.orchestrate.run', async (args) => {
    return deps.runAiOrchestratorTask(args);
  });

  wrap<undefined, boolean>('ai.config.migrateSecrets', async () => {
    return deps.migrateAiSecrets();
  });

  wrap<undefined, AiDiagnosticsSnapshot>('ai.diagnostics.snapshot', async () => {
    return deps.getAiDiagnostics();
  });

  wrap<undefined, boolean>('ai.window.open', async () => {
    deps.openAiAssistantWindow();
    return true;
  });
}

function registerCapsuleHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  wrap<undefined, CapsuleStateSnapshot>('capsule.state.get', async () => {
    return deps.getCapsuleState();
  });

  wrap<CapsuleActionDispatchInput, CapsuleStateSnapshot>('capsule.action.dispatch', async (args) => {
    return deps.dispatchCapsuleAction(args);
  });

  wrap<{ uiState: CapsuleStateSnapshot['uiState'] }, CapsuleStateSnapshot>('capsule.ui.state.set', async (args) => {
    return deps.updateCapsuleUiState(args.uiState);
  });

  wrap<undefined, CapsuleStateSnapshot>('capsule.metrics.snapshot', async () => {
    return deps.getCapsuleState();
  });
}

// ---------------------------------------------------------------------------
// Permission handlers
// ---------------------------------------------------------------------------

function registerPermissionHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  wrap<{ source?: PermissionCheckSource; traceId?: string } | undefined, PermissionStatusSnapshot>('permissions.status.get', async (args) => {
    return deps.getPermissionStatus(args?.source ?? 'renderer-query', args?.traceId);
  });

  wrap<{ source?: PermissionCheckSource; traceId?: string } | undefined, PermissionStatusSnapshot>('permissions.refresh', async (args) => {
    return deps.getPermissionStatus(args?.source ?? 'manual-refresh', args?.traceId);
  });

  wrap<{ target: PermissionSettingsTarget; traceId?: string }, boolean>('permissions.openSettings', async (args) => {
    return deps.openPermissionSettings(args.target, args.traceId);
  });
}

// ---------------------------------------------------------------------------
// Dashboard handlers
// ---------------------------------------------------------------------------

function registerDashboardHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  const dc = deps.dashboardController;

  wrap<undefined, boolean>('dashboard.hide', async () => {
    dc.hide();
    return true;
  });

  wrap<undefined, boolean>('dashboard.open', async () => {
    dc.show();
    return true;
  });

  wrap<undefined, boolean>('dashboard.minimize', async () => {
    dc.minimize();
    return true;
  });

  wrap<undefined, boolean>('dashboard.toggleAlwaysOnTop', async () => {
    return dc.toggleAlwaysOnTop();
  });

  wrap<undefined, boolean>('dashboard.isAlwaysOnTop', async () => {
    return dc.getAlwaysOnTop();
  });
}

// ---------------------------------------------------------------------------
// App / Knowledge handlers
// ---------------------------------------------------------------------------

function registerAppHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  wrap<undefined, string>('app.version.get', async () => deps.getAppVersion());
  wrap<undefined, KnowledgeRuntimeStatus>('knowledge.status.get', async () => deps.getKnowledgeRuntimeStatus());
  wrap<undefined, boolean>('knowledge.web.open', async () => deps.openKnowledgeWeb());
  wrap<{ recordIds: string[] }, KnowledgeIngestRecordResult[]>('knowledge.ingest.records', async (args) => {
    const recordIds = Array.isArray(args.recordIds) ? args.recordIds.filter((value) => typeof value === 'string' && value.trim()) : [];
    if (recordIds.length === 0) {
      throw new AppError('INVALID_ARGUMENT', 'recordIds cannot be empty');
    }
    return deps.ingestKnowledgeRecords(recordIds);
  });
  wrap<{ dirPath: string; extensions?: string[]; excludePatterns?: string[] }, { success: boolean; totalFiles: number; newFiles: number; modifiedFiles: number; unchangedFiles: number; skippedFiles: number; message?: string }>('knowledge.scan.directory', async (args) => {
    if (!args.dirPath?.trim()) {
      return { success: false, totalFiles: 0, newFiles: 0, modifiedFiles: 0, unchangedFiles: 0, skippedFiles: 0, message: 'dirPath is required' };
    }
    return deps.scanKnowledgeDirectory({
      dirPath: args.dirPath.trim(),
      extensions: args.extensions,
      excludePatterns: args.excludePatterns
    });
  });
}

function registerTelemetryHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  wrap<{ event: string; payload?: Record<string, unknown> }, boolean>('telemetry.track', async (args) => {
    if (!args?.event || !isTelemetryEvent(args.event)) {
      logTelemetry(
        'stability.anomaly',
        {
          name: 'telemetry.track.invalid_event',
          event: args?.event ?? null
        },
        'warn'
      );
      return false;
    }

    if (deps.trackTelemetry) {
      await deps.trackTelemetry(args.event, args.payload);
      return true;
    }

    logTelemetry(args.event, {
      source: 'renderer',
      ...(args.payload ?? {})
    });
    return true;
  });
}

function registerCutoutHandlers(deps: IpcDependencies, wrap: ReturnType<typeof createWrapFn>): void {
  wrap<{ recordId: string }, CutoutProcessResult>('cutout.processFromRecord', async (args) => {
    const record = deps.storage.getRecord(args.recordId);
    if (record.type !== 'image') {
      throw new AppError('INVALID_ARGUMENT', '当前记录不是图片，无法执行抠图');
    }
    const content = await deps.storage.getRecordContent(args.recordId);
    if (content.type !== 'image') {
      throw new AppError('INVALID_ARGUMENT', '当前记录图片内容不可用');
    }
    return processCutoutFromRecord({
      recordId: args.recordId,
      sourceDataUrl: content.dataUrl,
      displayName: record.displayName
    });
  });

  wrap<CutoutSaveInput, CutoutSaveResult>('cutout.saveResult', async (args) => {
    const settings = deps.settings.get();
    return saveCutoutResult(args, settings);
  });

  wrap<{ outputPath: string }, boolean>('cutout.openOutput', async (args) => {
    if (!args.outputPath?.trim()) {
      throw new AppError('INVALID_ARGUMENT', 'outputPath is required');
    }
    const result = await shell.openPath(args.outputPath);
    return result === '';
  });

  wrap<CutoutSaveInput, CutoutSaveAsRecordResult>('cutout.saveAsRecord', async (args) => {
    const image = nativeImage.createFromDataURL(args.dataUrl);
    if (image.isEmpty()) {
      throw new AppError('IMAGE_DECODE_FAILED', 'Invalid cutout image data');
    }
    const created = await deps.storage.createImageRecord(image, {
      source: 'clipboard',
      sourceApp: 'PinStack Cutout',
      tags: ['cutout', 'transparent-png'],
      useCase: 'reference',
    });
    const renamed = args.fileNameSuggestion?.trim()
      ? await deps.storage.renameRecord(created.id, args.fileNameSuggestion.replace(/\.png$/i, ''))
      : created;
    deps.onRecordsChanged();
    return {
      recordId: renamed.id,
      outputPath: renamed.path
    };
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function registerIpcHandlers(deps: IpcDependencies): void {
  const wrap = createWrapFn(deps);

  registerAppHandlers(deps, wrap);
  registerRecordHandlers(deps, wrap);
  registerCaptureHandlers(deps, wrap);
  registerPinHandlers(deps, wrap);
  registerAiHandlers(deps, wrap);
  registerCapsuleHandlers(deps, wrap);
  registerSettingsHandlers(deps, wrap);
  registerPermissionHandlers(deps, wrap);
  registerDashboardHandlers(deps, wrap);
  registerVaultKeeperHandlers(deps, wrap);
  registerCutoutHandlers(deps, wrap);
  registerTelemetryHandlers(deps, wrap);
}
