import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { app, desktopCapturer, Menu, nativeImage, screen, session, shell } from 'electron';
import type { App as ElectronApp } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type {
  AiOrchestratorTaskInput,
  AiOrchestratorTaskResult,
  AiDiagnosticsSnapshot,
  AppSettings,
  AppToastLevel,
  AppToastPayload,
  RecordCategory,
  RuntimeSettings
} from '../shared/types';
import { ClipboardWatcher, type ClipboardContent, type ClipboardDetectionDebug } from './clipboardWatcher';
import { registerIpcHandlers } from './ipc';
import { OcrService } from './ocrService';
import { presentFailureFeedback, reportShortcutRegistrationFailure, type FailureFeedbackContext } from './failureFeedback';
import {
  getDefaultShortcutRegistrationStatus,
  type ShortcutRegistrationStatus
} from './permissions';
import { PinWindowManager } from './windows/pinWindowManager';
import { RuleEngine, suggestClassification } from './ruleEngine';
import { RuntimeSettingsService, SettingsService } from './settings';
import { isFlowSourceApp } from './sourceClassifier';
import { getFrontmostApp, listRunningApplications } from './sourceApp';
import { StabilityProbe } from './stabilityProbe';
import { StorageService } from './storage';
import { createLocalModelService, LocalModelServiceImpl } from './services/localModel/localModelService';
import { AiHubService } from './services/aiHub/aiHubService';
import { deleteCloudApiKey, loadCloudApiKey, saveCloudApiKey } from './services/aiHub/secretStore';
import { planAiTaskRoute, resolveTaskOutputTarget, taskRequiresRecord } from './services/aiHub/taskRouter';
import { createAiOrchestratorTask } from './services/aiHub/orchestrator';
import { createTrayController } from './tray';
import { SYSTEM_SUGGESTION_TAG } from '../shared/classificationSuggestion';
import { isAppWithinScope } from './appScope';
import { createCaptureController, type CaptureController } from './captureController';
import { createDashboardWindowController, type DashboardWindowController } from './windows/dashboardWindowController';
import { createAiAssistantWindowController, type AiAssistantWindowController } from './windows/aiAssistantWindowController';
import { createNotchSubprocessController, type CapsuleWindowController } from './windows/notchSubprocessController';
import { registerGlobalShortcuts, safeUnregisterGlobalShortcuts } from './shortcutManager';
import { getAiModelById, isLocalOllamaModel } from '../shared/ai/modelRegistry';
import { createDefaultAppSettings, DEFAULT_RUNTIME_SETTINGS } from '../shared/defaultSettings';
import type { KnowledgeIngestRecordResult, KnowledgeRuntimeStatus } from '../shared/knowledge3';
import { AppError } from './errors';
import { createKnowledgeServer } from '../../server/src/createKnowledgeServer';
import { KnowledgeRuntime } from '../../server/src/knowledgeRuntime';
import { VaultKeeperProcessManager } from './vaultkeeper/process-manager';
import type { VkRuntimeStatus, VkCreateJobRequest, VkExportRequest, VkExportBatchRequest, VkToolsInfo, VkBatchImportRequest, VkBatchImportPreviewRequest, VkSmartClipRequest, VkSuggestRequest, VkQualityRequest, VkRetryRequest, VkClipHtmlRequest, VkSendRecordRequest, VkApiResponse, VkJob } from '../shared/vaultkeeper';
import { VKBridge } from './vk/vkBridge';
import { resolveVkTaskFromRecord, sendRecordToVaultKeeper } from './vk/ipcAdapters';
import type { VKTask, VKTaskCreateInput, VKTaskListResponse, VKRuntimeStatus as VKRuntimeStatusV1 } from '../shared/vk/types';
import type { WikiQueryInput, WikiQueryResult, WikiLintResult, WikiStatus } from '../shared/vk/wikiTypes';
import { createPermissionCoordinator, type PermissionCoordinator } from './permissionCoordinator';
import { logTelemetry } from './telemetry';
import type { AppContext } from './appContext';
import { resolveKnowledgeWebTargetUrl } from './knowledgeWebResolver';
import { handleClipboardContent, resolveRecordCategory } from './clipboardHandler';
import { updateRuntimeSettings, toggleRuntimeModePreset, applyTrayMode, cycleRuntimeModeFromTray } from './runtimeSettingsUpdater';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const appWithState = app as ElectronApp & { isQuitting?: boolean };
const APP_DISPLAY_NAME = 'PinStack';

// Mitigate sporadic white/blank renderer issues on some macOS GPU compositions.
app.disableHardwareAcceleration();

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const preloadPath = path.join(__dirname, '../preload/index.cjs');
const rendererFilePath = path.join(__dirname, '../renderer/index.html');
const rendererDevUrl = process.env.VITE_DEV_SERVER_URL;
const knowledgeWebDevUrl = process.env.PINSTACK_WEB_DEV_URL?.trim() || 'http://localhost:5180';
const defaultStorageRoot = path.join(os.homedir(), 'PinStack');
const sharedSettingsFilePath = path.join(defaultStorageRoot, 'settings.json');

const stabilityProbe = new StabilityProbe({
  enabled: process.env.PINSTACK_STABILITY_LOG !== '0',
  summaryIntervalMs: 30000
});

// ---------------------------------------------------------------------------
// App version
// ---------------------------------------------------------------------------

function resolveAppVersion(): string {
  try {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
    if (typeof packageJson.version === 'string' && packageJson.version.trim()) {
      return packageJson.version.trim();
    }
  } catch (error) {
    console.warn('[app.version] Failed to read package.json version, falling back to app.getVersion()', error);
  }

  return app.getVersion();
}

const APP_VERSION = resolveAppVersion();

app.setName(APP_DISPLAY_NAME);

// ---------------------------------------------------------------------------
// Default settings
// ---------------------------------------------------------------------------

