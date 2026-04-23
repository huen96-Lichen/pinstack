import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AppSettings, RuntimeSettings } from '../src/shared/types';
import { RuntimeSettingsService, SettingsService } from '../src/main/settings';
import { createDefaultAppSettings, DEFAULT_RUNTIME_SETTINGS } from '../src/shared/defaultSettings';

const defaultAppSettings: AppSettings = createDefaultAppSettings({
  storageRoot: '/tmp/pinstack',
  vaultkeeperProjectRoot: ''
});

const defaultRuntimeSettings: RuntimeSettings = {
  ...DEFAULT_RUNTIME_SETTINGS,
  captureRecentSizes: [...DEFAULT_RUNTIME_SETTINGS.captureRecentSizes]
};

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pinstack-settings-test-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('SettingsService init should persist defaults when file missing', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    const service = new SettingsService(settingsFile, defaultAppSettings);

    await service.init();
    assert.deepEqual(service.get(), defaultAppSettings);

    const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as {
      appSettings?: AppSettings;
      runtimeSettings?: RuntimeSettings;
    };

    assert.deepEqual(parsed.appSettings, defaultAppSettings);
    assert.equal(parsed.runtimeSettings, undefined);
  });
});

test('SettingsService update should keep runtimeSettings section untouched', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    const seededRuntime: RuntimeSettings = {
      ...defaultRuntimeSettings,
      mode: 'silent'
    };

    await writeFile(
      settingsFile,
      JSON.stringify({ runtimeSettings: seededRuntime }, null, 2),
      'utf8'
    );

    const service = new SettingsService(settingsFile, defaultAppSettings);
    await service.init();
    await service.update({ autoPin: false });

    const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as {
      appSettings?: AppSettings;
      runtimeSettings?: RuntimeSettings;
    };

    assert.equal(parsed.appSettings?.autoPin, false);
    assert.equal(parsed.runtimeSettings?.mode, 'silent');
  });
});

test('RuntimeSettingsService init should ignore invalid values and keep defaults', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    await writeFile(
      settingsFile,
      JSON.stringify({
        runtimeSettings: {
          mode: 'invalid-mode',
          uiMode: 'broken',
          dashboardSizePreset: 'huge'
        }
      }),
      'utf8'
    );

    const service = new RuntimeSettingsService(settingsFile, defaultRuntimeSettings);
    await service.init();

    const runtime = service.get();
    assert.equal(runtime.mode, 'auto');
    assert.equal(runtime.uiMode, 'modern');
    assert.equal(runtime.dashboardSizePreset, 'medium');
  });
});

test('RuntimeSettingsService update should keep appSettings section untouched', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    const seededApp = {
      ...defaultAppSettings,
      pollIntervalMs: 900
    };

    await writeFile(
      settingsFile,
      JSON.stringify({ appSettings: seededApp }, null, 2),
      'utf8'
    );

    const service = new RuntimeSettingsService(settingsFile, defaultRuntimeSettings);
    await service.init();
    await service.update({ enableFlowPin: false, uiMode: 'modern' });

    const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as {
      appSettings?: AppSettings;
      runtimeSettings?: RuntimeSettings;
    };

    assert.equal(parsed.runtimeSettings?.enableFlowPin, false);
    assert.equal(parsed.runtimeSettings?.uiMode, 'modern');
    assert.equal(parsed.appSettings?.pollIntervalMs, 900);
  });
});

test('RuntimeSettingsService should persist dashboard and capture preference fields consistently', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    const service = new RuntimeSettingsService(settingsFile, defaultRuntimeSettings);

    await service.init();
    await service.update({
      dashboardSizePreset: 'large',
      defaultCaptureSizePreset: 'custom',
      defaultCaptureCustomSize: {
        width: 1440,
        height: 900
      },
      showStatusHints: false
    });

    const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as {
      runtimeSettings?: RuntimeSettings;
    };

    assert.equal(parsed.runtimeSettings?.dashboardSizePreset, 'large');
    assert.equal(parsed.runtimeSettings?.defaultCaptureSizePreset, 'custom');
    assert.deepEqual(parsed.runtimeSettings?.defaultCaptureCustomSize, {
      width: 1440,
      height: 900
    });
    assert.equal(parsed.runtimeSettings?.showStatusHints, false);
  });
});

