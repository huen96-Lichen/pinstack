import { ToggleSwitch } from '../../../../ToggleSwitch';
import { SectionHeader } from '../../../../design-system/primitives';
import { useAppVersion } from '../../../../version';
import { createTraceId, trackRendererTelemetry } from '../../../../shared/telemetry';
import type {
  PermissionStatusSnapshot,
  RuntimeSettings,
} from '../../../../../shared/types';
import type { AppSettings } from '../../../../../shared/types';

const selectClass = 'pinstack-field motion-interactive h-10 min-w-[132px] px-3 text-[13px]';
const pillButtonClass = 'pinstack-btn pinstack-btn-secondary motion-button inline-flex h-10 items-center justify-center px-3 text-[12px]';

const DEFAULT_CAPTURE_SIZE_OPTIONS = [
  { value: 'recent', label: '最近使用' },
  { value: '1080x1350', label: '1080x1350' },
  { value: '1920x1080', label: '1920x1080' },
  { value: 'custom', label: '自定义' }
] as const;

export { selectClass, pillButtonClass, DEFAULT_CAPTURE_SIZE_OPTIONS };

export function SettingsSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="settings-section space-y-2.5">
      <div className="settings-section-header">
        <h3 className="settings-section-group-title">{title}</h3>
        {description ? <p className="settings-section-group-desc">{description}</p> : null}
      </div>
      <div className="settings-section-card radius-l3 pinstack-subpanel-section px-4 py-2">{children}</div>
    </section>
  );
}

