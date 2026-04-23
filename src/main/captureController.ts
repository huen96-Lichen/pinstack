import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, nativeImage, screen, systemPreferences } from 'electron';
import type { Display, NativeImage } from 'electron';
import type {
  AppSettings,
  AppToastPayload,
  CaptureLauncherEdge,
  CaptureLauncherPosition,
  CaptureLauncherVisualState,
  CaptureRecordingState,
  CaptureRatioOption,
  CaptureSelectionBounds,
  CaptureSessionConfig,
  CaptureSizeOption,
  PermissionState,
  PermissionStatusSnapshot,
  RecordItem,
  ScreenshotAttemptDiagnostics,
  RuntimeSettings
} from '../shared/types';
import { AppError } from './errors';
import type { FailureFeedbackContext } from './failureFeedback';
import type { PinWindowManager } from './windows/pinWindowManager';
import type { StorageService } from './storage';
import { suggestClassification } from './ruleEngine';
import { SYSTEM_SUGGESTION_TAG } from '../shared/classificationSuggestion';
import { probeScreenCaptureCapability, probeScreenshotCommandCapability } from './permissions';
import { logTelemetry } from './telemetry';

const execFileAsync = promisify(execFile);

const CAPTURE_LAUNCHER_WIDTH = 56;
const CAPTURE_LAUNCHER_HEIGHT = 56;
const CAPTURE_LAUNCHER_MARGIN_X = 0;
const CAPTURE_LAUNCHER_MARGIN_TOP = 0;
const CAPTURE_LAUNCHER_MARGIN_BOTTOM = 0;
const CAPTURE_LAUNCHER_EDGE_THRESHOLD = 26;
const COLOR_SAMPLE_CACHE_TTL_MS = 320;
const COLOR_FALLBACK_COOLDOWN_MS = 450;

interface CaptureOverlayDisplayContext {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scaleFactor: number;
}

