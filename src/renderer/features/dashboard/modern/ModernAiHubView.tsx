import { useEffect, useMemo, useState } from 'react';
import type { DashboardViewProps } from '../shared/dashboard.types';
import { getAiConnectionLabel, getAiResponseModeLabel } from '../shared/dashboardUtils';
import { PinStackIcon, type PinStackIconName } from '../../../design-system/icons';
import { showAlert } from '../../../shared/dialogUtils';

interface ModernAiHubViewProps {
  view: DashboardViewProps;
}

type AiHubDetailTab = 'recent' | 'strategy' | 'chat';
type TaskRunStatus = 'success' | 'warning' | 'error';
type AiStrategyPreset = 'local_first' | 'balanced' | 'high_quality';
type ModelPairTemplateId = 'fast_local' | 'balanced_output' | 'high_quality_writing';
const AI_STRATEGY_PRESETS: Array<{ id: AiStrategyPreset; label: string; hint: string }> = [
  { id: 'local_first', label: '本地优先', hint: '低成本、低延迟' },
  { id: 'balanced', label: '平衡', hint: '默认本地，必要时降级' },
  { id: 'high_quality', label: '高质量', hint: '复杂任务优先云端' }
];
const MODEL_PAIR_TEMPLATES: Array<{ id: ModelPairTemplateId; label: string; hint: string }> = [
  { id: 'fast_local', label: '极速本地', hint: '轻量本地模型，低延迟' },
  { id: 'balanced_output', label: '平衡产出', hint: '本地主力 + 云端备用' },
  { id: 'high_quality_writing', label: '高质量写作', hint: '云端优先，适合正式文稿' }
];

interface TaskRun {
  id: string;
  name: string;
  status: TaskRunStatus;
  detail: string;
  output: string;
  route?: string;
  recordId?: string;
  at: number;
}

interface TaskCard {
  id: string;
  icon: PinStackIconName;
  title: string;
  description: string;
  pipeline: string;
  output: string;
  actionLabel: string;
  run: () => Promise<void>;
}
type TaskCardId = TaskCard['id'];

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  if (delta < 60_000) {
    return '刚刚';
  }
  if (delta < 3_600_000) {
    return `${Math.floor(delta / 60_000)} 分钟前`;
  }
  if (delta < 86_400_000) {
    return `${Math.floor(delta / 3_600_000)} 小时前`;
  }
  return `${Math.floor(delta / 86_400_000)} 天前`;
}

function statusPillClass(status: TaskRunStatus): string {
  if (status === 'success') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
  }
  if (status === 'warning') {
    return 'bg-amber-50 text-amber-700 border-amber-200/80';
  }
  return 'bg-rose-50 text-rose-700 border-rose-200/80';
}

function runtimeToneClass(connectionLabel: string): string {
  if (connectionLabel === '已连接') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
  }
  if (connectionLabel === '连接超时' || connectionLabel === '错误') {
    return 'bg-rose-50 text-rose-700 border-rose-200/80';
  }
  return 'bg-amber-50 text-amber-700 border-amber-200/80';
}

async function withSelectedRecord(
  view: DashboardViewProps,
  taskName: string,
  run: (recordId: string) => Promise<void>
): Promise<{ status: TaskRunStatus; detail: string }> {
  const recordId = view.selectedIds[0];
  if (!recordId) {
    view.filters.onPrimaryNavChange('all');
    view.filters.onUseCaseTabChange('all');
    window.dispatchEvent(new CustomEvent('pinstack-focus-record-grid'));
    showAlert(`请先选择一条记录，再执行「${taskName}」。已自动切回内容列表。`);
    return {
      status: 'warning',
      detail: `${taskName}前请先在右侧内容区选择一条记录。`
    };
  }

  try {
    await run(recordId);
    return {
      status: 'success',
      detail: '已执行并写回系统。'
    };
  } catch (error) {
    return {
      status: 'error',
      detail: error instanceof Error ? error.message : '执行失败，请稍后重试。'
    };
  }
}

