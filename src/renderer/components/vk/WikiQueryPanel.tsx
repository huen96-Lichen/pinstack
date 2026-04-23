import { useState } from 'react';

export function WikiQueryPanel(): JSX.Element {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer('');
    try {
      const result = await window.pinStack.wiki.query({ question: question.trim() });
      setAnswer(result.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败');
    } finally {
      setBusy(false);
    }
  };

  const presets = [
    '最近一周新增了哪些关键实体？',
    '给我当前知识库最值得推进的 3 个主题',
    '有哪些概念存在冲突或定义不一致？',
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">语义查询</h3>
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Grounded Answer</div>
      </div>

      <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="基于知识库，你的问题是什么？"
          disabled={busy}
          className="pinstack-field min-h-[88px] w-full resize-y px-3 py-2 text-[12px] leading-relaxed"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[10px] text-slate-500">⌘/Ctrl + Enter 快速执行</div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !question.trim()}
            className="pinstack-btn h-8 bg-slate-900 px-3 text-[12px] text-white disabled:opacity-50"
          >
            {busy ? '查询中...' : '开始查询'}
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 transition-colors hover:bg-slate-100"
            onClick={() => setQuestion(preset)}
          >
            {preset}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
          {error}
        </div>
      )}

      {answer && (
        <div className="mt-2 max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">Answer</div>
          <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-800">
            {answer}
          </div>
        </div>
      )}
    </section>
  );
}
