import assert from 'node:assert/strict';
import test from 'node:test';
import type { RecordItem } from '../src/shared/types';
import {
  filterDashboardRecords,
  getNextSizePreset,
  getRecordUseCase,
  getSizePresetLabel
} from '../src/renderer/features/dashboard/shared/dashboard.selectors';

const now = Date.now();
const sampleRecords: RecordItem[] = [
  {
    id: 'img-1',
    type: 'image',
    category: 'image',
    useCase: 'reference',
    tags: ['design'],
    path: '/tmp/a.png',
    previewText: 'chart screenshot',
    source: 'clipboard',
    createdAt: now,
    lastUsedAt: now,
    useCount: 1,
    pinned: true
  },
  {
    id: 'txt-1',
    type: 'text',
    category: 'text',
    useCase: 'prompt',
    tags: ['ui', 'codex'],
    path: '/tmp/a.txt',
    previewText: 'meeting memo',
    source: 'clipboard',
    createdAt: now - 1,
    lastUsedAt: now - 1,
    useCount: 0,
    pinned: true
  },
  {
    id: 'flow-1',
    type: 'text',
    category: 'flow',
    useCase: 'flow',
    tags: ['pipeline'],
    path: '/tmp/b.txt',
    previewText: 'pipeline note',
    ocrText: 'from codex terminal',
    sourceApp: 'Codex',
    source: 'clipboard',
    createdAt: now - 2,
    lastUsedAt: now - 2,
    useCount: 3,
    pinned: true
  }
];

test('size preset should cycle small -> medium -> large -> small', () => {
  assert.equal(getNextSizePreset('small'), 'medium');
  assert.equal(getNextSizePreset('medium'), 'large');
  assert.equal(getNextSizePreset('large'), 'small');
});

test('size preset label mapping should be stable', () => {
  assert.equal(getSizePresetLabel('small'), 'S');
  assert.equal(getSizePresetLabel('medium'), 'M');
  assert.equal(getSizePresetLabel('large'), 'L');
});

test('getRecordUseCase should fallback to flow when legacy category is flow', () => {
  const flowWithoutUseCase = { ...sampleRecords[2], useCase: undefined } as unknown as RecordItem;
  const textWithoutUseCase = { ...sampleRecords[1], useCase: undefined, category: 'text' } as unknown as RecordItem;
  assert.equal(getRecordUseCase(flowWithoutUseCase), 'flow');
  assert.equal(getRecordUseCase(textWithoutUseCase), 'unclassified');
});

test('filter should respect active tab', () => {
  assert.deepEqual(
    filterDashboardRecords(sampleRecords, 'prompt', '').map((item) => item.id),
    ['txt-1']
  );
  assert.deepEqual(
    filterDashboardRecords(sampleRecords, 'flow', '').map((item) => item.id),
    ['flow-1']
  );
});

test('filter should search across display fields', () => {
  assert.deepEqual(
    filterDashboardRecords(sampleRecords, 'all', 'memo').map((item) => item.id),
    ['txt-1']
  );
  assert.deepEqual(
    filterDashboardRecords(sampleRecords, 'all', 'codex').map((item) => item.id),
    ['flow-1', 'txt-1']
  );
  assert.deepEqual(
    filterDashboardRecords(sampleRecords, 'all', 'design').map((item) => item.id),
    ['img-1']
  );
});
