import { useState } from 'react';
import type { VKSourceType, VKTask, VKTaskType } from '../../../shared/vk/types';

interface VKQuickSubmitProps {
  onCreated: (task: VKTask) => void;
}

export function VKQuickSubmit({ onCreated }: VKQuickSubmitProps): JSX.Element {
  const [sourceType, setSourceType] = useState<VKSourceType>('url');
  const [source, setSource] = useState('');
  const [type, setType] = useState<VKTaskType>('extract');
  const [aiEnhance, setAiEnhance] = useState(false);
  const [wikiIngest, setWikiIngest] = useState(false);
  const [outputMode, setOutputMode] = useState<'draft' | 'inbox' | 'library'>('draft');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!source.trim()) return;
    setBusy(true);
    try {
      const task = await window.pinStack.vk.task.create({
        type,
        sourceType,
        sourcePath: sourceType === 'url' ? undefined : source.trim(),
        sourceUrl: sourceType === 'url' ? source.trim() : undefined,
        options: {
          aiEnhance,
          wikiIngest,
          outputMode,
        },
      });
      onCreated(task);
      setSource('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-[color:var(--ps-border-subtle)] bg-white/80 p-3">
      <h3 className="mb-2 text-sm font-semibold text-[color:var(--ps-text-primary)]">快速提交</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value as VKSourceType)} className="pinstack-field h-9 px-2 text-[12px]">
          <option value="url">URL</option>
          <option value="file">文件</option>
          <option value="audio">音频</option>
          <option value="video">视频</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as VKTaskType)} className="pinstack-field h-9 px-2 text-[12px]">
          <option value="extract">extract</option>
          <option value="convert">convert</option>
          <option value="transcribe">transcribe</option>
          <option value="normalize">normalize</option>
          <option value="enhance">enhance</option>
          <option value="export">export</option>
        </select>
      </div>
      <input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder={sourceType === 'url' ? 'https://example.com' : '/path/to/file'}
        className="pinstack-field mt-2 h-9 w-full px-3 text-[12px]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--ps-text-secondary)]">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={aiEnhance} onChange={(e) => setAiEnhance(e.target.checked)} />
          AI 增强
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={wikiIngest} onChange={(e) => setWikiIngest(e.target.checked)} />
          知识库
        </label>
        <select value={outputMode} onChange={(e) => setOutputMode(e.target.value as 'draft' | 'inbox' | 'library')} className="pinstack-field h-7 px-2 text-[11px]">
          <option value="draft">draft</option>
          <option value="inbox">inbox</option>
          <option value="library">library</option>
        </select>
      </div>
      <button type="button" onClick={() => void submit()} disabled={busy || !source.trim()} className="pinstack-btn mt-2 h-9 w-full bg-[color:var(--ps-brand-primary)] text-white disabled:opacity-50">
        {busy ? '提交中...' : '提交任务'}
      </button>
    </section>
  );
}
