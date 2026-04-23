import type { VKTask } from '../../../shared/vk/types';

interface VKTaskListProps {
  tasks: VKTask[];
  onRefresh: () => void;
  selectedTaskId?: string | null;
  onSelectTask?: (task: VKTask) => void;
}

export function VKTaskList({ tasks, onRefresh, selectedTaskId = null, onSelectTask }: VKTaskListProps): JSX.Element {
  const runRetry = async (id: string) => {
    await window.pinStack.vk.task.retry(id);
    onRefresh();
  };

  const runCancel = async (id: string) => {
    await window.pinStack.vk.task.cancel(id);
    onRefresh();
  };

  const openOutput = async (id: string) => {
    await window.pinStack.vk.task.openOutput(id);
  };

  const openLog = async (id: string) => {
    await window.pinStack.vk.task.openLog(id);
  };

  return (
    <section className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--ps-text-primary)]">任务队列</h3>
        <button type="button" onClick={onRefresh} className="pinstack-btn pinstack-btn-ghost h-7 px-2 text-[11px]">刷新</button>
      </div>
      <div className="max-h-[380px] space-y-2 overflow-auto">
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onSelectTask?.(task)}
            className={`w-full cursor-pointer rounded-lg border p-2 text-left ${
              selectedTaskId === task.id
                ? 'border-[color:var(--ps-brand-primary)] bg-[color:var(--ps-brand-soft)]/40'
                : 'border-[color:var(--ps-border-subtle)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono text-[10px] text-[color:var(--ps-text-tertiary)]">{task.id.slice(0, 8)}...</span>
              <span className="font-medium">{task.status}</span>
            </div>
            <div className="mt-1 text-[10px] text-[color:var(--ps-text-secondary)]">{task.type} · {task.stage} · {task.progress}%</div>
            {task.errorMessage ? <div className="mt-1 text-[10px] text-red-600">{task.errorMessage}</div> : null}
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button type="button" className="pinstack-btn pinstack-btn-secondary h-6 px-2 text-[10px]" onClick={() => void runRetry(task.id)} disabled={task.status !== 'failed' && task.status !== 'cancelled'}>重试</button>
              <button type="button" className="pinstack-btn pinstack-btn-secondary h-6 px-2 text-[10px]" onClick={() => void runCancel(task.id)} disabled={task.status !== 'waiting'}>取消</button>
              <button type="button" className="pinstack-btn pinstack-btn-secondary h-6 px-2 text-[10px]" onClick={() => void openOutput(task.id)} disabled={!task.outputPath}>输出</button>
              <button type="button" className="pinstack-btn pinstack-btn-secondary h-6 px-2 text-[10px]" onClick={() => void openLog(task.id)}>日志</button>
            </div>
          </div>
        ))}
        {tasks.length === 0 ? <div className="text-[11px] text-[color:var(--ps-text-tertiary)]">暂无任务</div> : null}
      </div>
    </section>
  );
}