const defaultSettings: AppSettings = createDefaultAppSettings({
  storageRoot: defaultStorageRoot
});

const defaultRuntimeSettings: RuntimeSettings = {
  ...DEFAULT_RUNTIME_SETTINGS,
  captureRecentSizes: [...DEFAULT_RUNTIME_SETTINGS.captureRecentSizes]
};

async function migrateAiSecrets(ctx: AppContext): Promise<boolean> {
  const provider = ctx.settings.aiHub.cloudProvider?.trim() || 'openai';
  const legacyApiKey = ctx.settings.aiHub.cloudApiKey?.trim() || '';
  const keychainApiKey = await loadCloudApiKey(provider);

  if (!legacyApiKey) {
    return false;
  }

  if (!keychainApiKey || keychainApiKey !== legacyApiKey) {
    await saveCloudApiKey(provider, legacyApiKey);
  }

  const next = await ctx.settingsService.update({
    aiHub: {
      ...ctx.settings.aiHub,
      cloudApiKey: undefined
    }
  });
  ctx.settings = next;
  return true;
}

// ---------------------------------------------------------------------------
// AppContext — encapsulates all mutable global state
// ---------------------------------------------------------------------------

/** Single module-level reference for lifecycle event handlers */
let ctxRef: AppContext | null = null;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function normalizeShortcut(shortcut: string): string {
  return shortcut.replace(/\s+/g, '').toUpperCase();
}

function isLegacyQuickPanelShortcut(shortcut: string): boolean {
  const normalized = normalizeShortcut(shortcut);
  return normalized === 'COMMANDORCONTROL+SHIFT+V' || normalized === 'COMMAND+SHIFT+V' || normalized === 'CMDORCTRL+SHIFT+V';
}

function resolveAppIconPathCandidates(): string[] {
  return [
    path.join(process.resourcesPath, 'icon.icns'),
    path.join(path.dirname(process.execPath), '../Resources/icon.icns'),
    path.join(app.getAppPath(), 'assets', 'icons', 'app', 'pinstack-app-icon.icns'),
    path.join(process.resourcesPath, 'assets', 'icons', 'app', 'pinstack-app-icon.icns'),
    path.join(app.getAppPath(), 'assets', 'icons', 'app', 'icon.icns'),
    path.join(process.resourcesPath, 'assets', 'icons', 'app', 'icon.icns'),
    path.join(app.getAppPath(), 'assets', 'icons', 'app', 'pinstack-app-icon-master.png'),
    path.join(process.resourcesPath, 'assets', 'icons', 'app', 'pinstack-app-icon-master.png')
  ];
}

function applyDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) {
    return;
  }

  for (const candidate of resolveAppIconPathCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }
    const image = nativeImage.createFromPath(candidate);
    if (image.isEmpty()) {
      continue;
    }
    app.dock.setIcon(image);
    console.info('[app.icon] Dock icon applied', {
      path: candidate,
      isPackaged: app.isPackaged
    });
    return;
  }

  console.warn('[app.icon] Dock icon not found, keeping current icon', {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath()
  });
}

function logAppIconDiagnostics(): void {
  const appPathCandidate = path.join(app.getAppPath(), 'assets', 'icons', 'app', 'pinstack-app-icon.icns');
  const resourcesCandidate = path.join(process.resourcesPath, 'assets', 'icons', 'app', 'pinstack-app-icon.icns');
  const packagedIconCandidate = path.join(process.resourcesPath, 'icon.icns');
  console.info('[app.icon] configuration', {
    configuredBuildIcon: 'assets/icons/app/pinstack-app-icon.icns',
    appPathCandidate,
    appPathExists: existsSync(appPathCandidate),
    resourcesCandidate,
    resourcesExists: existsSync(resourcesCandidate),
    packagedIconCandidate,
    packagedIconExists: existsSync(packagedIconCandidate),
    isDev,
    isPackaged: app.isPackaged,
    cacheHint: '若图标未更新，请在确认资源链路后重启 Dock 再复测。'
  });
}

function ensureRegularMacAppMode(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    app.setName(APP_DISPLAY_NAME);
    app.setActivationPolicy('regular');
    app.dock?.show();
  } catch (error) {
    console.warn('[app.mode] Failed to force regular activation policy', error);
  }

  try {
    const menuTemplate: MenuItemConstructorOptions[] = [
      {
        label: APP_DISPLAY_NAME,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  } catch (error) {
    console.warn('[app.mode] Failed to install application menu', error);
  }
}
function applyLaunchAtLogin(enabled: boolean): void {
  if (process.platform !== 'darwin') {
    return;
  }

  // 开发模式下跳过登录项注册，避免权限错误
  if (isDev) {
    console.info('[settings] Skipping login item registration in dev mode');
    return;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled
    });
  } catch (error) {
    console.error('[settings] Failed to update launch at login', error);
  }
}

// ---------------------------------------------------------------------------
// Context-aware notification helpers
// ---------------------------------------------------------------------------

function notifyRecordsChanged(ctx: AppContext): void {
  ctx.dashboardController.getWindow()?.webContents.send('records.changed');
}

function notifyUiToast(ctx: AppContext, message: string, level: AppToastLevel = 'error'): void {
  const payload: AppToastPayload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    createdAt: Date.now()
  };

  ctx.dashboardController.getWindow()?.webContents.send('app.toast', payload);
  ctx.captureController.sendToastToHub(payload);
}

// ---------------------------------------------------------------------------
// Storage root / failure reporting helpers (context-aware)
// ---------------------------------------------------------------------------

async function openStorageRoot(ctx: AppContext): Promise<boolean> {
  const result = await shell.openPath(ctx.settings.storageRoot);
  if (result) {
    throw new Error(result);
  }
  return true;
}

