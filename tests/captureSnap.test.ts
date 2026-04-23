import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAxisSnap } from '../src/renderer/captureSnap';

test('resolveAxisSnap should not snap when snapping is disabled', () => {
  const result = resolveAxisSnap([100], [96, 100, 104], null, false);
  assert.equal(result.delta, 0);
  assert.equal(result.guide, null);
  assert.equal(result.nextLockedGuide, null);
});

test('resolveAxisSnap should snap when snapping is enabled and point is near guide', () => {
  const result = resolveAxisSnap([100], [97, 120], null, true);
  assert.equal(result.delta, -3);
  assert.equal(result.guide, 97);
  assert.equal(result.nextLockedGuide, 97);
});
