/**
 * AppContext — central application state container.
 *
 * Extracted from index.ts so that multiple modules (ipc, services, etc.)
 * can reference the same shape without circular imports.
 */
import type { AppSettings, RuntimeSettings } from '../shared/types';
import type { ClipboardWatcher } from './clipboardWatcher';
import type { PinWindowManager } from './windows/pinWindowManager';
import type { RuleEngine } from './ruleEngine';
import type { OcrService } from './ocrService';
import type { SettingsService, RuntimeSettingsService } from './settings';
import type { DashboardWindowController } from './windows/dashboardWindowController';
import type { AiAssistantWindowController } from './windows/aiAssistantWindowController';
import type { CapsuleWindowController } from './windows/notchSubprocessController';
import type { CaptureController } from './captureController';
import type { AiHubService } from './services/aiHub/aiHubService';
import type { LocalModelServiceImpl } from './services/localModel/localModelService';
import type { KnowledgeRuntime } from '../../server/src/knowledgeRuntime';
import type { VaultKeeperProcessManager } from './vaultkeeper/process-manager';
import type { VKBridge } from './vk/vkBridge';
import type { PermissionCoordinator } from './permissionCoordinator';
import type { ShortcutRegistrationStatus } from './permissions';

export interface AppContext {
  settings: AppSettings;
  runtimeSettings: RuntimeSettings;
  settingsService: SettingsService;
  runtimeSettingsService: RuntimeSettingsService;
  storage: import('./storage').StorageService;
  pinManager: PinWindowManager;
  ruleEngine: RuleEngine;
  ocrService: OcrService;
  tray: ReturnType<typeof import('./tray').createTrayController>;
  watcher: ClipboardWatcher;
  dashboardController: DashboardWindowController;
  capsuleController: CapsuleWindowController;
  captureController: CaptureController;
  aiAssistantWindowController: AiAssistantWindowController;
  aiHubService: AiHubService;
  knowledgeRuntime: KnowledgeRuntime;
  knowledgeApiBaseUrl: string;
  knowledgeWebUrl: string;
  knowledgeServerClose: (() => void) | null;
  localModelService: LocalModelServiceImpl;
  shortcutRegistrationStatus: ShortcutRegistrationStatus;
  permissionCoordinator: PermissionCoordinator;
  storageInitFailed: boolean;
  vkProcessManager: VaultKeeperProcessManager;
  vkBridge: VKBridge;
}
