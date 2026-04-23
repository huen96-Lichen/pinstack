import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CapturePoint } from './captureSelection';
import { buildCaptureSelection, isSelectionValid } from './captureSelection';
import type { CaptureSelectionBounds, CaptureSessionConfig } from '../shared/types';
import { useDomClasses } from './shared/useDomClasses';
import { EMPTY_SNAP_GUIDES, snapMovingSelection, snapResizingSelection, type SnapGuides, type SnapLocks } from './captureSnap';

const DEFAULT_SESSION: CaptureSessionConfig = {
  mode: 'free',
  size: null,
  ratio: null
};

const COLOR_PICK_INTERVAL_MS = 33;
const MIN_SELECTION_SIZE = 12;
const HANDLE_HIT_RADIUS = 10;
const GRID_GUIDE_MIN_SIZE = 72;

type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
type DragInteraction = 'idle' | 'creating' | 'moving' | 'resizing';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function clampSelectionToViewport(selection: CaptureSelectionBounds, width: number, height: number): CaptureSelectionBounds {
  const safeWidth = clamp(Math.round(selection.width), MIN_SELECTION_SIZE, Math.max(MIN_SELECTION_SIZE, width));
  const safeHeight = clamp(Math.round(selection.height), MIN_SELECTION_SIZE, Math.max(MIN_SELECTION_SIZE, height));
  const safeX = clamp(Math.round(selection.x), 0, Math.max(0, width - safeWidth));
  const safeY = clamp(Math.round(selection.y), 0, Math.max(0, height - safeHeight));

  return {
    x: safeX,
    y: safeY,
    width: safeWidth,
    height: safeHeight
  };
}

function hitTestSelection(point: CapturePoint, selection: CaptureSelectionBounds): { handle: ResizeHandle | null; inside: boolean } {
  const left = selection.x;
  const right = selection.x + selection.width;
  const top = selection.y;
  const bottom = selection.y + selection.height;
  const cx = selection.x + selection.width / 2;
  const cy = selection.y + selection.height / 2;
  const inRange = (a: number, b: number) => Math.abs(a - b) <= HANDLE_HIT_RADIUS;

  if (inRange(point.x, left) && inRange(point.y, top)) return { handle: 'nw', inside: true };
  if (inRange(point.x, cx) && inRange(point.y, top)) return { handle: 'n', inside: true };
  if (inRange(point.x, right) && inRange(point.y, top)) return { handle: 'ne', inside: true };
  if (inRange(point.x, left) && inRange(point.y, cy)) return { handle: 'w', inside: true };
  if (inRange(point.x, right) && inRange(point.y, cy)) return { handle: 'e', inside: true };
  if (inRange(point.x, left) && inRange(point.y, bottom)) return { handle: 'sw', inside: true };
  if (inRange(point.x, cx) && inRange(point.y, bottom)) return { handle: 's', inside: true };
  if (inRange(point.x, right) && inRange(point.y, bottom)) return { handle: 'se', inside: true };

  const inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  return { handle: null, inside };
}

function resizeSelectionFromHandle(
  start: CaptureSelectionBounds,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  viewport: { width: number; height: number }
): CaptureSelectionBounds {
  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;

  if (handle.includes('w')) {
    left = Math.min(left + dx, right - MIN_SELECTION_SIZE);
  }
  if (handle.includes('e')) {
    right = Math.max(right + dx, left + MIN_SELECTION_SIZE);
  }
  if (handle.includes('n')) {
    top = Math.min(top + dy, bottom - MIN_SELECTION_SIZE);
  }
  if (handle.includes('s')) {
    bottom = Math.max(bottom + dy, top + MIN_SELECTION_SIZE);
  }

  return clampSelectionToViewport(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    },
    viewport.width,
    viewport.height
  );
}

