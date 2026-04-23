import { useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import type { RecordItem as RecordItemType } from '../shared/types';
import { buildRecordName, formatImageTimeLabel } from './naming';

interface RecordItemProps {
  item: RecordItemType;
  previewSrc?: string;
  selected?: boolean;
  onSelect?: (recordId: string, additive: boolean) => void;
}

export function RecordItem({ item, previewSrc, selected = false, onSelect }: RecordItemProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [busyAction, setBusyAction] = useState<'copy' | 'delete' | 'pin' | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const timersRef = useRef<number[]>([]);

  const displayName = buildRecordName(item);
  const isFlow = item.useCase === 'flow' || item.category === 'flow';
  const sourceBadge = item.sourceApp?.trim() || '操作流程';

  useEffect(() => {
    return () => {
      for (const timerId of timersRef.current) {
        window.clearTimeout(timerId);
      }
      timersRef.current = [];
    };
  }, []);

  const schedule = (callback: () => void, delay: number) => {
    const timerId = window.setTimeout(callback, delay);
    timersRef.current.push(timerId);
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const onDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'copy';
    if (item.type === 'text') {
      event.dataTransfer.setData('text/plain', item.previewText || '');
    } else {
      event.dataTransfer.setData('text/uri-list', `file://${item.path}`);
    }
    window.pinStack.records.startDrag(item.id);
  };

  const onCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setBusyAction('copy');
    try {
      await window.pinStack.records.copy(item.id);
      setShowCopied(true);
      schedule(() => setShowCopied(false), 900);
    } finally {
      setBusyAction(null);
    }
  };

  const onDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setBusyAction('delete');
    setIsDeleting(true);
    try {
      await sleep(180);
      await window.pinStack.records.delete(item.id);
    } catch {
      setIsDeleting(false);
    } finally {
      setBusyAction(null);
    }
  };

  const onPin = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setBusyAction('pin');
    try {
      await window.pinStack.pin.createFromRecord(item.id);
      setShowPinned(true);
      schedule(() => setShowPinned(false), 720);
    } finally {
      setBusyAction(null);
    }
  };

  const onOpen = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    await window.pinStack.records.open(item.id);
  };

  const onRename = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const defaultName = displayName;
    const nextName = window.prompt('请输入新名称', defaultName);
    if (!nextName || !nextName.trim()) {
      return;
    }
    await window.pinStack.records.rename(item.id, nextName.trim());
  };

  const onCardClick = (event: MouseEvent<HTMLElement>) => {
    onSelect?.(item.id, event.metaKey || event.ctrlKey);
  };

  return (
    <article
      draggable={!isDeleting}
      onDragStart={onDragStart}
      onClick={onCardClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`drag-export glass-surface glass-l1 radius-l2 relative w-full overflow-hidden pinstack-card p-3.5 text-black shadow-[0_6px_14px_rgba(15,23,42,0.08)] transition duration-150 ease-out hover:scale-[1.012] hover:shadow-[0_10px_20px_rgba(15,23,42,0.14)] ${
        isDeleting ? 'pinstack-card-leave pointer-events-none' : ''
      } ${showPinned ? 'pinstack-card-pin-success' : ''} ${selected ? 'border-[#34C759] shadow-[0_0_0_2px_rgba(52,199,89,0.65)]' : ''} ${
        isFlow ? 'border-cyan-300/40 bg-[rgba(56,189,248,0.11)] shadow-[0_8px_20px_rgba(6,78,97,0.18)]' : ''
      }`}
    >
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-1">
        {showCopied ? <span className="pinstack-feedback-chip pinstack-feedback-copy">已复制</span> : null}
        {showPinned ? <span className="pinstack-feedback-chip pinstack-feedback-pin">已固定</span> : null}
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-black">{displayName}</p>
          {isFlow ? (
            <p className="mt-1 inline-flex max-w-full items-center rounded-full border border-cyan-300/55 bg-cyan-300/20 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-950">
              {sourceBadge}
            </p>
          ) : null}
        </div>
        <div
          className={`flex max-w-full flex-wrap items-center gap-1 transition ${
            hovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={onCopy}
            className="radius-l3 px-2 py-1 text-[11px] font-medium text-black hover:bg-black/10 disabled:opacity-60"
          >
            {busyAction === 'copy' ? '复制中...' : '复制'}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={onOpen}
            className="radius-l3 px-2 py-1 text-[11px] font-medium text-black hover:bg-black/10 disabled:opacity-60"
          >
            查看内容
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={onRename}
            className="radius-l3 px-2 py-1 text-[11px] font-medium text-black hover:bg-black/10 disabled:opacity-60"
          >
            改名
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={onPin}
            className="radius-l3 px-2 py-1 text-[11px] font-medium text-black hover:bg-black/10 disabled:opacity-60"
          >
            {busyAction === 'pin' ? '固定中...' : '固定'}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={onDelete}
            className="radius-l3 px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-100/70 disabled:opacity-60"
          >
            {busyAction === 'delete' ? '删除中...' : '删除'}
          </button>
        </div>
      </div>

      {item.type === 'image' ? (
        <div className="mb-2.5 overflow-hidden rounded-[12px] bg-slate-200/45">
          {previewSrc ? (
            <img src={previewSrc} alt="已固定内容预览" className="h-auto max-h-[320px] w-full object-cover" />
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-black/70">图片加载中...</div>
          )}
        </div>
      ) : null}

      {item.type === 'text' ? (
        <p
          className={`text-sm leading-6 text-black ${isFlow ? 'font-mono tracking-[0.01em]' : ''}`}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {item.previewText || '（空文本）'}
        </p>
      ) : (
        <p className="truncate text-xs text-black">{item.previewText || formatImageTimeLabel(item.createdAt)}</p>
      )}
    </article>
  );
}
