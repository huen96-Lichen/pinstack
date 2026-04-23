import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent
} from 'react';
import type { DragEvent } from 'react';
import type { RecordContent } from '../shared/types';
import { PinStackIcon } from './design-system/icons';

interface PinCardViewProps {
  metaLabel?: string;
  pinned?: boolean;
  content: RecordContent;
  error?: string | null;
  onCopy?: () => void;
  onTogglePin?: () => void;
  onDragContent?: (event: DragEvent<HTMLElement>) => void;
  onClose?: () => void;
  className?: string;
  shellStyle?: CSSProperties;
}

interface PinActionButtonProps {
  label: string;
  icon: ReactNode;
  emphasis?: 'medium' | 'subtle' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}

const IMAGE_ZOOM_MIN = 1;
const IMAGE_ZOOM_MAX = 3;
const IMAGE_ZOOM_STEP = 0.2;

interface ImagePanOffset {
  x: number;
  y: number;
}

interface ImageSize {
  width: number;
  height: number;
}

function clampZoom(value: number): number {
  return Math.max(IMAGE_ZOOM_MIN, Math.min(IMAGE_ZOOM_MAX, Number(value.toFixed(2))));
}

function clampImageOffset(
  offset: ImagePanOffset,
  zoom: number,
  naturalSize: ImageSize | null,
  container: HTMLDivElement | null
): ImagePanOffset {
  if (!naturalSize || !container || zoom <= 1) {
    return { x: 0, y: 0 };
  }

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  if (containerWidth <= 0 || containerHeight <= 0) {
    return { x: 0, y: 0 };
  }

  const containScale = Math.min(containerWidth / naturalSize.width, containerHeight / naturalSize.height);
  const baseWidth = naturalSize.width * containScale;
  const baseHeight = naturalSize.height * containScale;
  const scaledWidth = baseWidth * zoom;
  const scaledHeight = baseHeight * zoom;
  const maxOffsetX = Math.max(0, (scaledWidth - containerWidth) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - containerHeight) / 2);

  return {
    x: Math.max(-maxOffsetX, Math.min(maxOffsetX, offset.x)),
    y: Math.max(-maxOffsetY, Math.min(maxOffsetY, offset.y))
  };
}

function PinActionButton({ label, icon, emphasis = 'subtle', disabled = false, onClick }: PinActionButtonProps): JSX.Element {
  const emphasisClass =
    emphasis === 'medium'
      ? 'pinstack-icon-button-soft text-black/68 hover:text-black/84'
      : emphasis === 'danger'
        ? 'pinstack-icon-button-danger text-[color:var(--ps-status-danger)]'
        : 'pinstack-icon-button-ghost text-black/52';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`pin-no-drag motion-button inline-flex h-8 w-8 items-center justify-center rounded-lg disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit ${emphasisClass}`}
    >
      <span aria-hidden="true" className="pointer-events-none">
        {icon}
      </span>
    </button>
  );
}

