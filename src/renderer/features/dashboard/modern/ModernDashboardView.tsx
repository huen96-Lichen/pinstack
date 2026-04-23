import { useEffect, useRef, useState } from 'react';
import { ModernAiHubView } from './ModernAiHubView';
import { ModernFavoritesWorkspace } from './ModernFavoritesWorkspace';
import { ModernRecordCardFlow } from './ModernRecordCardFlow';
import { ModernRecordCardImage } from './ModernRecordCardImage';
import { ModernRecordCardText } from './ModernRecordCardText';
import { ModernRecordCardVideo } from './ModernRecordCardVideo';
import { ModernSidebar } from './ModernSidebar';
import { ModernTopBar } from './ModernTopBar';
import { VaultKeeperPage } from '../../../pages/vaultkeeper';
import { CutoutPage } from '../../../pages/cutout';
import type { DashboardViewProps } from '../shared/dashboard.types';
import { promptInput, showAlert } from '../../../shared/dialogUtils';
import { PermissionPrompt } from '../../../components/PermissionPrompt';
import { FirstLaunchGuide } from '../../../components/FirstLaunchGuide';
import type { ScreenshotAttemptDiagnostics } from '../../../../shared/types';

interface ModernDashboardViewProps {
  view: DashboardViewProps;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SystemStatusBar({ view }: { view: DashboardViewProps }): JSX.Element {
  const [isChecking, setIsChecking] = useState(false);
  const [screenshotDiagnostics, setScreenshotDiagnostics] = useState<ScreenshotAttemptDiagnostics | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const diagnostics = await window.pinStack.capture.getScreenshotDiagnostics();
        if (!disposed) {
          setScreenshotDiagnostics(diagnostics);
        }
      } catch {
        if (!disposed) {
          setScreenshotDiagnostics(null);
        }
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [view.permissionStatus?.updatedAt]);

  const permissionTone = !view.permissionStatus
    ? 'border-slate-300/65 bg-slate-100/70 text-slate-700'
    : view.permissionStatus.hasBlockingIssues
      ? 'border-rose-300/70 bg-rose-100/75 text-rose-700'
      : view.permissionStatus.hasIssues
        ? 'border-amber-300/70 bg-amber-100/80 text-amber-800'
        : 'border-emerald-300/70 bg-emerald-100/80 text-emerald-800';

  const permissionText = !view.permissionStatus
    ? '权限状态未获取'
    : view.permissionStatus.hasBlockingIssues
      ? `权限待处理 ${view.permissionStatus.items.filter((item) => item.blocking).length} 项`
      : view.permissionStatus.hasIssues
        ? '权限有风险项，建议检查'
        : '权限正常';

  const captureTone =
    view.runtimeSettings.mode === 'off'
      ? 'border-rose-300/70 bg-rose-100/75 text-rose-700'
      : view.runtimeSettings.enableCaptureLauncher
        ? 'border-emerald-300/70 bg-emerald-100/80 text-emerald-800'
        : 'border-amber-300/70 bg-amber-100/80 text-amber-800';

  const captureText =
    view.runtimeSettings.mode === 'off'
      ? '采集模式已关闭'
      : view.runtimeSettings.enableCaptureLauncher
        ? '采集入口运行中'
        : '采集入口未显示';

  const latestCaptureTone =
    !screenshotDiagnostics || screenshotDiagnostics.executionPath === 'not-run'
      ? 'border-slate-300/65 bg-slate-100/70 text-slate-700'
      : screenshotDiagnostics.success
        ? 'border-emerald-300/70 bg-emerald-100/80 text-emerald-800'
        : 'border-rose-300/70 bg-rose-100/75 text-rose-700';

  const latestCaptureText =
    !screenshotDiagnostics || screenshotDiagnostics.executionPath === 'not-run'
      ? '最近截图：暂无检测'
      : screenshotDiagnostics.success
        ? `最近截图：${formatTime(screenshotDiagnostics.timestamp)} 成功`
        : `最近截图：${formatTime(screenshotDiagnostics.timestamp)} 失败`;

