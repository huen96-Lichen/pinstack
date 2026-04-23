import { clipboard, ipcMain } from 'electron';
import type {
  CaptureRatioOption,
  CaptureSelectionBounds,
  CaptureSizeOption,
  PermissionStatusSnapshot,
} from '../../shared/types';
import { AppError } from '../errors';
import type { IpcDependencies, WrapFn } from '../ipc';
import { createWrapFn } from '../ipc';

function registerCaptureHandlers(deps: IpcDependencies, wrap: WrapFn): void {
  const cc = deps.captureController;

  wrap<undefined, boolean>('capture.start', async () => {
    deps.watcher.start();
    return true;
  });

  wrap<undefined, boolean>('capture.stop', async () => {
    deps.watcher.stop();
    return true;
  });

  wrap<{ count?: number } | undefined, boolean>('capture.ignoreNextCopy', async (args) => {
    deps.watcher.ignoreNextCopy(args?.count);
    return true;
  });

  wrap<undefined, boolean>('capture.toggleHub', async () => {
    await cc.toggleCaptureHubPanel();
    return true;
  });

  wrap<undefined, boolean>('capture.hideHub', async () => {
    cc.hideCaptureHubPanel();
    return true;
  });

  ipcMain.on('capture.hub.height', (_event, args: { height: number }) => {
    cc.updateCaptureHubPanelHeight(args.height);
  });

  wrap<undefined, boolean>('capture.takeScreenshot', async () => {
    await cc.beginRegionScreenshotCapture({ mode: 'free', size: null });
    return true;
  });

  wrap<CaptureSizeOption, boolean>('capture.takeFixedScreenshot', async (args) => {
    await cc.beginFixedSizeScreenshotCapture(args);
    return true;
  });

  wrap<CaptureRatioOption, boolean>('capture.takeRatioScreenshot', async (args) => {
    await cc.beginRatioScreenshotCapture(args);
    return true;
  });

  wrap<CaptureSelectionBounds, boolean>('capture.takeRegionScreenshot', async (args) => {
    await cc.confirmRegionScreenshotCapture(args);
    deps.onRecordsChanged();
    return true;
  });

  wrap<CaptureSelectionBounds, boolean>('capture.takeRegionScreenshot.copy', async (args) => {
    await cc.confirmRegionScreenshotToClipboard(args);
    deps.onRecordsChanged();
    return true;
  });

  wrap<CaptureSelectionBounds, boolean>('capture.takeRegionScreenshot.save', async (args) => {
    await cc.confirmRegionScreenshotSaveOnly(args);
    deps.onRecordsChanged();
    return true;
  });

  wrap<CaptureSelectionBounds, boolean>('capture.takeRegionScreenshot.pin', async (args) => {
    await cc.confirmRegionScreenshotAndForcePin(args);
    deps.onRecordsChanged();
    return true;
  });

  wrap<CaptureSelectionBounds, boolean>('capture.takeRegionScreenshot.saveAs', async (args) => {
    await cc.confirmRegionScreenshotSaveAsFile(args);
    deps.onRecordsChanged();
    return true;
  });

  wrap<undefined, boolean>('capture.cancelRegionScreenshot', async () => {
    await cc.cancelRegionScreenshotCapture();
    return true;
  });

  wrap<{ x: number; y: number }, string>('capture.getColorAtPosition', async (args) => {
    return cc.getColorAtPosition(args.x, args.y);
  });

  wrap<{ kind: 'text' | 'image' }, boolean>('capture.debugCaptureNow', async (args) => {
    if (args?.kind === 'text') {
      const text = clipboard.readText();
      if (!text.trim()) {
        throw new AppError('INVALID_ARGUMENT', 'Clipboard text is empty');
      }
      const record = await deps.storage.createTextRecord(text);
      await deps.pinManager.createPinWindow(record);
      deps.onRecordsChanged();
      return true;
    }

    const image = clipboard.readImage();
    const record = await deps.storage.createImageRecord(image);
    await deps.pinManager.createPinWindow(record);
    deps.onRecordsChanged();
    return true;
  });

  // Capture session / recording / launcher state
  wrap<undefined, import('../../shared/types').CaptureSessionConfig>('capture.selectionSession.get', async () => {
    return cc.getCaptureSelectionSession();
  });

  wrap<undefined, import('../../shared/types').CaptureRecordingState>('capture.recording.state.get', async () => {
    return cc.getCaptureRecordingState();
  });

  wrap<undefined, import('../../shared/types').CaptureLauncherVisualState>('capture.launcher.visualState.get', async () => {
    return cc.getCaptureLauncherVisualState();
  });

  wrap<undefined, PermissionStatusSnapshot['items'][number]['state']>('capture.screenPermission.get', async () => {
    return cc.getScreenCapturePermissionState();
  });

  wrap<undefined, import('../../shared/types').ScreenshotAttemptDiagnostics | null>('capture.screenshotDiagnostics.get', async () => {
    return cc.getLastScreenshotAttemptDiagnostics();
  });

  wrap<undefined, boolean>('capture.recording.markStarted', async () => {
    cc.markCaptureRecordingStarted();
    return true;
  });

  wrap<undefined, boolean>('capture.recording.markStopped', async () => {
    cc.markCaptureRecordingStopped();
    return true;
  });

  wrap<{ bytes: Uint8Array; mimeType?: string | null }, string>('capture.recording.save', async (args) => {
    return cc.saveCaptureRecording(args);
  });

  ipcMain.on('capture.recording.stopRequest', () => {
    cc.requestCaptureRecordingStop();
  });

  ipcMain.on('capture.launcher.drag.start', (_event, args: { screenX: number; screenY: number }) => {
    cc.beginCaptureLauncherDrag(args.screenX, args.screenY);
  });

  ipcMain.on('capture.launcher.drag.move', (_event, args: { screenX: number; screenY: number }) => {
    cc.updateCaptureLauncherDrag(args.screenX, args.screenY);
  });

  wrap<{ screenX?: number; screenY?: number } | undefined, boolean>('capture.launcher.drag.end', async (args) => {
    await cc.endCaptureLauncherDrag(args?.screenX, args?.screenY);
    return true;
  });
}

export { registerCaptureHandlers };
