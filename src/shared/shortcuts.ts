import type { AppSettings } from './types';

export type ConfigurableShortcutKey =
  | 'dashboardShortcut'
  | 'screenshotShortcut'
  | 'captureHubShortcut'
  | 'modeToggleShortcut'
  | 'trayOpenDashboardShortcut'
  | 'trayCycleModeShortcut'
  | 'trayQuitShortcut';

export type ShortcutSettings = Pick<AppSettings, ConfigurableShortcutKey>;

export const CONFIGURABLE_SHORTCUT_KEYS: ConfigurableShortcutKey[] = [
  'dashboardShortcut',
  'screenshotShortcut',
  'captureHubShortcut',
  'modeToggleShortcut',
  'trayOpenDashboardShortcut',
  'trayCycleModeShortcut',
  'trayQuitShortcut'
];

export const SHORTCUT_SETTING_LABELS: Record<ConfigurableShortcutKey, string> = {
  dashboardShortcut: '打开 / 关闭面板',
  screenshotShortcut: '快速截图',
  captureHubShortcut: '打开截图面板',
  modeToggleShortcut: '切换运行模式',
  trayOpenDashboardShortcut: '托盘：打开工作台',
  trayCycleModeShortcut: '托盘：切换模式',
  trayQuitShortcut: '托盘：退出 PinStack'
};

export const SHORTCUT_STATUS_LABELS: Record<ConfigurableShortcutKey, string> = {
  dashboardShortcut: '控制面板',
  screenshotShortcut: '截图',
  captureHubShortcut: '截图面板',
  modeToggleShortcut: '运行模式',
  trayOpenDashboardShortcut: '托盘打开工作台',
  trayCycleModeShortcut: '托盘切换模式',
  trayQuitShortcut: '托盘退出应用'
};

const FALLBACK_SHORTCUT_CANDIDATES = [
  'CommandOrControl+Shift+1',
  'CommandOrControl+Shift+P',
  'CommandOrControl+Shift+2',
  'CommandOrControl+Shift+M',
  'CommandOrControl+Shift+D',
  'CommandOrControl+Shift+R',
  'CommandOrControl+Shift+Q',
  'CommandOrControl+Shift+3',
  'CommandOrControl+Shift+4',
  'CommandOrControl+Shift+5',
  'CommandOrControl+Shift+6',
  'CommandOrControl+Shift+7',
  'CommandOrControl+Shift+8',
  'CommandOrControl+Shift+9',
  'CommandOrControl+Shift+0',
  'CommandOrControl+Shift+A',
  'CommandOrControl+Shift+B',
  'CommandOrControl+Shift+C',
  'CommandOrControl+Shift+E',
  'CommandOrControl+Shift+F',
  'CommandOrControl+Shift+G',
  'CommandOrControl+Shift+H',
  'CommandOrControl+Shift+I',
  'CommandOrControl+Shift+J',
  'CommandOrControl+Shift+K',
  'CommandOrControl+Shift+L',
  'CommandOrControl+Shift+N',
  'CommandOrControl+Shift+O',
  'CommandOrControl+Shift+S',
  'CommandOrControl+Shift+T',
  'CommandOrControl+Shift+U',
  'CommandOrControl+Shift+W',
  'CommandOrControl+Shift+X',
  'CommandOrControl+Shift+Y',
  'CommandOrControl+Shift+Z'
];

export function normalizeShortcutForCompare(shortcut: string): string {
  return shortcut.replace(/\s+/g, '').toUpperCase();
}

export function isLegacyRetiredCaptureHubShortcut(shortcut: string): boolean {
  const normalized = normalizeShortcutForCompare(shortcut);
  return normalized === 'COMMANDORCONTROL+SHIFT+V' || normalized === 'CMDORCTRL+SHIFT+V' || normalized === 'COMMAND+SHIFT+V';
}

export function sanitizeShortcutByKey(key: ConfigurableShortcutKey, shortcut: string | undefined): string | undefined {
  if (!shortcut) {
    return shortcut;
  }
  if (key === 'captureHubShortcut' && isLegacyRetiredCaptureHubShortcut(shortcut)) {
    return '';
  }
  return shortcut;
}

