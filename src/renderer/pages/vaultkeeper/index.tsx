import { useEffect, useState } from 'react';
import type { VKRuntimeStatus, VKTask } from '../../../shared/vk/types';
import { VKRuntimePanel } from '../../components/vk/VKRuntimePanel';
import { VKQuickSubmit } from '../../components/vk/VKQuickSubmit';
import { VKTaskList } from '../../components/vk/VKTaskList';
import { WikiStatusPanel } from '../../components/vk/WikiStatusPanel';
import { WikiQueryPanel } from '../../components/vk/WikiQueryPanel';
import { WikiSettingsPanel } from '../../components/vk/WikiSettingsPanel';

type VaultKeeperTab = 'tasks' | 'wiki';

export function VaultKeeperPage(): JSX.Element {
  const [runtime, setRuntime] = useState<VKRuntimeStatus | null>(null);
  const [tasks, setTasks] = useState<VKTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<VKTask | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [activeTab, setActiveTab] = useState<VaultKeeperTab>('wiki');

  const refreshRuntime = async () => {
    setLoadingRuntime(true);
    try {
      const status = await window.pinStack.vk.runtime.getStatus();
      setRuntime(status);
    } finally {
      setLoadingRuntime(false);
    }
  };

  const refreshTasks = async () => {
    const next = await window.pinStack.vk.task.list();
    setTasks(next.tasks);
    if (selectedTask) {
      const refreshed = next.tasks.find((t) => t.id === selectedTask.id) ?? null;
      setSelectedTask(refreshed);
    }
  };

  useEffect(() => {
    void refreshRuntime();
    void refreshTasks();
    const t = setInterval(() => {
      void refreshTasks();
      void refreshRuntime();
    }, 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-2xl border border-[color:var(--ps-border-subtle)] bg-gradient-to-r from-slate-50 via-white to-slate-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">WikiAgent Workbench</div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">知识库是核心，任务管线是入口</h2>
            <p className="mt-1 text-[12px] text-slate-600">先写入，再连接，再提问。围绕 WikiAgent 做持续积累。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MetricChip label="队列" value={runtime?.queueLength ?? 0} tone="slate" />
            <MetricChip label="总任务" value={tasks.length} tone="blue" />
            <MetricChip label="运行中" value={tasks.filter((item) => item.status === 'running').length} tone="emerald" />
          </div>
        </div>
        <div className="mt-3 flex gap-1 border-t border-slate-200 pt-2">
          <TabButton active={activeTab === 'wiki'} onClick={() => setActiveTab('wiki')} label="WikiAgent 工作台" />
          <TabButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} label="任务管线" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'tasks' ? (
          <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_420px]">
            <div className="min-h-0 space-y-3 overflow-auto pr-1">
              <VKRuntimePanel status={runtime} loading={loadingRuntime} onRefresh={() => void refreshRuntime()} />
              <VKQuickSubmit
                onCreated={(task) => {
                  setTasks((prev) => [task, ...prev]);
                  setSelectedTask(task);
                  void refreshRuntime();
                }}
              />
              <section className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[color:var(--ps-text-primary)]">任务详情与日志</h3>
                  {selectedTask ? <span className="text-[10px] text-[color:var(--ps-text-tertiary)]">{selectedTask.id.slice(0, 8)}...</span> : null}
                </div>
                {selectedTask ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-[color:var(--ps-text-secondary)]">
                      {selectedTask.type} · {selectedTask.status} · {selectedTask.stage} · {selectedTask.progress}%
                    </div>
                    {selectedTask.errorMessage ? (
                      <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                        {selectedTask.errorMessage}
                      </div>
                    ) : null}
                    <div className="max-h-[220px] overflow-auto rounded border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] p-2">
                      {(selectedTask.logs ?? []).length > 0 ? (
                        (selectedTask.logs ?? []).slice(-200).map((line, index) => (
                          <div key={`${selectedTask.id}-${index}`} className="font-mono text-[10px] text-[color:var(--ps-text-tertiary)]">
                            {line}
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">暂无日志</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">在右侧任务列表选择一个任务查看详情。</div>
                )}
              </section>
            </div>
            <div className="min-h-0 overflow-auto">
              <VKTaskList
                tasks={tasks}
                selectedTaskId={selectedTask?.id ?? null}
                onSelectTask={(task) => setSelectedTask(task)}
                onRefresh={() => void refreshTasks()}
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">知识中枢</h3>
                  <button
                    type="button"
                    className="pinstack-btn pinstack-btn-ghost h-7 px-2 text-[11px]"
                    onClick={() => void refreshRuntime()}
                  >
                    刷新状态
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <ActionCard
                    title="1. 采集并入库"
                    desc="提交文件/链接，自动进入 wiki_ingesting"
                    onClick={() => setActiveTab('tasks')}
                  />
                  <ActionCard
                    title="2. 语义查询"
                    desc="面向知识库提问，输出可追溯答案"
                    onClick={() => setActiveTab('wiki')}
                  />
                  <ActionCard
                    title="3. 健康维护"
                    desc="定期 lint 与结构巡检，保持可维护性"
                    onClick={() => setActiveTab('wiki')}
                  />
                </div>
              </section>
              <WikiQueryPanel />
            </div>
            <div className="space-y-3">
              <WikiStatusPanel onRefresh={() => { void refreshRuntime(); }} />
              <VKRuntimePanel status={runtime} loading={loadingRuntime} onRefresh={() => void refreshRuntime()} />
              <WikiSettingsPanel />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton(props: { active: boolean; label: string; onClick: () => void }): JSX.Element {
  const { active, label, onClick } = props;
  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? 'bg-slate-900 text-white'
          : 'text-[color:var(--ps-text-tertiary)] hover:bg-slate-100 hover:text-[color:var(--ps-text-secondary)]'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MetricChip(props: { label: string; value: number; tone: 'slate' | 'blue' | 'emerald' }): JSX.Element {
  const { label, value, tone } = props;
  const toneClass = tone === 'blue'
    ? 'border-blue-200 bg-blue-50 text-blue-700'
    : tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-white text-slate-700';
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  );
}

function ActionCard(props: { title: string; desc: string; onClick: () => void }): JSX.Element {
  const { title, desc, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition-all duration-200 hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      <div className="text-[12px] font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{desc}</div>
    </button>
  );
}