export interface CaptureControllerOptions {
  preloadPath: string;
  rendererFilePath: string;
  rendererDevUrl?: string;
  getCurrentSettings: () => AppSettings;
  getRuntimeSettings: () => RuntimeSettings;
  updateRuntimeSettings: (patch: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;
  storage: StorageService;
  pinManager: PinWindowManager;
  notifyRecordsChanged: () => void;
  notifyToast: (message: string, level?: 'error' | 'warning' | 'info') => void;
  reportFailure: (context: FailureFeedbackContext, error: unknown) => Promise<void>;
  getFrontmostApp: () => Promise<string | null>;
  getAppPath: () => string;
  getBundleId: () => string;
}

export interface CaptureController {
  captureScreenshotAndPin: (region?: CaptureSelectionBounds) => Promise<void>;
  beginRegionScreenshotCapture: (session?: CaptureSessionConfig) => Promise<void>;
  beginFixedSizeScreenshotCapture: (size: CaptureSizeOption) => Promise<void>;
  beginRatioScreenshotCapture: (ratio: CaptureRatioOption) => Promise<void>;
  confirmRegionScreenshotCapture: (selection: CaptureSelectionBounds) => Promise<void>;
  confirmRegionScreenshotToClipboard: (selection: CaptureSelectionBounds) => Promise<void>;
  confirmRegionScreenshotSaveOnly: (selection: CaptureSelectionBounds) => Promise<void>;
  confirmRegionScreenshotAndForcePin: (selection: CaptureSelectionBounds) => Promise<void>;
  confirmRegionScreenshotSaveAsFile: (selection: CaptureSelectionBounds) => Promise<void>;
  cancelRegionScreenshotCapture: () => Promise<void>;
  getCaptureSelectionSession: () => CaptureSessionConfig;
  toggleCaptureHubPanel: () => Promise<void>;
  hideCaptureHubPanel: () => void;
  updateCaptureHubPanelHeight: (height: number) => void;
  getCaptureRecordingState: () => CaptureRecordingState;
  getCaptureLauncherVisualState: () => CaptureLauncherVisualState;
  markCaptureRecordingStarted: () => void;
  markCaptureRecordingStopped: () => void;
  requestCaptureRecordingStop: () => void;
  saveCaptureRecording: (args: { bytes: Uint8Array; mimeType?: string | null }) => Promise<string>;
  beginCaptureLauncherDrag: (screenX: number, screenY: number) => void;
  updateCaptureLauncherDrag: (screenX: number, screenY: number) => void;
  endCaptureLauncherDrag: (screenX?: number, screenY?: number) => Promise<void>;
  getScreenCapturePermissionState: () => PermissionState;
  getLastScreenshotAttemptDiagnostics: () => ScreenshotAttemptDiagnostics | null;
  showCaptureLauncher: (force?: boolean) => Promise<void>;
  hideCaptureLauncher: () => void;
  repositionCaptureLauncherWindow: () => void;
  broadcastCaptureLauncherVisualState: (bounds?: { x: number; y: number; width: number; height: number }) => void;
  getColorAtPosition: (screenX: number, screenY: number) => Promise<string>;
  setHubOpenVisualState: () => void;
  sendToastToHub: (payload: AppToastPayload) => void;
  sendPermissionStatusToHub: (snapshot: PermissionStatusSnapshot) => void;
  handleDisplayMetricsChanged: () => void;
  destroy: () => void;
}

export function createCaptureController(options: CaptureControllerOptions): CaptureController {
  let captureOverlayWindowRef: BrowserWindow | null = null;
  let captureHubWindowRef: BrowserWindow | null = null;
  let captureLauncherWindowRef: BrowserWindow | null = null;
  let captureHubHeightRef = 272;
  let captureRecordingStateRef: CaptureRecordingState = {
    active: false,
    startedAt: null
  };
  let captureLauncherDragStateRef:
    | {
        startCursorX: number;
        startCursorY: number;
        startBounds: { x: number; y: number; width: number; height: number };
      }
    | null = null;
  let captureOverlayDisplayContextRef: CaptureOverlayDisplayContext | null = null;
  let colorSampleCacheRef:
    | {
        displayId: string;
        bitmap: Buffer;
        width: number;
        height: number;
        physicalBounds: { x: number; y: number; width: number; height: number };
        capturedAt: number;
      }
    | null = null;
  let lastColorSampleRef = '#------';
  let lastColorFallbackAtRef = 0;
  let currentCaptureSessionConfigRef: CaptureSessionConfig = {
    mode: 'free',
    size: null,
    ratio: null
  };
  let lastScreenshotAttemptRef: ScreenshotAttemptDiagnostics | null = null;

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getActiveDisplay() {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  function getAccessibilityTrusted(): boolean {
    if (process.platform !== 'darwin') {
      return false;
    }
    return systemPreferences.isTrustedAccessibilityClient(false);
  }

  function getRawScreenPermissionStatus(): string {
    if (process.platform !== 'darwin') {
      return 'unknown';
    }
    return systemPreferences.getMediaAccessStatus('screen');
  }

  function setLastScreenshotAttempt(
    patch: Omit<ScreenshotAttemptDiagnostics, 'timestamp' | 'appPath' | 'bundleId' | 'rawScreenStatus' | 'accessibilityTrusted' | 'captureMode'>
  ): void {
    lastScreenshotAttemptRef = {
      timestamp: Date.now(),
      appPath: options.getAppPath(),
      bundleId: options.getBundleId(),
      rawScreenStatus: getRawScreenPermissionStatus(),
      accessibilityTrusted: getAccessibilityTrusted(),
      captureMode: currentCaptureSessionConfigRef.mode,
      ...patch
    };
    logTelemetry('capture.screenshot.diagnostics', { ...lastScreenshotAttemptRef });
  }

  function getDisplayPhysicalBounds(display: Display) {
    return {
      x: Math.round(display.bounds.x * display.scaleFactor),
      y: Math.round(display.bounds.y * display.scaleFactor),
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor)
    };
  }

  function resolveDisplayForRegion(region?: CaptureSelectionBounds): Display {
    if (!region) {
      return getActiveDisplay();
    }

    const allDisplays = screen.getAllDisplays();
    let bestMatch = allDisplays[0] ?? getActiveDisplay();
    let bestOverlap = -1;

    for (const display of allDisplays) {
      const bounds = getDisplayPhysicalBounds(display);
      const overlapWidth = Math.max(
        0,
        Math.min(region.x + region.width, bounds.x + bounds.width) - Math.max(region.x, bounds.x)
      );
      const overlapHeight = Math.max(
        0,
        Math.min(region.y + region.height, bounds.y + bounds.height) - Math.max(region.y, bounds.y)
      );
      const overlapArea = overlapWidth * overlapHeight;
      if (overlapArea > bestOverlap) {
        bestOverlap = overlapArea;
        bestMatch = display;
      }
    }

    return bestMatch;
  }

  function getCaptureLauncherSafeAreaBounds(display: Display) {
    return {
      x: display.workArea.x + CAPTURE_LAUNCHER_MARGIN_X,
      y: display.workArea.y + CAPTURE_LAUNCHER_MARGIN_TOP,
      width: Math.max(0, display.workArea.width - CAPTURE_LAUNCHER_MARGIN_X * 2),
      height: Math.max(0, display.workArea.height - CAPTURE_LAUNCHER_MARGIN_TOP - CAPTURE_LAUNCHER_MARGIN_BOTTOM)
    };
  }

  function clampCaptureLauncherBounds(bounds: { x: number; y: number; width: number; height: number }) {
    const display = screen.getDisplayMatching(bounds);
    const safeArea = getCaptureLauncherSafeAreaBounds(display);
    const maxX = Math.max(safeArea.x, safeArea.x + safeArea.width - bounds.width);
    const maxY = Math.max(safeArea.y, safeArea.y + safeArea.height - bounds.height);

    return {
      x: Math.round(Math.max(safeArea.x, Math.min(bounds.x, maxX))),
      y: Math.round(Math.max(safeArea.y, Math.min(bounds.y, maxY))),
      width: bounds.width,
      height: bounds.height
    };
  }

  function isCaptureHubOpen(): boolean {
    return Boolean(captureHubWindowRef && !captureHubWindowRef.isDestroyed() && captureHubWindowRef.isVisible());
  }

  function resolveCaptureLauncherVisualState(bounds: { x: number; y: number; width: number; height: number }): CaptureLauncherVisualState {
    const display = screen.getDisplayMatching(bounds);
    const safeArea = getCaptureLauncherSafeAreaBounds(display);
    const maxX = Math.max(safeArea.x, safeArea.x + safeArea.width - bounds.width);
    const maxY = Math.max(safeArea.y, safeArea.y + safeArea.height - bounds.height);
    const distances: Array<{ edge: CaptureLauncherEdge; value: number }> = [
      { edge: 'left' as const, value: Math.max(0, bounds.x - safeArea.x) },
      { edge: 'right' as const, value: Math.max(0, maxX - bounds.x) },
      { edge: 'top' as const, value: Math.max(0, bounds.y - safeArea.y) },
      { edge: 'bottom' as const, value: Math.max(0, maxY - bounds.y) }
    ].sort((a, b) => a.value - b.value);

    const nearest = distances[0] ?? { edge: null, value: Number.MAX_SAFE_INTEGER };
    return {
      weakened: nearest.value <= CAPTURE_LAUNCHER_EDGE_THRESHOLD,
      edge: nearest.edge,
      edgeDistance: nearest.value,
      hubOpen: isCaptureHubOpen()
    };
  }

  function buildDefaultCaptureLauncherBounds(display = getActiveDisplay()) {
    const safeArea = getCaptureLauncherSafeAreaBounds(display);

    return {
      x: Math.round(safeArea.x),
      y: Math.round(safeArea.y + Math.max(0, safeArea.height - CAPTURE_LAUNCHER_HEIGHT)),
      width: CAPTURE_LAUNCHER_WIDTH,
      height: CAPTURE_LAUNCHER_HEIGHT
    };
  }

  function serializeCaptureLauncherPosition(bounds: { x: number; y: number; width: number; height: number }): CaptureLauncherPosition {
    const display = screen.getDisplayMatching(bounds);
    const safeArea = getCaptureLauncherSafeAreaBounds(display);
    const rangeX = Math.max(1, safeArea.width - bounds.width);
    const rangeY = Math.max(1, safeArea.height - bounds.height);

    return {
      displayId: display.id,
      relativeX: Math.max(0, Math.min((bounds.x - safeArea.x) / rangeX, 1)),
      relativeY: Math.max(0, Math.min((bounds.y - safeArea.y) / rangeY, 1))
    };
  }

  function resolveCaptureLauncherBounds() {
    const position = options.getRuntimeSettings().captureLauncherPosition;
    if (!position) {
      return buildDefaultCaptureLauncherBounds(getActiveDisplay());
    }

    const display =
      screen.getAllDisplays().find((item) => item.id === position.displayId) ??
      getActiveDisplay();
    const safeArea = getCaptureLauncherSafeAreaBounds(display);
    const rangeX = Math.max(0, safeArea.width - CAPTURE_LAUNCHER_WIDTH);
    const rangeY = Math.max(0, safeArea.height - CAPTURE_LAUNCHER_HEIGHT);

    return clampCaptureLauncherBounds({
      x: Math.round(safeArea.x + rangeX * position.relativeX),
      y: Math.round(safeArea.y + rangeY * position.relativeY),
      width: CAPTURE_LAUNCHER_WIDTH,
      height: CAPTURE_LAUNCHER_HEIGHT
    });
  }

  function getCaptureLauncherBounds() {
    if (captureLauncherWindowRef && !captureLauncherWindowRef.isDestroyed()) {
      return clampCaptureLauncherBounds(captureLauncherWindowRef.getBounds());
    }

    return resolveCaptureLauncherBounds();
  }

  function getCaptureHubBounds() {
    const launcherBounds = getCaptureLauncherBounds();
    const display = screen.getDisplayMatching(launcherBounds).workArea;
    const width = 388;
    const height = Math.min(captureHubHeightRef, Math.max(240, display.height - 24));
    const gap = 10;
    const margin = 12;
    const preferredX = launcherBounds.x + launcherBounds.width - width + 6;
    const spaceAbove = launcherBounds.y - display.y - gap - margin;
    const spaceBelow = display.y + display.height - (launcherBounds.y + launcherBounds.height) - gap - margin;
    const shouldOpenAbove = spaceAbove >= height || spaceAbove >= spaceBelow;
    const preferredY = shouldOpenAbove
      ? launcherBounds.y - height - gap
      : launcherBounds.y + launcherBounds.height + gap;

    return {
      x: Math.max(display.x + margin, Math.min(preferredX, display.x + display.width - width - margin)),
      y: Math.max(display.y + margin, Math.min(preferredY, display.y + display.height - height - margin)),
      width,
      height
    };
  }

  function buildRecordingFilePath(): string {
    const recordingsRoot = path.join(options.getCurrentSettings().storageRoot, 'recordings');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(recordingsRoot, `recording-${stamp}.webm`);
  }

  function broadcastCaptureRecordingState(): void {
    const payload = captureRecordingStateRef;
    captureLauncherWindowRef?.webContents.send('capture.recording.state', payload);
    captureHubWindowRef?.webContents.send('capture.recording.state', payload);
  }

  function broadcastCaptureLauncherVisualState(bounds?: { x: number; y: number; width: number; height: number }): void {
    const nextBounds =
      bounds ??
      (captureLauncherWindowRef && !captureLauncherWindowRef.isDestroyed()
        ? clampCaptureLauncherBounds(captureLauncherWindowRef.getBounds())
        : resolveCaptureLauncherBounds());
    const payload = resolveCaptureLauncherVisualState(nextBounds);
    captureLauncherWindowRef?.webContents.send('capture.launcher.visualState', payload);
  }

  function getCaptureRecordingState(): CaptureRecordingState {
    return captureRecordingStateRef;
  }

  function getCaptureLauncherVisualState(): CaptureLauncherVisualState {
    return resolveCaptureLauncherVisualState(getCaptureLauncherBounds());
  }

  function getLastScreenshotAttemptDiagnostics(): ScreenshotAttemptDiagnostics | null {
    return lastScreenshotAttemptRef;
  }

  function markCaptureRecordingStarted(): void {
    captureRecordingStateRef = {
      active: true,
      startedAt: Date.now()
    };
    broadcastCaptureRecordingState();
    void showCaptureLauncher(true).catch((error) => {
      console.error('[capture:recording] Failed to show launcher while recording', error);
    });
  }

  function markCaptureRecordingStopped(): void {
    captureRecordingStateRef = {
      active: false,
      startedAt: null
    };
    broadcastCaptureRecordingState();
    if (options.getRuntimeSettings().enableCaptureLauncher) {
      void showCaptureLauncher(true).catch((error) => {
        console.error('[capture:recording] Failed to restore launcher after recording', error);
      });
    } else {
      hideCaptureLauncher();
    }
  }

  function requestCaptureRecordingStop(): void {
    captureHubWindowRef?.webContents.send('capture.recording.stopRequested');
  }

  async function saveCaptureRecording(args: { bytes: Uint8Array; mimeType?: string | null }): Promise<string> {
    const filePath = buildRecordingFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(args.bytes));
    try {
      await options.storage.createVideoRecord(filePath, {
        source: 'recording',
        category: 'video',
        sourceApp: 'PinStack',
        useCase: 'reference',
        tags: ['recording', 'video']
      });
      options.notifyRecordsChanged();
    } catch (error) {
      console.error('[capture:recording] Failed to index recording', error);
      await options.reportFailure('capture.recording.index', error);
      return filePath;
    }
    options.notifyToast(`录屏已保存：${path.basename(filePath)}`, 'info');
    return filePath;
  }