async function reportFailure(ctx: AppContext, context: FailureFeedbackContext, error: unknown): Promise<void> {
  await presentFailureFeedback(context, error, {
    notifyToast: (msg, level) => notifyUiToast(ctx, msg, level),
    openPermissionSettings: (target) => ctx.permissionCoordinator.openPermissionSettings(target),
    openStorageRoot: () => openStorageRoot(ctx)
  });
}

// ---------------------------------------------------------------------------
// Runtime settings update (context-aware)
// ---------------------------------------------------------------------------
// Clipboard handler (context-aware)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Bootstrap sub-functions
// ---------------------------------------------------------------------------

async function initSettings(): Promise<{
  settingsService: SettingsService;
  runtimeSettingsService: RuntimeSettingsService;
  currentSettings: AppSettings;
  runtimeSettings: RuntimeSettings;
}> {
  const legacySettingsFilePath = path.join(app.getPath('userData'), 'settings.json');
  const legacyRuntimeSettingsFilePath = path.join(app.getPath('userData'), 'runtime-settings.json');

  const settingsService = new SettingsService(sharedSettingsFilePath, defaultSettings, legacySettingsFilePath);
  await settingsService.init();
  let currentSettings = settingsService.get();
  if (isLegacyQuickPanelShortcut(currentSettings.captureHubShortcut)) {
    currentSettings = await settingsService.update({
      captureHubShortcut: defaultSettings.captureHubShortcut
    });
    console.info('[shortcuts] migrated legacy shortcut', {
      from: 'Command+Shift+V',
      to: currentSettings.captureHubShortcut
    });
  }

  const runtimeSettingsService = new RuntimeSettingsService(
    sharedSettingsFilePath,
    defaultRuntimeSettings,
    legacyRuntimeSettingsFilePath
  );
  await runtimeSettingsService.init();
  const runtimeSettings = runtimeSettingsService.get();

  logAppIconDiagnostics();
  applyDockIcon();

  return { settingsService, runtimeSettingsService, currentSettings, runtimeSettings };
}

async function initLocalModel(currentSettings: AppSettings): Promise<{ localModelService: LocalModelServiceImpl }> {
  const localModelService = createLocalModelService({ isDev });
  const startupLocalModel = currentSettings.aiHub.defaultModelId?.trim();
  if (currentSettings.aiHub.defaultProvider === 'local' && startupLocalModel && isLocalOllamaModel(startupLocalModel)) {
    await localModelService.setModel(startupLocalModel);
  }
  await localModelService.init();
  return { localModelService };
}

function initStorage(
  currentSettings: AppSettings,
  deps: {
    settingsService: SettingsService;
    localModelService: LocalModelServiceImpl;
    notifyRecordsChanged: () => void;
  }
): { storage: StorageService } {
  const storage = new StorageService(currentSettings.storageRoot, {
    localModelService: deps.localModelService,
    onBackgroundMutation: deps.notifyRecordsChanged
  });
  return { storage };
}

function initAiHub(
  currentSettings: AppSettings,
  storage: StorageService,
  localModelService: LocalModelServiceImpl
): { aiHubService: AiHubService } {
  const aiHubService = new AiHubService({
    getSettings: () => ctxRef?.settings ?? currentSettings,
    localModelService,
    searchRecords: async (query) =>
      storage.searchRecords({
        query,
        limit: 30
      }),
    storageRoot: () => (ctxRef?.settings ?? currentSettings).storageRoot,
    getCloudApiKey: (provider) => loadCloudApiKey(provider)
  });
  return { aiHubService };
}

async function initKnowledge(
  currentSettings: AppSettings,
  storage: StorageService,
  localModelService: LocalModelServiceImpl
): Promise<{
  knowledgeRuntime: KnowledgeRuntime;
  knowledgeApiBaseUrl: string;
  knowledgeWebUrl: string;
  knowledgeServerClose: () => void;
}> {
  let knowledgeApiBaseUrl = '';
  let knowledgeWebUrl = '';

  const knowledgeRuntime = new KnowledgeRuntime({
    storageRoot: currentSettings.storageRoot,
    storage,
    localModelService,
    getApiBaseUrl: () => knowledgeApiBaseUrl,
    getWebUrl: () => knowledgeWebUrl
  });
  await knowledgeRuntime.init();

  const startedKnowledgeServer = await createKnowledgeServer({
    runtime: knowledgeRuntime,
    webDevUrl: isDev ? knowledgeWebDevUrl : undefined,
    webRootPath: path.join(__dirname, '../web')
  });
  knowledgeApiBaseUrl = startedKnowledgeServer.apiBaseUrl;
  knowledgeWebUrl = startedKnowledgeServer.webUrl;
  const knowledgeServerClose = () => {
    startedKnowledgeServer.server.close();
  };
  console.info('[knowledge3.server] ready', {
    apiBaseUrl: knowledgeApiBaseUrl,
    webUrl: knowledgeWebUrl,
    webDevUrl: isDev ? knowledgeWebDevUrl : '',
    isDev
  });

  return { knowledgeRuntime, knowledgeApiBaseUrl, knowledgeWebUrl, knowledgeServerClose };
}

async function initVaultKeeper(currentSettings: AppSettings): Promise<VaultKeeperProcessManager> {
  const vkSettings = currentSettings.vaultkeeper;
  if (!vkSettings?.enabled) {
    console.info('[bootstrap] VaultKeeper is disabled in settings');
    const manager = new VaultKeeperProcessManager({
      vkProjectRoot: vkSettings?.projectRoot || '',
      vkWorkDir: currentSettings.storageRoot,
      port: vkSettings?.port || 3210,
    });
    return manager;
  }

  const manager = new VaultKeeperProcessManager({
    vkProjectRoot: vkSettings.projectRoot,
    vkWorkDir: currentSettings.storageRoot,
    port: vkSettings.port || 3210,
    onStateChange: (status: VkRuntimeStatus) => {
      console.info(`[vaultkeeper] state: ${status.state}`);
    },
  });

  if (vkSettings.autoStart) {
    try {
      await manager.start();
      console.info('[bootstrap] VaultKeeper started successfully');
    } catch (error) {
      console.error('[bootstrap] VaultKeeper auto-start failed (non-blocking):', error);
    }
  }

  return manager;
}

