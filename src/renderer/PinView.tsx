import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import type { RecordContent, RecordItem } from '../shared/types';
import { getUseCaseShellGlowStyle } from './features/dashboard/shared/useCasePalette';
import { PinCardView } from './PinCardView';

interface PinViewProps {
  recordId: string;
  cardId: string;
}

export function PinView({ recordId, cardId }: PinViewProps): JSX.Element {
  const [record, setRecord] = useState<RecordItem | null>(null);
  const [content, setContent] = useState<RecordContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const nextRecord = await window.pinStack.records.get(recordId);
        const nextContent = await window.pinStack.records.getContent(recordId);
        if (!cancelled) {
          setRecord(nextRecord);
          setContent(nextContent);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '卡片内容加载失败');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  useEffect(() => {
    document.documentElement.classList.add('pin-view-html');
    document.body.classList.add('pin-view-body');
    const root = document.getElementById('root');
    root?.classList.add('pin-view-root');

    return () => {
      document.documentElement.classList.remove('pin-view-html');
      document.body.classList.remove('pin-view-body');
      root?.classList.remove('pin-view-root');
    };
  }, []);

  const closeWithAnimation = async () => {
    setClosing(true);
    await new Promise((resolve) => setTimeout(resolve, 140));
    await window.pinStack.pin.close(cardId);
  };

  const toggleAlwaysOnTop = async () => {
    try {
      const next = await window.pinStack.pin.toggleAlwaysOnTop(cardId);
      setAlwaysOnTop(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换固定失败');
    }
  };

  const copyText = async () => {
    if (content?.type !== 'text') {
      return;
    }

    try {
      // Mark internal copy source so main watcher skips one capture cycle.
      await window.pinStack.capture.ignoreNextCopy();
      await navigator.clipboard.writeText(content.text);
    } catch {
      setError('复制失败，请检查系统权限');
    }
  };

  const handleContentDragStart = (event: DragEvent<HTMLElement>) => {
    if (!record) {
      return;
    }

    event.dataTransfer.effectAllowed = 'copy';
    if (content?.type === 'text') {
      event.dataTransfer.setData('text/plain', content.text);
    } else if (content?.type === 'image' || content?.type === 'video') {
      event.dataTransfer.setData('text/uri-list', `file://${record.path}`);
    }

    window.pinStack.records.startDrag(record.id);
  };

  const pinShellStyle = useMemo(() => {
    if (!record) {
      return undefined;
    }

    return getUseCaseShellGlowStyle(record.useCase);
  }, [record]);

  const pinMetaLabel = useMemo(() => {
    if (!record) {
      return '文本';
    }

    if (record.type === 'image') {
      return '图片';
    }

    if (record.type === 'video') {
      return '录屏';
    }

    return '文本';
  }, [record]);

  return (
    <main className="pinstack-window-page pinstack-window-page--clear p-1">
      <section className="pinstack-window-panel pinstack-window-panel--clear h-full overflow-visible p-0">
        <AnimatePresence>
          {!closing ? (
            <motion.section
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative h-full rounded-[15px] border border-white/20 bg-white/10 p-1 shadow-[0_14px_26px_rgba(8,10,20,0.14)] backdrop-blur-[9px]"
            >
              {!error && !content ? <p className="p-3 text-xs text-black/70">加载中...</p> : null}

              {content && content.type !== 'video' ? (
                <PinCardView
                  metaLabel={pinMetaLabel}
                  pinned={alwaysOnTop}
                  content={content}
                  error={error}
                  onCopy={() => void copyText()}
                  onTogglePin={() => void toggleAlwaysOnTop()}
                  onDragContent={handleContentDragStart}
                  onClose={() => void closeWithAnimation()}
                  className=""
                  shellStyle={pinShellStyle}
                />
              ) : content?.type === 'video' ? (
                <div className="glass-surface radius-l2 flex h-full items-center justify-center border border-white/20 px-4 text-sm text-black/70">
                  录屏记录不支持悬浮卡片，请在 Dashboard 中打开查看。
                </div>
              ) : null}
            </motion.section>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
}
