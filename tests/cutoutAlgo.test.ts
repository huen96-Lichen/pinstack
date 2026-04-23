import assert from 'node:assert/strict';
import test from 'node:test';
import { removeBackgroundByCornersRgba } from '../src/main/cutout/cutoutAlgo';

function makeImage(width: number, height: number, fill: [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = fill[0];
    out[i + 1] = fill[1];
    out[i + 2] = fill[2];
    out[i + 3] = fill[3];
  }
  return out;
}

test('removeBackgroundByCornersRgba removes corner-like background pixels', () => {
  const width = 5;
  const height = 5;
  const bg: [number, number, number, number] = [240, 240, 240, 255];
  const fg: [number, number, number, number] = [120, 60, 200, 255];
  const rgba = makeImage(width, height, bg);

  const centerIndex = ((2 * width) + 2) * 4;
  rgba[centerIndex] = fg[0];
  rgba[centerIndex + 1] = fg[1];
  rgba[centerIndex + 2] = fg[2];
  rgba[centerIndex + 3] = fg[3];

  const out = removeBackgroundByCornersRgba(rgba, width, height, 36);

  // Background corner should become transparent.
  assert.equal(out[3], 0);
  // Foreground center should remain opaque.
  assert.equal(out[centerIndex + 3], 255);
});

test('removeBackgroundByCornersRgba removes all alpha on fully corner-like background', () => {
  const width = 3;
  const height = 3;
  const rgba = makeImage(width, height, [30, 30, 30, 255]);
  const out = removeBackgroundByCornersRgba(rgba, width, height, 5);

  // All pixels should become transparent because every pixel matches the sampled background.
  for (let i = 3; i < out.length; i += 4) {
    assert.equal(out[i], 0);
  }
});
