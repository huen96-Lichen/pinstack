import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultAppSettings } from '../src/shared/defaultSettings';
import {
  dedupeShortcutSettings,
  getShortcutSettings,
  isLegacyRetiredCaptureHubShortcut,
  resolveShortcutSettingsWithSwap
} from '../src/shared/shortcuts';

const defaults = createDefaultAppSettings({
  storageRoot: '/tmp/pinstack',
  vaultkeeperProjectRoot: ''
});

test('resolveShortcutSettingsWithSwap should swap target with conflicting shortcut', () => {
  const current = getShortcutSettings(defaults);
  const resolved = resolveShortcutSettingsWithSwap(
    current,
    {
      trayCycleModeShortcut: current.dashboardShortcut
    },
    current
  );

  assert.equal(resolved.trayCycleModeShortcut, current.dashboardShortcut);
  assert.equal(resolved.dashboardShortcut, current.trayCycleModeShortcut);
});

test('dedupeShortcutSettings should remove duplicates and keep all shortcut values unique', () => {
  const current = getShortcutSettings(defaults);
  const deduped = dedupeShortcutSettings(
    {
      ...current,
      trayOpenDashboardShortcut: current.dashboardShortcut,
      trayCycleModeShortcut: current.dashboardShortcut,
      trayQuitShortcut: current.dashboardShortcut
    },
    current
  );

  const values = Object.values(deduped).filter((item) => item.trim().length > 0);
  const normalized = values.map((item) => item.replace(/\s+/g, '').toUpperCase());
  assert.equal(new Set(normalized).size, normalized.length);
});

test('legacy capture hub shortcut should be recognized and retired', () => {
  assert.equal(isLegacyRetiredCaptureHubShortcut('CommandOrControl+Shift+V'), true);
  assert.equal(isLegacyRetiredCaptureHubShortcut('CommandOrControl+Shift+2'), false);
});

