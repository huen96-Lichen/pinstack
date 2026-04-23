import type { CaptureSelectionBounds } from '../shared/types';

const SNAP_RELEASE_THRESHOLD = 8;
const SNAP_THRESHOLD = 3;

export type SnapGuides = {
  vertical: number[];
  horizontal: number[];
};

export type SnapLocks = {
  x: number | null;
  y: number | null;
};

export const EMPTY_SNAP_GUIDES: SnapGuides = {
  vertical: [],
  horizontal: []
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function clampSelectionToViewport(selection: CaptureSelectionBounds, width: number, height: number): CaptureSelectionBounds {
  const MIN_SELECTION_SIZE = 12;
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

export function getSnapCandidates(length: number): number[] {
  const candidates = [0, Math.round(length / 3), Math.round(length / 2), Math.round((length * 2) / 3), length];
  return [...new Set(candidates)].sort((a, b) => a - b);
}

export function resolveAxisSnap(
  points: number[],
  candidates: number[],
  lockedGuide: number | null,
  snapEnabled: boolean
): { delta: number; guide: number | null; nextLockedGuide: number | null } {
  if (!snapEnabled || points.length === 0) {
    return { delta: 0, guide: null, nextLockedGuide: null };
  }

  if (lockedGuide !== null) {
    const nearestPoint = points.reduce((winner, point) => (Math.abs(point - lockedGuide) < Math.abs(winner - lockedGuide) ? point : winner), points[0]);
    const lockedDelta = lockedGuide - nearestPoint;
    if (Math.abs(lockedDelta) <= SNAP_RELEASE_THRESHOLD) {
      return {
        delta: lockedDelta,
        guide: lockedGuide,
        nextLockedGuide: lockedGuide
      };
    }
  }

  let winner: { delta: number; guide: number } | null = null;
  for (const point of points) {
    for (const guide of candidates) {
      const delta = guide - point;
      if (Math.abs(delta) > SNAP_THRESHOLD) {
        continue;
      }
      if (!winner || Math.abs(delta) < Math.abs(winner.delta)) {
        winner = { delta, guide };
      }
    }
  }

  if (!winner) {
    return { delta: 0, guide: null, nextLockedGuide: null };
  }

  return {
    delta: winner.delta,
    guide: winner.guide,
    nextLockedGuide: winner.guide
  };
}

export function snapMovingSelection(
  selection: CaptureSelectionBounds,
  viewport: { width: number; height: number },
  locks: SnapLocks,
  snapEnabled: boolean
): { selection: CaptureSelectionBounds; guides: SnapGuides; locks: SnapLocks } {
  const xCandidates = getSnapCandidates(viewport.width);
  const yCandidates = getSnapCandidates(viewport.height);
  const xPoints = [selection.x, selection.x + selection.width / 2, selection.x + selection.width];
  const yPoints = [selection.y, selection.y + selection.height / 2, selection.y + selection.height];
  const xSnap = resolveAxisSnap(xPoints, xCandidates, locks.x, snapEnabled);
  const ySnap = resolveAxisSnap(yPoints, yCandidates, locks.y, snapEnabled);

  const snapped = clampSelectionToViewport(
    {
      ...selection,
      x: selection.x + xSnap.delta,
      y: selection.y + ySnap.delta
    },
    viewport.width,
    viewport.height
  );

  return {
    selection: snapped,
    guides: {
      vertical: xSnap.guide !== null ? [xSnap.guide] : [],
      horizontal: ySnap.guide !== null ? [ySnap.guide] : []
    },
    locks: {
      x: xSnap.nextLockedGuide,
      y: ySnap.nextLockedGuide
    }
  };
}

export function snapResizingSelection(
  selection: CaptureSelectionBounds,
  handle: string,
  viewport: { width: number; height: number },
  locks: SnapLocks,
  snapEnabled: boolean
): { selection: CaptureSelectionBounds; guides: SnapGuides; locks: SnapLocks } {
  const MIN_SELECTION_SIZE = 12;
  const xCandidates = getSnapCandidates(viewport.width);
  const yCandidates = getSnapCandidates(viewport.height);
  const guides: SnapGuides = {
    vertical: [],
    horizontal: []
  };

  let left = selection.x;
  let right = selection.x + selection.width;
  let top = selection.y;
  let bottom = selection.y + selection.height;

  const xPoints: number[] = [];
  const yPoints: number[] = [];

  if (handle.includes('w')) xPoints.push(left);
  if (handle.includes('e')) xPoints.push(right);
  if (handle.includes('n')) yPoints.push(top);
  if (handle.includes('s')) yPoints.push(bottom);

  const xSnap = resolveAxisSnap(xPoints, xCandidates, locks.x, snapEnabled);
  const ySnap = resolveAxisSnap(yPoints, yCandidates, locks.y, snapEnabled);

  if (handle.includes('w')) {
    left += xSnap.delta;
    if (xSnap.guide !== null) {
      guides.vertical.push(xSnap.guide);
    }
  }
  if (handle.includes('e')) {
    right += xSnap.delta;
    if (xSnap.guide !== null && !guides.vertical.includes(xSnap.guide)) {
      guides.vertical.push(xSnap.guide);
    }
  }
  if (handle.includes('n')) {
    top += ySnap.delta;
    if (ySnap.guide !== null) {
      guides.horizontal.push(ySnap.guide);
    }
  }
  if (handle.includes('s')) {
    bottom += ySnap.delta;
    if (ySnap.guide !== null && !guides.horizontal.includes(ySnap.guide)) {
      guides.horizontal.push(ySnap.guide);
    }
  }

  if (handle.includes('w')) {
    left = clamp(left, 0, right - MIN_SELECTION_SIZE);
  }
  if (handle.includes('e')) {
    right = clamp(right, left + MIN_SELECTION_SIZE, viewport.width);
  }
  if (handle.includes('n')) {
    top = clamp(top, 0, bottom - MIN_SELECTION_SIZE);
  }
  if (handle.includes('s')) {
    bottom = clamp(bottom, top + MIN_SELECTION_SIZE, viewport.height);
  }

  return {
    selection: clampSelectionToViewport(
      {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      },
      viewport.width,
      viewport.height
    ),
    guides,
    locks: {
      x: xSnap.nextLockedGuide,
      y: ySnap.nextLockedGuide
    }
  };
}