export function PinCardView({
  metaLabel = '文本',
  pinned = true,
  content,
  error,
  onCopy,
  onTogglePin,
  onDragContent,
  onClose,
  className,
  shellStyle
}: PinCardViewProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageOffset, setImageOffset] = useState<ImagePanOffset>({ x: 0, y: 0 });
  const [imageNaturalSize, setImageNaturalSize] = useState<ImageSize | null>(null);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const imageDragStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(
    null
  );

  const statusLabel = pinned ? '已固定' : '未固定';
  const canZoomOut = imageZoom > IMAGE_ZOOM_MIN;
  const canZoomIn = imageZoom < IMAGE_ZOOM_MAX;
  const canPanImage = content.type === 'image' && imageZoom > 1;

  const applyImageZoom = (nextZoom: number, anchor?: { x: number; y: number }) => {
    const clampedZoom = clampZoom(nextZoom);
    const container = imageFrameRef.current;

    if (!anchor || !container || !imageNaturalSize) {
      setImageZoom(clampedZoom);
      setImageOffset((current) => clampImageOffset(current, clampedZoom, imageNaturalSize, container));
      return;
    }

    const rect = container.getBoundingClientRect();
    const pointerX = anchor.x - rect.left;
    const pointerY = anchor.y - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const contentX = (pointerX - centerX - imageOffset.x) / imageZoom;
    const contentY = (pointerY - centerY - imageOffset.y) / imageZoom;
    const nextOffset = {
      x: pointerX - centerX - contentX * clampedZoom,
      y: pointerY - centerY - contentY * clampedZoom
    };

    setImageZoom(clampedZoom);
    setImageOffset(clampImageOffset(nextOffset, clampedZoom, imageNaturalSize, container));
  };

  const updateImageZoom = (delta: number, anchor?: { x: number; y: number }) => {
    applyImageZoom(imageZoom + delta, anchor);
  };

  const resetImageZoom = () => {
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
  };

  const handleImageWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateImageZoom(event.deltaY < 0 ? IMAGE_ZOOM_STEP : -IMAGE_ZOOM_STEP, {
      x: event.clientX,
      y: event.clientY
    });
  };

  const handleImagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canPanImage || event.button !== 0) {
      return;
    }

    imageDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: imageOffset.x,
      originY: imageOffset.y
    };
    setIsImageDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleImagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = imageDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextOffset = {
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY)
    };

    setImageOffset(clampImageOffset(nextOffset, imageZoom, imageNaturalSize, imageFrameRef.current));
  };

  const endImagePointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = imageDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    imageDragStateRef.current = null;
    setIsImageDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className={`pin-card-shell relative flex h-full flex-col overflow-hidden px-3 pb-3 pt-3 text-black transition-[box-shadow,border-color] duration-200 ${className ?? ''}`}
      style={{
        WebkitBackdropFilter: 'none',
        backdropFilter: 'none',
        ...shellStyle
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header className="pin-drag-region mb-2.5 flex min-h-9 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="pin-drag-region pin-card-meta-pill truncate">{metaLabel}</span>
          <span className="pin-drag-region pin-card-meta-pill truncate text-black/52" onDoubleClick={() => onTogglePin?.()}>
            {statusLabel}
          </span>
        </div>

        <div
          className={`pin-no-drag motion-card-actions flex shrink-0 items-center gap-1.5 ${hovered ? 'opacity-100' : 'opacity-40'}`}
        >
          {content.type === 'image' ? (
            <>
              <PinActionButton
                label="缩小"
                disabled={!canZoomOut}
                onClick={() => updateImageZoom(-IMAGE_ZOOM_STEP)}
                icon={
                  <PinStackIcon name="minimize" size={15} />
                }
              />
              <button
                type="button"
                onClick={resetImageZoom}
                className="pin-no-drag motion-button inline-flex h-8 min-w-10 items-center justify-center rounded-lg border border-transparent bg-transparent px-2 text-[11px] font-medium text-black/44 hover:bg-white/68 hover:text-black/72"
                title="还原"
              >
                {Math.round(imageZoom * 100)}%
              </button>
              <PinActionButton
                label="放大"
                emphasis="medium"
                disabled={!canZoomIn}
                onClick={() => updateImageZoom(IMAGE_ZOOM_STEP)}
                icon={
                  <PinStackIcon name="maximize" size={15} />
                }
              />
            </>
          ) : null}
          {content.type === 'text' && onCopy ? (
            <PinActionButton
              label="复制"
              emphasis="medium"
              onClick={onCopy}
              icon={
                <PinStackIcon name="duplicate" size={15} />
              }
            />
          ) : null}
          {onTogglePin ? (
            <PinActionButton
              label={pinned ? '取消固定' : '固定'}
              onClick={onTogglePin}
              icon={
                pinned ? <PinStackIcon name="pin-top" size={15} /> : <PinStackIcon name="pin-off" size={15} />
              }
            />
          ) : null}
          {onClose ? (
            <PinActionButton
              label="关闭"
              emphasis="danger"
              onClick={onClose}
              icon={
                <PinStackIcon name="close" size={15} />
              }
            />
          ) : null}
        </div>
      </header>

      <div className={`min-h-0 ${content.type === 'text' ? '' : 'flex flex-1 items-stretch'}`}>
        {error ? <p className="mb-2 text-xs text-rose-500">{error}</p> : null}

        {content.type === 'text' ? (
          <div
            draggable
            onDragStart={onDragContent}
            className="pin-no-drag drag-export pin-card-content-block max-h-full overflow-auto px-1 py-1"
          >
            <pre className="whitespace-pre-wrap break-words text-[15px] leading-7 text-black/88">{content.text}</pre>
          </div>
        ) : content.type === 'image' ? (
          <div
            ref={imageFrameRef}
            draggable={!canPanImage}
            onDragStart={onDragContent}
            onWheel={handleImageWheel}
            onDoubleClick={resetImageZoom}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={endImagePointerDrag}
            onPointerCancel={endImagePointerDrag}
            className={`pin-no-drag drag-export pin-card-image-frame flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden ${
              canPanImage ? (isImageDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
            }`}
          >
            <img
              src={content.dataUrl}
              alt="Pinned"
              draggable={false}
              onLoad={(event) => {
                setImageNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                });
              }}
              className="h-full w-full max-h-full max-w-full object-contain transition-transform duration-150 ease-out"
              style={{
                transform: `translate(${imageOffset.x}px, ${imageOffset.y}px) scale(${imageZoom})`,
                transformOrigin: 'center center'
              }}
            />
          </div>
        ) : (
          <div className="pin-card-content-block flex h-full min-h-[7rem] items-center justify-center p-4 text-xs text-black/58">
            该内容不支持卡片预览
          </div>
        )}
      </div>
    </section>
  );
}