test('RuntimeSettingsService should persist capsule settings with partial update merge', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    const service = new RuntimeSettingsService(settingsFile, defaultRuntimeSettings);

    await service.init();
    await service.update({
      capsule: {
        enabled: true,
        surfaceMode: 'vibrant',
        anchorDisplayPolicy: 'primary-display',
        hoverEnabled: true,
        animationPreset: 'snappy',
        expandedAutoCollapseMs: 1800,
        balancedEntryOrder: ['ai', 'screenshot', 'workspace'],
        displayTitle: 'PinStack',
        quickApps: [],
        enabledModules: ['screenshot', 'ai', 'workspace'],
        showMusicContent: true
      }
    });
    await service.update({
      capsule: {
        ...service.get().capsule,
        hoverEnabled: false
      }
    });

    const parsed = JSON.parse(await readFile(settingsFile, 'utf8')) as {
      runtimeSettings?: RuntimeSettings;
    };

    assert.equal(parsed.runtimeSettings?.capsule.surfaceMode, 'vibrant');
    assert.equal(parsed.runtimeSettings?.capsule.anchorDisplayPolicy, 'primary-display');
    assert.equal(parsed.runtimeSettings?.capsule.hoverEnabled, false);
    assert.equal(parsed.runtimeSettings?.capsule.animationPreset, 'snappy');
    assert.deepEqual(parsed.runtimeSettings?.capsule.balancedEntryOrder, ['ai', 'screenshot', 'workspace']);
  });
});

test('SettingsService update should auto-swap conflicting shortcut assignment', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    const service = new SettingsService(settingsFile, defaultAppSettings);
    await service.init();

    const before = service.get();
    const next = await service.update({
      trayCycleModeShortcut: before.dashboardShortcut
    });

    assert.equal(next.trayCycleModeShortcut, before.dashboardShortcut);
    assert.equal(next.dashboardShortcut, before.trayCycleModeShortcut);
  });
});

test('SettingsService init should dedupe legacy duplicated shortcut settings and persist', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    await writeFile(
      settingsFile,
      JSON.stringify({
        appSettings: {
          ...defaultAppSettings,
          dashboardShortcut: 'CommandOrControl+Shift+P',
          screenshotShortcut: 'CommandOrControl+Shift+P',
          captureHubShortcut: 'CommandOrControl+Shift+P',
          modeToggleShortcut: 'CommandOrControl+Shift+P',
          trayOpenDashboardShortcut: 'CommandOrControl+Shift+P',
          trayCycleModeShortcut: 'CommandOrControl+Shift+P',
          trayQuitShortcut: 'CommandOrControl+Shift+P'
        }
      }),
      'utf8'
    );

    const service = new SettingsService(settingsFile, defaultAppSettings);
    await service.init();
    const next = service.get();
    const values = [
      next.dashboardShortcut,
      next.screenshotShortcut,
      next.captureHubShortcut,
      next.modeToggleShortcut,
      next.trayOpenDashboardShortcut,
      next.trayCycleModeShortcut,
      next.trayQuitShortcut
    ];
    const normalized = values.map((item) => item.replace(/\s+/g, '').toUpperCase());
    assert.equal(new Set(normalized).size, normalized.length);
  });
});

test('SettingsService should keep 7 shortcuts unique after sequential updates', async () => {
  await withTempDir(async (dir) => {
    const settingsFile = path.join(dir, 'settings.json');
    const service = new SettingsService(settingsFile, defaultAppSettings);
    await service.init();

    await service.update({ trayOpenDashboardShortcut: 'CommandOrControl+Shift+P' });
    await service.update({ trayCycleModeShortcut: 'CommandOrControl+Shift+P' });
    await service.update({ trayQuitShortcut: 'CommandOrControl+Shift+P' });

    const next = service.get();
    const values = [
      next.dashboardShortcut,
      next.screenshotShortcut,
      next.captureHubShortcut,
      next.modeToggleShortcut,
      next.trayOpenDashboardShortcut,
      next.trayCycleModeShortcut,
      next.trayQuitShortcut
    ];
    const normalized = values.map((item) => item.replace(/\s+/g, '').toUpperCase());
    assert.equal(new Set(normalized).size, normalized.length);
  });
});
