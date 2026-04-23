import { execFile } from 'node:child_process';
import { stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { clipboard, desktopCapturer, screen, shell, systemPreferences } from 'electron';
import type {
  PermissionCheckSource,
  PermissionDiagnostics,
  PermissionItemStatus,
  PermissionProbeStatus,
  PermissionSettingsTarget,
  PermissionState,
  PermissionStatusSnapshot
} from '../shared/types';

export interface ShortcutRegistrationStatus {
  screenshotShortcut: string;
  dashboardShortcut: string;
  captureHubShortcut: string;
  modeToggleShortcut: string;
  trayOpenDashboardShortcut: string;
  trayCycleModeShortcut: string;
  trayQuitShortcut: string;
  screenshotRegistered: boolean;
  dashboardRegistered: boolean;
  captureHubRegistered: boolean;
  modeToggleRegistered: boolean;
  trayOpenDashboardRegistered: boolean;
  trayCycleModeRegistered: boolean;
  trayQuitRegistered: boolean;
}

export interface PermissionAppMetadata {
  appName: string;
  executablePath: string;
  appPath: string;
  bundleId: string;
  isDev: boolean;
  isPackaged: boolean;
}

export interface PermissionSnapshotBuildContext {
  source: PermissionCheckSource;
  app: PermissionAppMetadata;
  settingsOpenedAt?: Partial<Record<PermissionSettingsTarget, number>>;
}

interface ScreenCaptureProbeResult {
  status: PermissionProbeStatus;
  sourceCount: number;
  usableSourceCount: number;
  error?: string;
}

interface ScreenshotCommandProbeResult {
  status: PermissionProbeStatus;
  fileSize: number;
  error?: string;
}

const execFileAsync = promisify(execFile);

const DEFAULT_SHORTCUT_STATUS: ShortcutRegistrationStatus = {
  screenshotShortcut: '',
  dashboardShortcut: '',
  captureHubShortcut: '',
  modeToggleShortcut: '',
  trayOpenDashboardShortcut: '',
  trayCycleModeShortcut: '',
  trayQuitShortcut: '',
  screenshotRegistered: true,
  dashboardRegistered: true,
  captureHubRegistered: true,
  modeToggleRegistered: true,
  trayOpenDashboardRegistered: true,
  trayCycleModeRegistered: true,
  trayQuitRegistered: true
};

const SETTINGS_URL_MAP: Record<PermissionSettingsTarget, string> = {
  privacyGeneral: 'x-apple.systempreferences:com.apple.preference.security',
  privacyAccessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  privacyInputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  keyboardShortcuts: 'x-apple.systempreferences:com.apple.preference.keyboard?Shortcuts',
  privacyScreenCapture: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
};

const SETTINGS_PATH_HINT_MAP: Record<PermissionSettingsTarget, string> = {
  privacyGeneral: '系统设置 → 隐私与安全性',
  privacyAccessibility: '系统设置 → 隐私与安全性 → 辅助功能',
  privacyInputMonitoring: '系统设置 → 隐私与安全性 → 输入监控',
  keyboardShortcuts: '系统设置 → 键盘 → 键盘快捷键',
  privacyScreenCapture: '系统设置 → 隐私与安全性 → 屏幕录制'
};

const RESTART_HINT_WINDOW_MS = 3 * 60 * 1000;

// 会话级权限请求闸门
let sessionPermissionState = {
  hasRequestedScreenPermissionThisSession: false,
  lastScreenPermissionCheckAt: 0
};

// 重置会话状态
function resetSessionPermissionState() {
  sessionPermissionState = {
    hasRequestedScreenPermissionThisSession: false,
    lastScreenPermissionCheckAt: 0
  };
}

// 检查是否可以请求屏幕权限
function canRequestScreenPermission(): boolean {
  return !sessionPermissionState.hasRequestedScreenPermissionThisSession;
}

// 标记已请求屏幕权限
function markScreenPermissionRequested() {
  sessionPermissionState.hasRequestedScreenPermissionThisSession = true;
}

// 检查是否需要刷新权限状态（节流）
function shouldRefreshPermissionState(): boolean {
  const now = Date.now();
  const threshold = 5000; // 5秒节流
  return now - sessionPermissionState.lastScreenPermissionCheckAt > threshold;
}

// 标记权限检查时间
function markPermissionChecked() {
  sessionPermissionState.lastScreenPermissionCheckAt = Date.now();
}

function isStateNeedsAttention(state: PermissionState): boolean {
  return state === 'denied' || state === 'not-determined' || state === 'requires-restart';
}

function createPermissionItem(input: {
  key: PermissionItemStatus['key'];
  title: string;
  state: PermissionState;
  message: string;
  settingsTarget: PermissionSettingsTarget;
  checkedAt: number;
  actionLabel?: string;
  canRetry?: boolean;
  canOpenSystemSettings?: boolean;
  blocking?: boolean;
  systemStatus?: string;
  probeStatus?: PermissionProbeStatus;
  probeError?: string;
  desktopProbeStatus?: PermissionProbeStatus;
  desktopProbeError?: string;
  recommendedAction?: string;
}): PermissionItemStatus {
  return {
    key: input.key,
    title: input.title,
    state: input.state,
    lastCheckedAt: input.checkedAt,
    message: input.message,
    detail: input.message,
    actionLabel: input.actionLabel,
    canRetry: input.canRetry ?? true,
    canOpenSystemSettings: input.canOpenSystemSettings ?? true,
    needsAttention: isStateNeedsAttention(input.state),
    blocking: input.blocking ?? isStateNeedsAttention(input.state),
    settingsTarget: input.settingsTarget,
    systemStatus: input.systemStatus,
    probeStatus: input.probeStatus,
    probeError: input.probeError,
    desktopProbeStatus: input.desktopProbeStatus,
    desktopProbeError: input.desktopProbeError,
    recommendedAction: input.recommendedAction
  };
}

function wasSettingsRecentlyOpened(
  target: PermissionSettingsTarget,
  context: PermissionSnapshotBuildContext,
  checkedAt: number
): boolean {
  const ts = context.settingsOpenedAt?.[target];
  if (!ts) {
    return false;
  }
  return checkedAt - ts <= RESTART_HINT_WINDOW_MS;
}

function getClipboardStatus(checkedAt: number): PermissionItemStatus {
  try {
    void clipboard.readText();
    void clipboard.readImage();
    return createPermissionItem({
      key: 'clipboard',
      title: '剪贴板访问',
      state: 'granted',
      message: '剪贴板读取能力正常。',
      settingsTarget: 'privacyGeneral',
      checkedAt,
      canRetry: false
    });
  } catch (error) {
    return createPermissionItem({
      key: 'clipboard',
      title: '剪贴板访问',
      state: 'denied',
      message: `无法读取剪贴板，可能被系统策略限制：${String(error)}`,
      settingsTarget: 'privacyGeneral',
      checkedAt,
      actionLabel: '打开系统设置'
    });
  }
}

function getGlobalShortcutStatus(shortcuts: ShortcutRegistrationStatus, checkedAt: number): PermissionItemStatus {
  const failed: string[] = [];
  if (!shortcuts.screenshotRegistered && shortcuts.screenshotShortcut) {
    failed.push(`截图(${shortcuts.screenshotShortcut})`);
  }
  if (!shortcuts.dashboardRegistered && shortcuts.dashboardShortcut) {
    failed.push(`面板(${shortcuts.dashboardShortcut})`);
  }
  if (!shortcuts.captureHubRegistered && shortcuts.captureHubShortcut) {
    failed.push(`截图面板(${shortcuts.captureHubShortcut})`);
  }
  if (!shortcuts.modeToggleRegistered && shortcuts.modeToggleShortcut) {
    failed.push(`运行模式(${shortcuts.modeToggleShortcut})`);
  }
  if (!shortcuts.trayOpenDashboardRegistered && shortcuts.trayOpenDashboardShortcut) {
    failed.push(`托盘打开工作台(${shortcuts.trayOpenDashboardShortcut})`);
  }
  if (!shortcuts.trayCycleModeRegistered && shortcuts.trayCycleModeShortcut) {
    failed.push(`托盘切换模式(${shortcuts.trayCycleModeShortcut})`);
  }
  if (!shortcuts.trayQuitRegistered && shortcuts.trayQuitShortcut) {
    failed.push(`托盘退出应用(${shortcuts.trayQuitShortcut})`);
  }

  if (failed.length === 0) {
    return createPermissionItem({
      key: 'globalShortcut',
      title: '全局快捷键',
      state: 'granted',
      message: '全局快捷键注册正常。',
      settingsTarget: 'keyboardShortcuts',
      checkedAt,
      canRetry: false
    });
  }

  return createPermissionItem({
    key: 'globalShortcut',
    title: '全局快捷键',
    state: 'denied',
    message: `以下快捷键不可用：${failed.join('、')}。可能被其他应用占用。`,
    settingsTarget: 'keyboardShortcuts',
    checkedAt,
    actionLabel: '打开快捷键设置'
  });
}

function getAccessibilityStatus(context: PermissionSnapshotBuildContext, checkedAt: number): PermissionItemStatus {
  if (process.platform !== 'darwin') {
    return createPermissionItem({
      key: 'accessibility',
      title: '辅助功能权限',
      state: 'unknown',
      message: '当前仅在 macOS 提供检查。',
      settingsTarget: 'privacyAccessibility',
      checkedAt,
      canOpenSystemSettings: false,
      canRetry: false
    });
  }

  // 开发环境下降级权限状态显示
  if (context.app.isDev) {
    return createPermissionItem({
      key: 'accessibility',
      title: '辅助功能权限（开发环境）',
      state: 'unknown',
      message: '当前为开发环境，权限状态可能与正式版不一致。请在正式安装版中验证权限设置。',
      settingsTarget: 'privacyAccessibility',
      checkedAt,
      canOpenSystemSettings: true,
      canRetry: false,
      blocking: false
    });
  }

  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (trusted) {
    return createPermissionItem({
      key: 'accessibility',
      title: '辅助功能权限',
      state: 'granted',
      message: '辅助功能已授权，自动化链路可用。',
      settingsTarget: 'privacyAccessibility',
      checkedAt,
      canRetry: false
    });
  }

  if (wasSettingsRecentlyOpened('privacyAccessibility', context, checkedAt)) {
    return createPermissionItem({
      key: 'accessibility',
      title: '辅助功能权限',
      state: 'requires-restart',
      message: '已检测到你刚处理过辅助功能权限。若刷新后仍未生效，请重启 PinStack。',
      settingsTarget: 'privacyAccessibility',
      checkedAt,
      actionLabel: '刷新状态'
    });
  }

  return createPermissionItem({
    key: 'accessibility',
    title: '辅助功能权限',
    state: 'denied',
    message: '辅助功能未授权，部分自动化能力可能受限。路径：系统设置 → 隐私与安全性 → 辅助功能。',
    settingsTarget: 'privacyAccessibility',
    checkedAt,
    actionLabel: '打开系统设置',
    blocking: false
  });
}

function getInputMonitoringStatus(checkedAt: number): PermissionItemStatus {
  if (process.platform !== 'darwin') {
    return createPermissionItem({
      key: 'inputMonitoring',
      title: '输入监控权限',
      state: 'unknown',
      message: '当前仅在 macOS 提供引导。',
      settingsTarget: 'privacyInputMonitoring',
      checkedAt,
      canOpenSystemSettings: false,
      canRetry: false
    });
  }

  return createPermissionItem({
    key: 'inputMonitoring',
    title: '输入监控权限',
    state: 'unknown',
    message: '系统未提供稳定读取接口。若后续启用键盘监听，请手动授权。',
    settingsTarget: 'privacyInputMonitoring',
    checkedAt,
    actionLabel: '打开系统设置'
  });
}

function resolveAppBundlePath(executablePath: string, appPath: string): string | undefined {
  const candidates = [executablePath, appPath];
  for (const candidate of candidates) {
    const marker = candidate.indexOf('.app/');
    if (marker !== -1) {
      return candidate.slice(0, marker + 4);
    }
    if (candidate.endsWith('.app')) {
      return candidate;
    }
  }
  return undefined;
}

function isStableInstallLocation(bundlePath: string | undefined): boolean {
  if (!bundlePath) {
    return false;
  }
  if (bundlePath.includes('/AppTranslocation/')) {
    return false;
  }
  if (bundlePath.startsWith('/Applications/')) {
    return true;
  }
  const home = process.env.HOME;
  if (home && bundlePath.startsWith(path.join(home, 'Applications') + path.sep)) {
    return true;
  }
  return false;
}

function getInstallLocationMessage(appMeta: PermissionAppMetadata, bundlePath: string | undefined): string | undefined {
  if (!appMeta.isPackaged) {
    return '当前运行的是开发环境，系统授权状态可能不会和正式 .app 完全一致。';
  }
  if (!bundlePath) {
    return '无法识别当前应用包路径，权限判断可能不稳定。';
  }
  if (!isStableInstallLocation(bundlePath)) {
    return '当前运行的是非稳定安装路径。未签名应用从 DMG 或其他目录启动时，权限可能不会和已授权实例一致。建议复制到 /Applications 后再启动。';
  }
  return undefined;
}

function buildIdentityFingerprint(appMeta: PermissionAppMetadata, bundlePath: string | undefined): string {
  return [
    appMeta.bundleId,
    bundlePath ?? 'no-bundle-path',
    appMeta.isPackaged ? 'packaged' : 'dev',
    appMeta.executablePath
  ].join(' | ');
}

export async function probeScreenCaptureCapability(): Promise<ScreenCaptureProbeResult> {
  if (process.platform !== 'darwin') {
    return {
      status: 'not-run',
      sourceCount: 0,
      usableSourceCount: 0
    };
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 16, height: 16 },
      fetchWindowIcons: false
    });
    const usableSourceCount = sources.filter((source) => {
      if (source.thumbnail.isEmpty()) {
        return false;
      }
      const size = source.thumbnail.getSize();
      return size.width > 0 && size.height > 0;
    }).length;

    return {
      status: sources.length > 0 ? 'success' : 'failed',
      sourceCount: sources.length,
      usableSourceCount,
      error: sources.length > 0 ? undefined : 'desktopCapturer 未返回屏幕源'
    };
  } catch (error) {
    return {
      status: 'failed',
      sourceCount: 0,
      usableSourceCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function probeScreenshotCommandCapability(): Promise<ScreenshotCommandProbeResult> {
  if (process.platform !== 'darwin') {
    return {
      status: 'not-run',
      fileSize: 0
    };
  }

  const display = screen.getPrimaryDisplay();
  const x = Math.round(display.bounds.x + 1);
  const y = Math.round(display.bounds.y + 1);
  const width = Math.min(2, Math.max(1, Math.round(display.bounds.width)));
  const height = Math.min(2, Math.max(1, Math.round(display.bounds.height)));
  const tempPath = path.join(os.tmpdir(), `pinstack-permission-probe-${Date.now()}.png`);

  try {
    await execFileAsync('screencapture', ['-x', `-R${x},${y},${width},${height}`, tempPath], {
      timeout: 5000
    });
    const fileStat = await stat(tempPath);
    return {
      status: fileStat.size > 0 ? 'success' : 'failed',
      fileSize: fileStat.size,
      error: fileStat.size > 0 ? undefined : 'screencapture 未生成有效图像文件'
    };
  } catch (error) {
    const probeError =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      status: 'failed',
      fileSize: 0,
      error: probeError
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

async function getScreenCaptureStatus(
  context: PermissionSnapshotBuildContext,
  checkedAt: number
): Promise<PermissionItemStatus> {
  if (process.platform !== 'darwin') {
    return createPermissionItem({
      key: 'screenCapture',
      title: '屏幕录制权限',
      state: 'unknown',
      message: '当前仅在 macOS 提供检查。',
      settingsTarget: 'privacyScreenCapture',
      checkedAt,
      canOpenSystemSettings: false,
      canRetry: false
    });
  }

  // 开发环境下降级权限状态显示
  if (context.app.isDev) {
    return createPermissionItem({
      key: 'screenCapture',
      title: '屏幕录制权限（开发环境）',
      state: 'unknown',
      message: '当前为开发环境，权限状态可能与正式版不一致。请在正式安装版中验证权限设置。',
      settingsTarget: 'privacyScreenCapture',
      checkedAt,
      canOpenSystemSettings: true,
      canRetry: false,
      blocking: false
    });
  }

  const raw = systemPreferences.getMediaAccessStatus('screen');
  // Passive permission check only: do not proactively call desktopCapturer/screencapture here.
  // This prevents macOS from showing screen-recording permission dialogs during startup/focus checks.
  const desktopProbe: ScreenCaptureProbeResult = {
    status: 'not-run',
    sourceCount: 0,
    usableSourceCount: 0
  };
  const screenshotProbe: ScreenshotCommandProbeResult = {
    status: 'not-run',
    fileSize: 0
  };
  const screenshotUsable = raw === 'granted';
  const bundlePath = resolveAppBundlePath(context.app.executablePath, context.app.appPath);
  const installLocationStable = isStableInstallLocation(bundlePath);
  const installLocationMessage = getInstallLocationMessage(context.app, bundlePath);

  if (raw === 'granted') {
    return createPermissionItem({
      key: 'screenCapture',
      title: '屏幕录制权限',
      state: 'granted',
      message: screenshotUsable
        ? '屏幕录制权限已授权，截图与录屏可用。'
        : '系统显示屏幕录制权限已授权。若开始截图仍失败，问题更可能在截图链路本身，而不是系统权限。',
      settingsTarget: 'privacyScreenCapture',
      checkedAt,
      canRetry: false,
      systemStatus: raw,
      probeStatus: screenshotProbe.status,
      probeError: screenshotProbe.error,
      desktopProbeStatus: desktopProbe.status,
      desktopProbeError: desktopProbe.error
    });
  }

  if (screenshotUsable) {
    const message = installLocationStable
      ? '已检测到截图能力可用，但系统权限状态仍未同步。可以继续截图；若状态长期不更新，请刷新或重启 PinStack。'
      : installLocationMessage ??
        '已检测到自带截图能力可用，但当前运行实例可能不是系统已授权的那个。建议复制到 /Applications 后重启。';
    return createPermissionItem({
      key: 'screenCapture',
      title: '屏幕录制权限',
      state: 'granted',
      message,
      settingsTarget: 'privacyScreenCapture',
      checkedAt,
      actionLabel: '刷新状态',
      systemStatus: raw,
      probeStatus: screenshotProbe.status,
      recommendedAction: installLocationStable ? 'refresh-or-restart' : 'move-to-applications',
      probeError: screenshotProbe.error,
      desktopProbeStatus: desktopProbe.status,
      desktopProbeError: desktopProbe.error,
      blocking: false
    });
  }

  if (raw === 'not-determined') {
    return createPermissionItem({
      key: 'screenCapture',
      title: '屏幕录制权限',
      state: 'not-determined',
      message: '屏幕录制权限尚未授权。首次截图会触发系统弹窗。',
      settingsTarget: 'privacyScreenCapture',
      checkedAt,
      actionLabel: '打开系统设置',
      systemStatus: raw,
      probeStatus: screenshotProbe.status,
      probeError: screenshotProbe.error,
      desktopProbeStatus: desktopProbe.status,
      desktopProbeError: desktopProbe.error,
      recommendedAction: 'grant-screen-capture'
    });
  }

  if (raw === 'denied' || raw === 'restricted') {
    if (wasSettingsRecentlyOpened('privacyScreenCapture', context, checkedAt)) {
      return createPermissionItem({
        key: 'screenCapture',
        title: '屏幕录制权限',
        state: 'requires-restart',
        message: '已检测到权限可能已变更。请先刷新；若仍未生效，请重启 PinStack。',
        settingsTarget: 'privacyScreenCapture',
        checkedAt,
        actionLabel: '刷新状态',
        systemStatus: raw,
        probeStatus: screenshotProbe.status,
        probeError: screenshotProbe.error,
        desktopProbeStatus: desktopProbe.status,
        desktopProbeError: desktopProbe.error,
        recommendedAction: 'refresh-or-restart'
      });
    }

    return createPermissionItem({
      key: 'screenCapture',
      title: '屏幕录制权限',
      state: 'denied',
      message: installLocationMessage
        ? `未检测到可用的屏幕录制权限。${installLocationMessage}`
        : '未开启屏幕录制权限，请前往系统设置开启。路径：系统设置 → 隐私与安全性 → 屏幕录制。',
      settingsTarget: 'privacyScreenCapture',
      checkedAt,
      actionLabel: '打开系统设置',
      systemStatus: raw,
      probeStatus: screenshotProbe.status,
      probeError: screenshotProbe.error,
      desktopProbeStatus: desktopProbe.status,
      desktopProbeError: desktopProbe.error,
      recommendedAction: installLocationMessage ? 'move-to-applications' : 'grant-screen-capture'
    });
  }

  return createPermissionItem({
    key: 'screenCapture',
    title: '屏幕录制权限',
    state: 'unknown',
    message: installLocationMessage
      ? `${installLocationMessage} 当前系统状态：${raw}`
      : `未识别的屏幕权限状态：${raw}`,
    settingsTarget: 'privacyScreenCapture',
    checkedAt,
    systemStatus: raw,
    probeStatus: screenshotProbe.status,
    probeError: screenshotProbe.error,
    desktopProbeStatus: desktopProbe.status,
    desktopProbeError: desktopProbe.error,
    recommendedAction: installLocationMessage ? 'move-to-applications' : 'refresh-or-restart'
  });
}

function getNotificationStatus(checkedAt: number): PermissionItemStatus {
  return createPermissionItem({
    key: 'notifications',
    title: '通知权限',
    state: 'unknown',
    message: '通知权限仅在需要时触发系统授权，本轮不阻塞主流程。',
    settingsTarget: 'privacyGeneral',
    checkedAt,
    canRetry: false,
    canOpenSystemSettings: false
  });
}

function getFileAccessStatus(checkedAt: number): PermissionItemStatus {
  return createPermissionItem({
    key: 'fileAccess',
    title: '文件访问',
    state: 'unknown',
    message: '文件访问以运行时读写结果为准，权限页仅提供诊断参考。',
    settingsTarget: 'privacyGeneral',
    checkedAt,
    canRetry: false,
    canOpenSystemSettings: false
  });
}

function getAutomationDependencyStatus(
  screenCapture: PermissionItemStatus,
  accessibility: PermissionItemStatus,
  checkedAt: number
): PermissionItemStatus {
  const screenCaptureUsable = screenCapture.state === 'granted' || screenCapture.state === 'requires-restart';
  if (screenCaptureUsable && accessibility.state === 'granted') {
    return createPermissionItem({
      key: 'automationDependency',
      title: '自动化依赖状态',
      state: 'granted',
      message: '自动化依赖完整，可用。',
      settingsTarget: 'privacyAccessibility',
      checkedAt,
      canRetry: false
    });
  }

  if (screenCaptureUsable || accessibility.state === 'granted') {
    return createPermissionItem({
      key: 'automationDependency',
      title: '自动化依赖状态',
      state: 'denied',
      message: '自动化能力部分可用，请补齐剩余权限。',
      settingsTarget: !screenCaptureUsable ? 'privacyScreenCapture' : 'privacyAccessibility',
      checkedAt,
      actionLabel: '打开系统设置',
      blocking: false
    });
  }

  return createPermissionItem({
    key: 'automationDependency',
    title: '自动化依赖状态',
    state: 'denied',
    message: '自动化能力不可用，需先授权屏幕录制与辅助功能。',
    settingsTarget: 'privacyScreenCapture',
    checkedAt,
    actionLabel: '打开系统设置',
    blocking: false
  });
}

function resolveInstanceMismatch(
  appMeta: PermissionAppMetadata,
  screenCapture: PermissionItemStatus,
  accessibility: PermissionItemStatus,
  installLocationMessage?: string
): { suspected: boolean; message?: string } {
  if (process.platform !== 'darwin') {
    return { suspected: false };
  }

  const hasPermissionIssue = screenCapture.needsAttention || accessibility.needsAttention;
  if (!hasPermissionIssue) {
    return { suspected: false };
  }

  if (installLocationMessage) {
    return {
      suspected: true,
      message: installLocationMessage
    };
  }

  if (
    screenCapture.systemStatus &&
    (screenCapture.probeStatus === 'success' || screenCapture.desktopProbeStatus === 'success') &&
    screenCapture.systemStatus !== 'granted'
  ) {
    return {
      suspected: true,
      message: '系统权限状态和实际可用性不一致。通常是当前运行实例与系统已授权实例不同，或刚授权后系统状态尚未刷新。'
    };
  }

  const executableLooksLikeElectron = /Electron\.app/i.test(appMeta.executablePath);
  const bundleIdLooksUnexpected = appMeta.bundleId !== 'com.pinstack.app';
  const devRuntime = !appMeta.isPackaged || appMeta.isDev;
  if (!executableLooksLikeElectron && !bundleIdLooksUnexpected && !devRuntime) {
    return { suspected: false };
  }

  return {
    suspected: true,
    message: '当前运行实例可能不是系统中已授权的 PinStack.app，请确认实例一致后重试。'
  };
}

export function getDefaultShortcutRegistrationStatus(): ShortcutRegistrationStatus {
  return { ...DEFAULT_SHORTCUT_STATUS };
}

export function getPermissionSettingsPathHint(target: PermissionSettingsTarget): string {
  return SETTINGS_PATH_HINT_MAP[target] ?? SETTINGS_PATH_HINT_MAP.privacyGeneral;
}

export async function buildPermissionStatusSnapshot(
  shortcutRegistrationStatus: ShortcutRegistrationStatus,
  context: PermissionSnapshotBuildContext
): Promise<PermissionStatusSnapshot> {
  const checkedAt = Date.now();
  const bundlePath = resolveAppBundlePath(context.app.executablePath, context.app.appPath);
  const installLocationStable = isStableInstallLocation(bundlePath);
  const installLocationMessage = getInstallLocationMessage(context.app, bundlePath);
  const clipboardStatus = getClipboardStatus(checkedAt);
  const shortcutStatus = getGlobalShortcutStatus(shortcutRegistrationStatus, checkedAt);
  const accessibilityStatus = getAccessibilityStatus(context, checkedAt);
  const inputMonitoringStatus = getInputMonitoringStatus(checkedAt);
  const screenCaptureStatus = await getScreenCaptureStatus(context, checkedAt);
  const notificationStatus = getNotificationStatus(checkedAt);
  const fileAccessStatus = getFileAccessStatus(checkedAt);
  const automationDependencyStatus = getAutomationDependencyStatus(screenCaptureStatus, accessibilityStatus, checkedAt);

  const mismatch = resolveInstanceMismatch(context.app, screenCaptureStatus, accessibilityStatus, installLocationMessage);
  const automationCapability: PermissionDiagnostics['automationCapability'] =
    automationDependencyStatus.state === 'granted'
      ? 'available'
      : screenCaptureStatus.state === 'granted' || accessibilityStatus.state === 'granted'
        ? 'partial'
        : 'unavailable';

  const diagnostics: PermissionDiagnostics = {
    appName: context.app.appName,
    executablePath: context.app.executablePath,
    appPath: context.app.appPath,
    appBundlePath: bundlePath,
    bundleId: context.app.bundleId,
    isDev: context.app.isDev,
    isPackaged: context.app.isPackaged,
    lastSource: context.source,
    instanceMismatchSuspected: mismatch.suspected,
    instanceMismatchMessage: mismatch.message,
    installLocationStable,
    installLocationMessage,
    identityFingerprint: buildIdentityFingerprint(context.app, bundlePath),
    automationCapability
  };

  const items: PermissionItemStatus[] = [
    screenCaptureStatus,
    accessibilityStatus,
    automationDependencyStatus,
    shortcutStatus,
    clipboardStatus,
    inputMonitoringStatus,
    notificationStatus,
    fileAccessStatus
  ];

  return {
    items,
    hasIssues: items.some((item) => item.needsAttention),
    hasBlockingIssues: items.some((item) => item.blocking),
    updatedAt: checkedAt,
    source: context.source,
    diagnostics
  };
}

export async function openPermissionSettings(target: PermissionSettingsTarget): Promise<boolean> {
  const url = SETTINGS_URL_MAP[target] ?? SETTINGS_URL_MAP.privacyGeneral;
  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('[permissions] Failed to open direct settings URL', {
      target,
      url,
      error
    });
    try {
      await shell.openExternal(SETTINGS_URL_MAP.privacyGeneral);
      return true;
    } catch (fallbackError) {
      console.error('[permissions] Failed to open fallback settings URL', {
        target,
        fallbackUrl: SETTINGS_URL_MAP.privacyGeneral,
        error: fallbackError
      });
      return false;
    }
  }
}
