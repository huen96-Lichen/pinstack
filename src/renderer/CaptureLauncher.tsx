import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CaptureLauncherVisualState, CaptureRecordingState } from '../shared/types';
import { PinStackIcon } from './design-system/icons';
import { useDomClasses } from './shared/useDomClasses';

const DRAG_THRESHOLD = 6;

type PointerStart = {
  pointerId: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
};

export function CaptureLauncher(): JSX.Element {
  const pointerStartRef = useRef<PointerStart | null>(null);
  const dragStartedRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isStartingCapture, setIsStartingCapture] = useState(false);
  const [visualState, setVisualState] = useState<CaptureLauncherVisualState>({
    weakened: false,
    edge: null,
    edgeDistance: 999,
    hubOpen: false
  });
  const [recordingState, setRecordingState] = useState<CaptureRecordingState>({
    active: false,
    startedAt: null
  });

  useDomClasses();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const state = await window.pinStack.capture.getRecordingState();
      const launcherVisualState = await window.pinStack.capture.getLauncherVisualState();
      if (!cancelled) {
        setRecordingState(state);
        setVisualState(launcherVisualState);
      }
    };

    void load();
    const unsubscribe = window.pinStack.capture.onRecordingState((state) => {
      setRecordingState(state);
    });
    const unsubscribeLauncherState = window.pinStack.capture.onLauncherVisualState((state) => {
      setVisualState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeLauncherState();
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const pointerStart = pointerStartRef.current;
      if (!pointerStart || event.pointerId !== pointerStart.pointerId) {
        return;
      }

      const deltaX = event.clientX - pointerStart.clientX;
      const deltaY = event.clientY - pointerStart.clientY;
      const distance = Math.hypot(deltaX, deltaY);

      if (!dragStartedRef.current && distance >= DRAG_THRESHOLD) {
        dragStartedRef.current = true;
        setIsDragging(true);
        window.pinStack.capture.launcherDragStart(pointerStart.screenX, pointerStart.screenY);
      }

      if (dragStartedRef.current) {
        window.pinStack.capture.launcherDragMove(event.screenX, event.screenY);
      }
    };

    const finishInteraction = (event: PointerEvent) => {
      const pointerStart = pointerStartRef.current;
      if (!pointerStart || event.pointerId !== pointerStart.pointerId) {
        return;
      }

      if (dragStartedRef.current) {
        void window.pinStack.capture.launcherDragEnd(event.screenX, event.screenY);
      } else {
        if (recordingState.active) {
          window.pinStack.capture.requestRecordingStop();
        } else {
          setIsStartingCapture(true);
          void window.pinStack.capture.takeScreenshot().finally(() => {
            setIsStartingCapture(false);
          });
        }
      }

      pointerStartRef.current = null;
      dragStartedRef.current = false;
      setIsDragging(false);
    };

    const cancelInteraction = (event: PointerEvent) => {
      const pointerStart = pointerStartRef.current;
      if (!pointerStart || event.pointerId !== pointerStart.pointerId) {
        return;
      }

      if (dragStartedRef.current) {
        void window.pinStack.capture.launcherDragEnd(event.screenX, event.screenY);
      }

      pointerStartRef.current = null;
      dragStartedRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('pointercancel', cancelInteraction);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishInteraction);
      window.removeEventListener('pointercancel', cancelInteraction);
    };
  }, [recordingState.active]);

  const handleContextMenu = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (recordingState.active || isDragging || isStartingCapture) {
      return;
    }
    void window.pinStack.capture.toggleHub();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    pointerStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY
    };
    dragStartedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const isSubdued = !isHovered && !isDragging && !recordingState.active && (visualState.hubOpen || visualState.weakened);
  const isSelected = isHovered || isDragging || visualState.hubOpen || recordingState.active;
  const outerStateClass = isDragging
    ? 'cursor-grabbing scale-[0.97]'
    : recordingState.active
      ? 'cursor-pointer text-[color:var(--ps-status-danger)]'
      : isSubdued
        ? 'cursor-grab opacity-72'
        : 'cursor-grab text-black/76';
  const outlineStateClass = recordingState.active
    ? 'h-11 w-11 border-[2px] border-[rgba(201,75,75,0.68)] opacity-100'
    : isSelected
      ? 'h-11 w-11 border-[2px] border-[rgba(124,92,250,0.78)] opacity-100'
      : 'h-11 w-11 border-[2px] border-transparent opacity-0';
  const innerBaseClass = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_1px_rgba(255,255,255,0.28)]';
  const innerStateClass = isDragging
    ? 'h-9 w-9 scale-[0.95] border-[rgba(124,92,250,0.2)] bg-[color:var(--ps-brand-soft)] text-[color:var(--ps-brand-primary)] shadow-[0_0_0_6px_rgba(124,92,250,0.08)]'
    : recordingState.active
      ? 'h-9 w-9 border-rose-300/34 bg-rose-100/74 text-[color:var(--ps-status-danger)] shadow-[0_0_0_6px_rgba(201,75,75,0.08)]'
      : isSubdued
        ? 'h-[30px] w-[30px] border-[rgba(124,92,250,0.16)] bg-[color:var(--ps-brand-soft)] text-[color:var(--ps-brand-primary)] opacity-72'
        : isHovered
          ? 'h-9 w-9 scale-[1.03] border-[rgba(124,92,250,0.2)] bg-[color:var(--ps-brand-soft)] text-[color:var(--ps-brand-primary)] shadow-[0_0_0_6px_rgba(124,92,250,0.08)]'
          : 'h-9 w-9 border-[rgba(124,92,250,0.2)] bg-[color:var(--ps-brand-soft)] text-[color:var(--ps-brand-primary)] shadow-[0_0_0_1px_rgba(124,92,250,0.06)]';

  return (
    <main className="pinstack-window-page pinstack-window-page--clear p-0">
      <section className="pinstack-window-panel pinstack-window-panel--clear flex h-full w-full items-center justify-center p-0">
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onContextMenu={handleContextMenu}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          className={`motion-button flex h-[48px] w-[48px] items-center justify-center overflow-visible rounded-full border border-white/24 bg-white/9 shadow-[0_8px_16px_rgba(20,24,38,0.14)] backdrop-blur-[8px] transition-[transform,opacity,color,border-color,background-color] duration-[110ms] ease-out ${outerStateClass}`}
          aria-label={recordingState.active ? '停止录屏' : '开始截图'}
          title={
            isDragging
              ? '拖拽移动'
              : recordingState.active
                ? '录屏中，点击停止'
                : isHovered
                  ? '左键截图，右键打开面板，拖拽移动'
                  : '左键截图，右键打开面板'
          }
        >
          <span
            className="relative flex h-11 w-11 items-center justify-center transition-[transform,opacity] duration-[100ms] ease-out"
          >
            <span
              className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[border-color,opacity,width,height] duration-[100ms] ease-out ${outlineStateClass}`}
            />
            <span
              className={`relative flex items-center justify-center rounded-full border leading-none transition-[transform,box-shadow,opacity,border-color,background-color,color,width,height] duration-[100ms] ease-out ${innerBaseClass} ${innerStateClass}`}
            >
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                {recordingState.active ? (
                  <PinStackIcon name="record" size={16} className="block" />
                ) : (
                  <svg
                    viewBox="0 0 16 16"
                    width={16}
                    height={16}
                    className="block"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="5.4" />
                    <path d="M8 5.1v5.8M5.1 8h5.8" strokeLinecap="round" />
                  </svg>
                )}
              </span>
            </span>
          </span>
        </button>
      </section>
    </main>
  );
}
