import { buildPermissionStatusSnapshot, getPermissionSettingsPathHint, openPermissionSettings, type PermissionAppMetadata, type ShortcutRegistrationStatus } from './permissions';
import type { PermissionCheckSource, PermissionSettingsTarget, PermissionStatusSnapshot } from '../shared/types';
import { logTelemetry } from './telemetry';

export interface PermissionCoordinatorOptions {
  cacheDurationMs?: number;
  getShortcutRegistrationStatus: () => ShortcutRegistrationStatus;
  getPermissionAppMeta: () => PermissionAppMetadata;
  onSnapshotUpdated?: (
    snapshot: PermissionStatusSnapshot,
    meta: { traceId?: string; source: PermissionCheckSource }
  ) => void;
}

export interface PermissionCoordinator {
  getPermissionStatus: (source: PermissionCheckSource, traceId?: string) => Promise<PermissionStatusSnapshot>;
  openPermissionSettings: (target: PermissionSettingsTarget, traceId?: string) => Promise<boolean>;
}

export function createPermissionCoordinator(options: PermissionCoordinatorOptions): PermissionCoordinator {
  const cacheDurationMs = options.cacheDurationMs ?? 10000;

  let permissionStatusSnapshot: PermissionStatusSnapshot | null = null;
  let permissionCacheTimestamp = 0;
  let awaitingPermissionSettingsReturn = false;
  const permissionSettingsOpenedAt: Partial<Record<PermissionSettingsTarget, number>> = {};

  function resolveEffectiveSource(source: PermissionCheckSource): PermissionCheckSource {
    if (!awaitingPermissionSettingsReturn) {
      return source;
    }

    if (source === 'renderer-query' || source === 'activate' || source === 'focus') {
      awaitingPermissionSettingsReturn = false;
      return 'settings-return';
    }

    return source;
  }

  async function getPermissionStatus(source: PermissionCheckSource, traceId?: string): Promise<PermissionStatusSnapshot> {
    const now = Date.now();
    if (permissionStatusSnapshot && now - permissionCacheTimestamp < cacheDurationMs && source !== 'manual-refresh') {
      return permissionStatusSnapshot;
    }

    const effectiveSource = resolveEffectiveSource(source);

    const snapshot = await buildPermissionStatusSnapshot(options.getShortcutRegistrationStatus(), {
      source: effectiveSource,
      settingsOpenedAt: permissionSettingsOpenedAt,
      app: options.getPermissionAppMeta()
    });

    permissionStatusSnapshot = snapshot;
    permissionCacheTimestamp = now;
    options.onSnapshotUpdated?.(snapshot, { traceId, source: effectiveSource });
    return snapshot;
  }

  async function openSettingsWithTracking(target: PermissionSettingsTarget, traceId?: string): Promise<boolean> {
    permissionSettingsOpenedAt[target] = Date.now();
    awaitingPermissionSettingsReturn = true;

    logTelemetry('permissions.settings.open.requested', {
      target,
      pathHint: getPermissionSettingsPathHint(target),
      traceId: traceId ?? null
    });

    const opened = await openPermissionSettings(target);
    if (!opened) {
      awaitingPermissionSettingsReturn = false;
    }

    logTelemetry('permissions.settings.open.result', {
      target,
      success: opened,
      pathHint: getPermissionSettingsPathHint(target),
      traceId: traceId ?? null
    });
    return opened;
  }

  return {
    getPermissionStatus,
    openPermissionSettings: openSettingsWithTracking
  };
}
