// Settings IPC handlers
// Extracted from ipc.ts

import { dialog } from 'electron';
import type {
  AppSettings,
  LocalModelSettingsStatus,
  PinToggleSettings,
  RuntimeSettings,
} from '../../shared/types';
import { AppError } from '../errors';
import type { IpcDependencies, WrapFn } from '../ipc';

function registerSettingsHandlers(deps: IpcDependencies, wrap: WrapFn): void {
  wrap<undefined, AppSettings>('settings.get', async () => {
    return deps.settings.get();
  });

  wrap<Partial<AppSettings>, AppSettings>('settings.set', async (args) => {
    const patch: Partial<AppSettings> = {
      ...args,
      aiHub: args.aiHub ? { ...args.aiHub } : undefined
    };

    if (patch.aiHub && typeof patch.aiHub.cloudApiKey === 'string') {
      const provider = (patch.aiHub.cloudProvider || deps.settings.get().aiHub.cloudProvider || 'openai').trim();
      const secret = patch.aiHub.cloudApiKey.trim();
      if (secret) {
        await deps.setAiCloudApiKey(provider, secret);
      } else {
        await deps.clearAiCloudApiKey(provider);
      }
      patch.aiHub.cloudApiKey = undefined;
    }

    const next = await deps.settings.update(patch);
    await deps.onSettingsUpdated(next);
    return next;
  });

  wrap<undefined, string[]>('settings.scope.listApps', async () => {
    return deps.listRunningApps();
  });

  wrap<{ refreshPreflight?: boolean } | undefined, LocalModelSettingsStatus>('settings.localModel.status', async (args) => {
    return deps.getLocalModelStatus(args?.refreshPreflight);
  });

  wrap<{ model: string }, LocalModelSettingsStatus>('settings.localModel.model.set', async (args) => {
    return deps.setLocalModelName(args.model);
  });

  wrap<undefined, boolean>('settings.openStorageRoot', async () => {
    return deps.openStorageRoot();
  });

  wrap<{ url: string }, boolean>('settings.openExternalUrl', async (args) => {
    if (!args?.url?.trim()) {
      throw new AppError('INVALID_ARGUMENT', 'External URL is required');
    }
    return deps.openExternalUrl(args.url);
  });

  wrap<undefined, string | null>('settings.pickApp', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择应用',
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  wrap<{ appPath: string }, string | null>('settings.getAppIcon', async (args) => {
    // NOTE:
    // We intentionally disable runtime app icon extraction for stability.
    // Recent production crashes show SIGTRAP inside macOS icon pipeline
    // (NSImage/ISIcon path) when resolving file icons from Electron.
    // Returning null keeps UI functional via fallback glyphs and avoids app exit.
    if (!args?.appPath?.trim()) {
      return null;
    }
    return null;
  });

  wrap<undefined, PinToggleSettings>('settings.getToggle', async () => {
    const runtime = deps.getRuntimeSettings();
    return {
      enableImagePin: runtime.enableImagePin,
      enableTextPin: runtime.enableTextPin,
      enableFlowPin: runtime.enableFlowPin
    };
  });

  wrap<Partial<PinToggleSettings>, PinToggleSettings>('settings.update', async (args) => {
    const patch: Partial<RuntimeSettings> = {};
    if (typeof args.enableImagePin === 'boolean') {
      patch.enableImagePin = args.enableImagePin;
    }
    if (typeof args.enableTextPin === 'boolean') {
      patch.enableTextPin = args.enableTextPin;
    }
    if (typeof args.enableFlowPin === 'boolean') {
      patch.enableFlowPin = args.enableFlowPin;
    }

    const next = await deps.updateRuntimeSettings(patch);
    return {
      enableImagePin: next.enableImagePin,
      enableTextPin: next.enableTextPin,
      enableFlowPin: next.enableFlowPin
    };
  });

  wrap<undefined, RuntimeSettings>('settings.runtime.get', async () => {
    return deps.getRuntimeSettings();
  });

  wrap<Partial<RuntimeSettings>, RuntimeSettings>('settings.runtime.update', async (args) => {
    return deps.updateRuntimeSettings(args);
  });
}

export { registerSettingsHandlers };
