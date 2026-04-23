import { useEffect, useMemo, useState } from 'react';
import type {
  PermissionItemStatus,
  PermissionState,
  PermissionStatusSnapshot,
  ScreenshotAttemptDiagnostics
} from '../../shared/types';
import { createTraceId, trackRendererTelemetry } from '../shared/telemetry';

interface PermissionPromptProps {
  status: PermissionStatusSnapshot | null;
  onRefresh: () => Promise<void>;
}

const STATE_LABEL: Record<PermissionState, string> = {
  granted: '已授权',
  denied: '未授权',
  'not-determined': '待授权',
  'requires-restart': '需重启',
  unknown: '未知'
};

function stateTone(state: PermissionState): string {
  if (state === 'granted') {
    return 'bg-emerald-200/70';
  }
  if (state === 'requires-restart' || state === 'not-determined') {
    return 'bg-amber-200/75';
  }
  if (state === 'denied') {
    return 'bg-rose-200/75';
  }
  return 'bg-slate-200/75';
}

export function PermissionPrompt({ status, onRefresh }: PermissionPromptProps): JSX.Element | null {
  const [showDetail, setShowDetail] = useState(false);
  const [openingTarget, setOpeningTarget] = useState<PermissionItemStatus['key'] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [screenshotDiagnostics, setScreenshotDiagnostics] = useState<ScreenshotAttemptDiagnostics | null>(null);

  const issueItems = useMemo(() => {
    return status?.items.filter((item) => item.blocking) ?? [];
  }, [status]);
  const keyItems = useMemo(() => {
    if (!status) {
      return [];
    }
    const ordered: PermissionItemStatus[] = [];
    for (const key of ['screenCapture', 'accessibility', 'automationDependency'] as const) {
      const item = status.items.find((entry) => entry.key === key);
      if (item) {
        ordered.push(item);
      }
    }
    return ordered;
  }, [status]);

  const loadScreenshotDiagnostics = async () => {
    const next = await window.pinStack.capture.getScreenshotDiagnostics();
    setScreenshotDiagnostics(next);
  };

  useEffect(() => {
    if (!showDetail) {
      return;
    }
    void loadScreenshotDiagnostics();
  }, [showDetail]);

  const openSystemSettings = async (item: PermissionItemStatus) => {
    if (!item.canOpenSystemSettings) {
      return;
    }
    const traceId = createTraceId('permission-open-settings');
    trackRendererTelemetry('renderer.permission.settings.open', {
      targetKey: item.key,
      settingsTarget: item.settingsTarget,
      source: status?.source ?? null
    }, { traceId });
    setOpeningTarget(item.key);
    try {
      await window.pinStack.permissions.openSettings(item.settingsTarget, traceId);
    } finally {
      setOpeningTarget(null);
    }
  };

  const refresh = async () => {
    const traceId = createTraceId('permission-refresh');
    trackRendererTelemetry('renderer.permission.refresh', {
      scope: 'dialog',
      source: status?.source ?? null
    }, { traceId });
    setIsRefreshing(true);
    try {
      await onRefresh();
      await loadScreenshotDiagnostics();
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshItem = async (item: PermissionItemStatus) => {
    if (!item.canRetry) {
      return;
    }
    const traceId = createTraceId(`permission-item-refresh-${item.key}`);
    trackRendererTelemetry('renderer.permission.item.refresh', {
      targetKey: item.key,
      source: status?.source ?? null
    }, { traceId });
    setIsRefreshing(true);
    try {
      await window.pinStack.permissions.refresh('permission-dialog', traceId);
      await loadScreenshotDiagnostics();
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyDiagnostics = async () => {
    if (!status) {
      return;
    }
    const traceId = createTraceId('permission-copy-diagnostics');
    const screenItem = status.items.find((item) => item.key === 'screenCapture');
    const lines = [
      `appPath: ${status.diagnostics.appPath}`,
      `bundleId: ${status.diagnostics.bundleId}`,
      `getMediaAccessStatus('screen'): ${screenItem?.systemStatus ?? 'n/a'}`,
      `accessibilityTrusted: ${status.items.find((item) => item.key === 'accessibility')?.state ?? 'n/a'}`,
      `captureMode: ${screenshotDiagnostics?.captureMode ?? 'n/a'}`,
      `screenshotTrigger: ${screenshotDiagnostics?.trigger ?? 'n/a'}`,
      `screenshotExecutionPath: ${screenshotDiagnostics?.executionPath ?? 'n/a'}`,
      `screenshotCommand: ${screenshotDiagnostics?.command ?? 'n/a'}`,
      `screenshotSuccess: ${String(screenshotDiagnostics?.success ?? false)}`,
      `screenshotError: ${screenshotDiagnostics?.error ?? 'n/a'}`,
      `screenshotStack: ${screenshotDiagnostics?.stack ?? 'n/a'}`,
      `screenProbe.desktop: ${screenItem?.desktopProbeStatus ?? 'n/a'}`,
      `screenProbe.desktopError: ${screenItem?.desktopProbeError ?? 'n/a'}`,
      `screenProbe.screenshot: ${screenItem?.probeStatus ?? 'n/a'}`,
      `screenProbe.screenshotError: ${screenItem?.probeError ?? 'n/a'}`,
      `permissionSource: ${status.source}`,
      `checkedAt: ${new Date(status.updatedAt).toISOString()}`
    ];
    await window.pinStack.capture.ignoreNextCopy();
    await navigator.clipboard.writeText(lines.join('\n'));
    trackRendererTelemetry('renderer.permission.diagnostics.copy', {
      source: status.source,
      hasScreenshotDiagnostics: Boolean(screenshotDiagnostics)
    }, { traceId });
  };

  if (!status || !status.hasBlockingIssues) {
    return null;
  }

  return (
    <>
      <div className="radius-l3 mb-3 flex items-center gap-2 border border-amber-500/35 bg-amber-100/60 px-3 py-2 text-xs text-black shadow-[0_8px_18px_rgba(245,158,11,0.15)]">
        <span className="font-semibold">系统检查</span>
        <span className="truncate text-black/75">
          发现 {issueItems.length} 个阻塞项，可能导致截图或自动化行为无响应
        </span>
        <button
          type="button"
          onClick={() => {
            const traceId = createTraceId('permission-details-open');
            setShowDetail(true);
            trackRendererTelemetry('renderer.permission.details.opened', {
              source: status.source
            }, { traceId });
            void window.pinStack.permissions.refresh('permission-dialog', traceId).then(loadScreenshotDiagnostics);
          }}
          className="motion-button radius-control ml-auto border border-amber-600/35 bg-white/65 px-2 py-1 font-medium hover:bg-white/80"
        >
          查看并修复
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          className="motion-button radius-control border border-white/45 bg-white/55 px-2 py-1 hover:bg-white/75 disabled:opacity-60"
        >
          {isRefreshing ? '检测中...' : '一键检测'}
        </button>
      </div>

      {showDetail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onClick={() => setShowDetail(false)}
        >
          <section
            className="glass-surface glass-l3 radius-l2 w-full max-w-[620px] border border-white/35 p-4 text-black shadow-[0_24px_48px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">权限与可用性诊断（按顺序处理）</h2>
              <button
                type="button"
                onClick={() => setShowDetail(false)}
                className="motion-button radius-control border border-white/40 bg-white/55 px-2 py-1 text-xs hover:bg-white/75"
              >
                先关闭
              </button>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
              {keyItems.map((item) => (
                <div key={`summary-${item.key}`} className="radius-l3 border border-white/35 bg-white/35 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{item.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${stateTone(item.state)}`}>
                      {STATE_LABEL[item.state]}
                    </span>
                  </div>
                  <p className="mt-1 text-black/75">{item.message}</p>
                </div>
              ))}
            </div>

            <ul className="max-h-[46vh] space-y-2 overflow-auto pr-1 text-xs">
              {status.items.map((item) => (
                <li
                  key={item.key}
                  className={`radius-l3 border px-3 py-2 ${
                    item.needsAttention ? 'border-amber-500/35 bg-amber-100/45' : 'border-white/35 bg-white/35'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{item.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${stateTone(item.state)}`}>
                      {STATE_LABEL[item.state]}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {item.canRetry ? (
                        <button
                          type="button"
                          onClick={() => void refreshItem(item)}
                          disabled={isRefreshing}
                          className="motion-button radius-control border border-white/45 bg-white/60 px-2 py-1 text-[11px] font-medium hover:bg-white/80 disabled:opacity-60"
                        >
                          {isRefreshing ? '刷新中...' : '刷新状态'}
                        </button>
                      ) : null}
                      {item.canOpenSystemSettings ? (
                        <button
                          type="button"
                          onClick={() => void openSystemSettings(item)}
                          disabled={openingTarget !== null}
                          className="motion-button radius-control border border-white/45 bg-white/60 px-2 py-1 text-[11px] font-medium hover:bg-white/80 disabled:opacity-60"
                        >
                          {openingTarget === item.key ? '打开中...' : '打开系统设置'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-black/75">{item.message}</p>
                  <p className="mt-1 text-[11px] text-black/50">
                    最近检查：{new Date(item.lastCheckedAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>

            <details className="mt-3 rounded-[12px] border border-white/35 bg-white/35 px-3 py-2 text-xs text-black/70">
              <summary className="cursor-pointer font-medium">权限诊断信息</summary>
              <div className="mt-2 space-y-1">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void copyDiagnostics()}
                    className="motion-button radius-control border border-white/45 bg-white/60 px-2 py-1 text-[11px] font-medium hover:bg-white/80"
                  >
                    复制诊断日志
                  </button>
                </div>
                <p>最近检查来源：{status.source}</p>
                <p>最近检查时间：{new Date(status.updatedAt).toLocaleString()}</p>
                <p>自动化能力：{status.diagnostics.automationCapability}</p>
                <p>App 路径：{status.diagnostics.appPath}</p>
                {status.diagnostics.appBundlePath ? <p>App 包路径：{status.diagnostics.appBundlePath}</p> : null}
                <p>可执行文件：{status.diagnostics.executablePath}</p>
                <p>Bundle ID：{status.diagnostics.bundleId}</p>
                <p>运行模式：{status.diagnostics.isDev ? 'dev' : 'prod'}</p>
                <p>安装路径稳定性：{status.diagnostics.installLocationStable ? 'stable' : 'unstable'}</p>
                {status.diagnostics.installLocationMessage ? (
                  <p className="text-amber-700">安装提示：{status.diagnostics.installLocationMessage}</p>
                ) : null}
                {status.items
                  .filter((item) => item.key === 'screenCapture')
                  .map((item) => (
                    <div key="screenCaptureDebug" className="space-y-1">
                      <p>
                        屏幕录制诊断：system={item.systemStatus ?? 'n/a'} · screenshotProbe={item.probeStatus ?? 'n/a'} ·
                        desktopProbe={item.desktopProbeStatus ?? 'n/a'}
                      </p>
                      {item.probeError ? <p className="text-amber-700">截图探测：{item.probeError}</p> : null}
                      {item.desktopProbeError ? <p className="text-amber-700">桌面源探测：{item.desktopProbeError}</p> : null}
                    </div>
                  ))}
                {screenshotDiagnostics ? (
                  <div className="space-y-1 rounded-[10px] border border-white/30 bg-white/40 px-2 py-2">
                    <p>最近截图尝试：mode={screenshotDiagnostics.captureMode} · trigger={screenshotDiagnostics.trigger}</p>
                    <p>执行链路：{screenshotDiagnostics.executionPath}</p>
                    {screenshotDiagnostics.command ? <p>实际命令/函数：{screenshotDiagnostics.command}</p> : null}
                    <p>成功：{screenshotDiagnostics.success ? 'yes' : 'no'}</p>
                    {screenshotDiagnostics.error ? <p className="text-amber-700">失败原因：{screenshotDiagnostics.error}</p> : null}
                    {screenshotDiagnostics.stack ? <p className="text-amber-700">错误栈：{screenshotDiagnostics.stack}</p> : null}
                  </div>
                ) : (
                  <p>最近截图尝试：暂无记录</p>
                )}
                {status.diagnostics.instanceMismatchSuspected ? (
                  <p className="text-amber-700">
                    实例提示：{status.diagnostics.instanceMismatchMessage ?? '当前运行实例可能与系统授权实例不一致。'}
                  </p>
                ) : null}
              </div>
            </details>
          </section>
        </div>
      ) : null}
    </>
  );
}