  function normalizeCaptureSize(size: CaptureSizeOption): CaptureSizeOption {
    return {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height))
    };
  }

  async function rememberCaptureSize(size: CaptureSizeOption): Promise<void> {
    const runtimeSettings = options.getRuntimeSettings();
    if (!runtimeSettings.rememberCaptureRecentSizes) {
      return;
    }

    const normalized = normalizeCaptureSize(size);
    const nextRecentSizes = [
      normalized,
      ...runtimeSettings.captureRecentSizes.filter(
        (item) => item.width !== normalized.width || item.height !== normalized.height
      )
    ].slice(0, 6);

    await options.updateRuntimeSettings({
      captureRecentSizes: nextRecentSizes
    });
  }

  async function persistCaptureLauncherBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
    await options.updateRuntimeSettings({
      captureLauncherPosition: serializeCaptureLauncherPosition(bounds)
    });
  }

  function getScreenCapturePermissionState(): PermissionState {
    const raw = getRawScreenPermissionStatus();
    if (raw === 'granted') {
      return 'granted';
    }
    if (raw === 'denied' || raw === 'restricted') {
      return 'denied';
    }
    if (raw === 'not-determined') {
      return 'not-determined';
    }
    return 'unknown';
  }

  // 会话级权限请求闸门
  let hasRequestedScreenPermissionThisSession = false;

  let hasShownScreenCaptureMismatchToastThisSession = false;

  async function canProceedWithScreenCapture(): Promise<boolean> {
    const systemState = getScreenCapturePermissionState();
    
    // 如果权限已授予或尚未确定，允许继续
    if (systemState === 'granted' || systemState === 'not-determined') {
      // 对于尚未确定的情况，标记已请求权限
      if (systemState === 'not-determined' && !hasRequestedScreenPermissionThisSession) {
        hasRequestedScreenPermissionThisSession = true;
      }
      return true;
    }

    // 检查实际捕获能力
    const desktopProbe = await probeScreenCaptureCapability();
    if (desktopProbe.status === 'success') {
      return true;
    }

    const probe = await probeScreenshotCommandCapability();
    if (probe.status === 'success') {
      return true;
    }

    setLastScreenshotAttempt({
      trigger: 'beginRegionScreenshotCapture.permissionGate',
      executionPath: 'permission-gate',
      command: 'screen permission gate',
      success: false,
      error: probe.error ?? desktopProbe.error ?? 'Screen capture gate checks failed before screenshot start'
    });
    if (!hasShownScreenCaptureMismatchToastThisSession) {
      hasShownScreenCaptureMismatchToastThisSession = true;
      options.notifyToast('权限状态与实际截图链路可能不一致，将继续尝试截图；若失败可复制诊断日志。', 'warning');
    }
    return true;
  }

  async function saveScreenshotToFile(image: NativeImage): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const defaultPath = path.join(app.getPath('pictures'), `PinStack-${timestamp}.png`);
    const focusedWindow =
      (captureOverlayWindowRef && !captureOverlayWindowRef.isDestroyed() ? captureOverlayWindowRef : null)
      ?? (captureHubWindowRef && !captureHubWindowRef.isDestroyed() ? captureHubWindowRef : null)
      ?? (captureLauncherWindowRef && !captureLauncherWindowRef.isDestroyed() ? captureLauncherWindowRef : null)
      ?? undefined;
    const result = focusedWindow
      ? await dialog.showSaveDialog(focusedWindow, {
          title: '另存为截图',
          defaultPath,
          buttonLabel: '保存',
          filters: [{ name: 'PNG 图片', extensions: ['png'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation']
        })
      : await dialog.showSaveDialog({
          title: '另存为截图',
          defaultPath,
          buttonLabel: '保存',
          filters: [{ name: 'PNG 图片', extensions: ['png'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation']
        });

    if (result.canceled || !result.filePath) {
      return;
    }

    const filePath = result.filePath.toLowerCase().endsWith('.png') ? result.filePath : `${result.filePath}.png`;
    await fs.writeFile(filePath, image.toPNG());
    options.notifyToast(`截图已保存：${path.basename(filePath)}`, 'info');
  }

  async function captureViaDesktopCapturer(region?: CaptureSelectionBounds): Promise<NativeImage> {
    const display = resolveDisplayForRegion(region);
    const physicalBounds = getDisplayPhysicalBounds(display);
    const thumbnailSize = {
      width: Math.max(1, physicalBounds.width),
      height: Math.max(1, physicalBounds.height)
    };
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize,
      fetchWindowIcons: false
    });
    const displayId = String(display.id);
    const source =
      sources.find((item) => item.display_id === displayId) ??
      sources.find((item) => item.display_id === '0') ??
      sources[0];

    if (!source || source.thumbnail.isEmpty()) {
      throw new AppError('PERMISSION_REQUIRED', 'desktopCapturer 未返回可用屏幕图像');
    }

    if (!region) {
      return source.thumbnail;
    }

    const cropRect = {
      x: Math.max(0, Math.round(region.x - physicalBounds.x)),
      y: Math.max(0, Math.round(region.y - physicalBounds.y)),
      width: Math.max(1, Math.round(region.width)),
      height: Math.max(1, Math.round(region.height))
    };

    if (
      cropRect.x + cropRect.width > thumbnailSize.width ||
      cropRect.y + cropRect.height > thumbnailSize.height
    ) {
      throw new AppError(
        'INVALID_ARGUMENT',
        `截图区域超出屏幕范围: ${JSON.stringify({ cropRect, thumbnailSize, displayId })}`
      );
    }

    return source.thumbnail.crop(cropRect);
  }

  async function promptScreenshotDisplayName(defaultName: string): Promise<string | null> {
    if (process.platform !== 'darwin') {
      return null;
    }

    const escapedDefault = defaultName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `
      set defaultValue to "${escapedDefault}"
      try
        set nameResult to text returned of (display dialog "请输入截图名称（可稍后再改）" default answer defaultValue buttons {"跳过", "保存"} default button "保存")
        return nameResult
      on error number -128
        return ""
      end try
    `;

    try {
      const { stdout } = await execFileAsync('osascript', ['-e', script], {
        timeout: 30000
      });
      const value = stdout.trim();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  async function captureImageForRegion(region?: CaptureSelectionBounds): Promise<NativeImage> {
    const tempPath = path.join(os.tmpdir(), `pinstack-${Date.now()}.png`);
    const captureArgs = region
      ? ['-x', `-R${region.x},${region.y},${region.width},${region.height}`, tempPath]
      : ['-x', tempPath];
    let image: NativeImage | null = null;

    try {
      try {
        image = await captureViaDesktopCapturer(region);
        setLastScreenshotAttempt({
          trigger: 'captureScreenshotAndPin',
          executionPath: 'desktopCapturer-crop',
          command: 'desktopCapturer.getSources -> thumbnail.crop',
          success: true,
          region: region ?? null
        });
      } catch (desktopError) {
        console.error('[captureScreenshotAndPin] desktopCapturer capture failed, falling back to screencapture', desktopError);
        try {
          await execFileAsync('screencapture', captureArgs);
          image = nativeImage.createFromPath(tempPath);
          setLastScreenshotAttempt({
            trigger: 'captureScreenshotAndPin',
            executionPath: 'screencapture-fallback',
            command: `screencapture ${captureArgs.join(' ')}`,
            success: !image.isEmpty(),
            error: image.isEmpty() ? 'screencapture 返回了空图像' : undefined,
            stack: desktopError instanceof Error ? desktopError.stack : undefined,
            region: region ?? null
          });
        } catch (error) {
          setLastScreenshotAttempt({
            trigger: 'captureScreenshotAndPin',
            executionPath: 'screencapture-fallback',
            command: `screencapture ${captureArgs.join(' ')}`,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            region: region ?? null
          });
          console.error('[captureScreenshotAndPin] Screenshot command failed', error);
          await options.reportFailure('capture.screenshot.command', error);
          throw error;
        }
      }
      if (!image || image.isEmpty()) {
        throw new AppError('IMAGE_DECODE_FAILED', 'Screenshot image is empty');
      }

      return image;
    } finally {
      try {
        await fs.rm(tempPath, { force: true });
      } catch (error) {
        console.error('[captureScreenshotAndPin] Failed to cleanup temp screenshot file', error);
      }
    }
  }

  async function captureScreenshotAndPin(
    region?: CaptureSelectionBounds,
    optionsBehavior?: {
      saveToLibrary?: boolean;
      copyToClipboard?: boolean;
      forcePin?: boolean;
      skipAutoPin?: boolean;
    }
  ): Promise<void> {
    let image: NativeImage;
    try {
      image = await captureImageForRegion(region);
    } catch (error) {
      console.error('[captureScreenshotAndPin] Failed to capture image', error);
      setLastScreenshotAttempt({
        trigger: 'captureScreenshotAndPin',
        executionPath: lastScreenshotAttemptRef?.executionPath ?? 'not-run',
        command: lastScreenshotAttemptRef?.command,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        region: region ?? null
      });
      await options.reportFailure('capture.screenshot.decode', error);
      return;
    }

    const behavior = {
      saveToLibrary: optionsBehavior?.saveToLibrary ?? true,
      copyToClipboard: optionsBehavior?.copyToClipboard ?? false,
      forcePin: optionsBehavior?.forcePin ?? false,
      skipAutoPin: optionsBehavior?.skipAutoPin ?? false
    };

    if (behavior.copyToClipboard) {
      clipboard.writeImage(image);
      options.notifyToast('截图已复制到剪贴板', 'info');
    }

    if (!behavior.saveToLibrary) {
      return;
    }

    let record: Awaited<ReturnType<StorageService['createImageRecord']>>;
    const sourceApp = await options.getFrontmostApp();
    const suggestion = suggestClassification({
      content: { type: 'image' },
      metadata: {
        sourceApp,
        length: null
      }
    });
    const suggestionTags = [...new Set([SYSTEM_SUGGESTION_TAG, ...suggestion.tags])];
    try {
      record = await options.storage.createImageRecord(image, {
        source: 'screenshot',
        category: 'image',
        sourceApp,
        useCase: suggestion.useCase,
        tags: suggestionTags
      });
    } catch (error) {
      console.error('[captureScreenshotAndPin] Failed to save screenshot record', error);
      await options.reportFailure('capture.screenshot.save', error);
      return;
    }

    try {
      const shouldPin = behavior.forcePin
        || (
          !behavior.skipAutoPin
          && options.getRuntimeSettings().mode === 'auto'
          && options.getRuntimeSettings().enableImagePin !== false
        );
      if (shouldPin) {
        await options.pinManager.createPinWindow(record);
      }
    } catch (error) {
      console.error('[captureScreenshotAndPin] Failed to create pin window for screenshot', error);
      await options.reportFailure('capture.screenshot.pin', error);
    }

    options.notifyRecordsChanged();

    void (async () => {
      const fallbackName = `截图-${new Date(record.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}`;
      const nextDisplayName = await promptScreenshotDisplayName(fallbackName);
      if (!nextDisplayName) {
        return;
      }
      try {
        await options.storage.renameRecord(record.id, nextDisplayName);
        options.notifyRecordsChanged();
      } catch (error) {
        console.error('[captureScreenshotAndPin] Failed to rename screenshot record', error);
        await options.reportFailure('capture.screenshot.rename', error);
      }
    })();
  }

  async function loadPage(windowRef: BrowserWindow, viewName: string): Promise<void> {
    if (options.rendererDevUrl) {
      const query = new URLSearchParams({ view: viewName });
      await windowRef.loadURL(`${options.rendererDevUrl}?${query.toString()}`);
      return;
    }

    await windowRef.loadFile(options.rendererFilePath, {
      query: {
        view: viewName
      }
    });
  }

  async function loadCaptureOverlayPage(windowRef: BrowserWindow): Promise<void> {
    await loadPage(windowRef, 'capture-overlay');
  }

  async function loadCaptureHubPage(windowRef: BrowserWindow): Promise<void> {
    await loadPage(windowRef, 'capture-hub');
  }

  async function loadCaptureLauncherPage(windowRef: BrowserWindow): Promise<void> {
    await loadPage(windowRef, 'capture-launcher');
  }

  function repositionCaptureLauncherWindow(): void {
    if (!captureLauncherWindowRef || captureLauncherWindowRef.isDestroyed()) {
      return;
    }

    const bounds = resolveCaptureLauncherBounds();
    captureLauncherWindowRef.setBounds(bounds, false);
    broadcastCaptureLauncherVisualState(bounds);
    void persistCaptureLauncherBounds(bounds);
  }

  function positionCaptureHubWindow(windowRef: BrowserWindow, animate = false): void {
    windowRef.setBounds(getCaptureHubBounds(), animate);
  }

  function updateCaptureHubPanelHeight(height: number): void {
    const display = screen.getDisplayMatching(getCaptureLauncherBounds()).workArea;
    const maxHeight = Math.max(224, display.height - 24);
    const nextHeight = Math.max(224, Math.min(Math.round(height), maxHeight));
    if (Math.abs(nextHeight - captureHubHeightRef) < 2) {
      return;
    }

    captureHubHeightRef = nextHeight;
    if (captureHubWindowRef && !captureHubWindowRef.isDestroyed()) {
      positionCaptureHubWindow(captureHubWindowRef, false);
    }
  }

  async function ensureCaptureLauncherWindow(): Promise<BrowserWindow> {
    if (captureLauncherWindowRef && !captureLauncherWindowRef.isDestroyed()) {
      repositionCaptureLauncherWindow();
      return captureLauncherWindowRef;
    }

    const bounds = getCaptureLauncherBounds();
    const windowRef = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'PinStack Capture Launcher',
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    windowRef.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    windowRef.setAlwaysOnTop(true, 'floating');

    windowRef.on('closed', () => {
      captureLauncherWindowRef = null;
      captureLauncherDragStateRef = null;
    });

    try {
      await loadCaptureLauncherPage(windowRef);
    } catch (error) {
      windowRef.destroy();
      throw error;
    }

    captureLauncherWindowRef = windowRef;
    windowRef.webContents.on('did-finish-load', () => {
      broadcastCaptureLauncherVisualState(windowRef.getBounds());
    });
    return windowRef;
  }

  async function ensureCaptureHubWindow(): Promise<BrowserWindow> {
    if (captureHubWindowRef && !captureHubWindowRef.isDestroyed()) {
      positionCaptureHubWindow(captureHubWindowRef);
      return captureHubWindowRef;
    }

    const bounds = getCaptureHubBounds();
    const windowRef = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'PinStack Capture Hub',
      ...(process.platform === 'darwin'
        ? {
            vibrancy: 'under-window',
            visualEffectState: 'active'
          }
        : {}),
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    windowRef.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    windowRef.setAlwaysOnTop(true, 'floating');

    windowRef.on('blur', () => {
      if (!windowRef.isDestroyed() && windowRef.isVisible()) {
        windowRef.hide();
        broadcastCaptureLauncherVisualState();
      }
    });

    windowRef.on('show', () => {
      broadcastCaptureLauncherVisualState();
    });

    windowRef.on('hide', () => {
      broadcastCaptureLauncherVisualState();
    });

    windowRef.on('closed', () => {
      captureHubWindowRef = null;
    });

    try {
      await loadCaptureHubPage(windowRef);
    } catch (error) {
      windowRef.destroy();
      throw error;
    }

    captureHubWindowRef = windowRef;
    return windowRef;
  }

  async function showCaptureLauncher(force = false): Promise<void> {
    if (!force && !options.getRuntimeSettings().enableCaptureLauncher) {
      return;
    }
    const windowRef = await ensureCaptureLauncherWindow();
    repositionCaptureLauncherWindow();
    if (windowRef.isMinimized()) {
      windowRef.restore();
    }
    windowRef.showInactive();
  }

  function hideCaptureLauncher(): void {
    if (!captureLauncherWindowRef || captureLauncherWindowRef.isDestroyed()) {
      return;
    }
    captureLauncherWindowRef.hide();
  }

  async function toggleCaptureHubPanel(): Promise<void> {
    const panel = await ensureCaptureHubWindow();
    if (options.getRuntimeSettings().enableCaptureLauncher) {
      await showCaptureLauncher();
    }
    if (panel.isVisible()) {
      panel.hide();
      broadcastCaptureLauncherVisualState();
      return;
    }
    positionCaptureHubWindow(panel, false);
    panel.show();
    panel.focus();
    panel.webContents.send('capture.hub.shown');
    broadcastCaptureLauncherVisualState();
  }

  function hideCaptureHubPanel(): void {
    if (!captureHubWindowRef || captureHubWindowRef.isDestroyed()) {
      return;
    }
    captureHubWindowRef.hide();
    broadcastCaptureLauncherVisualState();
  }

  function beginCaptureLauncherDrag(screenX: number, screenY: number): void {
    if (!captureLauncherWindowRef || captureLauncherWindowRef.isDestroyed()) {
      return;
    }

    captureLauncherDragStateRef = {
      startCursorX: screenX,
      startCursorY: screenY,
      startBounds: captureLauncherWindowRef.getBounds()
    };
  }

  function updateCaptureLauncherDrag(screenX: number, screenY: number): void {
    if (!captureLauncherWindowRef || captureLauncherWindowRef.isDestroyed() || !captureLauncherDragStateRef) {
      return;
    }

    const nextBounds = clampCaptureLauncherBounds({
      ...captureLauncherDragStateRef.startBounds,
      x: Math.round(captureLauncherDragStateRef.startBounds.x + (screenX - captureLauncherDragStateRef.startCursorX)),
      y: Math.round(captureLauncherDragStateRef.startBounds.y + (screenY - captureLauncherDragStateRef.startCursorY))
    });

    captureLauncherWindowRef.setBounds(nextBounds, false);
    broadcastCaptureLauncherVisualState(nextBounds);
    if (captureHubWindowRef && !captureHubWindowRef.isDestroyed() && captureHubWindowRef.isVisible()) {
      positionCaptureHubWindow(captureHubWindowRef);
    }
  }

  async function endCaptureLauncherDrag(screenX?: number, screenY?: number): Promise<void> {
    if (typeof screenX === 'number' && typeof screenY === 'number') {
      updateCaptureLauncherDrag(screenX, screenY);
    }

    if (!captureLauncherWindowRef || captureLauncherWindowRef.isDestroyed()) {
      captureLauncherDragStateRef = null;
      return;
    }

    const bounds = clampCaptureLauncherBounds(captureLauncherWindowRef.getBounds());
    captureLauncherWindowRef.setBounds(bounds, false);
    broadcastCaptureLauncherVisualState(bounds);
    captureLauncherDragStateRef = null;
    await persistCaptureLauncherBounds(bounds);
  }

  async function ensureCaptureOverlayWindow(): Promise<BrowserWindow> {
    if (captureOverlayWindowRef && !captureOverlayWindowRef.isDestroyed()) {
      return captureOverlayWindowRef;
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    captureOverlayDisplayContextRef = {
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height
      },
      scaleFactor: display.scaleFactor
    };

    const windowRef = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      fullscreenable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: false,
      title: 'PinStack Capture Overlay',
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    windowRef.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    windowRef.setAlwaysOnTop(true, 'screen-saver');
    windowRef.setContentProtection(true);

    windowRef.on('closed', () => {
      captureOverlayWindowRef = null;
      captureOverlayDisplayContextRef = null;
    });

    try {
      await loadCaptureOverlayPage(windowRef);
    } catch (error) {
      windowRef.destroy();
      throw error;
    }

    captureOverlayWindowRef = windowRef;
    return windowRef;
  }

  function getCaptureSelectionSession(): CaptureSessionConfig {
    return {
      mode: currentCaptureSessionConfigRef.mode,
      size: currentCaptureSessionConfigRef.size ? { ...currentCaptureSessionConfigRef.size } : null,
      ratio: currentCaptureSessionConfigRef.ratio ? { ...currentCaptureSessionConfigRef.ratio } : null
    };
  }

  async function beginFixedSizeScreenshotCapture(size: CaptureSizeOption): Promise<void> {
    await beginRegionScreenshotCapture({
      mode: 'fixed',
      size,
      ratio: null
    });
  }

  async function beginRatioScreenshotCapture(ratio: CaptureRatioOption): Promise<void> {
    await beginRegionScreenshotCapture({
      mode: 'ratio',
      size: null,
      ratio
    });
  }

  async function beginRegionScreenshotCapture(
    session: CaptureSessionConfig = { mode: 'free', size: null, ratio: null }
  ): Promise<void> {
    hideCaptureHubPanel();
    hideCaptureLauncher();

    currentCaptureSessionConfigRef = {
      mode: session.mode,
      size: session.size ? normalizeCaptureSize(session.size) : null,
      ratio: session.ratio
        ? {
            label: session.ratio.label,
            width: Math.max(1, Math.round(session.ratio.width)),
            height: Math.max(1, Math.round(session.ratio.height))
          }
        : null
    };

    const canProceed = await canProceedWithScreenCapture();
    if (!canProceed) {
      await options.reportFailure(
        'capture.screenPermission',
        new AppError('PERMISSION_REQUIRED', 'Screen capture permission is required')
      );
      void showCaptureLauncher();
      return;
    }

    const windowRef = await ensureCaptureOverlayWindow();
    const display = getActiveDisplay();
    captureOverlayDisplayContextRef = {
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height
      },
      scaleFactor: display.scaleFactor
    };

    windowRef.setBounds(display.bounds, false);
    if (windowRef.isMinimized()) {
      windowRef.restore();
    }
    windowRef.show();
    windowRef.focus();
  }

  async function cancelRegionScreenshotCapture(): Promise<void> {
    if (!captureOverlayWindowRef || captureOverlayWindowRef.isDestroyed()) {
      captureOverlayDisplayContextRef = null;
      return;
    }

    captureOverlayWindowRef.hide();
    captureOverlayDisplayContextRef = null;
    await showCaptureLauncher();
  }

  function toAbsoluteSelection(selection: CaptureSelectionBounds): CaptureSelectionBounds {
    if (!captureOverlayDisplayContextRef) {
      throw new Error('Capture overlay display context is missing');
    }

    const normalizedWidth = Math.max(1, Math.round(selection.width));
    const normalizedHeight = Math.max(1, Math.round(selection.height));
    const normalizedX = Math.max(0, Math.round(selection.x));
    const normalizedY = Math.max(0, Math.round(selection.y));
    const displayContext = captureOverlayDisplayContextRef;

    return {
      x: Math.round((displayContext.bounds.x + normalizedX) * displayContext.scaleFactor),
      y: Math.round((displayContext.bounds.y + normalizedY) * displayContext.scaleFactor),
      width: Math.round(normalizedWidth * displayContext.scaleFactor),
      height: Math.round(normalizedHeight * displayContext.scaleFactor)
    };
  }

  async function executeRegionSelection(
    selection: CaptureSelectionBounds,
    behavior?: {
      saveToLibrary?: boolean;
      copyToClipboard?: boolean;
      forcePin?: boolean;
      skipAutoPin?: boolean;
    }
  ): Promise<void> {
    const absoluteRegion = toAbsoluteSelection(selection);
    const normalizedWidth = Math.max(1, Math.round(selection.width));
    const normalizedHeight = Math.max(1, Math.round(selection.height));

    captureOverlayWindowRef?.hide();
    await delay(120);
    await captureScreenshotAndPin(absoluteRegion, behavior);
    await rememberCaptureSize({
      width: normalizedWidth,
      height: normalizedHeight
    });
    captureOverlayDisplayContextRef = null;
    await showCaptureLauncher();
  }

  async function confirmRegionScreenshotCapture(selection: CaptureSelectionBounds): Promise<void> {
    await executeRegionSelection(selection);
  }

  async function confirmRegionScreenshotToClipboard(selection: CaptureSelectionBounds): Promise<void> {
    await executeRegionSelection(selection, {
      saveToLibrary: false,
      copyToClipboard: true
    });
  }

  async function confirmRegionScreenshotSaveOnly(selection: CaptureSelectionBounds): Promise<void> {
    await executeRegionSelection(selection, {
      saveToLibrary: true,
      copyToClipboard: false,
      skipAutoPin: true,
      forcePin: false
    });
  }

  async function confirmRegionScreenshotAndForcePin(selection: CaptureSelectionBounds): Promise<void> {
    await executeRegionSelection(selection, {
      saveToLibrary: true,
      copyToClipboard: false,
      forcePin: true
    });
  }

  async function confirmRegionScreenshotSaveAsFile(selection: CaptureSelectionBounds): Promise<void> {
    const absoluteRegion = toAbsoluteSelection(selection);
    const normalizedWidth = Math.max(1, Math.round(selection.width));
    const normalizedHeight = Math.max(1, Math.round(selection.height));

    captureOverlayWindowRef?.hide();
    await delay(120);
    try {
      const image = await captureImageForRegion(absoluteRegion);
      await saveScreenshotToFile(image);
    } catch (error) {
      console.error('[capture.saveAsFile] Failed to capture/save screenshot', error);
      await options.reportFailure('capture.screenshot.save', error);
    } finally {
      await rememberCaptureSize({
        width: normalizedWidth,
        height: normalizedHeight
      });
      captureOverlayDisplayContextRef = null;
      await showCaptureLauncher();
    }
  }

  function extractHexColorFromBitmap(bitmap: Buffer, offset = 0): string | null {
    if (!bitmap || bitmap.length < offset + 3) {
      return null;
    }
    // nativeImage bitmap is BGRA
    const b = bitmap[offset] ?? 0;
    const g = bitmap[offset + 1] ?? 0;
    const r = bitmap[offset + 2] ?? 0;
    return formatHexColor(r, g, b);
  }

  async function fallbackGetColorViaScreencapture(screenX: number, screenY: number): Promise<string> {
    const roundedX = Math.round(screenX);
    const roundedY = Math.round(screenY);
    const tempPath = path.join(os.tmpdir(), `pinstack-color-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    try {
      await execFileAsync('screencapture', ['-x', `-R${roundedX},${roundedY},1,1`, tempPath], {
        timeout: 1200
      });
      const image = nativeImage.createFromPath(tempPath);
      if (image.isEmpty()) {
        return '#------';
      }
      const bitmap = image.getBitmap();
      return extractHexColorFromBitmap(bitmap) ?? '#------';
    } catch {
      return '#------';
    } finally {
      try {
        await fs.rm(tempPath, { force: true });
      } catch {
        // ignore cleanup failures
      }
    }
  }

  function formatHexColor(r: number, g: number, b: number): string {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  }

  async function getDisplayBitmapSample(display: Display): Promise<{
    bitmap: Buffer;
    width: number;
    height: number;
    physicalBounds: { x: number; y: number; width: number; height: number };
  } | null> {
    const displayId = String(display.id);
    const physicalBounds = getDisplayPhysicalBounds(display);
    const now = Date.now();
    if (
      colorSampleCacheRef
      && colorSampleCacheRef.displayId === displayId
      && now - colorSampleCacheRef.capturedAt <= COLOR_SAMPLE_CACHE_TTL_MS
    ) {
      return {
        bitmap: colorSampleCacheRef.bitmap,
        width: colorSampleCacheRef.width,
        height: colorSampleCacheRef.height,
        physicalBounds: colorSampleCacheRef.physicalBounds
      };
    }

    const thumbnailSize = {
      width: Math.max(1, physicalBounds.width),
      height: Math.max(1, physicalBounds.height)
    };
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize,
      fetchWindowIcons: false
    });
    const source =
      sources.find((item) => item.display_id === displayId) ??
      sources.find((item) => item.display_id === '0') ??
      sources[0];
    if (!source || source.thumbnail.isEmpty()) {
      return null;
    }
    const bitmap = source.thumbnail.getBitmap();
    if (!bitmap || bitmap.length < 4) {
      return null;
    }

    colorSampleCacheRef = {
      displayId,
      bitmap,
      width: thumbnailSize.width,
      height: thumbnailSize.height,
      physicalBounds,
      capturedAt: now
    };
    return {
      bitmap,
      width: thumbnailSize.width,
      height: thumbnailSize.height,
      physicalBounds
    };
  }

  async function getColorAtPosition(screenX: number, screenY: number): Promise<string> {
    try {
      const point = {
        x: Math.round(screenX),
        y: Math.round(screenY)
      };
      const display = screen.getDisplayNearestPoint(point);
      const sample = await getDisplayBitmapSample(display);
      if (!sample) {
        const now = Date.now();
        if (now - lastColorFallbackAtRef < COLOR_FALLBACK_COOLDOWN_MS) {
          return lastColorSampleRef;
        }
        lastColorFallbackAtRef = now;
        const fallbackColor = await fallbackGetColorViaScreencapture(screenX, screenY);
        if (fallbackColor !== '#------') {
          lastColorSampleRef = fallbackColor;
        }
        return fallbackColor === '#------' ? lastColorSampleRef : fallbackColor;
      }

      const scale = display.scaleFactor || 1;
      const pixelX = Math.round(point.x * scale);
      const pixelY = Math.round(point.y * scale);
      const localX = Math.max(0, Math.min(sample.width - 1, pixelX - sample.physicalBounds.x));
      const localY = Math.max(0, Math.min(sample.height - 1, pixelY - sample.physicalBounds.y));
      const stride = sample.width * 4;
      const offset = localY * stride + localX * 4;
      const desktopColor = extractHexColorFromBitmap(sample.bitmap, offset);
      if (desktopColor) {
        lastColorSampleRef = desktopColor;
        return desktopColor;
      }
      const now = Date.now();
      if (now - lastColorFallbackAtRef < COLOR_FALLBACK_COOLDOWN_MS) {
        return lastColorSampleRef;
      }
      lastColorFallbackAtRef = now;
      const fallbackColor = await fallbackGetColorViaScreencapture(screenX, screenY);
      if (fallbackColor !== '#------') {
        lastColorSampleRef = fallbackColor;
      }
      return fallbackColor === '#------' ? lastColorSampleRef : fallbackColor;
    } catch (error) {
      const now = Date.now();
      if (now - lastColorFallbackAtRef < COLOR_FALLBACK_COOLDOWN_MS) {
        return lastColorSampleRef;
      }
      lastColorFallbackAtRef = now;
      const fallbackColor = await fallbackGetColorViaScreencapture(screenX, screenY);
      if (fallbackColor !== '#------') {
        lastColorSampleRef = fallbackColor;
        return fallbackColor;
      }
      console.error('[capture.colorPicker] Failed to get color at position', error);
      return lastColorSampleRef;
    }
  }

  // 节流函数
  function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function(this: any, ...args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  return {
    captureScreenshotAndPin,
    beginRegionScreenshotCapture,
    beginFixedSizeScreenshotCapture,
    beginRatioScreenshotCapture,
    confirmRegionScreenshotCapture,
    confirmRegionScreenshotToClipboard,
    confirmRegionScreenshotSaveOnly,
    confirmRegionScreenshotAndForcePin,
    confirmRegionScreenshotSaveAsFile,
    cancelRegionScreenshotCapture,
    getCaptureSelectionSession,
    toggleCaptureHubPanel,
    hideCaptureHubPanel,
    updateCaptureHubPanelHeight,
    getCaptureRecordingState,
    getCaptureLauncherVisualState,
    markCaptureRecordingStarted,
    markCaptureRecordingStopped,
    requestCaptureRecordingStop,
    saveCaptureRecording,
    beginCaptureLauncherDrag,
    updateCaptureLauncherDrag,
    endCaptureLauncherDrag,
    getScreenCapturePermissionState,
    getLastScreenshotAttemptDiagnostics,
    showCaptureLauncher,
    hideCaptureLauncher,
    repositionCaptureLauncherWindow,
    broadcastCaptureLauncherVisualState,
    getColorAtPosition,
    setHubOpenVisualState() {
      broadcastCaptureLauncherVisualState();
    },
    sendToastToHub(payload) {
      captureHubWindowRef?.webContents.send('app.toast', payload);
    },
    sendPermissionStatusToHub(snapshot) {
      captureHubWindowRef?.webContents.send('permissions.status.updated', snapshot);
    },
    handleDisplayMetricsChanged() {
      repositionCaptureLauncherWindow();
      if (captureHubWindowRef && !captureHubWindowRef.isDestroyed() && captureHubWindowRef.isVisible()) {
        positionCaptureHubWindow(captureHubWindowRef);
      }
    },
    destroy() {
      captureHubWindowRef?.destroy();
      captureHubWindowRef = null;
      captureLauncherWindowRef?.destroy();
      captureLauncherWindowRef = null;
      captureOverlayWindowRef?.destroy();
      captureOverlayWindowRef = null;
      captureLauncherDragStateRef = null;
      captureOverlayDisplayContextRef = null;
    }
  };
}
