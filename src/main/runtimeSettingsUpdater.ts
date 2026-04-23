/**
 * Runtime settings updater and mode toggle helpers.
 * Extracted from index.ts to reduce main-process entry size.
 */
import type { RuntimeSettings } from '../shared/types';
import type { AppContext } from './appContext';

export async function updateRuntimeSettings(
  ctx: AppContext,
  patch: Partial<RuntimeSettings>,
  options: { persist?: boolean } = {},
  stabilityProbe?: { info: (event: string, payload?: Record<string, unknown>) => void },
): Promise<RuntimeSettings> {
  const previousMode = ctx.runtimeSettings.mode;
  const shouldApplyWindowSize =
    Object.prototype.hasOwnProperty.call(patch, 'dashboardBounds') ||
    Object.prototype.hasOwnProperty.call(patch, 'dashboardSizePreset');
  const shouldApplyAlwaysOnTop = Object.prototype.hasOwnProperty.call(patch, 'dashboardAlwaysOnTop');

  ctx.runtimeSettings = {
    ...ctx.runtimeSettings,
    ...patch,
    capsule: patch.capsule
      ? {
          ...ctx.runtimeSettings.capsule,
          ...patch.capsule
        }
      : ctx.runtimeSettings.capsule
  };

  if (patch.rememberCaptureRecentSizes === false) {
    ctx.runtimeSettings.captureRecentSizes = [];
  }

  if (options.persist !== false) {
    ctx.runtimeSettings = await ctx.runtimeSettingsService.update(ctx.runtimeSettings);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'mode')) {
    if (!Object.prototype.hasOwnProperty.call(patch, 'pinBehaviorMode')) {
      if (patch.mode === 'off') {
        ctx.runtimeSettings.pinBehaviorMode = 'off';
      } else if (patch.mode === 'auto') {
        ctx.runtimeSettings.pinBehaviorMode = 'auto';
      }
    }
    ctx.tray.syncMode(ctx.runtimeSettings.mode);
    stabilityProbe?.info('mode.switch', {
      from: previousMode,
      to: ctx.runtimeSettings.mode
    });
  }

  if (shouldApplyWindowSize) {
    ctx.dashboardController.updateFromRuntime(ctx.runtimeSettings);
  }

  if (shouldApplyAlwaysOnTop) {
    ctx.dashboardController.getWindow()?.setAlwaysOnTop(ctx.runtimeSettings.dashboardAlwaysOnTop);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'enableCaptureLauncher')) {
    const captureController = ctx.captureController;
    if (captureController) {
      if (ctx.runtimeSettings.enableCaptureLauncher || captureController.getCaptureRecordingState().active) {
        void captureController.showCaptureLauncher(true).catch((error) => {
          console.error('[runtimeSettings] Failed to show capture launcher', error);
        });
      } else {
        captureController.hideCaptureHubPanel();
        captureController.hideCaptureLauncher();
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'capsule')) {
    ctx.capsuleController.updateFromRuntime(ctx.runtimeSettings);
  }

  return ctx.runtimeSettings;
}

export async function toggleRuntimeModePreset(
  ctx: AppContext,
  notifyUiToast: (message: string, level?: 'error' | 'warning' | 'info') => void,
): Promise<void> {
  if (ctx.runtimeSettings.pinBehaviorMode === 'auto') {
    await updateRuntimeSettings(ctx, {
      mode: 'auto',
      pinBehaviorMode: 'custom'
    });
    notifyUiToast('已切换为：自定义模式（按你的开关设置执行）', 'info');
    return;
  }

  if (ctx.runtimeSettings.pinBehaviorMode === 'custom') {
    await updateRuntimeSettings(ctx, {
      mode: 'off',
      pinBehaviorMode: 'off',
      enableImagePin: false,
      enableTextPin: false
    });
    notifyUiToast('已切换为：全部关闭（不再自动弹出）', 'info');
    return;
  }

  await updateRuntimeSettings(ctx, {
    mode: 'auto',
    pinBehaviorMode: 'auto',
    enableImagePin: true,
    enableTextPin: true
  });
  notifyUiToast('已切换为：自动弹出模式', 'info');
}

export async function applyTrayMode(ctx: AppContext, mode: RuntimeSettings['mode']): Promise<void> {
  if (mode === 'off') {
    await updateRuntimeSettings(ctx, {
      mode,
      pinBehaviorMode: 'off',
      enableImagePin: false,
      enableTextPin: false
    });
    return;
  }

  if (mode === 'silent') {
    await updateRuntimeSettings(ctx, {
      mode,
      pinBehaviorMode: 'custom'
    });
    return;
  }

  await updateRuntimeSettings(ctx, {
    mode,
    pinBehaviorMode: 'auto',
    enableImagePin: true,
    enableTextPin: true
  });
}

export async function cycleRuntimeModeFromTray(
  ctx: AppContext,
  notifyUiToast: (message: string, level?: 'error' | 'warning' | 'info') => void,
): Promise<void> {
  const currentMode = ctx.runtimeSettings.mode;
  const nextMode: RuntimeSettings['mode'] =
    currentMode === 'auto' ? 'silent' : currentMode === 'silent' ? 'off' : 'auto';
  await applyTrayMode(ctx, nextMode);
  const label = nextMode === 'auto' ? '自动' : nextMode === 'silent' ? '静默' : '关闭';
  notifyUiToast(`已切换托盘模式：${label}`, 'info');
}
