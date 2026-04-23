import assert from 'node:assert/strict';
import test from 'node:test';
import type { RecordItem } from '../src/shared/types';
import { inferContentSubtypeFromText, inferRecordContentSubtype } from '../src/renderer/features/dashboard/shared/contentSubtype';

test('inferContentSubtypeFromText should classify command text', () => {
  const raw = 'npm run dev\ncd src';
  assert.equal(inferContentSubtypeFromText(raw), 'command');
});

test('inferContentSubtypeFromText should classify error text first', () => {
  const raw = 'Error: command not found';
  assert.equal(inferContentSubtypeFromText(raw), 'error');
});

test('inferContentSubtypeFromText should classify code text', () => {
  const raw = 'function run() { return true; }';
  assert.equal(inferContentSubtypeFromText(raw), 'code');
});

test('inferContentSubtypeFromText should fallback to plain', () => {
  const raw = '今天把这个方案整理一下。';
  assert.equal(inferContentSubtypeFromText(raw), 'plain');
});

test('inferRecordContentSubtype should return undefined for image records', () => {
  const imageRecord: RecordItem = {
    id: 'img-1',
    type: 'image',
    category: 'image',
    path: '/tmp/a.png',
    source: 'screenshot',
    useCase: 'reference',
    tags: [],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    useCount: 0,
    pinned: false
  };

  assert.equal(inferRecordContentSubtype(imageRecord), undefined);
});
