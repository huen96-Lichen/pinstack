import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCapsuleAnimationParameters } from '../src/main/services/capsule/animationParameters';
import { reduceCapsuleState } from '../src/main/services/capsule/statusReducer';
import { StatusPriorityQueue } from '../src/main/services/capsule/statusPriorityQueue';
import { DEFAULT_RUNTIME_SETTINGS } from '../src/shared/defaultSettings';
import type { CapsuleEvent, CapsuleStateSnapshot, RuntimeSettings } from '../src/shared/types';

function event(type: CapsuleEvent['type'], priority: CapsuleEvent['priority'], createdAt: number): CapsuleEvent {
  return {
    id: `evt_${type}_${createdAt}`,
    type,
    priority,
    createdAt
  };
}

test('StatusPriorityQueue should order events by priority and recency', () => {
  const queue = new StatusPriorityQueue(5);
  queue.push(event('clipboardCaptured', 'low', 1));
  queue.push(event('aiProcessingStarted', 'medium', 2));
  queue.push(event('screenshotCompleted', 'high', 3));
  const first = queue.consume();
  assert.equal(first?.type, 'screenshotCompleted');
  const second = queue.consume();
  assert.equal(second?.type, 'aiProcessingStarted');
});

test('StatusPriorityQueue should keep only latest aiProcessingStarted event', () => {
  const queue = new StatusPriorityQueue(5);
  queue.push(event('aiProcessingStarted', 'medium', 1));
  queue.push(event('aiProcessingStarted', 'medium', 2));
  assert.equal(queue.size(), 1);
  assert.equal(queue.consume()?.createdAt, 2);
});

test('StatusPriorityQueue should enforce max queue length', () => {
  const queue = new StatusPriorityQueue(2);
  queue.push(event('clipboardCaptured', 'low', 1));
  queue.push(event('workspaceOpenRequested', 'low', 2));
  queue.push(event('capsuleExpanded', 'low', 3));
  assert.equal(queue.size(), 2);
});

test('reduceCapsuleState should derive business state from latest event', () => {
  const current: CapsuleStateSnapshot = {
    uiState: 'collapsed',
    businessState: 'idle',
    queueSize: 0,
    updatedAt: 0
  };
  const next = reduceCapsuleState(current, {
    event: event('aiProcessingStarted', 'medium', 100),
    queueSize: 1,
    now: 101
  });
  assert.equal(next.businessState, 'ai_processing');
  assert.equal(next.queueSize, 1);
  assert.equal(next.updatedAt, 101);
});

test('resolveCapsuleAnimationParameters should map smooth/snappy presets', () => {
  const smoothRuntime: RuntimeSettings = {
    ...DEFAULT_RUNTIME_SETTINGS,
    capsule: {
      ...DEFAULT_RUNTIME_SETTINGS.capsule,
      animationPreset: 'smooth'
    }
  };
  const snappyRuntime: RuntimeSettings = {
    ...DEFAULT_RUNTIME_SETTINGS,
    capsule: {
      ...DEFAULT_RUNTIME_SETTINGS.capsule,
      animationPreset: 'snappy'
    }
  };

  const smooth = resolveCapsuleAnimationParameters(smoothRuntime);
  const snappy = resolveCapsuleAnimationParameters(snappyRuntime);
  assert.deepEqual(smooth.shellSpring, [0.36, 0.88]);
  assert.deepEqual(snappy.shellSpring, [0.26, 0.9]);
  assert.ok(snappy.contentFadeMs < smooth.contentFadeMs);
});