function initWindows(ctx: AppContext): void {
  ctx.dashboardController = createDashboardWindowController({
    preloadPath,
    rendererFilePath,
    rendererDevUrl,
    isDev,
    getSettings: () => ctx.settings,
    getRuntimeSettings: () => ctx.runtimeSettings,
    updateRuntimeSettings: (patch) => updateRuntimeSettings(ctx, patch),
    isQuitting: () => Boolean(appWithState.isQuitting)
  });

  ctx.aiAssistantWindowController = createAiAssistantWindowController({
    preloadPath,
    rendererFilePath,
    rendererDevUrl,
    isDev
  });

  ctx.captureController = createCaptureController({
    preloadPath,
    rendererFilePath,
    rendererDevUrl,
    getCurrentSettings: () => ctx.settings,
    getRuntimeSettings: () => ctx.runtimeSettings,
    updateRuntimeSettings: (patch) => updateRuntimeSettings(ctx, patch),
    storage: ctx.storage,
    pinManager: ctx.pinManager,
    notifyRecordsChanged: () => notifyRecordsChanged(ctx),
    notifyToast: (msg, level) => notifyUiToast(ctx, msg, level),
    reportFailure: (context, error) => reportFailure(ctx, context, error),
    getFrontmostApp,
    getAppPath: () => app.getAppPath(),
    getBundleId: () => process.env.APP_ID ?? 'com.pinstack.app'
  });

  ctx.capsuleController = createNotchSubprocessController({
    preloadPath,
    rendererFilePath,
    rendererDevUrl,
    isDev,
    getSettings: () => ctx.settings,
    getRuntimeSettings: () => ctx.runtimeSettings,
    getRecentContent: async () => {
      const latest = await ctx.storage.listRecentRecords(1);
      const record = latest[0];
      if (!record) {
        return undefined;
      }
      return {
        recordId: record.id,
        title: record.displayName || record.previewText || '未命名内容',
        useCase: record.useCase,
        source: record.source,
        createdAt: record.createdAt
      };
    },
    getAiConnectionState: async () => {
      const status = await ctx.aiHubService.getRuntimeStatus();
      return status.connectionState;
    },
    takeScreenshot: async () => {
      await ctx.captureController.beginRegionScreenshotCapture();
    },
    openAiWindow: () => {
      ctx.aiAssistantWindowController.show();
    },
    openWorkspace: () => {
      ctx.dashboardController.show();
    }
  });
}

function initClipboard(ctx: AppContext): void {
  ctx.watcher = new ClipboardWatcher(ctx.settings.pollIntervalMs, async (payload) => {
    const eventName = payload.type === 'text' ? 'clipboard.process.text' : 'clipboard.process.image';
    await stabilityProbe.measure(
      eventName,
      async () => handleClipboardContent(ctx, payload, stabilityProbe, () => notifyRecordsChanged(ctx), (msg, level) => notifyUiToast(ctx, msg, level)),
      {
        slowMs: payload.type === 'image' ? 1800 : 1200
      }
    );
  });
}

function initTray(ctx: AppContext): void {
  ctx.tray = createTrayController({
    onTrayPrimaryAction: () => {
      const isDashboardVisible = Boolean(ctx.dashboardController.getWindow()?.isVisible());
      stabilityProbe.info('tray.click', {
        dashboardVisible: isDashboardVisible
      });

      if (isDashboardVisible) {
        ctx.dashboardController.hide();
        stabilityProbe.info('tray.click.hideDashboard');
        return;
      }

      ctx.dashboardController.show();
    },
    openDashboard: () => {
      ctx.dashboardController.show();
    },
    initialMode: ctx.runtimeSettings.mode,
    onModeChange: (mode) => {
      void applyTrayMode(ctx, mode);
    }
  });
}

function initShortcuts(ctx: AppContext): void {
  const rebindShortcuts = (settings: AppSettings) => {
    ctx.shortcutRegistrationStatus = registerGlobalShortcuts(settings, {
      onScreenshot: async () => {
        await ctx.captureController?.beginRegionScreenshotCapture();
      },
      onToggleDashboard: () => {
        ctx.dashboardController?.toggle();
      },
      onToggleCaptureHub: async () => {
        await ctx.captureController?.toggleCaptureHubPanel();
      },
      onToggleMode: async () => {
        await toggleRuntimeModePreset(ctx, (msg, level) => notifyUiToast(ctx, msg, level));
      },
      onTrayOpenDashboard: () => {
        ctx.dashboardController?.show();
      },
      onTrayCycleMode: async () => {
        await cycleRuntimeModeFromTray(ctx, (msg, level) => notifyUiToast(ctx, msg, level));
      },
      onTrayQuit: () => {
        app.quit();
      },
      notifyToast: (msg, level) => notifyUiToast(ctx, msg, level)
    });
    console.info('[shortcuts] registration result', {
      screenshot: {
        shortcut: ctx.shortcutRegistrationStatus.screenshotShortcut,
        registered: ctx.shortcutRegistrationStatus.screenshotRegistered
      },
      dashboard: {
        shortcut: ctx.shortcutRegistrationStatus.dashboardShortcut,
        registered: ctx.shortcutRegistrationStatus.dashboardRegistered
      },
      captureHub: {
        shortcut: ctx.shortcutRegistrationStatus.captureHubShortcut,
        registered: ctx.shortcutRegistrationStatus.captureHubRegistered
      },
      mode: {
        shortcut: ctx.shortcutRegistrationStatus.modeToggleShortcut,
        registered: ctx.shortcutRegistrationStatus.modeToggleRegistered
      },
      trayOpenDashboard: {
        shortcut: ctx.shortcutRegistrationStatus.trayOpenDashboardShortcut,
        registered: ctx.shortcutRegistrationStatus.trayOpenDashboardRegistered
      },
      trayCycleMode: {
        shortcut: ctx.shortcutRegistrationStatus.trayCycleModeShortcut,
        registered: ctx.shortcutRegistrationStatus.trayCycleModeRegistered
      },
      trayQuit: {
        shortcut: ctx.shortcutRegistrationStatus.trayQuitShortcut,
        registered: ctx.shortcutRegistrationStatus.trayQuitRegistered
      }
    });
    void reportShortcutRegistrationFailure(ctx.shortcutRegistrationStatus, {
      notifyToast: (msg, level) => notifyUiToast(ctx, msg, level),
      openPermissionSettings: (target) => ctx.permissionCoordinator.openPermissionSettings(target),
      openStorageRoot: () => openStorageRoot(ctx)
    });
  };

  rebindShortcuts(ctx.settings);
}

