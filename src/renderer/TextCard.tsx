import type { DragEvent } from 'react';
import type { RecordItem } from '../shared/types';
import { buildRecordName } from './naming';

interface TextCardProps {
  item: RecordItem;
}

export function TextCard({ item }: TextCardProps): JSX.Element {
  const displayName = buildRecordName(item);

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', item.previewText || '');
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

      <p
        className="text-sm leading-6 text-black"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}
      >
        {item.previewText || '(empty text)'}
      </p>
    </article>
  );
}
