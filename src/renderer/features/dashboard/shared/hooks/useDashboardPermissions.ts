import { useCallback, useEffect, useState } from 'react';
import type { PermissionCheckSource, PermissionStatusSnapshot } from '../../../../../shared/types';

export function useDashboardPermissions(): {
  permissionStatus: PermissionStatusSnapshot | null;
  loadPermissionStatus: () => Promise<void>;
} {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatusSnapshot | null>(null);

  const fetchPermissionStatus = useCallback(async (source: PermissionCheckSource) => {
    try {
      const snapshot = await window.pinStack.permissions.getStatus(source);
      setPermissionStatus(snapshot);
    } catch {
      // Ignore permission status errors.
    }
  }, []);

  const loadPermissionStatus = useCallback(async () => {
    await fetchPermissionStatus('manual-refresh');
  }, [fetchPermissionStatus]);

  useEffect(() => {
    void fetchPermissionStatus('renderer-query');
    const handleSettingsUpdated = () => {
      void fetchPermissionStatus('refresh');
    };
    const handleFocus = () => {
      void fetchPermissionStatus('focus');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchPermissionStatus('focus');
      }
    };
    const unsubscribePermissionUpdate = window.pinStack.permissions.onStatusUpdated((snapshot) => {
      setPermissionStatus(snapshot);
    });
    window.addEventListener('pinstack-settings-updated', handleSettingsUpdated);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pinstack-settings-updated', handleSettingsUpdated);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribePermissionUpdate();
    };
  }, [fetchPermissionStatus]);

  return {
    permissionStatus,
    loadPermissionStatus
  };
}