export function CaptureOverlay(): JSX.Element {
  const [session, setSession] = useState<CaptureSessionConfig>(DEFAULT_SESSION);
  const [dragStart, setDragStart] = useState<CapturePoint | null>(null);
  const [dragCurrent, setDragCurrent] = useState<CapturePoint | null>(null);
  const [selection, setSelection] = useState<CaptureSelectionBounds | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isRatioLocked, setIsRatioLocked] = useState(false);
  const [isCenterModifierActive, setIsCenterModifierActive] = useState(false);
  const [isSnapModifierActive, setIsSnapModifierActive] = useState(false);
  const [dragInteraction, setDragInteraction] = useState<DragInteraction>('idle');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuides>(EMPTY_SNAP_GUIDES);
  const rootRef = useRef<HTMLDivElement>(null);
  const moveOriginRef = useRef<{ selection: CaptureSelectionBounds; pointer: CapturePoint } | null>(null);
  const resizeOriginRef = useRef<{ selection: CaptureSelectionBounds; pointer: CapturePoint; handle: ResizeHandle } | null>(null);

  // ── 取色状态 ──
  const [cursorScreenX, setCursorScreenX] = useState(0);
  const [cursorScreenY, setCursorScreenY] = useState(0);
  const [pickedColor, setPickedColor] = useState('#------');
  const [cursorLocalX, setCursorLocalX] = useState(0);
  const [cursorLocalY, setCursorLocalY] = useState(0);
  const latestCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastSampleCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const snapLocksRef = useRef<SnapLocks>({ x: null, y: null });

  useDomClasses();

  const getViewport = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    return {
      width: Math.round(rect?.width ?? window.innerWidth),
      height: Math.round(rect?.height ?? window.innerHeight)
    };
  }, []);

  const getLocalPoint = useCallback((clientX: number, clientY: number): CapturePoint => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: clientX, y: clientY };
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, []);

  const recomputeSelection = useCallback(
    (nextStart: CapturePoint | null, nextCurrent: CapturePoint | null, ratioLocked = isRatioLocked, centerMode = isCenterModifierActive) => {
      const nextSelection = buildCaptureSelection({
        session,
        viewport: getViewport(),
        start: nextStart,
        current: nextCurrent,
        modifiers: {
          ratioLocked,
          centerMode
        }
      });

      setSelection(nextSelection);
      return nextSelection;
    },
    [getViewport, isCenterModifierActive, isRatioLocked, session]
  );

  const submitSelection = useCallback(
    async (nextSelection: CaptureSelectionBounds | null) => {
      if (!isSelectionValid(nextSelection) || isSubmitting || isLoadingSession) {
        return;
      }

      setIsSubmitting(true);
      try {
        await window.pinStack.capture.takeRegionScreenshot(nextSelection);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isLoadingSession, isSubmitting]
  );

  const runQuickAction = useCallback(
    async (action: 'copy' | 'save' | 'pin' | 'saveAs') => {
      if (!selection || !isSelectionValid(selection) || isSubmitting || isLoadingSession) {
        return;
      }
      setIsSubmitting(true);
      setContextMenu(null);
      try {
        if (action === 'copy') {
          await window.pinStack.capture.takeRegionScreenshotCopy(selection);
          return;
        }
        if (action === 'save') {
          await window.pinStack.capture.takeRegionScreenshotSave(selection);
          return;
        }
        if (action === 'saveAs') {
          await window.pinStack.capture.takeRegionScreenshotSaveAs(selection);
          return;
        }
        await window.pinStack.capture.takeRegionScreenshotPin(selection);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isLoadingSession, isSubmitting, selection]
  );

  // ── 取色：节流定时器 ──
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (disposed || inFlight) {
        return;
      }
      if (dragInteraction !== 'idle' || isSubmitting || isLoadingSession) {
        return;
      }
      const { x, y } = latestCursorRef.current;
      if (x === 0 && y === 0) return;
      if (x === lastSampleCursorRef.current.x && y === lastSampleCursorRef.current.y) {
        return;
      }
      inFlight = true;
      try {
        const color = await window.pinStack.capture.getColorAtPosition(x, y);
        if (/^#[0-9A-F]{6}$/i.test(color)) {
          setPickedColor(color);
          lastSampleCursorRef.current = { x, y };
        }
      } catch {
        // 静默失败
      } finally {
        inFlight = false;
      }
    }, COLOR_PICK_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [dragInteraction, isLoadingSession, isSubmitting]);

  // ── 取色：复制颜色值 ──
  const copyPickedColor = useCallback(async () => {
    if (pickedColor === '#------') return;
    try {
      await window.pinStack.capture.ignoreNextCopy();
      await navigator.clipboard.writeText(pickedColor);
    } catch {
      // 复制失败静默处理
    }
  }, [pickedColor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        void window.pinStack.capture.cancelRegionScreenshot();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        void submitSelection(selection);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void copyPickedColor();
        return;
      }

      if (event.key === 'Shift') {
        setIsRatioLocked(true);
        recomputeSelection(dragStart, dragCurrent, true, isCenterModifierActive);
        return;
      }

      if (event.key === 'Alt') {
        setIsCenterModifierActive(true);
        recomputeSelection(dragStart, dragCurrent, isRatioLocked, true);
        return;
      }

      if (event.key === 'Meta' || event.key === 'Control') {
        setIsSnapModifierActive(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsRatioLocked(false);
        recomputeSelection(dragStart, dragCurrent, false, isCenterModifierActive);
        return;
      }

      if (event.key === 'Alt') {
        setIsCenterModifierActive(false);
        recomputeSelection(dragStart, dragCurrent, isRatioLocked, false);
        return;
      }

      if (event.key === 'Meta' || event.key === 'Control') {
        setIsSnapModifierActive(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [copyPickedColor, dragCurrent, dragStart, isCenterModifierActive, isRatioLocked, recomputeSelection, selection, submitSelection]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      setIsLoadingSession(true);
      try {
        const next = await window.pinStack.capture.getSelectionSession();
        if (!cancelled) {
          setSession(next);
          setDragStart(null);
          setDragCurrent(null);
          setSelection(null);
          setIsDragging(false);
          setDragInteraction('idle');
          setContextMenu(null);
          setSnapGuides(EMPTY_SNAP_GUIDES);
          snapLocksRef.current = { x: null, y: null };
          setIsRatioLocked(false);
          setIsCenterModifierActive(false);
          setIsSnapModifierActive(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSession(false);
          setIsSubmitting(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const modifierHint = useMemo(() => {
    if (session.mode === 'fixed') {
      return isCenterModifierActive ? 'Alt: 当前为左上角跟随' : 'Alt: 切换左上角跟随';
    }

    if (session.mode === 'ratio' && session.ratio) {
      return `${session.ratio.label} 比例已锁定 · ${isCenterModifierActive ? 'Alt: 当前为中心扩展' : 'Alt: 切换中心扩展'}`;
    }

    return `${isRatioLocked ? 'Shift: 比例锁定已开启' : 'Shift: 锁定比例'}  ·  ${
      isCenterModifierActive ? 'Alt: 当前为中心扩展' : 'Alt: 切换中心扩展'
    }  ·  ${isSnapModifierActive ? 'Cmd/Ctrl: 磁吸已开启' : 'Cmd/Ctrl: 按住启用磁吸'}`;
  }, [isCenterModifierActive, isRatioLocked, isSnapModifierActive, session.mode, session.ratio]);

  const helperTitle =
    session.mode === 'fixed' && session.size
      ? `移动鼠标定位 ${session.size.width} × ${session.size.height} 截图区域`
      : session.mode === 'ratio' && session.ratio
        ? `拖拽选择 ${session.ratio.label} 比例截图区域`
        : '拖拽选择截图区域';

  const helperDetail =
    session.mode === 'fixed'
      ? 'Enter 确认截图，Esc 取消'
      : '松开鼠标完成选区，右键快捷菜单，Enter 确认截图，Esc 取消';

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isSubmitting || isLoadingSession) {
      return;
    }
    if (event.button === 2) {
      return;
    }
    setContextMenu(null);
    setSnapGuides(EMPTY_SNAP_GUIDES);
    snapLocksRef.current = { x: null, y: null };

    const point = getLocalPoint(event.clientX, event.clientY);

    if (session.mode === 'fixed') {
      setDragCurrent(point);
      recomputeSelection(null, point);
      return;
    }

    if (selection && isSelectionValid(selection)) {
      const hit = hitTestSelection(point, selection);
      if (hit.handle) {
        resizeOriginRef.current = {
          selection: { ...selection },
          pointer: point,
          handle: hit.handle
        };
        setDragInteraction('resizing');
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      if (hit.inside) {
        moveOriginRef.current = {
          selection: { ...selection },
          pointer: point
        };
        setDragInteraction('moving');
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    setDragStart(point);
    setDragCurrent(point);
    setDragInteraction('creating');
    setIsDragging(true);
    recomputeSelection(point, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isSubmitting || isLoadingSession) {
      return;
    }

    const point = getLocalPoint(event.clientX, event.clientY);
    setCursorLocalX(point.x);
    setCursorLocalY(point.y);

    // 更新取色坐标（屏幕绝对坐标）
    latestCursorRef.current = { x: event.screenX, y: event.screenY };
    setCursorScreenX(event.screenX);
    setCursorScreenY(event.screenY);

    if (session.mode === 'fixed') {
      setDragCurrent(point);
      recomputeSelection(null, point);
      return;
    }

    if (dragInteraction === 'moving' && moveOriginRef.current) {
      const { selection: startSelection, pointer: startPointer } = moveOriginRef.current;
      const viewport = getViewport();
      const next = clampSelectionToViewport(
        {
          x: startSelection.x + (point.x - startPointer.x),
          y: startSelection.y + (point.y - startPointer.y),
          width: startSelection.width,
          height: startSelection.height
        },
        viewport.width,
        viewport.height
      );
      const snapped = snapMovingSelection(next, viewport, snapLocksRef.current, isSnapModifierActive);
      setSelection(snapped.selection);
      setSnapGuides(snapped.guides);
      snapLocksRef.current = snapped.locks;
      return;
    }

    if (dragInteraction === 'resizing' && resizeOriginRef.current) {
      const { selection: startSelection, pointer: startPointer, handle } = resizeOriginRef.current;
      const viewport = getViewport();
      const next = resizeSelectionFromHandle(
        startSelection,
        handle,
        point.x - startPointer.x,
        point.y - startPointer.y,
        viewport
      );
      const snapped = snapResizingSelection(next, handle, viewport, snapLocksRef.current, isSnapModifierActive);
      setSelection(snapped.selection);
      setSnapGuides(snapped.guides);
      snapLocksRef.current = snapped.locks;
      return;
    }

    if (dragInteraction === 'creating' || !dragStart) {
      setSnapGuides(EMPTY_SNAP_GUIDES);
      snapLocksRef.current = { x: null, y: null };
      setDragCurrent(point);
      recomputeSelection(dragStart, point);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isSubmitting || isLoadingSession) {
      return;
    }

    if (session.mode === 'fixed') {
      const point = getLocalPoint(event.clientX, event.clientY);
      setDragCurrent(point);
      recomputeSelection(null, point);
      return;
    }

    if (!isDragging) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    const point = getLocalPoint(event.clientX, event.clientY);
    setDragCurrent(point);
    moveOriginRef.current = null;
    resizeOriginRef.current = null;
    setSnapGuides(EMPTY_SNAP_GUIDES);
    snapLocksRef.current = { x: null, y: null };
    setDragInteraction('idle');
    setIsDragging(false);
    if (dragStart) {
      recomputeSelection(dragStart, point);
    }
  };

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!selection || !isSelectionValid(selection) || isSubmitting || isLoadingSession) {
      setContextMenu(null);
      return;
    }
    const viewport = getViewport();
    const menuWidth = 168;
    const menuHeight = 172;
    setContextMenu({
      x: clamp(event.clientX + 8, 8, Math.max(8, viewport.width - menuWidth - 8)),
      y: clamp(event.clientY + 8, 8, Math.max(8, viewport.height - menuHeight - 8))
    });
  };

  // 计算十字准星在 overlay 中的位置
  const crosshairStyle = useMemo((): React.CSSProperties => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { display: 'none' };
    return {
      position: 'absolute',
      left: cursorLocalX,
      top: cursorLocalY,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: 60
    };
  }, [cursorLocalX, cursorLocalY]);

  const cursorHudStyle = useMemo((): React.CSSProperties => {
    const rect = rootRef.current?.getBoundingClientRect();
    const hudWidth = 172;
    const hudHeight = 78;
    const margin = 16;
    if (!rect) {
      return { display: 'none' };
    }

    const leftRaw = cursorLocalX + 18;
    const topRaw = cursorLocalY + 18;
    const left = Math.max(margin, Math.min(leftRaw, rect.width - hudWidth - margin));
    const top = Math.max(margin, Math.min(topRaw, rect.height - hudHeight - margin));

    return {
      position: 'absolute',
      left,
      top,
      width: hudWidth,
      minHeight: hudHeight,
      zIndex: 72,
      pointerEvents: 'none'
    };
  }, [cursorLocalX, cursorLocalY]);

  const actionBarStyle = useMemo((): React.CSSProperties | null => {
    if (!selection) {
      return null;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    const actionWidth = 220;
    const actionHeight = 36;
    const margin = 12;
    const preferredLeft = selection.x + selection.width - actionWidth;
    const left = Math.max(margin, Math.min(preferredLeft, rect.width - actionWidth - margin));

    const showAbove = selection.y >= actionHeight + margin + 8;
    const top = showAbove
      ? selection.y - actionHeight - 8
      : Math.min(rect.height - actionHeight - margin, selection.y + selection.height + 8);

    return {
      position: 'absolute',
      left,
      top,
      width: actionWidth,
      height: actionHeight,
      zIndex: 74
    };
  }, [selection]);

  return (
    <main className="pinstack-window-page pinstack-window-page--overlay h-screen w-screen">
      <div
        ref={rootRef}
        className="pinstack-window-panel pinstack-window-panel--overlay relative h-full w-full cursor-crosshair overflow-hidden rounded-[14px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
      >
        {/* ── 顶部信息栏 ── */}
        <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center px-6" style={{ zIndex: 70 }}>
          <div className="rounded-2xl border border-white/20 bg-black/50 px-4 py-2 text-center text-sm font-medium text-white shadow-[0_18px_48px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div>{helperTitle}</div>
            <div className="mt-1 text-xs text-white/70">{helperDetail}</div>
            <div className="mt-1 text-[11px] text-white/55">{modifierHint}</div>
          </div>
        </div>

        {/* ── 十字准星 ── */}
        {dragInteraction === 'idle' && (
          <div style={crosshairStyle}>
            {/* 水平线 */}
            <div className="absolute left-1/2 top-1/2 h-px w-5 -translate-x-[calc(-50%+12px)] -translate-y-1/2 bg-white/80" />
            <div className="absolute left-1/2 top-1/2 h-px w-5 -translate-x-[calc(-50%-12px)] -translate-y-1/2 bg-white/80" />
            {/* 垂直线 */}
            <div className="absolute left-1/2 top-1/2 w-px h-5 -translate-x-1/2 -translate-y-[calc(-50%+12px)] bg-white/80" />
            <div className="absolute left-1/2 top-1/2 w-px h-5 -translate-x-1/2 -translate-y-[calc(-50%-12px)] bg-white/80" />
            {/* 中心点 */}
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        )}

        {/* ── 全屏参考线（PixPin 风格）── */}
        {dragInteraction === 'idle' ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-cyan-200/55"
              style={{ left: cursorLocalX, zIndex: 58 }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 h-px bg-cyan-200/55"
              style={{ top: cursorLocalY, zIndex: 58 }}
            />
          </>
        ) : null}

        {(snapGuides.vertical.length > 0 || snapGuides.horizontal.length > 0) ? (
          <>
            {snapGuides.vertical.map((x) => (
              <div
                key={`snap-v-${x}`}
                className="pointer-events-none absolute inset-y-0 w-px bg-cyan-300/90 shadow-[0_0_14px_rgba(34,211,238,0.65)]"
                style={{ left: x, zIndex: 63 }}
              />
            ))}
            {snapGuides.horizontal.map((y) => (
              <div
                key={`snap-h-${y}`}
                className="pointer-events-none absolute inset-x-0 h-px bg-cyan-300/90 shadow-[0_0_14px_rgba(34,211,238,0.65)]"
                style={{ top: y, zIndex: 63 }}
              />
            ))}
          </>
        ) : null}

        {/* ── 光标信息面板（PixPin 风格）── */}
        {dragInteraction === 'idle' ? (
          <div style={cursorHudStyle} className="rounded-xl border border-white/20 bg-black/72 px-2.5 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <div
                className="h-8 w-8 shrink-0 rounded-md border border-white/25"
                style={{ backgroundColor: pickedColor === '#------' ? 'transparent' : pickedColor }}
              />
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] font-semibold tracking-wide text-white">{pickedColor}</div>
                <div className="font-mono text-[10px] text-white/70">
                  x:{Math.max(0, Math.round(cursorLocalX))} y:{Math.max(0, Math.round(cursorLocalY))}
                </div>
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-white/15 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/70">
              Enter 截图 · Esc 取消 · Shift 锁比例 · Alt 中心扩展 · Cmd/Ctrl 临时磁吸
            </div>
          </div>
        ) : null}

        {/* ── 选区 ── */}
        {selection ? (
          <div
            className="pointer-events-none absolute border border-cyan-300 bg-cyan-200/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.34),0_0_0_1px_rgba(255,255,255,0.3)_inset,0_0_32px_rgba(56,189,248,0.22)]"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.width,
              height: selection.height
            }}
          >
            {selection.width >= GRID_GUIDE_MIN_SIZE && selection.height >= GRID_GUIDE_MIN_SIZE ? (
              <>
                <span className="absolute inset-y-0 left-1/3 w-px -translate-x-1/2 bg-cyan-200/45" />
                <span className="absolute inset-y-0 left-2/3 w-px -translate-x-1/2 bg-cyan-200/45" />
                <span className="absolute inset-x-0 top-1/3 h-px -translate-y-1/2 bg-cyan-200/45" />
                <span className="absolute inset-x-0 top-2/3 h-px -translate-y-1/2 bg-cyan-200/45" />
              </>
            ) : null}
            <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <span className="absolute left-1/2 -top-1.5 h-3 w-3 -translate-x-1/2 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <span className="absolute -left-1.5 -bottom-1.5 h-3 w-3 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <span className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <span className="absolute -right-1.5 -bottom-1.5 h-3 w-3 rounded-full border border-white/80 bg-cyan-300/95 shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
            <div className="absolute -top-8 right-0 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-lg">
              {selection.width} × {selection.height} · x{selection.x} y{selection.y}
            </div>
          </div>
        ) : null}

        {/* ── 选区快捷操作条 ── */}
        {selection && actionBarStyle ? (
          <div
            style={actionBarStyle}
            className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/72 px-2 py-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={() => void submitSelection(selection)}
              disabled={isSubmitting || isLoadingSession || !isSelectionValid(selection)}
              className="h-7 flex-1 rounded-lg bg-cyan-500/90 px-2 text-[12px] font-semibold text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              截图
            </button>
            <button
              type="button"
              onClick={() => void window.pinStack.capture.cancelRegionScreenshot()}
              className="h-7 rounded-lg border border-white/20 px-2.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void runQuickAction('copy')}
              className="h-7 rounded-lg border border-white/20 px-2.5 text-[12px] font-mono text-white/85 transition-colors hover:bg-white/10"
              title="复制截图到剪贴板"
            >
              复制截图
            </button>
          </div>
        ) : null}

        {contextMenu ? (
          <div
            className="absolute z-[90] w-[168px] rounded-xl border border-white/20 bg-black/80 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => void runQuickAction('copy')}
              className="block h-8 w-full rounded-lg px-2 text-left text-[12px] text-white/90 transition-colors hover:bg-white/12"
            >
              复制到剪贴板
            </button>
            <button
              type="button"
              onClick={() => void runQuickAction('save')}
              className="mt-0.5 block h-8 w-full rounded-lg px-2 text-left text-[12px] text-white/90 transition-colors hover:bg-white/12"
            >
              保存到 PinStack
            </button>
            <button
              type="button"
              onClick={() => void runQuickAction('saveAs')}
              className="mt-0.5 block h-8 w-full rounded-lg px-2 text-left text-[12px] text-white/90 transition-colors hover:bg-white/12"
            >
              另存为文件...
            </button>
            <button
              type="button"
              onClick={() => void runQuickAction('pin')}
              className="mt-0.5 block h-8 w-full rounded-lg px-2 text-left text-[12px] text-white/90 transition-colors hover:bg-white/12"
            >
              保存并钉住
            </button>
            <div className="my-1 h-px bg-white/12" />
            <button
              type="button"
              onClick={() => setContextMenu(null)}
              className="block h-8 w-full rounded-lg px-2 text-left text-[12px] text-white/70 transition-colors hover:bg-white/12"
            >
              关闭菜单
            </button>
          </div>
        ) : null}

        {!selection && session.mode === 'fixed' && session.size ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-6">
            <div className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] text-white/70 backdrop-blur-lg">
              固定尺寸：{session.size.width} × {session.size.height}
            </div>
          </div>
        ) : null}

        {isSubmitting || isLoadingSession ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-white/20 bg-black/60 px-4 py-3 text-sm font-medium text-white shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl">
              {isLoadingSession ? '准备截图中...' : '正在截图并保存...'}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
