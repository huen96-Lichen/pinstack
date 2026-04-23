import type { VKRuntimeStatus } from '../../../shared/vk/types';

interface VKRuntimePanelProps {
  status: VKRuntimeStatus | null;
  loading: boolean;
  onRefresh: () => void;
}

export function VKRuntimePanel({ status, loading, onRefresh }: VKRuntimePanelProps): JSX.Element {
  const copyInstall = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // ignore copy failures in non-secure clipboard contexts
    }
  };

  return (
    <section className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--ps-text-primary)]">运行态</h3>
        <button type="button" className="pinstack-btn pinstack-btn-ghost h-7 px-2 text-[11px]" onClick={onRefresh}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>
      <div className="space-y-1.5 text-[11px]">
        <div className="text-[color:var(--ps-text-secondary)]">
          service: <span className="font-medium text-[color:var(--ps-text-primary)]">{status?.service ?? 'idle'}</span>
          {' '}· queue: <span className="font-medium text-[color:var(--ps-text-primary)]">{status?.queueLength ?? 0}</span>
        </div>
        <div className="max-h-[140px] overflow-auto rounded-lg border border-[color:var(--ps-border-subtle)] bg-[color:var(--ps-surface-muted)] p-2">
          {(status?.dependencies ?? []).map((dep) => (
            <div key={dep.key} className="mb-1 rounded border border-[color:var(--ps-border-subtle)] bg-white/70 p-1.5 last:mb-0">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[color:var(--ps-text-secondary)]">{dep.key}</span>
                <span className={dep.available ? 'text-emerald-600' : 'text-red-600'}>{dep.available ? 'available' : 'missing'}</span>
              </div>
              <div className="truncate text-[10px] text-[color:var(--ps-text-tertiary)]">version: {dep.version || '-'}</div>
              <div className="truncate text-[10px] text-[color:var(--ps-text-tertiary)]">path: {dep.path || '-'}</div>
              <div className="text-[10px] text-[color:var(--ps-text-tertiary)]">hint: {dep.hint}</div>
              {dep.installCommand ? (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-[10px] text-[color:var(--ps-text-tertiary)]">
                    install: {dep.installCommand}
                  </div>
                  <button
                    type="button"
                    className="pinstack-btn pinstack-btn-ghost h-5 px-1.5 text-[10px]"
                    onClick={() => void copyInstall(dep.installCommand!)}
                  >
                    复制
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {(status?.dependencies ?? []).length === 0 ? <div className="text-[10px] text-[color:var(--ps-text-tertiary)]">暂无依赖状态</div> : null}
        </div>
      </div>
    </section>
  );
}