function initIpc(ctx: AppContext, deps: {
  localModelService: LocalModelServiceImpl;
  rebindShortcuts: (settings: AppSettings) => void;
}): void {
  const runAiOrchestratorTask = createAiOrchestratorTask({
    ctx,
    notifyRecordsChanged: () => notifyRecordsChanged(ctx),
  });

  registerIpcHandlers({
    storage: ctx.storage,
    watcher: ctx.watcher,
    pinManager: ctx.pinManager,
    settings: ctx.settingsService,
    getRuntimeSettings: () => ctx.runtimeSettings,
    updateRuntimeSettings: (next) => updateRuntimeSettings(ctx, next),
    ocrService: ctx.ocrService,
    captureController: ctx.captureController,
    dashboardController: ctx.dashboardController,
    getCapsuleState: async () => ctx.capsuleController.getStateSnapshot(),
    dispatchCapsuleAction: async (input) => ctx.capsuleController.dispatchAction(input),
    updateCapsuleUiState: async (uiState) => ctx.capsuleController.updateUiState(uiState),
    getPermissionStatus: (source, traceId) => ctx.permissionCoordinator.getPermissionStatus(source, traceId),
    openPermissionSettings: (target, traceId) => ctx.permissionCoordinator.openPermissionSettings(target, traceId),
    notifyToast: (message, level) => notifyUiToast(ctx, message, level),
    reportFailure: (context, error) => reportFailure(ctx, context, error),
    listRunningApps: async () => {
      const apps = await listRunningApplications();
      return apps.filter((item) => item !== 'PinStack');
    },
    openStorageRoot: () => openStorageRoot(ctx),
    openExternalUrl: async (url: string) => {
      await shell.openExternal(url);
      return true;
    },
    getAppVersion: () => APP_VERSION,
    trackTelemetry: (event, payload) => {
      logTelemetry(event, {
        source: 'renderer',
        ...(payload ?? {})
      });
    },
    getKnowledgeRuntimeStatus: async (): Promise<KnowledgeRuntimeStatus> => {
      return ctx.knowledgeRuntime.getStatus();
    },
    openKnowledgeWeb: async (): Promise<boolean> => {
      const { targetUrl, reason } = await resolveKnowledgeWebTargetUrl(ctx, isDev, knowledgeWebDevUrl);
      if (!targetUrl) {
        const details = `knowledge web url unavailable: ${reason}`;
        console.error('[knowledge3.web.open] failed', { reason });
        notifyUiToast(ctx, '知识前台地址不可用，请稍后重试。', 'error');
        throw new AppError('INTERNAL_ERROR', 'PinStack 3.0 Web URL is not available.', details);
      }
      console.info('[knowledge3.web.open] opening', { targetUrl, reason });
      try {
        await shell.openExternal(targetUrl);
      } catch (error) {
        const details = error instanceof Error ? error.message : 'unknown shell.openExternal error';
        console.error('[knowledge3.web.open] failed', { targetUrl, reason, error });
        notifyUiToast(ctx, '知识前台打开失败，请稍后重试。', 'error');
        throw new AppError('INTERNAL_ERROR', 'Failed to open PinStack 3.0 Web URL.', details);
      }
      return true;
    },
    ingestKnowledgeRecords: async (recordIds): Promise<KnowledgeIngestRecordResult[]> => {
      const results: KnowledgeIngestRecordResult[] = [];
      for (const recordId of recordIds) {
        results.push(await ctx.knowledgeRuntime.ingestExistingRecord(recordId));
      }
      return results;
    },
    scanKnowledgeDirectory: async (options) => {
      try {
        const result = await ctx.knowledgeRuntime.scanDirectory(options);
        return { success: true, ...result };
      } catch (err) {
        return {
          success: false,
          totalFiles: 0,
          newFiles: 0,
          modifiedFiles: 0,
          unchangedFiles: 0,
          skippedFiles: 0,
          message: err instanceof Error ? err.message : 'Directory scan failed'
        };
      }
    },
    onSettingsUpdated: async (next) => {
      ctx.settings = next;
      const nextLocalModel = next.aiHub.defaultModelId?.trim();
      if (next.aiHub.defaultProvider === 'local' && nextLocalModel && isLocalOllamaModel(nextLocalModel) && deps.localModelService.getModel() !== nextLocalModel) {
        await deps.localModelService.setModel(nextLocalModel);
      }
      ctx.vkBridge.refreshWikiSchedulers();
      applyLaunchAtLogin(next.launchAtLogin);
      deps.rebindShortcuts(next);
      void ctx.permissionCoordinator.getPermissionStatus('refresh');
    },
    getLocalModelStatus: async (refreshPreflight) => {
      const runtimeStatus = await deps.localModelService.getRuntimeStatus(refreshPreflight);
      const configuredModel = ctx.settings.aiHub.defaultModelId?.trim() || runtimeStatus.configuredModel;
      const configuredModelMeta = getAiModelById(configuredModel);
      const effectiveModel = configuredModelMeta?.channel === 'local' ? configuredModel : runtimeStatus.effectiveModel;
      return {
        ...runtimeStatus,
        configuredModel,
        effectiveModel,
        model: effectiveModel
      };
    },
    setLocalModelName: async (model) => {
      if (!isLocalOllamaModel(model)) {
        throw new Error(`模型 ${model} 不是受控的本地 Ollama 模型。`);
      }
      await deps.localModelService.setModel(model);
      ctx.settings = await ctx.settingsService.update({
        aiHub: {
          ...ctx.settings.aiHub,
          defaultModelId: model
        }
      });
      return deps.localModelService.getRuntimeStatus(true);
    },
    getAiRuntimeStatus: () => ctx.aiHubService.getRuntimeStatus(),
    getAiModelCatalog: () => ctx.aiHubService.listModels(),
    getAiChatSession: () => ctx.aiHubService.getChatSession(),
    clearAiChatSession: () => ctx.aiHubService.clearChatSession(),
    sendAiChat: (text, onStream) => ctx.aiHubService.sendChat(text, onStream),
    runAiHealthCheck: () => ctx.aiHubService.healthCheck(),
    runAiTest: () => ctx.aiHubService.test(),
    inferAiSearchIntent: (query) => ctx.aiHubService.inferSearchIntent(query),
    runAiOrchestratorTask,
    migrateAiSecrets: async () => migrateAiSecrets(ctx),
    getAiDiagnostics: async (): Promise<AiDiagnosticsSnapshot> => ctx.aiHubService.getDiagnosticsSnapshot(),
    openAiAssistantWindow: () => {
      ctx.aiAssistantWindowController?.show();
    },
    setAiCloudApiKey: async (provider: string, apiKey: string) => {
      await saveCloudApiKey(provider || 'openai', apiKey);
    },
    clearAiCloudApiKey: async (provider: string) => {
      await deleteCloudApiKey(provider || 'openai');
    },
    onRecordsChanged: () => notifyRecordsChanged(ctx),
    vkRuntimeGetStatus: async () => ctx.vkBridge.getRuntimeStatus(),
    vkTaskCreate: async (input: VKTaskCreateInput) => resolveVkTaskFromRecord(ctx, input),
    vkTaskList: async () => ctx.vkBridge.listTasks(),
    vkTaskGet: async (id: string) => ctx.vkBridge.getTask(id),
    vkTaskRetry: async (id: string) => ctx.vkBridge.retryTask(id),
    vkTaskCancel: async (id: string) => ctx.vkBridge.cancelTask(id),
    vkTaskOpenOutput: async (id: string) => ctx.vkBridge.openOutput(id),
    vkTaskOpenLog: async (id: string) => ctx.vkBridge.openLog(id),
    wikiGetStatus: async () => ctx.vkBridge.getWikiStatus(),
    wikiQuery: async (input) => ctx.vkBridge.wikiQuery(input),
    wikiLint: async () => ctx.vkBridge.wikiLint(),
    wikiOpenDir: async () => ctx.vkBridge.openWikiDir(),
    wikiOpenIndex: async () => ctx.vkBridge.openWikiIndex(),
    getVaultKeeperStatus: async () => ctx.vkProcessManager.getStatus(),
    startVaultKeeper: async () => { await ctx.vkProcessManager.start(); return ctx.vkProcessManager.getStatus(); },
    stopVaultKeeper: async () => { await ctx.vkProcessManager.stop(); return ctx.vkProcessManager.getStatus(); },
    vkCreateJob: async (params: VkCreateJobRequest) => ctx.vkProcessManager.getClient().createJob(params),
    vkGetJob: async (jobId: string) => ctx.vkProcessManager.getClient().getJob(jobId),
    vkExportFile: async (params: VkExportRequest) => ctx.vkProcessManager.getClient().exportFile(params),
    vkExportBatch: async (params: VkExportBatchRequest) => ctx.vkProcessManager.getClient().exportBatch(params),
    vkGetTools: async () => ctx.vkProcessManager.getClient().getTools(),
    vkBatchImport: async (params: VkBatchImportRequest) => ctx.vkProcessManager.getClient().batchImport(params),
    vkBatchImportPreview: async (params: VkBatchImportPreviewRequest) => ctx.vkProcessManager.getClient().batchImportPreview(params),
    vkSmartClip: async (params: VkSmartClipRequest) => ctx.vkProcessManager.getClient().smartClip(params),
    vkClipHtml: async (params: VkClipHtmlRequest) => ctx.vkProcessManager.getClient().clipHtml(params),
    vkSuggest: async (params: VkSuggestRequest) => ctx.vkProcessManager.getClient().suggest(params),
    vkQualityCheck: async (params: VkQualityRequest) => ctx.vkProcessManager.getClient().qualityCheck(params),
    vkRetryJob: async (jobId: string, params?: VkRetryRequest) => ctx.vkProcessManager.getClient().retryJob(jobId, params),
    vkSendRecord: async (request: VkSendRecordRequest) => sendRecordToVaultKeeper(ctx, request)
  });
}