  const runQuickCheck = async () => {
    setIsChecking(true);
    try {
      await view.onRefreshPermissionStatus();
      const diagnostics = await window.pinStack.capture.getScreenshotDiagnostics();
      setScreenshotDiagnostics(diagnostics);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <section className="mb-3 rounded-[12px] border border-[color:var(--ps-border-subtle)] bg-white/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${permissionTone}`}>{permissionText}</span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${captureTone}`}>{captureText}</span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${latestCaptureTone}`}>{latestCaptureText}</span>
        <button
          type="button"
          onClick={() => {
            void runQuickCheck();
          }}
          disabled={isChecking}
          className="pinstack-btn pinstack-btn-secondary motion-button ml-auto h-7 px-2.5 text-[11px] disabled:opacity-60"
        >
          {isChecking ? '检测中...' : '一键检测'}
        </button>
        <button
          type="button"
          onClick={() => {
            void window.pinStack.permissions.openSettings('privacyScreenCapture');
          }}
          className="pinstack-btn pinstack-btn-ghost motion-button h-7 px-2.5 text-[11px]"
        >
          打开系统设置
        </button>
      </div>
    </section>
  );
}

export function ModernDashboardView({ view }: ModernDashboardViewProps): JSX.Element {
  const bulkSecondaryButtonClass =
    'pinstack-btn pinstack-btn-secondary motion-button h-7 shrink-0 whitespace-nowrap px-2.5 text-[11px] disabled:opacity-60';
  const bulkGhostButtonClass = 'pinstack-btn pinstack-btn-ghost motion-button h-7 shrink-0 whitespace-nowrap px-2.5 text-[11px]';
  const isAiHubView = view.primaryNav === 'ai' && view.activeTab === 'all';
  const isVaultKeeperView = view.primaryNav === 'vaultkeeper';
  const isCutoutView = view.primaryNav === 'cutout';
  const recordGridRef = useRef<HTMLElement | null>(null);
  const [highlightRecordGrid, setHighlightRecordGrid] = useState(false);

  useEffect(() => {
    const onFocusRecordGrid = () => {
      const node = recordGridRef.current;
      if (!node) {
        return;
      }
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightRecordGrid(true);
      window.setTimeout(() => setHighlightRecordGrid(false), 1200);
    };
    window.addEventListener('pinstack-focus-record-grid', onFocusRecordGrid as EventListener);
    return () => {
      window.removeEventListener('pinstack-focus-record-grid', onFocusRecordGrid as EventListener);
    };
  }, []);

  return (
    <div className="pinstack-window-page">
      <div className="pinstack-window-panel flex h-full flex-col gap-4 overflow-hidden p-4">
        <ModernTopBar view={view} />

        <div className="no-drag min-h-0 flex-1">
          <div className="flex h-full min-w-0 gap-4">
            {!view.sidebarCollapsed ? <ModernSidebar view={view} /> : null}

            <section className="pinstack-main-panel flex min-w-0 flex-1 flex-col p-4 text-black">
              <SystemStatusBar view={view} />
              <PermissionPrompt status={view.permissionStatus} onRefresh={view.onRefreshPermissionStatus} />

              {view.selectedIds.length > 0 ? (
                <div className="pinstack-section-panel mb-3 flex items-center gap-2 overflow-x-auto px-3 py-2 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <span className="shrink-0 whitespace-nowrap">已选 {view.selectedIds.length} 条</span>
                  <button
                    type="button"
                    onClick={() => {
                      void view.selection.onBulkSetUseCase('prompt');
                    }}
                    disabled={view.bulkBusy !== null}
                    className={bulkSecondaryButtonClass}
                  >
                    设为提示词
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void view.selection.onBulkSetUseCase('fix');
                    }}
                    disabled={view.bulkBusy !== null}
                    className={bulkSecondaryButtonClass}
                  >
                    设为问题修复
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const raw = await promptInput('输入要新增的标签（逗号分隔）', '');
                      if (!raw) {
                        return;
                      }
                      const tags = raw
                        .split(',')
                        .map((tag) => tag.trim().toLowerCase())
                        .filter(Boolean);
                      void view.selection.onBulkAddTags(tags);
                    }}
                    disabled={view.bulkBusy !== null}
                    className={bulkSecondaryButtonClass}
                  >
                    批量加标签
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const raw = await promptInput('输入要移除的标签（逗号分隔）', '');
                      if (!raw) {
                        return;
                      }
                      const tags = raw
                        .split(',')
                        .map((tag) => tag.trim().toLowerCase())
                        .filter(Boolean);
                      void view.selection.onBulkRemoveTags(tags);
                    }}
                    disabled={view.bulkBusy !== null}
                    className={bulkSecondaryButtonClass}
                  >
                    批量删标签
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void view.selection.onBulkCreateFlow();
                    }}
                    disabled={view.bulkBusy !== null || view.selectedIds.length < 2}
                    className={bulkSecondaryButtonClass}
                    title="将当前多选记录组合为一个操作流程"
                  >
                    {view.bulkBusy === 'flow' ? '创建中...' : '创建操作流程'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void view.selection.onBulkPin();
                    }}
                    disabled={view.bulkBusy !== null}
                    className={bulkSecondaryButtonClass}
                  >
                    {view.bulkBusy === 'pin' ? '处理中...' : '批量重新固定'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void window.pinStack.knowledge
                        .ingestRecords(view.selectedIds)
                        .then((results) => {
                          showAlert(`已送入 3.0 收集箱：${results.length} 条。`);
                        })
                        .catch((error: unknown) => {
                          showAlert(error instanceof Error ? error.message : '送入 3.0 收集箱失败');
                        });
                    }}
                    disabled={view.bulkBusy !== null}
                    className={bulkSecondaryButtonClass}
                    title="把当前多选文本记录送入 PinStack 3.0 的内容收集主链路"
                  >
                    送入 3.0 收集箱
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void view.selection.onBulkDelete();
                    }}
                    disabled={view.bulkBusy !== null}
                    className={bulkSecondaryButtonClass}
                  >
                    {view.bulkBusy === 'delete' ? '处理中...' : '批量删除'}
                  </button>
                  <button
                    type="button"
                    onClick={view.selection.onClearSelection}
                    className={bulkGhostButtonClass}
                  >
                    清空选择
                  </button>
                </div>
              ) : null}

              <div className="pinstack-scroll-fade-shell min-h-0 flex-1">
                <div
                  className="pinstack-scroll-fade-content min-h-0 h-full overflow-y-auto pr-2 scroll-smooth-y"
                  onClick={() => {
                    view.selection.onClearSelection();
                  }}
                >
                  {isVaultKeeperView ? <VaultKeeperPage /> : isCutoutView ? <CutoutPage view={view} /> : isAiHubView ? <ModernAiHubView view={view} /> : null}

                  {!isAiHubView && !isVaultKeeperView && !isCutoutView && view.isLoading ? <p className="text-sm text-black/70">加载中...</p> : null}
                  {!isAiHubView && !isVaultKeeperView && !isCutoutView && !view.isLoading && view.filteredRecords.length === 0 ? (
                    <p className="text-sm text-black/70">还没有内容。你可以先复制文本或截图开始收集。</p>
                  ) : null}

                  {view.primaryNav === 'favorites' ? <ModernFavoritesWorkspace view={view} /> : null}

                  {!isAiHubView && !isVaultKeeperView && !isCutoutView && !view.isLoading && view.filteredRecords.length > 0 ? (
                    <section
                      aria-label="Modern Card Grid"
                      ref={recordGridRef}
                      className={highlightRecordGrid ? 'rounded-xl ring-2 ring-[color:var(--ps-brand-primary)] ring-offset-2 ring-offset-white/60 transition-all' : ''}
                    >
                      {view.primaryNav === 'favorites' ? (
                        <div className="mb-3 flex items-end justify-between gap-3 px-1">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/35">收藏内容</div>
                            <h3 className="mt-1 text-lg font-semibold text-black">已收藏内容</h3>
                          </div>
                          <div className="text-xs text-black/45">当前共 {view.filteredRecords.length} 条</div>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {view.filteredRecords.map((item) => {
                          const selected = view.selectedIds.includes(item.id);

                          return (
                            <div
                              key={item.id}
                              className="pinstack-card-enter"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {item.useCase === 'flow' ? (
                                <ModernRecordCardFlow
                                  item={item}
                                  selected={selected}
                                  onSelect={view.selection.onSelectRecord}
                                  actions={view.recordActions}
                                />
                              ) : item.type === 'image' ? (
                                <ModernRecordCardImage
                                  item={item}
                                  previewSrc={view.imagePreviewMap[item.id]}
                                  selected={selected}
                                  onSelect={view.selection.onSelectRecord}
                                  actions={view.recordActions}
                                />
                              ) : item.type === 'video' ? (
                                <ModernRecordCardVideo
                                  item={item}
                                  selected={selected}
                                  onSelect={view.selection.onSelectRecord}
                                  actions={view.recordActions}
                                />
                              ) : (
                                <ModernRecordCardText
                                  item={item}
                                  selected={selected}
                                  onSelect={view.selection.onSelectRecord}
                                  actions={view.recordActions}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      <FirstLaunchGuide recordCount={view.records.length} />
    </div>
  );
}
