import { useCallback, useEffect, useState } from 'react';
import type { RuntimeSettings } from '../../../../../shared/types';
import { getNextSizePreset } from '../dashboard.selectors';
import type { SyncRuntimeSettings } from './useDashboardSettings';

export function useDashboardTopBar(
  runtimeSettings: RuntimeSettings,
  syncRuntimeSettings: SyncRuntimeSettings
): {
  sidebarCollapsed: boolean;
  dashboardPinned: boolean;
  onToggleSidebar: () => void;
  onCycleSizePreset: () => Promise<void>;
  onToggleDashboardPinned: () => Promise<void>;
  onMinimizeDashboard: () => Promise<void>;
  onHideDashboard: () => Promise<void>;
} {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardPinned, setDashboardPinned] = useState(runtimeSettings.dashboardAlwaysOnTop);

  useEffect(() => {
    setDashboardPinned(runtimeSettings.dashboardAlwaysOnTop);
  }, [runtimeSettings.dashboardAlwaysOnTop]);

  useEffect(() => {
    let cancelled = false;

    const syncPinnedState = async () => {
      try {
        const pinned = await window.pinStack.dashboard.isAlwaysOnTop();
        if (!cancelled) {
          setDashboardPinned(pinned);
        }
      } catch {
        // Keep optimistic pinned state.
      }
    };

    void syncPinnedState();

    const onFocus = () => {
      void syncPinnedState();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const onCycleSizePreset = useCallback(async () => {
    const nextPreset = getNextSizePreset(runtimeSettings.dashboardSizePreset);
    await syncRuntimeSettings({
      dashboardSizePreset: nextPreset,
      dashboardBounds: undefined
    });
  }, [runtimeSettings.dashboardSizePreset, syncRuntimeSettings]);

  const onToggleDashboardPinned = useCallback(async () => {
    const next = await window.pinStack.dashboard.toggleAlwaysOnTop();
    await syncRuntimeSettings({ dashboardAlwaysOnTop: next });
    setDashboardPinned(next);
  }, [syncRuntimeSettings]);

  return {
    sidebarCollapsed,
    dashboardPinned,
    onToggleSidebar: () => setSidebarCollapsed((prev) => !prev),
    onCycleSizePreset,
    onToggleDashboardPinned,
    onMinimizeDashboard: async () => {
      await window.pinStack.dashboard.minimize();
    },
    onHideDashboard: async () => {
      await window.pinStack.dashboard.hide();
    }
  };
}
