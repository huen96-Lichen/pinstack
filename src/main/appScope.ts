import type { AppSettings } from '../shared/types';

export function normalizeAppScopeValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isAppWithinScope(settings: Pick<AppSettings, 'scopeMode' | 'scopedApps'>, appName: string | null | undefined): boolean {
  if (settings.scopeMode === 'global') {
    return true;
  }

  const normalized = normalizeAppScopeValue(appName);
  const scopedApps = new Set(settings.scopedApps.map((item) => normalizeAppScopeValue(item)).filter(Boolean));
  if (!normalized) {
    return settings.scopeMode !== 'whitelist';
  }

  if (settings.scopeMode === 'blacklist') {
    return !scopedApps.has(normalized);
  }

  return scopedApps.has(normalized);
}
