import { useEffect, useRef, useState } from 'react';
import type {
  PermissionCheckSource,
  CaptureSizeOption,
  RecordItem,
  PermissionItemStatus,
  PermissionStatusSnapshot,
  RuntimeSettings
} from '../shared/types';
import { PinStackIcon, PinStackIconButton } from './design-system/icons';
import { SectionHeader } from './design-system/primitives';
import { AnchoredLayer } from './components/AnchoredLayer';
import { useDomClasses } from './shared/useDomClasses';
import { useCaptureSize } from './hooks/useCaptureSize';
import { useRecording } from './hooks/useRecording';
import { useVaultKeeper } from './features/dashboard/shared/hooks/useVaultKeeper';
import { createTraceId, trackRendererTelemetry } from './shared/telemetry';

const HUB_ENTER_DURATION_FREE = '120ms,120ms,90ms';
const HUB_ENTER_DURATION_FIXED = '80ms,80ms,60ms';
const HUB_TRANSITION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SEGMENTED_DURATION = '180ms';
const FIXED_PANEL_SHELL_DURATION = '280ms,280ms,280ms,280ms';
const FIXED_PANEL_CONTENT_DURATION = '320ms,340ms';

/* ------------------------------------------------------------------ */
/*  VK Quick Tools                                                     */
/* ------------------------------------------------------------------ */

interface VkQuickTool {
  id: string;
  label: string;
  icon: string;
  gradient: string;
  instant?: boolean;
}

const VK_QUICK_TOOLS: VkQuickTool[] = [
  { id: 'convert', label: '转换', icon: 'copy', gradient: 'from-violet-500 to-purple-600' },
  { id: 'image', label: '图片', icon: 'image', gradient: 'from-blue-500 to-cyan-500' },
  { id: 'pack', label: '打包', icon: 'text', gradient: 'from-emerald-500 to-teal-500' },
  { id: 'web', label: '网页', icon: 'launcher', gradient: 'from-amber-500 to-orange-500' },
  { id: 'video', label: '转写', icon: 'panel', gradient: 'from-rose-500 to-pink-500' },
  { id: 'cutout', label: '抠图', icon: 'image', gradient: 'from-fuchsia-500 to-violet-600', instant: true },
];