// ---------------------------------------------------------------------------
// Bootstrap — orchestration entry point
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  ensureRegularMacAppMode();

  // 1. Settings
  const { settingsService, runtimeSettingsService, currentSettings, runtimeSettings } = await initSettings();

  // 2. Local model
  const { localModelService } = await initLocalModel(currentSettings);

  // 3. Storage
  const { storage } = initStorage(currentSettings, {
    settingsService,
    localModelService,
    notifyRecordsChanged: () => {} // placeholder, will be replaced after ctx is built
  });

  let storageInitFailed = false;
  try {
    await storage.init();
  } catch (error) {
    console.error('[bootstrap] Storage init failed', error);
    storageInitFailed = true;
  }

  // 4. AiHub
  const { aiHubService } = initAiHub(currentSettings, storage, localModelService);

  // 5. Knowledge
  const knowledgeResult = await initKnowledge(
    currentSettings,
    storage,
    localModelService
  );

  // 6. VaultKeeper
  const vkProcessManager = await initVaultKeeper(currentSettings);
  const vkBridge = new VKBridge({
    getSettings: () => ctxRef?.settings ?? currentSettings,
    onWikiIngestSuccess: async ({ wikiDir }) => {
      const scanTargets = ['sources', 'entities', 'concepts', 'topics']
        .map((segment) => path.join(wikiDir, segment))
        .filter((dirPath) => existsSync(dirPath));

      let totalFiles = 0;
      let newFiles = 0;
      let modifiedFiles = 0;
      let unchangedFiles = 0;
      let skippedFiles = 0;

      for (const dirPath of scanTargets) {
        const scanned = await knowledgeResult.knowledgeRuntime.scanDirectory({
          dirPath,
          extensions: ['.md'],
          excludePatterns: ['**/_lint_report.md'],
        });
        totalFiles += scanned.totalFiles;
        newFiles += scanned.newFiles;
        modifiedFiles += scanned.modifiedFiles;
        unchangedFiles += scanned.unchangedFiles;
        skippedFiles += scanned.skippedFiles;
      }

      return {
        scannedDirs: scanTargets.length,
        totalFiles,
        newFiles,
        modifiedFiles,
        unchangedFiles,
        skippedFiles,
      };
    },
  });
  await vkBridge.init();

  // 7. Build AppContext
  const ctx: AppContext = {
    settings: currentSettings,
    runtimeSettings,
    settingsService,
    runtimeSettingsService,
    storage,
    pinManager: new PinWindowManager({ preloadPath, rendererFilePath, rendererDevUrl }),
    ruleEngine: new RuleEngine({ getRuntimeSettings: () => runtimeSettings }),
    ocrService: new OcrService(),
    tray: null!,
    watcher: null!,
    dashboardController: null!,
    capsuleController: null!,
    captureController: null!,
    aiAssistantWindowController: null!,
    aiHubService,
    knowledgeRuntime: knowledgeResult.knowledgeRuntime,
    knowledgeApiBaseUrl: knowledgeResult.knowledgeApiBaseUrl,
    knowledgeWebUrl: knowledgeResult.knowledgeWebUrl,
    knowledgeServerClose: knowledgeResult.knowledgeServerClose,
    localModelService,
    shortcutRegistrationStatus: getDefaultShortcutRegistrationStatus(),
    permissionCoordinator: createPermissionCoordinator({
      getShortcutRegistrationStatus: () => ctx.shortcutRegistrationStatus,
      getPermissionAppMeta: () => ({
        appName: app.getName(),
        executablePath: process.execPath,
        appPath: app.getAppPath(),
        bundleId: process.env.APP_ID ?? 'com.pinstack.app',
        isDev,
        isPackaged: app.isPackaged
      }),
      onSnapshotUpdated: (snapshot, meta) => {
        logTelemetry('permissions.status.checked', {
          traceId: meta.traceId ?? null,
          source: snapshot.source,
          appName: snapshot.diagnostics.appName,
          executablePath: snapshot.diagnostics.executablePath,
          appPath: snapshot.diagnostics.appPath,
          appBundlePath: snapshot.diagnostics.appBundlePath,
          bundleId: snapshot.diagnostics.bundleId,
          isDev: snapshot.diagnostics.isDev,
          isPackaged: snapshot.diagnostics.isPackaged,
          instanceMismatchSuspected: snapshot.diagnostics.instanceMismatchSuspected,
          installLocationStable: snapshot.diagnostics.installLocationStable,
          installLocationMessage: snapshot.diagnostics.installLocationMessage,
          identityFingerprint: snapshot.diagnostics.identityFingerprint,
          automationCapability: snapshot.diagnostics.automationCapability,
          items: snapshot.items.map((item) => ({
            key: item.key,
            state: item.state,
            systemStatus: item.systemStatus,
            probeStatus: item.probeStatus,
            message: item.message
          }))
        });
        ctx.dashboardController.getWindow()?.webContents.send('permissions.status.updated', snapshot);
        ctx.captureController.sendPermissionStatusToHub(snapshot);
      }
    }),
    storageInitFailed,
    vkProcessManager,
    vkBridge
  };

  ctxRef = ctx;

  try {
    const migrated = await migrateAiSecrets(ctx);
    if (migrated) {
      console.info('[ai.secrets] migrated legacy cloudApiKey to macOS Keychain');
    }
  } catch (error) {
    console.error('[ai.secrets] migration failed', error);
  }

  // 8. Windows
  initWindows(ctx);

  // 9. Clipboard
  initClipboard(ctx);

  // 10. Display media handler
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 0, height: 0 }
        });
        callback({
          video: sources[0]
        });
      } catch (error) {
        console.error('[capture:recording] Failed to resolve screen source', error);
        callback({});
      }
    },
    { useSystemPicker: true }
  );

  if (storageInitFailed) {
    notifyUiToast(ctx, '存储初始化失败，已进入降级模式。请检查 ~/PinStack 目录权限。', 'error');
  }

  // 11. Tray
  initTray(ctx);

  // 12. Shortcuts (needs rebindShortcuts closure)
  const rebindShortcuts = (settings: AppSettings) => {
    ctx.shortcutRegistrationStatus = registerGlobalShortcuts(settings, {
      onScreenshot: async () => {
        await ctx.captureController?.beginRegionScreenshotCapture();
      },
      onToggleDashboard: () => {
        ctx.dashboardController?.toggle();
      },
      onToggleCaptureHub: async () => {
        await ctx.captureController?.toggleCaptureHubPanel();
      },
      onToggleMode: async () => {
        await toggleRuntimeModePreset(ctx, (msg, level) => notifyUiToast(ctx, msg, level));
      },
      onTrayOpenDashboard: () => {
        ctx.dashboardController?.show();
      },
      onTrayCycleMode: async () => {
        await cycleRuntimeModeFromTray(ctx, (msg, level) => notifyUiToast(ctx, msg, level));
      },
      onTrayQuit: () => {
        app.quit();
      },
      notifyToast: (msg, level) => notifyUiToast(ctx, msg, level)
    });
    console.info('[shortcuts] registration result', {
      screenshot: {
        shortcut: ctx.shortcutRegistrationStatus.screenshotShortcut,
        registered: ctx.shortcutRegistrationStatus.screenshotRegistered
      },
      dashboard: {
        shortcut: ctx.shortcutRegistrationStatus.dashboardShortcut,
        registered: ctx.shortcutRegistrationStatus.dashboardRegistered
      },
      captureHub: {
        shortcut: ctx.shortcutRegistrationStatus.captureHubShortcut,
        registered: ctx.shortcutRegistrationStatus.captureHubRegistered
      },
      mode: {
        shortcut: ctx.shortcutRegistrationStatus.modeToggleShortcut,
        registered: ctx.shortcutRegistrationStatus.modeToggleRegistered
      },
      trayOpenDashboard: {
        shortcut: ctx.shortcutRegistrationStatus.trayOpenDashboardShortcut,
        registered: ctx.shortcutRegistrationStatus.trayOpenDashboardRegistered
      },
      trayCycleMode: {
        shortcut: ctx.shortcutRegistrationStatus.trayCycleModeShortcut,
        registered: ctx.shortcutRegistrationStatus.trayCycleModeRegistered
      },
      trayQuit: {
        shortcut: ctx.shortcutRegistrationStatus.trayQuitShortcut,
        registered: ctx.shortcutRegistrationStatus.trayQuitRegistered
      }
    });
    void reportShortcutRegistrationFailure(ctx.shortcutRegistrationStatus, {
      notifyToast: (msg, level) => notifyUiToast(ctx, msg, level),
      openPermissionSettings: (target) => ctx.permissionCoordinator.openPermissionSettings(target),
      openStorageRoot: () => openStorageRoot(ctx)
    });
  };

  // 13. IPC
  initIpc(ctx, {
    localModelService,
    rebindShortcuts
  });

  // 14. Post-init
  rebindShortcuts(currentSettings);
  void ctx.permissionCoordinator.getPermissionStatus('startup');

  if (currentSettings.autoPin) {
    ctx.watcher.start();
    stabilityProbe.info('watcher.start');
  }

  applyLaunchAtLogin(currentSettings.launchAtLogin);

  if (runtimeSettings.enableCaptureLauncher) {
    void ctx.captureController.showCaptureLauncher().catch((error) => {
      console.error('[bootstrap] Failed to show capture launcher', error);
    });
  }
  if (runtimeSettings.capsule.enabled) {
    ctx.capsuleController.show();
  }

  const handleDisplayEnvironmentChanged = () => {
    ctx.captureController?.handleDisplayMetricsChanged();
    ctx.dashboardController?.handleDisplayEnvironmentChanged();
    ctx.capsuleController?.handleDisplayEnvironmentChanged();
  };

  screen.on('display-metrics-changed', handleDisplayEnvironmentChanged);
  screen.on('display-added', handleDisplayEnvironmentChanged);
  screen.on('display-removed', handleDisplayEnvironmentChanged);

  stabilityProbe.start();
}