export function ModernAiHubView({ view }: ModernAiHubViewProps): JSX.Element {
  const [detailTab, setDetailTab] = useState<AiHubDetailTab>('recent');
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>([]);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [strategyBusy, setStrategyBusy] = useState<AiStrategyPreset | null>(null);
  const [strategyNotice, setStrategyNotice] = useState<string | null>(null);
  const [modelPairBusy, setModelPairBusy] = useState(false);
  const [modelPairNotice, setModelPairNotice] = useState<string | null>(null);

  const currentStrategyPreset: AiStrategyPreset =
    view.appSettings.aiHub.defaultProvider === 'cloud'
      ? 'high_quality'
      : view.appSettings.aiHub.allowFallback
        ? 'balanced'
        : 'local_first';
  const strategyLabel =
    currentStrategyPreset === 'high_quality'
      ? '高质量模式'
      : currentStrategyPreset === 'balanced'
        ? '平衡模式'
        : '本地优先';
  const currentPipeline = 'E4B → Qwen A3B → 云端强模型';
  const outputTarget = `${view.appSettings.storageRoot} / VaultKeeper / 当前卡片`;
  const connectionLabel = getAiConnectionLabel(view.ai.runtimeStatus);
  const responseModeLabel = getAiResponseModeLabel(view.ai.runtimeStatus);
  const runtimeLabel = `${connectionLabel} · ${responseModeLabel}`;
  const runtimeMessage = view.ai.runtimeStatus?.message ?? '尚未检查运行状态';
  const totalRecords = view.records.length;
  const aiRecordCount = view.records.filter((record) => record.useCase !== 'unclassified').length;
  const localModelCandidates = useMemo(
    () => view.ai.modelCatalog.filter((item) => item.channel === 'local'),
    [view.ai.modelCatalog]
  );
  const cloudModelCandidates = useMemo(
    () => view.ai.modelCatalog.filter((item) => item.channel === 'cloud'),
    [view.ai.modelCatalog]
  );
  const preferredLocalModelId =
    view.appSettings.aiHub.preferredLocalModelId ||
    localModelCandidates.find((item) => item.isAvailable)?.id ||
    localModelCandidates[0]?.id ||
    view.appSettings.aiHub.defaultModelId;
  const preferredCloudModelId =
    view.appSettings.aiHub.preferredCloudModelId ||
    cloudModelCandidates.find((item) => item.isConfigured || item.isAvailable)?.id ||
    cloudModelCandidates[0]?.id ||
    view.appSettings.aiHub.cloudModelId ||
    'cloud:mock';
  const latestResult = useMemo(
    () =>
      [...view.records].sort((a, b) => {
        const aTime = Math.max(a.lastUsedAt || 0, a.createdAt || 0);
        const bTime = Math.max(b.lastUsedAt || 0, b.createdAt || 0);
        return bTime - aTime;
      })[0] ?? null,
    [view.records]
  );

  const pushRun = (
    name: string,
    status: TaskRunStatus,
    detail: string,
    output: string,
    recordId?: string,
    route?: string
  ) => {
    setTaskRuns((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        status,
        detail,
        output,
        route,
        recordId,
        at: Date.now()
      },
      ...prev
    ].slice(0, 20));
  };

  const tasks: TaskCard[] = [
    {
      id: 'organize-current',
      icon: 'spark',
      title: '整理当前卡片',
      description: '自动生成标题与摘要，快速收口当前内容。',
      pipeline: 'E4B → Qwen(超长时)',
      output: '输出到当前卡片',
      actionLabel: '立即整理',
      run: async () => {
        const result = await withSelectedRecord(view, '整理当前卡片', async (recordId) => {
          const executed = await window.pinStack.ai.runOrchestratorTask({
            taskType: 'organize_current',
            recordId
          });
          pushRun(
            '整理当前卡片',
            executed.status,
            executed.message,
            executed.outputTarget,
            recordId,
            `${executed.route.provider} · ${executed.route.model}`
          );
        });
        if (result.status === 'warning') {
          pushRun('整理当前卡片', result.status, result.detail, '当前卡片', view.selectedIds[0]);
        }
      }
    },
    {
      id: 'summary',
      icon: 'text',
      title: '生成摘要',
      description: '为当前记录生成一段式总结，便于复用和检索。',
      pipeline: 'E4B / Qwen',
      output: '输出到摘要字段',
      actionLabel: '生成摘要',
      run: async () => {
        const result = await withSelectedRecord(view, '生成摘要', async (recordId) => {
          const executed = await window.pinStack.ai.runOrchestratorTask({
            taskType: 'generate_summary',
            recordId
          });
          pushRun(
            '生成摘要',
            executed.status,
            executed.message,
            executed.outputTarget,
            recordId,
            `${executed.route.provider} · ${executed.route.model}`
          );
        });
        if (result.status === 'warning') {
          pushRun('生成摘要', result.status, result.detail, '摘要字段', view.selectedIds[0]);
        }
      }
    },
    {
      id: 'markdown',
      icon: 'edit',
      title: '整理为 Markdown',
      description: '进入 VaultKeeper 进行结构化整理并导出文档。',
      pipeline: 'Qwen → VaultKeeper',
      output: '输出到资料库文档',
      actionLabel: '进入整理',
      run: async () => {
        const executed = await window.pinStack.ai.runOrchestratorTask({
          taskType: 'format_markdown'
        });
        if (executed.actionHint === 'navigate_vaultkeeper') {
          view.filters.onPrimaryNavChange('vaultkeeper');
        }
        pushRun(
          '整理为 Markdown',
          executed.status,
          executed.message,
          executed.outputTarget,
          undefined,
          `${executed.route.provider} · ${executed.route.model}`
        );
      }
    },
    {
      id: 'meta',
      icon: 'filter',
      title: '补标签与 frontmatter',
      description: '为当前记录补充标签，准备后续 frontmatter 结构。',
      pipeline: 'E4B',
      output: '输出到元数据字段',
      actionLabel: '补齐元数据',
      run: async () => {
        const result = await withSelectedRecord(view, '补标签与 frontmatter', async (recordId) => {
          const executed = await window.pinStack.ai.runOrchestratorTask({
            taskType: 'enrich_metadata',
            recordId
          });
          pushRun(
            '补标签与 frontmatter',
            executed.status,
            executed.message,
            executed.outputTarget,
            recordId,
            `${executed.route.provider} · ${executed.route.model}`
          );
        });
        if (result.status === 'warning') {
          pushRun('补标签与 frontmatter', result.status, result.detail, 'tags / frontmatter', view.selectedIds[0]);
        }
      }
    },
    {
      id: 'formal-doc',
      icon: 'record',
      title: '写正式文档',
      description: '打开自由对话，按高质量路径生成正式文稿。',
      pipeline: 'Qwen / 云端强模型',
      output: '输出到卡片或 Markdown',
      actionLabel: '开始写作',
      run: async () => {
        const executed = await window.pinStack.ai.runOrchestratorTask({
          taskType: 'write_formal_doc'
        });
        if (executed.actionHint === 'open_ai_chat') {
          setDetailTab('chat');
          window.dispatchEvent(new CustomEvent('pinstack-open-ai-chat'));
        }
        pushRun(
          '写正式文档',
          executed.status,
          executed.message,
          executed.outputTarget,
          undefined,
          `${executed.route.provider} · ${executed.route.model}`
        );
      }
    },
    {
      id: 'vk',
      icon: 'panel',
      title: '打开 VaultKeeper 处理',
      description: '进入素材处理引擎，执行网页/视频等重处理链路。',
      pipeline: 'VaultKeeper',
      output: '输出到 VK 流程',
      actionLabel: '打开 VK',
      run: async () => {
        const executed = await window.pinStack.ai.runOrchestratorTask({
          taskType: 'open_vaultkeeper'
        });
        if (executed.actionHint === 'navigate_vaultkeeper') {
          view.filters.onPrimaryNavChange('vaultkeeper');
        }
        pushRun(
          '打开 VaultKeeper 处理',
          executed.status,
          executed.message,
          executed.outputTarget,
          undefined,
          `${executed.route.provider} · ${executed.route.model}`
        );
      }
    }
  ];

  const runTask = async (task: TaskCard) => {
    setTaskBusyId(task.id);
    try {
      await task.run();
    } finally {
      setTaskBusyId(null);
    }
  };

  useEffect(() => {
    const onRunTask = (event: Event) => {
      const custom = event as CustomEvent<{ taskId?: TaskCardId }>;
      const taskId = custom.detail?.taskId;
      if (!taskId || taskBusyId) {
        return;
      }
      const targetTask = tasks.find((task) => task.id === taskId);
      if (!targetTask) {
        return;
      }
      void runTask(targetTask);
    };
    window.addEventListener('pinstack-ai-hub-run-task', onRunTask as EventListener);
    return () => {
      window.removeEventListener('pinstack-ai-hub-run-task', onRunTask as EventListener);
    };
  }, [tasks, taskBusyId]);

  const applyStrategyPreset = async (preset: AiStrategyPreset) => {
    if (strategyBusy) {
      return;
    }
    setStrategyBusy(preset);
    setStrategyNotice(null);
    try {
      const localCandidates = view.ai.modelCatalog.filter((item) => item.channel === 'local');
      const cloudCandidates = view.ai.modelCatalog.filter((item) => item.channel === 'cloud');
      const currentModelId = view.appSettings.aiHub.defaultModelId;
      const localModelId =
        view.appSettings.aiHub.preferredLocalModelId ||
        (localCandidates.find((item) => item.id === currentModelId)?.id ??
          localCandidates.find((item) => item.isAvailable)?.id ??
          localCandidates[0]?.id ??
          currentModelId);
      const cloudModelId =
        view.appSettings.aiHub.preferredCloudModelId ||
        (cloudCandidates.find((item) => item.id === currentModelId)?.id ??
          cloudCandidates.find((item) => item.isConfigured || item.isAvailable)?.id ??
          cloudCandidates[0]?.id ??
          null);

      if (preset === 'high_quality' && !cloudModelId) {
        setStrategyNotice('未检测到可用云端模型，已保留当前策略。请先在设置里配置云端模型。');
        return;
      }

      const patch =
        preset === 'local_first'
          ? {
              defaultProvider: 'local' as const,
              allowFallback: false,
              defaultModelId: localModelId,
              preferredLocalModelId: localModelId
            }
          : preset === 'balanced'
            ? {
                defaultProvider: 'local' as const,
                allowFallback: true,
                defaultModelId: localModelId,
                preferredLocalModelId: localModelId
              }
            : {
                defaultProvider: 'cloud' as const,
                allowFallback: true,
                defaultModelId: cloudModelId as string,
                preferredCloudModelId: cloudModelId as string
              };

      await window.pinStack.settings.set({
        aiHub: {
          ...view.appSettings.aiHub,
          ...patch
        }
      });
      await view.ai.onRefreshRuntime();

      const successText =
        preset === 'local_first'
          ? '已切换为本地优先：轻任务走本地，不自动降级。'
          : preset === 'balanced'
            ? '已切换为平衡模式：默认本地，必要时允许降级。'
            : '已切换为高质量模式：复杂任务优先云端强模型。';
      setStrategyNotice(successText);
    } catch (error) {
      setStrategyNotice(error instanceof Error ? `策略切换失败：${error.message}` : '策略切换失败，请稍后重试。');
    } finally {
      setStrategyBusy(null);
    }
  };

  const saveModelPair = async (
    nextLocalModelId: string,
    nextCloudModelId: string,
    applyNow: 'none' | 'local' | 'cloud' | 'balanced' = 'none'
  ) => {
    if (modelPairBusy) {
      return;
    }
    setModelPairBusy(true);
    setModelPairNotice(null);
    try {
      const aiHubPatch: Partial<typeof view.appSettings.aiHub> = {
        preferredLocalModelId: nextLocalModelId,
        preferredCloudModelId: nextCloudModelId
      };
      if (applyNow === 'local') {
        aiHubPatch.defaultProvider = 'local';
        aiHubPatch.defaultModelId = nextLocalModelId;
      }
      if (applyNow === 'cloud') {
        aiHubPatch.defaultProvider = 'cloud';
        aiHubPatch.defaultModelId = nextCloudModelId;
      }
      if (applyNow === 'balanced') {
        aiHubPatch.defaultProvider = 'local';
        aiHubPatch.allowFallback = true;
        aiHubPatch.defaultModelId = nextLocalModelId;
      }
      await window.pinStack.settings.set({
        aiHub: {
          ...view.appSettings.aiHub,
          ...aiHubPatch
        }
      });
      await view.ai.onRefreshRuntime();
      setModelPairNotice(
        applyNow === 'local'
          ? '模型搭配已保存，并已应用为本地优先执行。'
          : applyNow === 'balanced'
            ? '模型搭配已保存，并已应用为平衡策略。'
          : applyNow === 'cloud'
            ? '模型搭配已保存，并已应用为高质量执行。'
            : '模型搭配已保存。'
      );
    } catch (error) {
      setModelPairNotice(error instanceof Error ? `模型搭配保存失败：${error.message}` : '模型搭配保存失败。');
    } finally {
      setModelPairBusy(false);
    }
  };

  const applyModelTemplate = async (templateId: ModelPairTemplateId) => {
    const findLocal = (...keywords: string[]) =>
      localModelCandidates.find((item) =>
        keywords.some((keyword) => item.id.toLowerCase().includes(keyword) || item.displayName.toLowerCase().includes(keyword))
      )?.id;
    const findCloud = () =>
      cloudModelCandidates.find((item) => item.isConfigured || item.isAvailable)?.id ||
      cloudModelCandidates[0]?.id ||
      preferredCloudModelId;

    if (templateId === 'fast_local') {
      const local = findLocal('e4b', 'gemma4') || preferredLocalModelId;
      await saveModelPair(local, preferredCloudModelId, 'local');
      return;
    }
    if (templateId === 'balanced_output') {
      const local = findLocal('qwen', 'gemma3:12b', 'gemma 3 12b') || preferredLocalModelId;
      const cloud = findCloud();
      await saveModelPair(local, cloud, 'balanced');
      return;
    }
    const local = findLocal('qwen', 'gemma3:12b', 'gemma 3 12b') || preferredLocalModelId;
    const cloud = findCloud();
    await saveModelPair(local, cloud, 'cloud');
  };

  const renderStrategySwitch = (compact = false): JSX.Element => (
    <div className={`rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] ${compact ? 'p-1.5' : 'p-1'}`}>
      {!compact ? <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-black/40">策略切换</div> : null}
      <div className={`grid ${compact ? 'grid-cols-1 gap-1' : 'grid-cols-3 gap-1'}`}>
        {AI_STRATEGY_PRESETS.map((item) => {
          const active = currentStrategyPreset === item.id;
          const busy = strategyBusy === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => void applyStrategyPreset(item.id)}
              disabled={strategyBusy !== null}
              className={`motion-button rounded-md px-2 ${compact ? 'h-7 text-[10px]' : 'h-8 text-[11px]'} ${
                active
                  ? 'bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,0.06)]'
                  : 'text-black/56 hover:text-black/82'
              } disabled:opacity-55`}
              title={item.hint}
            >
              {busy ? '切换中...' : item.label}
            </button>
          );
        })}
      </div>
      {strategyNotice ? <div className={`${compact ? 'mt-1 px-0.5 text-[10px]' : 'mt-2 px-1 text-[11px]'} text-black/58`}>{strategyNotice}</div> : null}
    </div>
  );

  return (
    <section aria-label="AI 管家中心" className="mb-3 space-y-3">
      <div className="pinstack-section-panel overflow-hidden px-4 py-3">
        <div className="rounded-2xl border border-[color:var(--ps-border-subtle)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,246,255,0.84))] p-4 shadow-[0_10px_24px_rgba(22,22,22,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="pinstack-section-eyebrow">AI ORCHESTRATOR</div>
              <h2 className="pinstack-section-title">AI 管家中心</h2>
              <p className="pinstack-section-description max-w-[760px]">
                本地优先，自动选择合适的模型与工具，把结果整理后写回系统。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${runtimeToneClass(connectionLabel)}`}>
                {runtimeLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!latestResult) {
                    return;
                  }
                  void view.recordActions.onOpenRecord(latestResult.id);
                }}
                disabled={!latestResult}
                className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px] disabled:opacity-55"
              >
                打开最近结果
              </button>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-black/58">{runtimeMessage}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="pinstack-section-panel px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">当前策略</div>
          <div className="mt-2 text-[18px] font-semibold text-black/84">{strategyLabel}</div>
          <p className="mt-1 text-[12px] text-black/54">小任务优先本地执行，复杂任务按策略升级。</p>
          <div className="mt-2">{renderStrategySwitch(true)}</div>
        </div>
        <div className="pinstack-section-panel px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">默认执行链路</div>
          <div className="mt-2 text-[14px] font-semibold text-black/84">{currentPipeline}</div>
          <p className="mt-1 text-[12px] text-black/54">当前状态：{runtimeLabel}</p>
        </div>
        <div className="pinstack-section-panel px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">输出去向</div>
          <div className="mt-2 text-[14px] font-semibold text-black/84">统一回写</div>
          <p className="mt-1 text-[12px] text-black/54">{outputTarget}</p>
        </div>
      </div>

      <div className="pinstack-section-panel px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/40">主任务入口</div>
            <div className="mt-1 text-[13px] text-black/56">先做事，再看技术细节。</div>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('pinstack-open-settings', { detail: { mode: 'ai' } }))}
            className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px]"
          >
            打开 AI 设置
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="motion-card rounded-2xl border border-[color:var(--ps-border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(252,251,255,0.82))] px-3 py-3 shadow-[0_6px_20px_rgba(22,22,22,0.04)]"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--ps-brand-soft)] text-[color:var(--ps-brand-primary)]">
                  <PinStackIcon name={task.icon} size={14} />
                </span>
                <h3 className="text-[14px] font-semibold text-black/86">{task.title}</h3>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-black/58">{task.description}</p>
              <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-black/38">{task.pipeline}</div>
              <div className="mt-0.5 text-[11px] text-black/48">{task.output}</div>
              <button
                type="button"
                onClick={() => void runTask(task)}
                disabled={taskBusyId !== null}
                className="pinstack-btn pinstack-btn-secondary motion-button mt-3 h-8 w-full px-3 text-[11px] disabled:opacity-55"
              >
                {taskBusyId === task.id ? '处理中...' : task.actionLabel}
              </button>
            </article>
          ))}
        </div>
      </div>

      <div className="pinstack-section-panel px-3 py-3">
        <div className="mb-3 flex items-center gap-1 rounded-lg bg-white/60 p-1">
          {[
            { id: 'recent' as const, label: '最近任务' },
            { id: 'strategy' as const, label: '策略与模型' },
            { id: 'chat' as const, label: '自由对话' }
          ].map((tab) => {
            const active = detailTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDetailTab(tab.id)}
                className={`motion-button h-8 rounded-md px-3 text-[12px] ${
                  active
                    ? 'bg-white text-black shadow-[0_2px_10px_rgba(0,0,0,0.06)]'
                    : 'text-black/54 hover:text-black/82'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {detailTab === 'recent' ? (
          <div className="space-y-2">
            {latestResult ? (
              <div className="rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-black/38">最近结果</div>
                <div className="mt-1 text-[13px] font-medium text-black/82">{latestResult.displayName || latestResult.id}</div>
                <div className="mt-1 text-[11px] text-black/52">最近更新时间：{formatRelativeTime(Math.max(latestResult.lastUsedAt, latestResult.createdAt))}</div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => void view.recordActions.onOpenRecord(latestResult.id)}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2.5 text-[11px]"
                  >
                    打开该结果
                  </button>
                </div>
              </div>
            ) : null}
            {taskRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[color:var(--ps-border-subtle)] px-3 py-6 text-center text-[12px] text-black/48">
                暂无任务记录。先从上面的任务卡片开始一次处理。
              </div>
            ) : (
              taskRuns.map((run) => (
                <div key={run.id} className="rounded-lg border border-[color:var(--ps-border-subtle)] bg-white/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-medium text-black/86">{run.name}</div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusPillClass(run.status)}`}>
                      {run.status === 'success' ? '成功' : run.status === 'warning' ? '提示' : '失败'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-black/56">{run.detail}</p>
                  {run.route ? <div className="mt-1 text-[11px] text-black/52">执行链路：{run.route}</div> : null}
                  <div className="mt-1 text-[11px] text-black/52">输出去向：{run.output}</div>
                  {run.recordId ? (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => void view.recordActions.onOpenRecord(run.recordId as string)}
                        className="pinstack-btn pinstack-btn-ghost motion-button h-6 px-2 text-[10px]"
                      >
                        打开对应记录
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-1 text-[10px] text-black/40">{formatRelativeTime(run.at)}</div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {detailTab === 'strategy' ? (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-[color:var(--ps-border-subtle)] bg-white/70 px-3 py-3">
              <div className="mb-2">{renderStrategySwitch(false)}</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-black/40">执行角色</div>
              <div className="mt-2 space-y-1 text-[13px] text-black/78">
                <div>轻任务：E4B（命名 / 标签 / 短摘要）</div>
                <div>中任务：Qwen A3B（整理 / 重写 / 中长摘要）</div>
                <div>高质量：云端强模型（复杂规划 / 正式文档）</div>
              </div>
              <div className="mt-1 text-[12px] text-black/56">
                当前默认模型：{view.appSettings.aiHub.defaultModelId}
              </div>
              <button
                type="button"
                onClick={() => void view.ai.onRefreshRuntime()}
                className="pinstack-btn pinstack-btn-secondary motion-button mt-3 h-8 px-3 text-[11px]"
              >
                刷新运行状态
              </button>
            </div>
            <div className="rounded-lg border border-[color:var(--ps-border-subtle)] bg-white/70 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-black/40">数据概览</div>
              <div className="mt-2 text-[13px] text-black/78">总记录：{totalRecords}</div>
              <div className="mt-1 text-[13px] text-black/78">已归类记录：{aiRecordCount}</div>
              <div className="mt-1 text-[13px] text-black/78">可用模型：{view.ai.modelCatalog.length}</div>
              <div className="mt-1 text-[13px] text-black/78">入口策略：{view.appSettings.aiHub.entryVisibility}</div>
              <div className="mt-3 rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] px-2.5 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-black/40">快速模型搭配</div>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {MODEL_PAIR_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      title={template.hint}
                      onClick={() => void applyModelTemplate(template.id)}
                      disabled={modelPairBusy}
                      className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px] disabled:opacity-55"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-black/56">本地模型</div>
                <select
                  value={preferredLocalModelId}
                  onChange={(event) => {
                    void saveModelPair(event.target.value, preferredCloudModelId, 'none');
                  }}
                  className="pinstack-field motion-interactive mt-1 h-8 w-full px-2 text-[11px]"
                >
                  {localModelCandidates.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-[11px] text-black/56">云端模型</div>
                <select
                  value={preferredCloudModelId}
                  onChange={(event) => {
                    void saveModelPair(preferredLocalModelId, event.target.value, 'none');
                  }}
                  className="pinstack-field motion-interactive mt-1 h-8 w-full px-2 text-[11px]"
                >
                  {cloudModelCandidates.length > 0 ? (
                    cloudModelCandidates.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                      </option>
                    ))
                  ) : (
                    <option value={preferredCloudModelId}>{preferredCloudModelId}</option>
                  )}
                </select>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void saveModelPair(preferredLocalModelId, preferredCloudModelId, 'local')}
                    disabled={modelPairBusy}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px] disabled:opacity-55"
                  >
                    {modelPairBusy ? '处理中...' : '应用本地优先'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveModelPair(preferredLocalModelId, preferredCloudModelId, 'cloud')}
                    disabled={modelPairBusy}
                    className="pinstack-btn pinstack-btn-secondary motion-button h-7 px-2 text-[10px] disabled:opacity-55"
                  >
                    {modelPairBusy ? '处理中...' : '应用高质量'}
                  </button>
                </div>
                {modelPairNotice ? <div className="mt-2 text-[10px] text-black/58">{modelPairNotice}</div> : null}
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('pinstack-open-settings', { detail: { mode: 'ai' } }))}
                className="pinstack-btn pinstack-btn-secondary motion-button mt-3 h-8 px-3 text-[11px]"
              >
                调整策略与模型
              </button>
            </div>
          </div>
        ) : null}

        {detailTab === 'chat' ? (
          <div className="rounded-lg border border-[color:var(--ps-border-subtle)] bg-white/70 px-3 py-4">
            <div className="text-[14px] font-semibold text-black/84">自由对话（次级入口）</div>
            <p className="mt-1 text-[12px] text-black/56">
              当任务卡无法覆盖你的需求时，再进入自由对话。主流程仍建议优先使用任务入口。
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('pinstack-open-ai-chat'))}
                className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px]"
              >
                打开对话窗口
              </button>
              <button
                type="button"
                onClick={() => void window.pinStack.ai.openWindow()}
                className="pinstack-btn pinstack-btn-secondary motion-button h-8 px-3 text-[11px]"
              >
                激活 AI 助手
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
