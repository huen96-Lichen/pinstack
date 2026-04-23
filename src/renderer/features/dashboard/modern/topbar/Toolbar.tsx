import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { HelpPanel } from '../HelpPanel';
import { SettingsPanel } from '../SettingsPanel';
import { ToggleSwitch } from '../../../../ToggleSwitch';
import { PinStackIcon } from '../../../../design-system/icons';
import type { DashboardViewProps } from '../../shared/dashboard.types';
import { AnchoredLayer } from '../../../../components/AnchoredLayer';
import { computeShowAiEntry } from '../../shared/dashboardUtils';
import { createTraceId, trackRendererTelemetry } from '../../../../shared/telemetry';

interface ToolbarProps {
  view: DashboardViewProps;
  topBarWidth: number;
  compactLevel: 'full' | 'compact' | 'dense';
  showPinOnTopLabel: boolean;
  modeChipState: 'auto' | 'custom' | 'off';
  statusChipState: 'normal' | 'permission_required';
  pinBehaviorLocked: boolean;
  permissionIssueItems: Array<{ key: string; blocking: boolean }>;
  permissionSummaryItems: Array<{
    key: string;
    title: string;
    state: string;
    message: string;
    canRetry: boolean;
    canOpenSystemSettings: boolean;
    settingsTarget: Parameters<typeof window.pinStack.permissions.openSettings>[0];
  }>;
  onToggleSidebar: () => void;
  onCycleSizePreset: () => Promise<void>;
  onToggleDashboardPinned: () => Promise<void>;
  onHideDashboard: () => Promise<void>;
  onMinimizeDashboard: () => Promise<void>;
  onRefreshPermissionStatus: () => Promise<void>;
  onSearchInput: (value: string) => void;
  topBarRef: RefObject<HTMLDivElement | null>;
}

type PermissionSummaryKey = 'screenCapture' | 'accessibility' | 'automationDependency';

const MODE_OPTIONS: Array<{ id: 'auto' | 'custom' | 'off'; label: string }> = [
  { id: 'auto', label: '全部弹出' },
  { id: 'custom', label: '自定义' },
  { id: 'off', label: '全部关闭' }
];

const STATUS_CHIP_STYLE: Record<string, { label: string; chipClass: string; dotClass: string }> = {
  normal: {
    label: '状态正常',
    chipClass: 'pinstack-btn pinstack-btn-secondary text-black/70',
    dotClass: 'bg-emerald-400'
  },
  permission_required: {
    label: '需要权限',
    chipClass: 'pinstack-btn border-amber-300/35 bg-amber-100/72 text-amber-800 hover:bg-amber-100',
    dotClass: 'bg-amber-500'
  }
};

const toolbarControlClass =
  'pinstack-btn pinstack-btn-secondary motion-button px-3 text-[12px]';

const titleBarStyle: CSSProperties = {
  background: 'var(--ps-bg-surface)',
  border: '1px solid color-mix(in srgb, var(--ps-border-subtle) 76%, transparent)',
  borderRadius: 'var(--radius-l2)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: 'var(--ps-shadow-card)'
};

function getPermissionStateChipClass(state: string): string {
  if (state === 'granted') {
    return 'bg-emerald-200/70 text-emerald-800';
  }
  if (state === 'requires-restart' || state === 'not-determined') {
    return 'bg-amber-200/75 text-amber-800';
  }
  if (state === 'denied') {
    return 'bg-rose-200/75 text-rose-800';
  }
  return 'bg-slate-200/75 text-slate-700';
}

function getPermissionStateLabel(state: string): string {
  if (state === 'granted') return '已授权';
  if (state === 'requires-restart') return '需重启';
  if (state === 'not-determined') return '待授权';
  if (state === 'denied') return '未授权';
  return '未知';
}

