import { useEffect, useMemo, useState } from 'react';
import type { RecordItem } from '../shared/types';
import { RecordItem as RecordItemCard } from './RecordItem';

interface CardGridProps {
  items: RecordItem[];
  isLoading: boolean;
  selectedIds: string[];
  onSelect: (recordId: string, additive: boolean) => void;
  onClearSelection: () => void;
}

export function CardGrid({
  items,
  isLoading,
  selectedIds,
  onSelect,
  onClearSelection
}: CardGridProps): JSX.Element {
  const [imagePreviewMap, setImagePreviewMap] = useState<Record<string, string>>({});

  const imageItems = useMemo(() => items.filter((item) => item.type === 'image'), [items]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      for (const item of imageItems) {
        if (imagePreviewMap[item.id]) {
          continue;
        }

        try {
          const content = await window.pinStack.records.getContent(item.id);
          if (!cancelled && content.type === 'image') {
            setImagePreviewMap((prev) => ({
              ...prev,
              [item.id]: content.dataUrl
            }));
          }
        } catch {
          // Keep placeholder for broken image payload.
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [imageItems, imagePreviewMap]);

  if (isLoading) {
    return <p className="text-sm text-black/70">加载中...</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-black/70">还没有内容。你可以先复制文本或截图开始收集。</p>;
  }

  return (
    <section
      className="columns-1 gap-4 md:columns-2 xl:columns-3 [column-fill:_balance]"
      aria-label="Card Grid"
      onClick={onClearSelection}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="pinstack-card-enter mb-4 break-inside-avoid"
          onClick={(event) => event.stopPropagation()}
        >
          <RecordItemCard
            item={item}
            previewSrc={imagePreviewMap[item.id]}
            selected={selectedIds.includes(item.id)}
            onSelect={onSelect}
          />
        </div>
      ))}
    </section>
  );
}
