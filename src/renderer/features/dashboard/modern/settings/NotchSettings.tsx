import { useCallback, useEffect, useState } from 'react';
import { ToggleSwitch } from '../../../../ToggleSwitch';
import { SettingsSection, SettingRow } from './GeneralSettings';
import { EmptyState } from '../../../../design-system/primitives';
import type { RuntimeSettings, QuickAppConfig, CapsuleAnchorDisplayPolicy } from '../../../../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toggleModule(modules: string[], mod: string): string[] {
  return modules.includes(mod) ? modules.filter(m => m !== mod) : [...modules, mod];
}

function addQuickApp(apps: QuickAppConfig[]): QuickAppConfig[] {
  return [...apps, {
    id: `app_${Date.now()}`,
    name: '',
    icon: 'app.fill',
    appPath: '',
    actionType: 'app',
    actionValue: ''
  }];
}

function removeQuickApp(apps: QuickAppConfig[], id: string): QuickAppConfig[] {
  return apps.filter(a => a.id !== id);
}

function updateQuickApp(apps: QuickAppConfig[], id: string, patch: Partial<QuickAppConfig>): QuickAppConfig[] {
  return apps.map(a => a.id === id ? { ...a, ...patch } : a);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NotchSettingsProps {
  localRuntimeSettings: RuntimeSettings;
  updateRuntimeSettings: (patch: Partial<RuntimeSettings>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotchSettings({ localRuntimeSettings, updateRuntimeSettings }: NotchSettingsProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});

  const capsule = localRuntimeSettings.capsule;
  const quickApps = capsule.quickApps ?? [];
  const enabledModules = capsule.enabledModules ?? ['screenshot', 'ai', 'workspace'];
  const displayTitle = capsule.displayTitle ?? 'PinStack';

  // Load icons for all quick apps that have an appPath
  const loadAppIcons = useCallback(async (apps: QuickAppConfig[]) => {
    const paths = apps.filter(a => a.appPath);
    if (paths.length === 0) return;
    const newIcons: Record<string, string> = {};
    for (const app of paths) {
      try {
        const icon = await (window.pinStack as unknown as { settings?: { getAppIcon?: (path: string) => Promise<string | null> } }).settings?.getAppIcon?.(app.appPath);
        if (icon) newIcons[app.id] = icon;
      } catch { /* ignore */ }
    }
    setAppIcons(prev => ({ ...prev, ...newIcons }));
  }, []);

  useEffect(() => {
    void loadAppIcons(quickApps);
  }, [quickApps, loadAppIcons]);

  const updateCapsule = (patch: Partial<RuntimeSettings['capsule']>) => {
    void updateRuntimeSettings({
      capsule: {
        ...capsule,
        ...patch
      }
    });
  };

  const selectApp = async (appId: string) => {
    const result = await (window.pinStack as unknown as { settings?: { pickApp?: () => Promise<string | null> } }).settings?.pickApp?.();
    if (result) {
      const appName = result.split('/').pop()?.replace('.app', '') ?? '';
      const apps = updateQuickApp(quickApps, appId, {
        appPath: result,
        actionValue: result,
        name: appName
      });
      updateCapsule({ quickApps: apps });
    }
  };

  const collapseSeconds = (capsule.expandedAutoCollapseMs / 1000).toFixed(1);

  return (
    <>
      <SettingsSection title="基本设置">
        <SettingRow title="启用菜单栏胶囊" description="在屏幕顶部显示 PinStack 菜单栏胶囊。">
          <ToggleSwitch
            checked={capsule.enabled}
            onChange={(value) => updateCapsule({ enabled: value })}
          />
        </SettingRow>
        <SettingRow title="显示名称" description="收起时显示的文字。">
          <input
            className="pinstack-field motion-interactive h-9 w-44 px-3 text-[13px]"
            value={displayTitle}
            onChange={(e) => updateCapsule({ displayTitle: e.target.value })}
          />
        </SettingRow>
        <SettingRow title="显示音乐内容" description="收缩胶囊显示当前播放的音乐信息。">
          <ToggleSwitch
            checked={capsule.showMusicContent ?? true}
            onChange={(value) => updateCapsule({ showMusicContent: value })}
          />
        </SettingRow>
        <SettingRow title="显示桌面" description="选择胶囊出现的桌面。">
          <select
            className="pinstack-field motion-interactive h-9 w-44 px-3 text-[13px] pinstack-field-select"
            value={capsule.anchorDisplayPolicy ?? 'all-spaces'}
            onChange={(e) => updateCapsule({ anchorDisplayPolicy: e.target.value as CapsuleAnchorDisplayPolicy })}
          >
            <option value="all-spaces">所有桌面</option>
            <option value="active-display">当前活动桌面</option>
            <option value="primary-display">仅主显示器</option>
          </select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="交互行为">
        <SettingRow title="悬停展开" description="鼠标悬停时自动展开。">
          <ToggleSwitch
            checked={capsule.hoverEnabled}
            onChange={(value) => updateCapsule({ hoverEnabled: value })}
          />
        </SettingRow>
        {capsule.hoverEnabled && (
          <SettingRow title="自动收起" description={`展开后 ${collapseSeconds} 秒无操作自动收起。`}>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="settings-slider w-28"
                value={capsule.expandedAutoCollapseMs}
                step={200}
                min={500}
                max={8000}
                onChange={(e) => updateCapsule({ expandedAutoCollapseMs: Number(e.target.value) })}
              />
              <span className="w-10 text-right text-[12px] tabular-nums text-[color:var(--ps-text-secondary)]">
                {collapseSeconds}s
              </span>
            </div>
          </SettingRow>
        )}
      </SettingsSection>

      <SettingsSection title="功能模块">
        <SettingRow title="截图入口" description="展开菜单中显示截图快捷按钮。">
          <ToggleSwitch
            checked={enabledModules.includes('screenshot')}
            onChange={(value) => updateCapsule({ enabledModules: toggleModule(enabledModules, 'screenshot') })}
          />
        </SettingRow>
        <SettingRow title="AI 助手" description="展开菜单中显示 AI 助手快捷按钮。">
          <ToggleSwitch
            checked={enabledModules.includes('ai')}
            onChange={(value) => updateCapsule({ enabledModules: toggleModule(enabledModules, 'ai') })}
          />
        </SettingRow>
        <SettingRow title="工作区" description="展开菜单中显示工作区快捷按钮。">
          <ToggleSwitch
            checked={enabledModules.includes('workspace')}
            onChange={(value) => updateCapsule({ enabledModules: toggleModule(enabledModules, 'workspace') })}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="快捷应用" description="点击「选择」从 Applications 文件夹中挑选应用">
        <SettingRow title="显示快捷应用栏" description="在胶囊展开后顶部显示快捷应用图标。有刘海的 MacBook Pro 会自动隐藏中间栏，仅在左右各显示一个图标。">
          <ToggleSwitch
            checked={capsule.showQuickApps ?? true}
            onChange={(value) => updateCapsule({ showQuickApps: value })}
          />
        </SettingRow>
        {(capsule.showQuickApps ?? true) && (
        <div className="pt-1">
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[12px]"
              onClick={() => {
                const newApps = addQuickApp(quickApps);
                updateCapsule({ quickApps: newApps });
                setEditingId(newApps[newApps.length - 1].id);
              }}
            >
              + 添加
            </button>
          </div>

          {quickApps.length === 0 ? (
            <EmptyState
              icon="⚙"
              title="还没有快捷应用"
              description="点击上方「+ 添加」开始配置"
            />
          ) : (
            <div className="space-y-1.5">
              {quickApps.map((app) => (
                <div
                  key={app.id}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                    editingId === app.id
                      ? 'border-[color:var(--ps-accent)] bg-[color:var(--ps-accent)]/5'
                      : 'border-[color:var(--ps-border-subtle)] hover:border-[color:var(--ps-text-tertiary)]'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[color:var(--ps-accent)]/10 text-[14px]">
                    {appIcons[app.id] ? (
                      <img src={appIcons[app.id]} alt={app.name} className="h-7 w-7 rounded-[4px] object-cover" />
                    ) : (
                      <span>⚡</span>
                    )}
                  </div>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[color:var(--ps-text-primary)] outline-none placeholder:text-[color:var(--ps-text-tertiary)]"
                    placeholder="输入应用名称"
                    value={app.name}
                    onChange={(e) => updateCapsule({ quickApps: updateQuickApp(quickApps, app.id, { name: e.target.value }) })}
                    onFocus={() => setEditingId(app.id)}
                  />
                  {app.appPath ? (
                    <span className="hidden max-w-[140px] truncate text-[11px] text-[color:var(--ps-text-tertiary)] sm:block">
                      {app.appPath.split('/').slice(-2).join('/')}
                    </span>
                  ) : (
                    <span className="hidden text-[11px] text-[color:var(--ps-text-tertiary)] sm:block">
                      未配置
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[11px] text-[color:var(--ps-accent)] opacity-0 transition-opacity hover:bg-[color:var(--ps-accent)]/10 group-hover:opacity-100"
                      onClick={() => void selectApp(app.id)}
                      title="选择应用"
                    >
                      选择
                    </button>
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[11px] text-red-400 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                      onClick={() => updateCapsule({ quickApps: removeQuickApp(quickApps, app.id) })}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </SettingsSection>

      <SettingsSection title="动画">
        <SettingRow title="动画风格" description="胶囊展开/收起的动画效果。">
          <div className="pinstack-segmented flex items-center gap-1 p-1">
            {[
              { value: 'smooth', label: '平滑' },
              { value: 'snappy', label: '干脆' }
            ].map((option) => {
              const active = capsule.animationPreset === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`pinstack-segmented-item motion-button h-8 px-3 text-[12px] ${active ? 'is-active' : ''}`}
                  onClick={() => updateCapsule({ animationPreset: option.value as 'smooth' | 'snappy' })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </SettingRow>
      </SettingsSection>
    </>
  );
}