export function pickShortcutSettings(source: Partial<AppSettings>): Partial<ShortcutSettings> {
  const picked: Partial<ShortcutSettings> = {};
  for (const key of CONFIGURABLE_SHORTCUT_KEYS) {
    const value = source[key];
    if (typeof value === 'string') {
      picked[key] = value;
    }
  }
  return picked;
}

export function getShortcutSettings(source: AppSettings): ShortcutSettings {
  return {
    dashboardShortcut: source.dashboardShortcut,
    screenshotShortcut: source.screenshotShortcut,
    captureHubShortcut: source.captureHubShortcut,
    modeToggleShortcut: source.modeToggleShortcut,
    trayOpenDashboardShortcut: source.trayOpenDashboardShortcut,
    trayCycleModeShortcut: source.trayCycleModeShortcut,
    trayQuitShortcut: source.trayQuitShortcut
  };
}

function chooseFirstAvailableShortcut(
  key: ConfigurableShortcutKey,
  defaults: ShortcutSettings,
  usedNormalized: Set<string>
): string {
  const candidates = [defaults[key], ...FALLBACK_SHORTCUT_CANDIDATES];
  for (const candidate of candidates) {
    const sanitized = sanitizeShortcutByKey(key, candidate)?.trim() ?? '';
    if (!sanitized) {
      continue;
    }
    const normalized = normalizeShortcutForCompare(sanitized);
    if (!usedNormalized.has(normalized)) {
      return sanitized;
    }
  }
  return '';
}

export function dedupeShortcutSettings(input: ShortcutSettings, defaults: ShortcutSettings): ShortcutSettings {
  const output = { ...input };
  const usedNormalized = new Set<string>();

  for (const key of CONFIGURABLE_SHORTCUT_KEYS) {
    const rawValue = output[key];
    const sanitized = sanitizeShortcutByKey(key, output[key])?.trim() ?? '';
    const migratedLegacyCaptureHub =
      key === 'captureHubShortcut' &&
      typeof rawValue === 'string' &&
      rawValue.trim().length > 0 &&
      isLegacyRetiredCaptureHubShortcut(rawValue);
    if (!sanitized) {
      if (migratedLegacyCaptureHub) {
        const fallback = chooseFirstAvailableShortcut(key, defaults, usedNormalized);
        output[key] = fallback;
        if (fallback) {
          usedNormalized.add(normalizeShortcutForCompare(fallback));
        }
      } else {
        output[key] = '';
      }
      continue;
    }

    const normalized = normalizeShortcutForCompare(sanitized);
    if (!usedNormalized.has(normalized)) {
      output[key] = sanitized;
      usedNormalized.add(normalized);
      continue;
    }

    const fallback = chooseFirstAvailableShortcut(key, defaults, usedNormalized);
    output[key] = fallback;
    if (fallback) {
      usedNormalized.add(normalizeShortcutForCompare(fallback));
    }
  }

  return output;
}

export function resolveShortcutSettingsWithSwap(
  current: ShortcutSettings,
  patch: Partial<ShortcutSettings>,
  defaults: ShortcutSettings
): ShortcutSettings {
  const next: ShortcutSettings = {
    ...current,
    ...patch
  };

  const touched = CONFIGURABLE_SHORTCUT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(patch, key));
  if (touched.length === 1) {
    const targetKey = touched[0];
    const nextTargetValue = sanitizeShortcutByKey(targetKey, next[targetKey])?.trim() ?? '';
    const nextTargetNormalized = nextTargetValue ? normalizeShortcutForCompare(nextTargetValue) : '';

    if (nextTargetNormalized) {
      const conflictKey = CONFIGURABLE_SHORTCUT_KEYS.find((key) => {
        if (key === targetKey) {
          return false;
        }
        const candidate = sanitizeShortcutByKey(key, next[key])?.trim() ?? '';
        return candidate ? normalizeShortcutForCompare(candidate) === nextTargetNormalized : false;
      });

      if (conflictKey) {
        const previousTargetValue = sanitizeShortcutByKey(targetKey, current[targetKey])?.trim() ?? '';
        next[conflictKey] = previousTargetValue;
      }
    }
  }

  return dedupeShortcutSettings(next, defaults);
}
