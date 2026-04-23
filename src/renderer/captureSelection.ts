import type { CaptureSelectionBounds, CaptureSessionConfig } from '../shared/types';

export interface CapturePoint {
  x: number;
  y: number;
}

export interface CaptureViewport {
  width: number;
  height: number;
}

export interface CaptureModifierState {
  ratioLocked: boolean;
  centerMode: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function normalizeBounds(x: number, y: number, width: number, height: number, viewport: CaptureViewport): CaptureSelectionBounds {
  const safeWidth = clamp(Math.round(width), 1, Math.max(1, viewport.width));
  const safeHeight = clamp(Math.round(height), 1, Math.max(1, viewport.height));
  const safeX = clamp(Math.round(x), 0, Math.max(0, viewport.width - safeWidth));
  const safeY = clamp(Math.round(y), 0, Math.max(0, viewport.height - safeHeight));

  return {
    x: safeX,
    y: safeY,
    width: safeWidth,
    height: safeHeight
  };
}

function buildFreeSelection(
  start: CapturePoint,
  current: CapturePoint,
  viewport: CaptureViewport,
  modifiers: CaptureModifierState,
  session: CaptureSessionConfig
): CaptureSelectionBounds {
  const ratio =
    session.mode === 'ratio' && session.ratio && session.ratio.width > 0 && session.ratio.height > 0
      ? session.ratio.width / session.ratio.height
      : modifiers.ratioLocked
        ? session.size && session.size.width > 0 && session.size.height > 0
          ? session.size.width / session.size.height
          : 1
        : null;

  let dx = current.x - start.x;
  let dy = current.y - start.y;

  if (ratio !== null) {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx / Math.max(absDy, 1) > ratio) {
      dy = Math.sign(dy || 1) * absDx / ratio;
    } else {
      dx = Math.sign(dx || 1) * absDy * ratio;
    }
  }

  if (modifiers.centerMode) {
    const width = Math.abs(dx) * 2;
    const height = Math.abs(dy) * 2;
    return normalizeBounds(start.x - Math.abs(dx), start.y - Math.abs(dy), width, height, viewport);
  }

  const left = Math.min(start.x, start.x + dx);
  const top = Math.min(start.y, start.y + dy);
  return normalizeBounds(left, top, Math.abs(dx), Math.abs(dy), viewport);
}

function buildFixedSelection(
  anchor: CapturePoint,
  session: CaptureSessionConfig,
  viewport: CaptureViewport,
  modifiers: CaptureModifierState
): CaptureSelectionBounds | null {
  if (!session.size) {
    return null;
  }

  const safeWidth = Math.min(Math.max(1, Math.round(session.size.width)), viewport.width);
  const safeHeight = Math.min(Math.max(1, Math.round(session.size.height)), viewport.height);
  const useCenterFollow = !modifiers.centerMode;

  const x = useCenterFollow ? anchor.x - safeWidth / 2 : anchor.x;
  const y = useCenterFollow ? anchor.y - safeHeight / 2 : anchor.y;

  return normalizeBounds(x, y, safeWidth, safeHeight, viewport);
}

export function buildCaptureSelection(params: {
  session: CaptureSessionConfig;
  viewport: CaptureViewport;
  start: CapturePoint | null;
  current: CapturePoint | null;
  modifiers: CaptureModifierState;
}): CaptureSelectionBounds | null {
  const { session, viewport, start, current, modifiers } = params;

  if (session.mode === 'fixed') {
    if (!current) {
      return null;
    }
    return buildFixedSelection(current, session, viewport, modifiers);
  }

  if (!start || !current) {
    return null;
  }

  return buildFreeSelection(start, current, viewport, modifiers, session);
}

export function isSelectionValid(selection: CaptureSelectionBounds | null): selection is CaptureSelectionBounds {
  if (!selection) {
    return false;
  }

  return selection.width >= 12 && selection.height >= 12;
}