export function SettingRow({
  title,
  description,
  children,
  compact = false
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className={`settings-row flex items-center justify-between gap-4 ${compact ? 'min-h-[44px] py-2' : 'min-h-[56px] py-3'} first:pt-0 last:pb-0`}>
      <div className="min-w-0 flex-1">
        <div className="settings-row-title">{title}</div>
        {description ? <p className="settings-row-desc">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export interface GeneralSettingsProps {
  localAppSettings: AppSettings;
  localRuntimeSettings: RuntimeSettings;
  setLocalRuntimeSettings: React.Dispatch<React.SetStateAction<RuntimeSettings>>;
  updateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateRuntimeSettings: (patch: Partial<RuntimeSettings>) => Promise<void>;
  openStorageRoot: () => Promise<void>;
  resetOnboarding: () => void;
  permissionStatus: PermissionStatusSnapshot | null;
  appVersion: string;
  embedded: boolean;
  onClose?: () => void;
}

export function GeneralSettings({
  localAppSettings,
  localRuntimeSettings,
  setLocalRuntimeSettings,
  updateAppSettings,
  updateRuntimeSettings,
  openStorageRoot,
  resetOnboarding,
  permissionStatus,
  appVersion,
  embedded,
  onClose
}: GeneralSettingsProps): JSX.Element {
  return (
    <>
      <SettingsSection title="通用">
        <SettingRow title="固定置顶" description="控制面板始终显示在最前方，立即生效。">
          <ToggleSwitch
            checked={localRuntimeSettings.dashboardAlwaysOnTop}
            onChange={(value) => void updateRuntimeSettings({ dashboardAlwaysOnTop: value })}
          />
        </SettingRow>
        <SettingRow title="开机时启动 PinStack" description="随系统自动启动，下次登录生效。">
          <ToggleSwitch
            checked={localAppSettings.launchAtLogin}
            onChange={(value) => void updateAppSettings({ launchAtLogin: value })}
          />
        </SettingRow>
        <SettingRow title="默认打开到" description="下次打开面板时生效。">
          <select
            value={localAppSettings.defaultDashboardView}
            onChange={(event) => void updateAppSettings({ defaultDashboardView: event.target.value as AppSettings['defaultDashboardView'] })}
            className={`${selectClass} pinstack-field-select`}
          >
            <option value="all">全部</option>
            <option value="text">文本</option>
            <option value="images">图片</option>
            <option value="ai">AI 助手</option>
          </select>
        </SettingRow>
        <SettingRow title="默认窗口大小" description="立即生效，切换后当前面板会调整大小。">
          <select
            value={localRuntimeSettings.dashboardSizePreset}
            onChange={(event) =>
              void updateRuntimeSettings({
                dashboardSizePreset: event.target.value as RuntimeSettings['dashboardSizePreset'],
                dashboardBounds: undefined
              })
            }
            className={`${selectClass} pinstack-field-select`}
          >
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
          </select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="高级">
        <SettingRow title="打开本地数据目录" description="查看 PinStack 在本地保存的内容。">
          <button type="button" onClick={() => void openStorageRoot()} className={pillButtonClass}>
            打开目录
          </button>
        </SettingRow>
        <SettingRow title="重置新手引导" description="下次打开时重新显示首次使用提示。">
          <button type="button" onClick={resetOnboarding} className={pillButtonClass}>
            重新显示
          </button>
        </SettingRow>
        <SettingRow title="当前版本" description="当前正在使用的软件版本。">
          <span className="pinstack-badge px-3 py-2 text-[11px] text-black/72">
            v{appVersion}
          </span>
        </SettingRow>
        <div className="pinstack-section-panel mt-2 px-3 py-3 text-[12px] text-[color:var(--ps-text-secondary)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[12px] font-medium text-[color:var(--ps-text-primary)]">权限诊断</div>
              <button
                type="button"
                onClick={() => {
                  const traceId = createTraceId('settings-permission-refresh');
                  trackRendererTelemetry('renderer.settings.permission.refresh', {
                    source: permissionStatus?.source ?? null
                  }, { traceId });
                  void window.pinStack.permissions.refresh('manual-refresh', traceId);
                }}
                className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-2.5 text-[11px]"
              >
                刷新状态
              </button>
            </div>
            {permissionStatus ? (
              <div className="space-y-1.5">
                {(['screenCapture', 'accessibility', 'automationDependency'] as const).map((key) => {
                  const item = permissionStatus.items.find((entry) => entry.key === key);
                  if (!item) {
                    return null;
                  }
                  return (
                    <div key={key} className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-medium text-[color:var(--ps-text-primary)]">{item.title}</div>
                        <div className="text-[11px] text-[color:var(--ps-text-secondary)]">{item.message}</div>
                      </div>
                      <span className="pinstack-badge shrink-0 px-2 py-1 text-[10px] text-black/72">{item.state}</span>
                    </div>
                  );
                })}
                <div className="pt-1 text-[11px] text-[color:var(--ps-text-tertiary)]">
                  最近检查：{new Date(permissionStatus.updatedAt).toLocaleString()} · 来源：{permissionStatus.source}
                </div>
                <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">
                  运行环境：{permissionStatus.diagnostics.isDev ? 'dev' : 'prod'} · Bundle ID：{permissionStatus.diagnostics.bundleId}
                </div>
                {permissionStatus.items
                  .filter((item) => item.key === 'screenCapture')
                  .map((item) => (
                    <div key="screen-probe-status" className="text-[11px] text-[color:var(--ps-text-tertiary)]">
                      屏幕录制诊断：system={item.systemStatus ?? 'n/a'} · screenshotProbe={item.probeStatus ?? 'n/a'} ·
                      desktopProbe={item.desktopProbeStatus ?? 'n/a'}
                    </div>
                  ))}
                {permissionStatus.items
                  .filter((item) => item.key === 'screenCapture' && (item.probeError || item.desktopProbeError))
                  .map((item) => (
                    <div key="screen-probe-error" className="space-y-1 text-[11px] text-amber-700">
                      {item.probeError ? <div>截图探测：{item.probeError}</div> : null}
                      {item.desktopProbeError ? <div>桌面源探测：{item.desktopProbeError}</div> : null}
                    </div>
                  ))}
                {permissionStatus.diagnostics.appBundlePath ? (
                  <div className="break-all text-[11px] text-[color:var(--ps-text-tertiary)]">
                    App 包路径：{permissionStatus.diagnostics.appBundlePath}
                  </div>
                ) : null}
                <div className="break-all text-[11px] text-[color:var(--ps-text-tertiary)]">
                  App 路径：{permissionStatus.diagnostics.appPath}
                </div>
                <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">
                  安装路径：{permissionStatus.diagnostics.installLocationStable ? '稳定' : '非稳定'}
                </div>
                {permissionStatus.diagnostics.installLocationMessage ? (
                  <div className="text-[11px] text-amber-700">{permissionStatus.diagnostics.installLocationMessage}</div>
                ) : null}
                {permissionStatus.diagnostics.instanceMismatchSuspected ? (
                  <div className="text-[11px] text-amber-700">
                    {permissionStatus.diagnostics.instanceMismatchMessage ?? '当前运行实例可能与系统中已授权的 PinStack.app 不一致。'}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">尚未获取权限诊断信息。</div>
            )}
          </div>
      </SettingsSection>
    </>
  );
}