function CaptureHubVkBar(): JSX.Element {
  const { status: vkStatus } = useVaultKeeper();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const isRunning = true;
  const dotCls = vkStatus?.state === 'error' ? 'bg-red-500' : 'bg-emerald-500 animate-pulse';

  const waitForLatestScreenshotRecord = async (startedAt: number): Promise<RecordItem | null> => {
    const timeoutMs = 12000;
    const intervalMs = 250;
    const begin = Date.now();
    while (Date.now() - begin <= timeoutMs) {
      const recent = await window.pinStack.records.recent(12);
      const target = recent.find((item) => item.type === 'image' && item.source === 'screenshot' && item.createdAt >= startedAt - 1000);
      if (target) {
        return target;
      }
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }
    return null;
  };

  const runCutoutQuickFlow = async () => {
    const startedAt = Date.now();
    const selectionOk = await window.pinStack.capture.takeScreenshot();
    if (!selectionOk) {
      throw new Error('截图已取消');
    }
    const screenshotRecord = await waitForLatestScreenshotRecord(startedAt);
    if (!screenshotRecord) {
      throw new Error('未找到本次截图记录，请重试');
    }
    const cutout = await window.pinStack.cutout.processFromRecord(screenshotRecord.id);
    const saved = await window.pinStack.cutout.saveAsRecord({
      recordId: screenshotRecord.id,
      dataUrl: cutout.dataUrl,
      fileNameSuggestion: cutout.fileNameSuggestion,
    });
    setFeedback({ ok: true, text: `抠图完成，已生成透明 PNG 并回写卡片` });
    void window.pinStack.records.touch(saved.recordId);
  };

  const handleToolClick = (tool: VkQuickTool) => {
    setActiveTool(activeTool === tool.id ? null : tool.id);
    setInputValue('');
    setFeedback(null);
  };

  const handleExecute = async () => {
    if (!isRunning || busy) return;
    if (activeTool !== 'cutout' && !inputValue.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      let result;
      switch (activeTool) {
        case 'convert':
          result = await window.pinStack.vk.task.create({
            type: 'convert',
            sourceType: 'file',
            sourcePath: inputValue.trim(),
            options: { outputMode: 'draft' },
          });
          break;
        case 'image':
          result = await window.pinStack.vk.task.create({
            type: 'extract',
            sourceType: 'image_url',
            sourceUrl: inputValue.trim(),
            options: { outputMode: 'draft' },
          });
          break;
        case 'pack':
          result = await window.pinStack.vk.task.create({
            type: 'extract',
            sourceType: 'folder',
            sourcePath: inputValue.trim(),
            options: { outputMode: 'draft' },
          });
          break;
        case 'web':
          result = await window.pinStack.vk.task.create({
            type: 'extract',
            sourceType: 'url',
            sourceUrl: inputValue.trim(),
            options: { outputMode: 'draft', aiEnhance: true },
          });
          break;
        case 'video':
          result = await window.pinStack.vk.task.create({
            type: 'transcribe',
            sourceType: 'video',
            sourcePath: inputValue.trim(),
            options: { outputMode: 'draft' },
          });
          break;
        case 'cutout':
          await runCutoutQuickFlow();
          return;
        default:
          return;
      }
      setFeedback(result?.id ? { ok: true, text: '任务已提交' } : { ok: false, text: '操作失败' });
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setBusy(false);
    }
  };

  const inputPlaceholder: Record<string, string> = {
    convert: '输入文件路径…',
    image: '输入图片 URL 或网页地址…',
    pack: '输入文件夹路径…',
    web: '输入网站 URL…',
    video: '输入视频/音频文件路径…',
    cutout: '',
  };

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (!next) {
        setActiveTool(null);
        setInputValue('');
        setFeedback(null);
      }
      return next;
    });
  };

  return (
    <div className="mt-3 space-y-2.5">
      <button
        type="button"
        onClick={toggleExpanded}
        className="pinstack-btn pinstack-btn-ghost motion-button flex h-8 w-full items-center gap-2 rounded-[10px] border border-[color:var(--ps-border-subtle)] px-2.5 text-left text-[11px] text-[color:var(--ps-text-secondary)]"
        aria-expanded={isExpanded}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dotCls}`} />
        <span className="font-medium tracking-[0.04em] text-[color:var(--ps-text-tertiary)]">VaultKeeper 快捷工具</span>
        <span className="ml-auto text-[10px] text-[color:var(--ps-text-tertiary)]">{isExpanded ? '收起' : '展开'}</span>
        <PinStackIcon name={isExpanded ? 'arrow-down' : 'arrow-right'} size={14} className="text-[color:var(--ps-text-tertiary)]" />
      </button>

      {isExpanded ? (
        <>
          {/* Tool buttons row */}
          <div className="flex items-center gap-1.5">
            {VK_QUICK_TOOLS.map((tool) => {
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleToolClick(tool)}
                  className={`motion-button group relative flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-center transition-all duration-200 ${
                    isActive
                      ? 'bg-[color:var(--ps-brand-soft)] shadow-[0_2px_8px_rgba(124,92,250,0.10)]'
                      : 'hover:bg-[color:var(--ps-surface-hover)]'
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${tool.gradient} shadow-sm transition-transform duration-200 group-hover:scale-110`}>
                    <PinStackIcon name={tool.icon as any} size={13} className="text-white" />
                  </span>
                  <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-[color:var(--ps-brand-primary)]' : 'text-[color:var(--ps-text-tertiary)]'}`}>
                    {tool.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active tool input */}
          {activeTool && activeTool !== 'cutout' && (
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 px-3 py-1.5 backdrop-blur-sm">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleExecute(); }}
                  placeholder={inputPlaceholder[activeTool] ?? '输入路径…'}
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--ps-text-primary)] outline-none placeholder:text-[color:var(--ps-text-tertiary)]"
                />
                <button
                  type="button"
                  onClick={() => void handleExecute()}
                  disabled={!inputValue.trim() || !isRunning || busy}
                  className="motion-button inline-flex h-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ps-brand-primary)] px-3 text-[11px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? '…' : '执行'}
                </button>
              </div>
              {!isRunning && (
                <p className="mt-1 px-1 text-[10px] text-amber-600">VK 未运行，请先在主面板启动</p>
              )}
              {feedback && (
                <p className={`mt-1 px-1 text-[10px] ${feedback.ok ? 'text-emerald-600' : 'text-red-600'}`}>{feedback.text}</p>
              )}
            </div>
          )}

          {activeTool === 'cutout' ? (
            <div className="overflow-hidden rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 px-3 py-2 backdrop-blur-sm">
              <div className="text-[11px] font-medium text-[color:var(--ps-text-primary)]">透明 PNG 抠图</div>
              <p className="mt-0.5 text-[10px] text-[color:var(--ps-text-tertiary)]">
                点击后直接进入截图，截图完成即自动抠图并回写为新图片卡片。
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleExecute()}
                  disabled={!isRunning || busy}
                  className="motion-button inline-flex h-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ps-brand-primary)] px-3 text-[11px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? '处理中…' : '开始抠图'}
                </button>
              </div>
              {!isRunning ? (
                <p className="mt-1 text-[10px] text-amber-600">VK 未运行，但抠图页仍可打开并执行本地抠图。</p>
              ) : null}
              {feedback ? (
                <p className={`mt-1 text-[10px] ${feedback.ok ? 'text-emerald-600' : 'text-red-600'}`}>{feedback.text}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main CaptureHub                                                    */
/* ------------------------------------------------------------------ */

export function CaptureHub(): JSX.Element {
  const panelRef = useRef<HTMLElement | null>(null);
  const permissionAnchorRef = useRef<HTMLDivElement | null>(null);
  const presetAnchorRef = useRef<HTMLDivElement | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSettings | null>(null);
  const [permissionSnapshot, setPermissionSnapshot] = useState<PermissionStatusSnapshot | null>(null);
  const [screenPermission, setScreenPermission] = useState<PermissionItemStatus | null>(null);
  const [isPermissionPopoverOpen, setIsPermissionPopoverOpen] = useState(false);
  const [isPresetPopoverOpen, setIsPresetPopoverOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<'free' | 'fixed' | 'record' | null>(null);

  const {
    captureMode,
    setCaptureMode,
    customWidth,
    customHeight,
    ratioLocked,
    selectedRatio,
    customSize,
    recentSizes,
    presetSizes,
    presetRatios,
    formatSizeLabel,
    applyRuntimeDefaults,
    applySize,
    applyRatio,
    onWidthChange,
    onHeightChange,
    toggleRatioLock
  } = useCaptureSize(runtime);

  const {
    recordingState,
    recordingFeedback,
    busyAction: recordingBusyAction,
    setBusyAction: setRecordingBusyAction,
    startRecording
  } = useRecording();

  const effectiveBusyAction = busyAction ?? recordingBusyAction;

  useDomClasses();

  useEffect(() => {
    trackRendererTelemetry('renderer.capture.hub.mounted', {
      fixedPresetPanel: 'popover',
      permissionIndicator: 'status-dot'
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRuntime = async () => {
      const nextRuntime = await window.pinStack.settings.runtime.get();
      if (cancelled) {
        return;
      }

      setRuntime(nextRuntime);
      applyRuntimeDefaults(nextRuntime);
    };

    const refreshRuntime = async () => {
      const nextRuntime = await window.pinStack.settings.runtime.get();
      if (cancelled) {
        return;
      }

      setRuntime(nextRuntime);
    };

    const loadPermissions = async (source: PermissionCheckSource) => {
      const permissions = await window.pinStack.permissions.getStatus(source);
      if (cancelled) {
        return;
      }
      setPermissionSnapshot(permissions);
      setScreenPermission(permissions.items.find((item) => item.key === 'screenCapture') ?? null);
    };

    // 页面加载时加载运行时设置（含默认值应用）
    void loadRuntime();
    // 页面加载时只检查一次权限
    void loadPermissions('capture-hub');

    const unsubscribeHubShown = window.pinStack.capture.onHubShown(() => {
      // Capture Hub 再次显示时只刷新运行时设置状态，不覆盖用户手动选择的截图模式
      void refreshRuntime();
    });

    const unsubscribePermissionUpdate = window.pinStack.permissions.onStatusUpdated((snapshot) => {
      if (cancelled) {
        return;
      }
      setPermissionSnapshot(snapshot);
      setScreenPermission(snapshot.items.find((item) => item.key === 'screenCapture') ?? null);
    });

    return () => {
      cancelled = true;
      unsubscribeHubShown();
      unsubscribePermissionUpdate();
    };
  }, [applyRuntimeDefaults]);

  const screenPermissionUsable =
    screenPermission?.state === 'granted' || screenPermission?.state === 'requires-restart';
  const hasPermissionIssue = screenPermission ? !screenPermissionUsable : true;
  const permissionStatusText = screenPermission
    ? hasPermissionIssue
      ? screenPermission.message
      : '屏幕录制权限正常。'
    : '尚未获取权限状态。';

  const refreshPermissionStatus = async (source: PermissionCheckSource = 'manual-refresh', traceId?: string) => {
    const snapshot = await window.pinStack.permissions.refresh(source, traceId);
    setPermissionSnapshot(snapshot);
    setScreenPermission(snapshot.items.find((item) => item.key === 'screenCapture') ?? null);
  };

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const reportHeight = () => {
      const rect = panel.getBoundingClientRect();
      window.pinStack.capture.reportHubHeight(Math.ceil(rect.height + 16));
    };

    reportHeight();
    const raf = window.requestAnimationFrame(reportHeight);

    const observer = new ResizeObserver(() => {
      reportHeight();
    });
    observer.observe(panel);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [captureMode, recordingFeedback, customWidth, customHeight, ratioLocked, selectedRatio, recentSizes.length]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const reportHeight = () => {
      const rect = panel.getBoundingClientRect();
      window.pinStack.capture.reportHubHeight(Math.ceil(rect.height + 16));
    };

    const fastTimer = window.setTimeout(reportHeight, 72);
    const settleTimer = window.setTimeout(reportHeight, 168);

    return () => {
      window.clearTimeout(fastTimer);
      window.clearTimeout(settleTimer);
    };
  }, [captureMode]);

  const startFreeCapture = async () => {
    setBusyAction('free');
    try {
      await window.pinStack.capture.takeScreenshot();
    } finally {
      setBusyAction(null);
    }
  };

  const startFixedCapture = async (size: CaptureSizeOption) => {
    setBusyAction('fixed');
    try {
      await window.pinStack.capture.takeFixedScreenshot(size);
    } finally {
      setBusyAction(null);
    }
  };

  const onStartScreenshot = async () => {
    if (captureMode === 'free') {
      await startFreeCapture();
      return;
    }

    if (customSize) {
      await startFixedCapture(customSize);
    }
  };

  const onStartRecording = async () => {
    await startRecording();
  };

  const panelLabel =
    captureMode === 'fixed' ? '固定尺寸截图' : recordingState.active ? '录屏中' : '桌面快捷捕获';

  return (
    <main className="pinstack-window-page p-1.5">
      <section
        ref={panelRef}
        className="pinstack-window-panel pinstack-window-panel--autoheight flex max-h-[calc(100vh-12px)] flex-col overflow-hidden px-5 py-3 text-black/78 transition-[height,transform,opacity]"
        style={{
          transformOrigin: 'bottom right',
          transitionDuration: captureMode === 'fixed' ? HUB_ENTER_DURATION_FIXED : HUB_ENTER_DURATION_FREE,
          transitionTimingFunction: HUB_TRANSITION_EASING
        }}
      >
        <header className="pinstack-window-header drag-region -mx-5 -mt-3 mb-2 flex items-start justify-between gap-3 px-5 pb-2.5 pt-2.5">
          <div className="min-w-0 pl-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ps-text-tertiary)]">PinStack</div>
            <h2 className="mt-0.5 text-[13px] font-semibold text-[color:var(--ps-text-primary)]">轻量截图工作面板</h2>
            <p className="mt-0.5 text-[10px] font-normal text-[color:var(--ps-text-secondary)]">{panelLabel}</p>
          </div>
          <div className="no-drag flex items-center gap-2">
            <div className="relative" ref={permissionAnchorRef}>
              <button
                type="button"
                onClick={() => setIsPermissionPopoverOpen((prev) => !prev)}
                className="motion-button inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/45 bg-white/65"
                title={hasPermissionIssue ? '权限异常' : '权限正常'}
                aria-label={hasPermissionIssue ? '权限异常' : '权限正常'}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${hasPermissionIssue ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              </button>
              <AnchoredLayer
                open={isPermissionPopoverOpen}
                anchorRef={permissionAnchorRef}
                onRequestClose={() => setIsPermissionPopoverOpen(false)}
                preferredPlacement="bottom"
                align="end"
                offset={8}
                zIndex={240}
                className="motion-popover pinstack-dropdown-shell w-[300px] p-2.5 text-[11px] text-[color:var(--ps-text-secondary)]"
              >
                <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-black/45">权限状态</div>
                <p className="leading-relaxed">{permissionStatusText}</p>
                <p className="mt-1 text-[10px] text-black/50">
                  屏幕录制：{screenPermission?.state ?? 'unknown'}
                </p>
                {permissionSnapshot?.diagnostics.instanceMismatchSuspected ? (
                  <p className="mt-1 text-[10px] text-amber-700">
                    {permissionSnapshot.diagnostics.instanceMismatchMessage ??
                      '当前运行实例可能与系统授权实例不一致。'}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const traceId = createTraceId('capture-hub-permission-refresh');
                      trackRendererTelemetry('renderer.permission.refresh', {
                        scope: 'capture-hub',
                        source: 'manual-refresh'
                      }, { traceId });
                      void refreshPermissionStatus('manual-refresh', traceId);
                    }}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px]"
                  >
                    刷新状态
                  </button>
                  {hasPermissionIssue ? (
                    <button
                      type="button"
                      onClick={() => {
                        const traceId = createTraceId('capture-hub-open-settings');
                        trackRendererTelemetry('renderer.permission.settings.open', {
                          targetKey: 'screenCapture',
                          settingsTarget: 'privacyScreenCapture',
                          source: permissionSnapshot?.source ?? null
                        }, { traceId });
                        void window.pinStack.permissions.openSettings('privacyScreenCapture', traceId);
                      }}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px]"
                    >
                      打开系统设置
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsPermissionPopoverOpen(false)}
                    className="pinstack-btn pinstack-btn-ghost motion-button ml-auto h-7 px-2 text-[10px]"
                  >
                    稍后处理
                  </button>
                </div>
              </AnchoredLayer>
            </div>
            <span className="pinstack-badge px-2 py-1 text-[10px]">PNG</span>
            <PinStackIconButton icon="close" label="关闭截图面板" size="sm" tone="soft" onClick={() => void window.pinStack.capture.hideHub()} />
          </div>
        </header>

        <div className="mt-2 rounded-[11px] border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-subtle)] p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setCaptureMode('free')}
              className={`motion-button flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-medium transition-[background-color,color,box-shadow,transform,opacity] ${
                captureMode === 'free'
                  ? 'border border-[color:var(--ps-border-default)] bg-white text-[color:var(--ps-text-primary)] shadow-[0_1px_4px_rgba(22,22,22,0.06)]'
                  : 'border border-transparent bg-transparent text-[color:var(--ps-text-secondary)] hover:bg-white/55'
              }`}
              style={{
                transitionDuration: SEGMENTED_DURATION,
                transitionTimingFunction: HUB_TRANSITION_EASING
              }}
            >
              <PinStackIcon name="capture" size={14} />
              自由截图
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('fixed')}
              className={`motion-button flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-medium transition-[background-color,color,box-shadow,transform,opacity] ${
                captureMode === 'fixed'
                  ? 'border border-[color:var(--ps-border-default)] bg-white text-[color:var(--ps-text-primary)] shadow-[0_1px_4px_rgba(22,22,22,0.06)]'
                  : 'border border-transparent bg-transparent text-[color:var(--ps-text-secondary)] hover:bg-white/55'
              }`}
              style={{
                transitionDuration: SEGMENTED_DURATION,
                transitionTimingFunction: HUB_TRANSITION_EASING
              }}
            >
              <PinStackIcon name="edit" size={14} />
              固定尺寸
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-y-auto pr-1">
          <div
            className={`overflow-hidden transition-[max-height,opacity,margin,transform] ${
              captureMode === 'fixed'
                ? 'mt-0 max-h-[640px] translate-y-0 opacity-100'
                : 'mt-0 max-h-0 -translate-y-1 opacity-0'
            }`}
            style={{
              transitionDuration: FIXED_PANEL_SHELL_DURATION,
              transitionTimingFunction: HUB_TRANSITION_EASING
            }}
          >
            <div
              className={`space-y-3 transition-[opacity,transform] ${
                captureMode === 'fixed' ? 'translate-y-0 opacity-100' : '-translate-y-0.5 opacity-0'
              }`}
              style={{
                transitionDuration: FIXED_PANEL_CONTENT_DURATION,
                transitionTimingFunction: HUB_TRANSITION_EASING
              }}
            >
              <div className="pinstack-section-panel px-3 py-3">
                <div className="mb-2 text-[11px] font-medium tracking-[0.04em] text-[color:var(--ps-text-tertiary)]">主操作</div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={customWidth}
                    onChange={(event) => onWidthChange(event.target.value)}
                    placeholder="宽"
                    className="pinstack-field h-9 px-3 text-sm"
                  />
                  <span className="text-sm text-[color:var(--ps-text-tertiary)]">×</span>
                  <input
                    inputMode="numeric"
                    value={customHeight}
                    onChange={(event) => onHeightChange(event.target.value)}
                    placeholder="高"
                    className="pinstack-field h-9 px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={toggleRatioLock}
                    className={`pinstack-btn motion-button h-9 shrink-0 whitespace-nowrap px-3 text-[11px] ${
                      ratioLocked ? 'pinstack-btn-secondary' : 'pinstack-btn-ghost'
                    }`}
                  >
                    锁定比例
                  </button>
                </div>
              </div>
              <div className="pinstack-section-panel flex items-center justify-between px-3 py-2">
                <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">
                  当前尺寸：{customSize ? formatSizeLabel(customSize) : '待输入'}
                </div>
                <div className="relative" ref={presetAnchorRef}>
                  <button
                    type="button"
                    onClick={() => setIsPresetPopoverOpen((prev) => !prev)}
                    className="pinstack-btn pinstack-btn-ghost motion-button h-7 px-2 text-[11px]"
                  >
                    尺寸建议
                  </button>
                  <AnchoredLayer
                    open={isPresetPopoverOpen}
                    anchorRef={presetAnchorRef}
                    onRequestClose={() => setIsPresetPopoverOpen(false)}
                    preferredPlacement="bottom"
                    align="end"
                    offset={8}
                    zIndex={235}
                    className="motion-popover pinstack-dropdown-shell w-[292px] p-2.5 text-[11px]"
                  >
                    <div className="space-y-2">
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-black/42">比例预设</div>
                        <div className="flex flex-wrap gap-1.5">
                          {presetRatios.map((ratio) => {
                            const active = ratioLocked && selectedRatio?.label === ratio.label;
                            return (
                              <button
                                key={ratio.label}
                                type="button"
                                onClick={() => applyRatio(ratio)}
                                className={`pinstack-btn motion-button h-7 px-2 text-[10px] ${
                                  active ? 'pinstack-btn-secondary' : 'pinstack-btn-ghost'
                                }`}
                              >
                                {ratio.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-black/42">常用尺寸</div>
                        <div className="flex flex-wrap gap-1.5">
                          {presetSizes.map((size) => (
                            <button
                              key={`${size.width}-${size.height}`}
                              type="button"
                              onClick={() => applySize(size)}
                              className="pinstack-btn pinstack-btn-ghost motion-button h-7 px-2 text-[10px]"
                            >
                              {formatSizeLabel(size)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {recentSizes.length > 0 ? (
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-black/42">最近尺寸</div>
                          <div className="flex flex-wrap gap-1.5">
                            {recentSizes.slice(0, 4).map((size) => (
                              <button
                                key={`recent-${size.width}-${size.height}`}
                                type="button"
                                onClick={() => applySize(size)}
                                className="pinstack-btn motion-button h-7 border border-[rgba(124,92,250,0.14)] bg-[color:var(--ps-brand-soft)] px-2 text-[10px] text-[color:var(--ps-brand-primary)] hover:bg-[color:var(--ps-brand-soft)]"
                              >
                                {formatSizeLabel(size)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </AnchoredLayer>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 shrink-0 border-t border-[color:var(--ps-border-subtle)] pt-3">
          <div className="mb-2 text-[11px] font-medium tracking-[0.04em] text-[color:var(--ps-text-tertiary)]">执行</div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <button
              type="button"
              onClick={() => void onStartScreenshot()}
              disabled={effectiveBusyAction !== null || (captureMode === 'fixed' && !customSize)}
              className="pinstack-btn pinstack-btn-primary motion-button h-9 gap-2 px-3 text-[13px] font-medium disabled:opacity-50"
            >
              <PinStackIcon name="capture" size={16} />
              开始截图
            </button>
            <button
              type="button"
              onClick={() => void onStartRecording()}
              disabled={effectiveBusyAction !== null}
              className="pinstack-btn pinstack-btn-secondary motion-button h-9 min-w-[112px] gap-2 px-3 text-[13px] disabled:opacity-50"
            >
              <PinStackIcon name="record" size={16} />
              {recordingState.active ? '停止录屏' : '开始录屏'}
            </button>
          </div>

          {captureMode === 'fixed' && customSize ? (
            <div className="mt-2 text-[11px] text-[color:var(--ps-text-tertiary)]">当前尺寸 {formatSizeLabel(customSize)}</div>
          ) : null}

          {recordingState.active && recordingState.startedAt ? (
            <div className="mt-2 text-[11px] text-[color:var(--ps-status-danger)]">录屏进行中，可点击桌面悬浮按钮停止。</div>
          ) : null}

          {recordingFeedback ? (
            <div
              className="mt-2 rounded-[10px] border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-bg-surface)] px-3 py-2 text-[11px] text-[color:var(--ps-text-secondary)]"
            >
              {recordingFeedback}
            </div>
          ) : null}

          {/* VaultKeeper Quick Tools */}
          <CaptureHubVkBar />
        </div>
      </section>
    </main>
  );
}
