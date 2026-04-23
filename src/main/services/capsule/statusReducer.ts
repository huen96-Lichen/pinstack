import type { CapsuleBusinessState, CapsuleEvent, CapsuleStateSnapshot, CapsuleUIState } from '../../../shared/types';

function deriveBusinessState(event?: CapsuleEvent): CapsuleBusinessState {
  if (!event) {
    return 'idle';
  }
  if (event.type === 'screenshotCompleted') {
    return 'screenshot_completed';
  }
  if (event.type === 'clipboardCaptured') {
    return 'clipboard_captured';
  }
  if (event.type === 'aiProcessingStarted') {
    return 'ai_processing';
  }
  if (event.type === 'aiProcessingCompleted') {
    return 'ai_completed';
  }
  return 'idle';
}

export function reduceCapsuleState(current: CapsuleStateSnapshot, input: { uiState?: CapsuleUIState; event?: CapsuleEvent; queueSize: number; now?: number }): CapsuleStateSnapshot {
  const now = input.now ?? Date.now();
  const nextEvent = input.event ?? current.lastEvent;
  const nextBusinessState = deriveBusinessState(nextEvent);
  return {
    ...current,
    uiState: input.uiState ?? current.uiState,
    businessState: nextBusinessState,
    lastEvent: nextEvent,
    queueSize: input.queueSize,
    updatedAt: now
  };
}
