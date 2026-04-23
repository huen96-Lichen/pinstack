import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, RuntimeSettings } from '../../../../../shared/types';
import {
  createDefaultAppSettings,
  DEFAULT_RUNTIME_SETTINGS,
  DEFAULT_STORAGE_ROOT_PLACEHOLDER
} from '../../../../../shared/defaultSettings';

const defaultAppSettings: AppSettings = createDefaultAppSettings({
  storageRoot: DEFAULT_STORAGE_ROOT_PLACEHOLDER
});

const defaultRuntimeSettings: RuntimeSettings = {
  ...DEFAULT_RUNTIME_SETTINGS,
  captureRecentSizes: [...DEFAULT_RUNTIME_SETTINGS.captureRecentSizes]
};

export type SyncRuntimeSettings = (patch: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;

export { defaultAppSettings, defaultRuntimeSettings };

export function useDashboardSettings(): {
  appSettings: AppSettings;
  runtimeSettings: RuntimeSettings;
  syncRuntimeSettings: SyncRuntimeSettings;
  refreshSettings: () => Promise<void>;
  isHydrated: boolean;
} {
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(defaultRuntimeSettings);
  const [isHydrated, setIsHydrated] = useState(false);

  const syncRuntimeSettings = useCallback(async (patch: Partial<RuntimeSettings>) => {
    const next = await window.pinStack.settings.runtime.update(patch);
    setRuntimeSettings(next);
    return next;
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const [appRemote, runtimeRemote] = await Promise.all([
        window.pinStack.settings.get(),
        window.pinStack.settings.runtime.get()
      ]);

      setAppSettings(appRemote);
      setRuntimeSettings({
        ...defaultRuntimeSettings,
        ...runtimeRemote
      });
      setIsHydrated(true);
    } catch {
      // Keep defaults.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [appRemote, runtimeRemote] = await Promise.all([
          window.pinStack.settings.get(),
          window.pinStack.settings.runtime.get()
        ]);

        if (cancelled) {
          return;
        }

        setAppSettings(appRemote);
        setRuntimeSettings({
          ...defaultRuntimeSettings,
          ...runtimeRemote
        });
        setIsHydrated(true);
      } catch {
        // Keep defaults.
      }
    };

    void run();

    const handleSettingsUpdated = () => {
      void loadSettings();
    };

    window.addEventListener('pinstack-settings-updated', handleSettingsUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('pinstack-settings-updated', handleSettingsUpdated);
    };
  }, [loadSettings]);

  return {
    appSettings,
    runtimeSettings,
    syncRuntimeSettings,
    refreshSettings: loadSettings,
    isHydrated
  };
}