export function Toolbar({
  view,
  topBarWidth,
  compactLevel,
  showPinOnTopLabel,
  modeChipState,
  statusChipState,
  pinBehaviorLocked,
  permissionIssueItems,
  permissionSummaryItems,
  onToggleSidebar,
  onCycleSizePreset,
  onToggleDashboardPinned,
  onHideDashboard,
  onMinimizeDashboard,
  onRefreshPermissionStatus,
  onSearchInput,
  topBarRef
}: ToolbarProps): JSX.Element {
  const [isPinPopoverOpen, setIsPinPopoverOpen] = useState(false);
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsMode, setSettingsMode] = useState<'general' | 'ai'>('general');

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ mode?: 'general' | 'ai' }>;
      const requestedMode = custom.detail?.mode === 'ai' ? 'ai' : 'general';
      setSettingsMode(requestedMode);
      setIsSettingsOpen(true);
    };
    window.addEventListener('pinstack-open-settings', handler as EventListener);
    return () => window.removeEventListener('pinstack-open-settings', handler as EventListener);
  }, []);
  const [openingPermissionKey, setOpeningPermissionKey] = useState<string | null>(null);
  const cleanupPopoverRef = useRef<HTMLDivElement | null>(null);
  const pinPopoverRef = useRef<HTMLDivElement | null>(null);
  const statusPopoverRef = useRef<HTMLDivElement | null>(null);
  const helpPopoverRef = useRef<HTMLDivElement | null>(null);
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);

  const showAiEntry = computeShowAiEntry(view.appSettings.aiHub.entryVisibility, view.appSettings.aiHub.enabled);
  const statusChipVisual = STATUS_CHIP_STYLE[statusChipState];

  const openAiAssistantWindow = async () => {
    await window.pinStack.ai.openWindow();
  };
  const openKnowledgeWeb = async () => {
    try {
      await window.pinStack.knowledge.openWeb();
    } catch (error) {
      const message = error instanceof Error ? error.message : '知识前台暂时不可用，请稍后重试。';
      window.alert(message);
    }
  };

  useEffect(() => {
    const onOpenAi = () => {
      void openAiAssistantWindow();
    };
    window.addEventListener('pinstack-open-ai-chat', onOpenAi as EventListener);
    return () => {
      window.removeEventListener('pinstack-open-ai-chat', onOpenAi as EventListener);
    };
  }, []);

  useEffect(() => {
    const onOpenAiHub = (event: Event) => {
      const custom = event as CustomEvent<{ taskId?: string }>;
      const nextTaskId = custom.detail?.taskId;
      view.filters.onPrimaryNavChange('ai');
      setIsSettingsOpen(false);
      if (nextTaskId) {
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('pinstack-ai-hub-run-task', {
              detail: { taskId: nextTaskId }
            })
          );
        }, 80);
      }
    };
    window.addEventListener('pinstack-open-ai-hub', onOpenAiHub as EventListener);
    return () => {
      window.removeEventListener('pinstack-open-ai-hub', onOpenAiHub as EventListener);
    };
  }, [view.filters]);

  const openPermissionSettings = async (target: string, settingsTarget: Parameters<typeof window.pinStack.permissions.openSettings>[0]) => {
    const traceId = createTraceId(`toolbar-open-settings-${target}`);
    trackRendererTelemetry('renderer.toolbar.permission.settings.open', {
      target,
      settingsTarget
    }, { traceId });
    setOpeningPermissionKey(target);
    try {
      await window.pinStack.permissions.openSettings(settingsTarget, traceId);
    } finally {
      setOpeningPermissionKey(null);
    }
  };

  return (
    <>
      <div className="drag-region pinstack-titlebar-surface relative z-50 flex h-10 items-center overflow-visible px-4" style={titleBarStyle}>
        <div className="no-drag flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void onHideDashboard();
            }}
            className="motion-button group relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-black/20 bg-[#FF5F57] hover:brightness-95"
            title="关闭"
            aria-label="关闭"
          >
            <PinStackIcon
              name="close"
              size={8}
              className="pointer-events-none scale-[0.8] text-black/70 opacity-0 transition-all duration-[var(--motion-fast)] ease-[var(--ease-standard)] group-hover:scale-100 group-hover:opacity-100"
              strokeWidth={1.6}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              void onMinimizeDashboard();
            }}
            className="motion-button group relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-black/20 bg-[#FEBC2E] hover:brightness-95"
            title="最小化"
            aria-label="最小化"
          >
            <PinStackIcon
              name="minimize"
              size={8}
              className="pointer-events-none scale-[0.8] text-black/70 opacity-0 transition-all duration-[var(--motion-fast)] ease-[var(--ease-standard)] group-hover:scale-100 group-hover:opacity-100"
              strokeWidth={1.6}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              // Keep existing window logic unchanged in this task.
            }}
            className="motion-button group relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-black/20 bg-[#28C840] hover:brightness-95"
            title="最大化"
            aria-label="最大化"
          >
            <PinStackIcon
              name="maximize"
              size={8}
              className="pointer-events-none scale-[0.8] text-black/70 opacity-0 transition-all duration-[var(--motion-fast)] ease-[var(--ease-standard)] group-hover:scale-100 group-hover:opacity-100"
              strokeWidth={1.6}
            />
          </button>
        </div>

        <div className="pointer-events-none flex min-w-0 flex-1 items-center justify-center px-4">
          <p className="truncate text-[12px] font-medium tracking-[0.02em] text-black/74">PinStack Dashboard</p>
        </div>

        <div className="no-drag flex min-w-0 items-center justify-end">
          <div className="relative flex max-w-full items-center gap-2">
            {showAiEntry ? (
              <div className="relative z-[70]">
                <button
                  type="button"
                  onClick={() => {
                    void openAiAssistantWindow();
                  }}
                  className="pinstack-btn pinstack-btn-secondary motion-button h-8 gap-1.5 px-2.5 text-[11px]"
                  title="AI 助手"
                  aria-label="AI 助手"
                >
                  <PinStackIcon name="ai-workspace" size={16} />
                  <span className="hidden sm:inline">AI</span>
                </button>
              </div>
            ) : null}

            <div className="relative z-[70]">
              <button
                type="button"
                onClick={() => {
                  void openKnowledgeWeb();
                }}
                className="pinstack-btn pinstack-btn-secondary motion-button h-8 gap-1.5 px-2.5 text-[11px]"
                title="PinStack 3.0 知识前台"
                aria-label="PinStack 3.0 知识前台"
              >
                <PinStackIcon name="panel" size={16} />
                <span className="hidden sm:inline">知识前台</span>
              </button>
            </div>

            <div className="relative z-[70]" ref={settingsPopoverRef}>
              <button
                type="button"
                onClick={() => {
                  setSettingsMode('general');
                  setIsSettingsOpen((prev) => !prev);
                }}
                data-onboarding-target="settings"
                className="pinstack-btn pinstack-btn-secondary motion-button h-8 gap-1.5 px-2.5 text-[11px]"
                title="设置"
                aria-label="设置"
              >
                <PinStackIcon name="settings" size={16} />
                <span className="hidden sm:inline">设置</span>
              </button>
            </div>

            <div className="pinstack-control inline-flex h-8 items-center gap-2 px-2.5 text-[11px] text-black/68">
              {showPinOnTopLabel ? <span className="text-black/60">固定置顶</span> : null}
              <ToggleSwitch checked={view.dashboardPinned} onChange={() => void onToggleDashboardPinned()} />
            </div>

            <div className="relative z-[70]" ref={helpPopoverRef}>
              <button
                type="button"
                onClick={() => setIsHelpOpen((prev) => !prev)}
                className="pinstack-btn pinstack-btn-secondary motion-button h-8 w-8 px-0 text-black/64"
                title="帮助"
                aria-label="帮助"
              >
                <PinStackIcon name="help" size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div ref={topBarRef as React.RefObject<HTMLDivElement>} className="radius-l2 relative z-40 overflow-visible">
        <div className="pinstack-toolbar-surface flex h-12 min-w-0 items-center gap-2.5 px-4" style={{
          background: 'var(--ps-bg-elevated)',
          border: '1px solid color-mix(in srgb, var(--ps-border-default) 64%, transparent)',
          borderRadius: 'var(--radius-l2)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          boxShadow: 'var(--ps-shadow-card)'
        }}>
          <div className="no-drag flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleSidebar}
              className={toolbarControlClass}
              title={view.sidebarCollapsed ? '展开导航' : '收起导航'}
            >
              {view.sidebarCollapsed ? '展开' : '收起'}
            </button>
          </div>

          {/* Search bar — centered in the remaining space */}
          <div className="no-drag flex min-w-0 flex-1 items-center justify-center px-2">
            <label className="pinstack-field flex h-8 min-w-0 w-full max-w-[480px] items-center gap-2 px-3 text-sm">
              <PinStackIcon name="search" size={15} className="shrink-0 text-[color:var(--ps-text-tertiary)]" />
              <input
                value={view.keyword}
                onChange={(event) => onSearchInput(event.target.value)}
                placeholder="搜索内容、标签或来源"
                className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-[color:var(--ps-text-primary)] outline-none placeholder:text-[color:var(--ps-text-tertiary)]"
              />
            </label>
          </div>

          <div className="no-drag flex shrink-0 items-center justify-end gap-2">
            <div
              data-onboarding-target="mode"
              className="pinstack-segmented inline-flex h-9 items-center gap-1 p-1"
              title="运行模式"
            >
              {MODE_OPTIONS.map((option) => {
                const active = modeChipState === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      void view.filters.onModeChipChange(option.id);
                    }}
                  className={`pinstack-segmented-item motion-button px-2 py-1 text-[10px] font-medium ${active ? 'is-active' : ''}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {view.runtimeSettings.showStatusHints ? (
              <div className="relative" ref={statusPopoverRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsStatusPopoverOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        const traceId = createTraceId('toolbar-permission-refresh-open');
                        trackRendererTelemetry('renderer.toolbar.permission.refresh', {
                          trigger: 'status-chip-open'
                        }, { traceId });
                        void window.pinStack.permissions.refresh('dashboard-permissions', traceId);
                      }
                      return next;
                    });
                  }}
                  className={`motion-chip flex h-9 items-center gap-1.5 px-2.5 text-[11px] font-medium ${statusChipVisual.chipClass}`}
                  title="系统状态"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusChipVisual.dotClass}`} />
                  <span>{statusChipVisual.label}</span>
                </button>

                <AnchoredLayer
                  open={isStatusPopoverOpen}
                  anchorRef={statusPopoverRef}
                  onRequestClose={() => setIsStatusPopoverOpen(false)}
                  preferredPlacement="bottom"
                  align="end"
                  offset={8}
                  zIndex={220}
                  className="motion-popover pinstack-dropdown-shell w-[280px] p-2.5 text-[11px] text-black/80"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-[0.08em] text-black/42">系统状态</div>
                    <button
                      type="button"
                      onClick={() => {
                        const traceId = createTraceId('toolbar-permission-refresh-button');
                        trackRendererTelemetry('renderer.toolbar.permission.refresh', {
                          trigger: 'status-popover-button'
                        }, { traceId });
                        void onRefreshPermissionStatus();
                      }}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px]"
                    >
                      刷新状态
                    </button>
                  </div>

                  {statusChipState === 'permission_required' ? (
                    <div className="space-y-2">
                      <p className="radius-control border border-amber-300/35 bg-amber-300/10 px-2.5 py-1.5 text-[10px] text-amber-800">
                        发现 {permissionIssueItems.length} 项权限需要处理
                      </p>
                      {view.permissionStatus?.diagnostics.instanceMismatchSuspected ? (
                        <p className="radius-control border border-amber-300/35 bg-amber-300/10 px-2.5 py-1.5 text-[10px] text-amber-800">
                          {view.permissionStatus.diagnostics.instanceMismatchMessage ??
                            '当前运行实例可能与系统授权实例不一致，请确认运行的是同一个 PinStack.app。'}
                        </p>
                      ) : null}
                      {permissionSummaryItems.map((item) => (
                        <div key={item.key} className="pinstack-section-panel px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-black/78">{item.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${getPermissionStateChipClass(item.state)}`}>
                              {getPermissionStateLabel(item.state)}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] leading-relaxed text-black/52">{item.message}</p>
                          <div className="mt-2 flex items-center gap-2">
                            {item.canRetry ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void onRefreshPermissionStatus();
                                }}
                                className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px]"
                              >
                                刷新状态
                              </button>
                            ) : null}
                            {item.canOpenSystemSettings ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void openPermissionSettings(item.key, item.settingsTarget);
                                }}
                                disabled={openingPermissionKey !== null}
                                className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {openingPermissionKey === item.key ? '打开中...' : '打开系统设置'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      <div className="radius-control border border-white/35 bg-white/35 px-2.5 py-2 text-[10px] text-black/56">
                        最近检查：{view.permissionStatus ? new Date(view.permissionStatus.updatedAt).toLocaleString() : '未获取'} ·
                        来源：{view.permissionStatus?.source ?? 'unknown'}
                      </div>
                    </div>
                  ) : (
                    <div className="radius-control border border-emerald-300/35 bg-emerald-300/10 px-2.5 py-2 text-[10px] text-emerald-700">
                      系统状态正常，当前无需处理权限问题。
                    </div>
                  )}
                </AnchoredLayer>
              </div>
            ) : null}

            {compactLevel !== 'dense' ? (
              <div
                className={`pinstack-control flex h-9 items-center gap-2 px-2.5 text-[11px] text-black/66 ${
                  pinBehaviorLocked ? 'opacity-55' : ''
                }`}
                title={pinBehaviorLocked ? '由当前运行模式控制（切换到自定义后可编辑）' : '弹出策略'}
              >
                <span className="text-black/46">Img</span>
                <ToggleSwitch
                  checked={view.runtimeSettings.enableImagePin}
                  disabled={pinBehaviorLocked}
                  onChange={(value: boolean) => void view.filters.onToggleImagePin(value)}
                />
                <span className="text-black/46">Txt</span>
                <ToggleSwitch
                  checked={view.runtimeSettings.enableTextPin}
                  disabled={pinBehaviorLocked}
                  onChange={(value: boolean) => void view.filters.onToggleTextPin(value)}
                />
              </div>
            ) : (
              <div className="relative" ref={pinPopoverRef}>
                <button
                  type="button"
                  onClick={() => setIsPinPopoverOpen((prev) => !prev)}
                  className="pinstack-btn pinstack-btn-secondary motion-button h-9 px-2.5 text-[11px]"
                  title="弹出策略"
                >
                  Pin
                </button>

                <AnchoredLayer
                  open={isPinPopoverOpen}
                  anchorRef={pinPopoverRef}
                  onRequestClose={() => setIsPinPopoverOpen(false)}
                  preferredPlacement="bottom"
                  align="end"
                  offset={8}
                  zIndex={220}
                  className="motion-popover pinstack-dropdown-shell w-[210px] p-2.5 text-[11px] text-black/76"
                >
                    <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-black/42">Pin Behavior</div>
                    {pinBehaviorLocked ? <p className="mb-2 text-[10px] text-black/46">由当前模式控制</p> : null}
                    <div className="pinstack-section-panel flex items-center justify-between px-2.5 py-1.5">
                      <span>图片自动弹出</span>
                      <ToggleSwitch
                        checked={view.runtimeSettings.enableImagePin}
                        disabled={pinBehaviorLocked}
                        onChange={(value: boolean) => void view.filters.onToggleImagePin(value)}
                      />
                    </div>
                    <div className="pinstack-section-panel mt-2 flex items-center justify-between px-2.5 py-1.5">
                      <span>文本自动弹出</span>
                      <ToggleSwitch
                        checked={view.runtimeSettings.enableTextPin}
                        disabled={pinBehaviorLocked}
                        onChange={(value: boolean) => void view.filters.onToggleTextPin(value)}
                      />
                    </div>
                </AnchoredLayer>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                void onCycleSizePreset();
              }}
              className="pinstack-btn pinstack-btn-secondary motion-button flex h-9 w-9 items-center justify-center px-0 text-[11px] font-semibold text-black/68"
              title={`尺寸：${view.sizePresetLabel}`}
            >
              {view.sizePresetLabel}
            </button>

            <div className="relative" ref={cleanupPopoverRef}>
              <button
                type="button"
                onClick={() => {
                  if (view.cleanup.open) {
                    view.cleanup.onClose();
                    return;
                  }
                  view.cleanup.onOpen();
                }}
                className="pinstack-btn pinstack-btn-secondary motion-button h-9 px-3 text-[11px]"
                title="按当前结果批量清理"
              >
                批量清理
              </button>

              <AnchoredLayer
                open={view.cleanup.open}
                anchorRef={cleanupPopoverRef}
                onRequestClose={view.cleanup.onClose}
                preferredPlacement="bottom"
                align="end"
                offset={8}
                zIndex={220}
                className="motion-popover pinstack-dropdown-shell w-[320px] p-3 text-[11px] text-black/80"
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-[0.08em] text-black/42">批量清理</div>
                    <p className="text-[11px] leading-relaxed text-black/56">
                      只作用于当前视图结果，并按创建时间区间删除命中记录。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-black/46">开始时间</label>
                      <input
                        type="datetime-local"
                        value={view.cleanup.rangeStart}
                        onChange={(event) => view.cleanup.onRangeStartChange(event.target.value)}
                        className="pinstack-field h-9 w-full px-2.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-black/46">结束时间</label>
                      <input
                        type="datetime-local"
                        value={view.cleanup.rangeEnd}
                        onChange={(event) => view.cleanup.onRangeEndChange(event.target.value)}
                        className="pinstack-field h-9 w-full px-2.5 text-xs"
                      />
                    </div>
                  </div>

                  <div className="pinstack-section-panel flex items-center justify-between px-2.5 py-2">
                    <span className="text-[11px] text-black/58">当前命中数量</span>
                    <span className="text-[12px] font-semibold text-black/78">{view.cleanup.matchCount} 条</span>
                  </div>

                  {view.cleanup.validationMessage ? (
                    <p className="rounded-[10px] border border-amber-300/35 bg-amber-100/55 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
                      {view.cleanup.validationMessage}
                    </p>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-[11px] text-black/46">输入 DELETE 确认</label>
                    <input
                      value={view.cleanup.confirmText}
                      onChange={(event) => view.cleanup.onConfirmTextChange(event.target.value)}
                      placeholder="DELETE"
                      className="pinstack-field h-9 w-full px-2.5 text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={view.cleanup.onClose}
                      className="pinstack-btn pinstack-btn-ghost motion-button h-8 px-2.5 text-[11px]"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void view.cleanup.onExecute();
                      }}
                      disabled={
                        view.cleanup.busy ||
                        Boolean(view.cleanup.validationMessage) ||
                        view.cleanup.matchCount === 0 ||
                        view.cleanup.confirmText.trim() !== 'DELETE'
                      }
                      className="pinstack-btn pinstack-btn-danger motion-button h-8 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {view.cleanup.busy ? '删除中...' : '批量删除'}
                    </button>
                  </div>
                </div>
              </AnchoredLayer>
            </div>

          </div>
        </div>
      </div>

      {typeof document !== 'undefined' && (isSettingsOpen || isHelpOpen)
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="关闭当前面板"
                onClick={() => {
                  setIsHelpOpen(false);
                  setIsSettingsOpen(false);
                }}
                className="fixed inset-0 z-[80] m-0 border-0 bg-[color:var(--ps-bg-muted)] p-0 outline-none appearance-none backdrop-blur-[8px]"
              />

              {isSettingsOpen ? (
                <div className="pointer-events-none fixed inset-0 z-[90] flex items-start justify-center px-6 pb-6 pt-20">
                  <div className="pointer-events-auto">
                    <SettingsPanel
                      appSettings={view.appSettings}
                      runtimeSettings={view.runtimeSettings}
                      onClose={() => setIsSettingsOpen(false)}
                      mode={settingsMode}
                    />
                  </div>
                </div>
              ) : null}

              {isHelpOpen ? (
                <div className="pointer-events-none fixed inset-0 z-[90] flex items-start justify-center px-6 pb-6 pt-20">
                  <div className="pointer-events-auto">
                    <HelpPanel appSettings={view.appSettings} onClose={() => setIsHelpOpen(false)} />
                  </div>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </>
  );
}
