import { useMemo } from 'react';
import { ToggleSwitch } from '../../../../ToggleSwitch';
import { SettingRow, SettingsSection, selectClass, pillButtonClass, DEFAULT_CAPTURE_SIZE_OPTIONS } from './GeneralSettings';
import type { RuntimeSettings } from '../../../../../shared/types';
import type { AppSettings } from '../../../../../shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CaptureSettingsProps {
  localAppSettings: AppSettings;
  localRuntimeSettings: RuntimeSettings;
  setLocalRuntimeSettings: React.Dispatch<React.SetStateAction<RuntimeSettings>>;
  updateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateRuntimeSettings: (patch: Partial<RuntimeSettings>) => Promise<void>;
  updateModePreset: (nextMode: 'auto' | 'custom' | 'off') => Promise<void>;
  runningApps: string[];
  isLoadingApps: boolean;
  selectedScopeApp: string;
  setSelectedScopeApp: (value: string) => void;
  addScopeApp: () => Promise<void>;
  removeScopeApp: (appName: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CaptureSettings({
  localAppSettings,
  localRuntimeSettings,
  setLocalRuntimeSettings,
  updateAppSettings,
  updateRuntimeSettings,
  updateModePreset,
  runningApps,
  isLoadingApps,
  selectedScopeApp,
  setSelectedScopeApp,
  addScopeApp,
  removeScopeApp,
}: CaptureSettingsProps): JSX.Element {
  const captureSizeInputs = localRuntimeSettings.defaultCaptureCustomSize ?? { width: 1080, height: 1350 };
  const pinBehaviorLocked = localRuntimeSettings.pinBehaviorMode !== 'custom';

  const scopeAppList = useMemo(() => [...localAppSettings.scopedApps].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')), [localAppSettings.scopedApps]);
  const availableScopeApps = useMemo(
    () =>
      runningApps
        .filter((appName) => !localAppSettings.scopedApps.includes(appName))
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [runningApps, localAppSettings.scopedApps]
  );

  const scopeMode = localAppSettings.scopeMode as AppSettings['scopeMode'];

  return (
    <>
      {/* ---- Section 1: 桌面入口 ---- */}
      <SettingsSection title="桌面入口">
        <SettingRow title="显示悬浮捕获按钮" description="关闭后桌面入口隐藏，立即生效。">
          <ToggleSwitch
            checked={localRuntimeSettings.enableCaptureLauncher}
            onChange={(value) => void updateRuntimeSettings({ enableCaptureLauncher: value })}
          />
        </SettingRow>
      </SettingsSection>

      {/* ---- Section 2: 截图 ---- */}
      <SettingsSection title="截图">
        <SettingRow title="默认截图格式" description="当前仅支持 PNG。">
          <select
            value={localAppSettings.defaultScreenshotFormat}
            onChange={(event) =>
              void updateAppSettings({
                defaultScreenshotFormat: event.target.value as AppSettings['defaultScreenshotFormat']
              })
            }
            className={`${selectClass} pinstack-field-select`}
          >
            <option value="png">PNG</option>
          </select>
        </SettingRow>
        <SettingRow title="记住最近截图尺寸" description="关闭后停止记录并清空列表。">
          <ToggleSwitch
            checked={localRuntimeSettings.rememberCaptureRecentSizes}
            onChange={(value) =>
              void updateRuntimeSettings({
                rememberCaptureRecentSizes: value,
                captureRecentSizes: value ? localRuntimeSettings.captureRecentSizes : []
              })
            }
          />
        </SettingRow>
        <SettingRow title="默认截图尺寸" description="下次打开截图面板时生效。">
          <select
            value={localRuntimeSettings.defaultCaptureSizePreset}
            onChange={(event) =>
              void updateRuntimeSettings({
                defaultCaptureSizePreset: event.target.value as RuntimeSettings['defaultCaptureSizePreset']
              })
            }
            className={`${selectClass} pinstack-field-select`}
          >
            {DEFAULT_CAPTURE_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingRow>
        {localRuntimeSettings.defaultCaptureSizePreset === 'custom' ? (
          <div className="pinstack-section-panel mt-2 flex items-center gap-2 px-3 py-2.5">
            <input
              type="number"
              min={1}
              value={captureSizeInputs.width}
              onChange={(event) =>
                setLocalRuntimeSettings((prev) => ({
                  ...prev,
                  defaultCaptureCustomSize: {
                    width: Math.max(1, Number(event.target.value) || 1),
                    height: prev.defaultCaptureCustomSize?.height ?? captureSizeInputs.height
                  }
                }))
              }
              className={`${selectClass} min-w-0 flex-1`}
            />
            <span className="text-black/34">&times;</span>
            <input
              type="number"
              min={1}
              value={captureSizeInputs.height}
              onChange={(event) =>
                setLocalRuntimeSettings((prev) => ({
                  ...prev,
                  defaultCaptureCustomSize: {
                    width: prev.defaultCaptureCustomSize?.width ?? captureSizeInputs.width,
                    height: Math.max(1, Number(event.target.value) || 1)
                  }
                }))
              }
              className={`${selectClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              className={pillButtonClass}
              onClick={() => void updateRuntimeSettings({ defaultCaptureCustomSize: localRuntimeSettings.defaultCaptureCustomSize })}
            >
              保存
            </button>
          </div>
        ) : null}
      </SettingsSection>

      {/* ---- Section 3: 弹出与模式 ---- */}
      <SettingsSection title="弹出与模式">
        <SettingRow title="默认运行模式" description="切换后复制或截图的处理方式立刻变化。">
          <div className="pinstack-segmented flex items-center gap-1 p-1">
            {[
              { value: 'auto', label: '全部弹出' },
              { value: 'custom', label: '自定义' },
              { value: 'off', label: '全部关闭' }
            ].map((option) => {
              const active = localRuntimeSettings.pinBehaviorMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void updateModePreset(option.value as 'auto' | 'custom' | 'off')}
                  className={`pinstack-segmented-item motion-button h-8 px-2.5 text-[11px] ${active ? 'is-active' : ''}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <SettingRow
          title="图片自动弹出"
          description={pinBehaviorLocked ? '仅在自定义模式下可修改。' : '截图或图片记录后是否自动显示卡片。'}
        >
          <ToggleSwitch
            checked={localRuntimeSettings.enableImagePin}
            disabled={pinBehaviorLocked}
            onChange={(value) =>
              void updateRuntimeSettings({
                enableImagePin: value,
                mode: 'auto',
                pinBehaviorMode: 'custom'
              })
            }
          />
        </SettingRow>
        <SettingRow
          title="文本自动弹出"
          description={pinBehaviorLocked ? '仅在自定义模式下可修改。' : '复制文本后是否自动显示卡片。'}
        >
          <ToggleSwitch
            checked={localRuntimeSettings.enableTextPin}
            disabled={pinBehaviorLocked}
            onChange={(value) =>
              void updateRuntimeSettings({
                enableTextPin: value,
                mode: 'auto',
                pinBehaviorMode: 'custom'
              })
            }
          />
        </SettingRow>
        <SettingRow title="显示状态提示" description="顶部状态区显示运行状态提醒。">
          <ToggleSwitch
            checked={localRuntimeSettings.showStatusHints}
            onChange={(value) => void updateRuntimeSettings({ showStatusHints: value })}
          />
        </SettingRow>
      </SettingsSection>

      {/* ---- Section 4: 生效范围 ---- */}
      <SettingsSection title="生效范围">
          <div className="space-y-3">
          <div className="pinstack-segmented flex items-center gap-1 p-1">
            {[
              { value: 'global', label: '全局' },
              { value: 'blacklist', label: '排除应用' },
              { value: 'whitelist', label: '仅限应用' }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => void updateAppSettings({ scopeMode: option.value as AppSettings['scopeMode'] })}
                className={`pinstack-segmented-item motion-button h-8 px-2.5 text-[11px] ${scopeMode === option.value ? 'is-active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={`${scopeMode === 'global' ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2">
              <select
                value={selectedScopeApp}
                onChange={(event) => setSelectedScopeApp(event.target.value)}
                className={`${selectClass} flex-1`}
                disabled={scopeMode === 'global' || isLoadingApps}
              >
                {availableScopeApps.length === 0 ? <option value="">暂无可添加应用</option> : null}
                {availableScopeApps.map((appName) => (
                  <option key={appName} value={appName}>
                    {appName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void addScopeApp()}
                disabled={scopeMode === 'global' || !selectedScopeApp}
                className={`${pillButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                添加应用
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {scopeAppList.length === 0 ? (
                <span className="text-[11px] text-black/40">
                  {scopeMode === 'global' ? '当前为全局生效，不限制应用。' : '还没有添加应用。'}
                </span>
              ) : (
                scopeAppList.map((appName) => (
                  <span
                    key={appName}
                    className="pinstack-badge inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-black/68"
                  >
                    {appName}
                    <button type="button" onClick={() => void removeScopeApp(appName)} className="text-black/34 hover:text-black/62">
                      &times;
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </SettingsSection>

    </>
  );
}
