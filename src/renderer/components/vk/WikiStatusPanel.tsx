import { useEffect, useState } from 'react';
import type { WikiStatus } from '../../../shared/vk/wikiTypes';

interface WikiStatusPanelProps {
  onRefresh: () => void;
}

export function WikiStatusPanel({ onRefresh }: WikiStatusPanelProps): JSX.Element {
  const [status, setStatus] = useState<WikiStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await window.pinStack.wiki.getStatus();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const openDir = async () => {
    try {
      await window.pinStack.wiki.openDir();
    } catch {
      /* ignore */
    }
  };

  const openIndex = async () => {
    try {
      await window.pinStack.wiki.openIndex();
    } catch {
      /* ignore */
    }
  };

  const runLint = async () => {
    try {
      await window.pinStack.wiki.lint();
      await fetchStatus();
    } catch {
      /* ignore */
    }
  };

  if (!status) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">WikiAgent 状态</h3>
        <p className="text-[11px] text-slate-500">
          知识库未启用。请在设置中配置 VaultKeeper → Wiki。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">WikiAgent 状态</h3>
        <button
          type="button"
          className="pinstack-btn pinstack-btn-ghost h-7 px-2 text-[11px]"
          onClick={() => { void fetchStatus(); onRefresh(); }}
          disabled={loading}
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2 text-[11px]">
        <StatusDot ok={status.enabled} label={status.enabled ? '已启用' : '未启用'} />
        <StatusDot ok={status.pythonAvailable} label={status.pythonAvailable ? 'Python OK' : 'Python 缺失'} />
      </div>

      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {[
          { label: '源', value: status.sourcesCount, color: 'text-blue-700' },
          { label: '实体', value: status.entitiesCount, color: 'text-emerald-700' },
          { label: '概念', value: status.conceptsCount, color: 'text-violet-700' },
          { label: '主题', value: status.topicsCount, color: 'text-amber-700' },
          { label: '总计', value: status.totalPages, color: 'text-slate-900' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
            <div className={`text-base font-semibold ${item.color}`}>{item.value}</div>
            <div className="text-[10px] text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>

      {status.lastUpdated && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
          最近更新: {status.lastUpdated}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          className="pinstack-btn pinstack-btn-secondary h-8 px-2 text-[11px]"
          onClick={() => void runLint()}
        >
          健康检查
        </button>
        <button
          type="button"
          className="pinstack-btn pinstack-btn-secondary h-8 px-2 text-[11px]"
          onClick={() => void openIndex()}
        >
          打开索引
        </button>
        <button
          type="button"
          className="pinstack-btn pinstack-btn-secondary h-8 px-2 text-[11px]"
          onClick={() => void openDir()}
        >
          打开目录
        </button>
      </div>
    </section>
  );
}

function StatusDot(props: { ok: boolean; label: string }): JSX.Element {
  const { ok, label } = props;
  return (
    <div className={`rounded-full border px-2 py-1 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
      {label}
    </div>
  );
}