// ---------------------------------------------------------------------------
// App lifecycle events
// ---------------------------------------------------------------------------

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('before-quit', () => {
  appWithState.isQuitting = true;
  stabilityProbe.stop();
  ctxRef?.knowledgeServerClose?.();
  ctxRef?.captureController?.destroy();
  ctxRef?.capsuleController?.destroy();
  ctxRef?.aiAssistantWindowController?.getWindow()?.destroy();
  ctxRef?.dashboardController?.getWindow()?.destroy();
  ctxRef?.vkProcessManager?.stop().catch(() => {});
});

app.on('will-quit', () => {
  safeUnregisterGlobalShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  ensureRegularMacAppMode();
  const ctx = ctxRef;
  if (!ctx) return;
  void ctx.permissionCoordinator.getPermissionStatus('activate');
  if (ctx.runtimeSettings.enableCaptureLauncher) {
    void ctx.captureController?.showCaptureLauncher().catch((error) => {
      console.error('[activate] Failed to show capture launcher', error);
    });
  }
  if (ctx.runtimeSettings.capsule.enabled) {
    ctx.capsuleController?.show();
  }
  if (ctx.storage && ctx.pinManager) {
    ctx.dashboardController?.show();
  }
});

app.on('browser-window-focus', () => {
  const ctx = ctxRef;
  if (!ctx) return;
  void ctx.permissionCoordinator.getPermissionStatus('focus');
});

app.on('second-instance', () => {
  const ctx = ctxRef;
  if (!ctx) return;
  void ctx.permissionCoordinator.getPermissionStatus('focus');
  if (ctx.runtimeSettings.enableCaptureLauncher) {
    void ctx.captureController?.showCaptureLauncher(true).catch((error) => {
      console.error('[second-instance] Failed to show capture launcher', error);
    });
  }
  if (ctx.runtimeSettings.capsule.enabled) {
    ctx.capsuleController?.show();
  }

  if (ctx.storage && ctx.pinManager) {
    ctx.dashboardController?.show();
  }
});

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    bootstrap().catch((error) => {
      console.error('[bootstrap] Fatal error during startup', error);
    });
  });
}
