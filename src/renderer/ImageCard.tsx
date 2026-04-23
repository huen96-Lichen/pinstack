import type { DragEvent } from 'react';
import type { RecordItem } from '../shared/types';
import { buildRecordName, formatImageTimeLabel } from './naming';

interface ImageCardProps {
  item: RecordItem;
  previewSrc?: string;
}

export function ImageCard({ item, previewSrc }: ImageCardProps): JSX.Element {
  const displayName = buildRecordName(item);

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/uri-list', `file://${item.path}`);
    window.pinStack.records.startDrag(item.id);
  };

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      className="drag-export glass-surface glass-l3 radius-l3 pinstack-card p-3 text-black transition duration-150 ease-out hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
    >
      <p className="mb-2 truncate text-xs font-medium text-black">{displayName}</p>

      <div className="mb-2 overflow-hidden rounded-[10px] bg-slate-200">
        {previewSrc ? (
          <img src={previewSrc} alt="Pinned" className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-black/70">Loading image...</div>
        )}
      </div>
      <p className="truncate text-xs text-black">{item.previewText || formatImageTimeLabel(item.createdAt)}</p>
    </article>
  );
}
