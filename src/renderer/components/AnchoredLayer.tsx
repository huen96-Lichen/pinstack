import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

type LayerPlacement = 'top' | 'bottom';
type LayerAlign = 'start' | 'end' | 'center';

interface LayerPosition {
  top: number;
  left: number;
  placement: LayerPlacement;
  transformOrigin: string;
}

interface AnchoredLayerProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onRequestClose?: () => void;
  preferredPlacement?: LayerPlacement;
  align?: LayerAlign;
  offset?: number;
  viewportPadding?: number;
  zIndex?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeHorizontalLeft(anchorRect: DOMRect, layerWidth: number, align: LayerAlign, viewportPadding: number): number {
  let nextLeft = anchorRect.left;

  if (align === 'end') {
    nextLeft = anchorRect.right - layerWidth;
  } else if (align === 'center') {
    nextLeft = anchorRect.left + anchorRect.width / 2 - layerWidth / 2;
  }

  return clamp(nextLeft, viewportPadding, window.innerWidth - layerWidth - viewportPadding);
}

function buildTransformOrigin(placement: LayerPlacement, align: LayerAlign): string {
  const horizontal = align === 'start' ? 'left' : align === 'end' ? 'right' : 'center';
  const vertical = placement === 'bottom' ? 'top' : 'bottom';
  return `${horizontal} ${vertical}`;
}

export function AnchoredLayer({
  open,
  anchorRef,
  className,
  style,
  children,
  onRequestClose,
  preferredPlacement = 'bottom',
  align = 'end',
  offset = 8,
  viewportPadding = 12,
  zIndex = 220
}: AnchoredLayerProps): JSX.Element | null {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<LayerPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      const layerRect = layerRef.current?.getBoundingClientRect();
      if (!anchorRect || !layerRect) {
        return;
      }

      const layerWidth = layerRect.width;
      const layerHeight = layerRect.height;
      const spaceBelow = window.innerHeight - anchorRect.bottom - viewportPadding;
      const spaceAbove = anchorRect.top - viewportPadding;
      let placement: LayerPlacement = preferredPlacement;

      if (preferredPlacement === 'bottom' && spaceBelow < layerHeight + offset && spaceAbove > spaceBelow) {
        placement = 'top';
      } else if (preferredPlacement === 'top' && spaceAbove < layerHeight + offset && spaceBelow > spaceAbove) {
        placement = 'bottom';
      }

      const nextTop = placement === 'bottom'
        ? clamp(anchorRect.bottom + offset, viewportPadding, window.innerHeight - layerHeight - viewportPadding)
        : clamp(anchorRect.top - layerHeight - offset, viewportPadding, window.innerHeight - layerHeight - viewportPadding);

      const nextLeft = computeHorizontalLeft(anchorRect, layerWidth, align, viewportPadding);

      setPosition({
        top: nextTop,
        left: nextLeft,
        placement,
        transformOrigin: buildTransformOrigin(placement, align)
      });
    };

    updatePosition();
    const rafId = window.requestAnimationFrame(updatePosition);

    const handleResize = () => updatePosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [align, anchorRef, offset, open, preferredPlacement, viewportPadding]);

  useEffect(() => {
    if (!open || !onRequestClose) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (layerRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onRequestClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onRequestClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [anchorRef, onRequestClose, open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div
        ref={layerRef}
        className={`pointer-events-auto absolute ${className ?? ''}`}
        style={{
          ...style,
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          visibility: position ? 'visible' : 'hidden',
          transformOrigin: position?.transformOrigin
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
