import { app, globalShortcut } from 'electron';
import type { AppSettings } from '../shared/types';
import { getDefaultShortcutRegistrationStatus, type ShortcutRegistrationStatus } from './permissions';

export interface ShortcutManagerOptions {
  onScreenshot: () => Promise<void>;
  onToggleDashboard: () => void;
  onToggleCaptureHub: () => Promise<void>;
  onToggleMode: () => Promise<void>;
  onTrayOpenDashboard: () => Promise<void> | void;
  onTrayCycleMode: () => Promise<void>;
  onTrayQuit: () => Promise<void> | void;
  notifyToast: (message: string, level?: 'error' | 'warning' | 'info') => void;
}

function normalizeShortcut(shortcut: string): string {
  return shortcut.replace(/\s+/g, '').toUpperCase();
}

function isLegacyRetiredShortcut(shortcut: string): boolean {
  const normalized = normalizeShortcut(shortcut);
  return normalized === 'COMMANDORCONTROL+SHIFT+V' || normalized === 'CMDORCTRL+SHIFT+V' || normalized === 'COMMAND+SHIFT+V';
}

function sanitizeShortcut(shortcut: string, purpose: string): string {
  if (!shortcut) {
    return shortcut;
  }
  if (purpose !== 'captureHub') {
    return shortcut;
  }
  if (!isLegacyRetiredShortcut(shortcut)) {
    return shortcut;
  }
  console.info('[shortcuts] legacy shortcut removed', {
    shortcut,
    purpose
  });
  return '';
}

export function registerGlobalShortcuts(settings: AppSettings, options: ShortcutManagerOptions): ShortcutRegistrationStatus {
  const screenshotShortcut = sanitizeShortcut(settings.screenshotShortcut, 'screenshot');
  const dashboardShortcut = sanitizeShortcut(settings.dashboardShortcut, 'dashboard');
  const captureHubShortcut = sanitizeShortcut(settings.captureHubShortcut, 'captureHub');
  const modeToggleShortcut = sanitizeShortcut(settings.modeToggleShortcut, 'modeToggle');
  const trayOpenDashboardShortcut = sanitizeShortcut(settings.trayOpenDashboardShortcut, 'trayOpenDashboard');
  const trayCycleModeShortcut = sanitizeShortcut(settings.trayCycleModeShortcut, 'trayCycleMode');
  const trayQuitShortcut = sanitizeShortcut(settings.trayQuitShortcut, 'trayQuit');
  const nextStatus: ShortcutRegistrationStatus = {
    ...getDefaultShortcutRegistrationStatus(),
    screenshotShortcut,
    dashboardShortcut,
    captureHubShortcut,
    modeToggleShortcut,
    trayOpenDashboardShortcut,
    trayCycleModeShortcut,
    trayQuitShortcut
  };

  if (!app.isReady()) {
    nextStatus.screenshotRegistered = false;
    nextStatus.dashboardRegistered = false;
    nextStatus.captureHubRegistered = false;
    nextStatus.modeToggleRegistered = false;
    nextStatus.trayOpenDashboardRegistered = false;
    nextStatus.trayCycleModeRegistered = false;
    nextStatus.trayQuitRegistered = false;
    return nextStatus;
  }

  globalShortcut.unregisterAll();

  if (screenshotShortcut) {
    nextStatus.screenshotRegistered = globalShortcut.register(screenshotShortcut, () => {
      void options.onScreenshot().catch((error) => {
        console.error('[globalShortcut:screenshot] handler failed', error);
        options.notifyToast('截图快捷键执行失败，请稍后重试。', 'error');
      });
    });
  }

  if (dashboardShortcut) {
    nextStatus.dashboardRegistered = globalShortcut.register(dashboardShortcut, () => {
      options.onToggleDashboard();
    });
  }

  if (captureHubShortcut) {
    nextStatus.captureHubRegistered = globalShortcut.register(captureHubShortcut, () => {
      void options.onToggleCaptureHub().catch((error) => {
        console.error('[globalShortcut:captureHub] handler failed', error);
        options.notifyToast('截图面板快捷键执行失败，请稍后重试。', 'error');
      });
    });
  }

  if (modeToggleShortcut) {
    nextStatus.modeToggleRegistered = globalShortcut.register(modeToggleShortcut, () => {
      void options.onToggleMode().catch((error) => {
        console.error('[globalShortcut:modeToggle] handler failed', error);
        options.notifyToast('运行模式切换失败，请稍后重试。', 'error');
      });
    });
  }

  if (trayOpenDashboardShortcut) {
    nextStatus.trayOpenDashboardRegistered = globalShortcut.register(trayOpenDashboardShortcut, () => {
      void Promise.resolve(options.onTrayOpenDashboard()).catch((error) => {
        console.error('[globalShortcut:trayOpenDashboard] handler failed', error);
        options.notifyToast('托盘打开工作台快捷键执行失败，请稍后重试。', 'error');
      });
    });
  }

  if (trayCycleModeShortcut) {
    nextStatus.trayCycleModeRegistered = globalShortcut.register(trayCycleModeShortcut, () => {
      void options.onTrayCycleMode().catch((error) => {
        console.error('[globalShortcut:trayCycleMode] handler failed', error);
        options.notifyToast('托盘切换模式快捷键执行失败，请稍后重试。', 'error');
      });
    });
  }

  if (trayQuitShortcut) {
    nextStatus.trayQuitRegistered = globalShortcut.register(trayQuitShortcut, () => {
      void Promise.resolve(options.onTrayQuit()).catch((error) => {
        console.error('[globalShortcut:trayQuit] handler failed', error);
        options.notifyToast('托盘退出快捷键执行失败，请稍后重试。', 'error');
      });
    });
  }

  return nextStatus;
}

export function safeUnregisterGlobalShortcuts(): void {
  if (!app.isReady()) {
    return;
  }

  try {
    globalShortcut.unregisterAll();
  } catch {
    // Ignore shutdown race conditions from dev hot-reload.
  }
}
