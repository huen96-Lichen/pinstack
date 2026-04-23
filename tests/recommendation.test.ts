import assert from 'node:assert/strict';
import test from 'node:test';
import type { RecordItem } from '../src/shared/types';
import { buildRecommendations } from '../src/renderer/features/dashboard/shared/recommendation';

const now = Date.parse('2026-03-30T12:00:00.000Z');

function makeRecord(input: Partial<RecordItem> & Pick<RecordItem, 'id'>): RecordItem {
  return {
    id: input.id,
    type: input.type ?? 'text',
    category: input.category ?? 'text',
    path: input.path ?? `/tmp/${input.id}.txt`,
    displayName: input.displayName,
    previewText: input.previewText ?? '',
    ocrText: input.ocrText,
    sourceApp: input.sourceApp ?? 'Codex',
    source: input.source ?? 'clipboard',
    useCase: input.useCase ?? 'reference',
    tags: input.tags ?? [],
    explainStatus: input.explainStatus,
    explainText: input.explainText,
    createdAt: input.createdAt ?? now - 7 * 24 * 60 * 60 * 1000,
    lastUsedAt: input.lastUsedAt ?? now - 7 * 24 * 60 * 60 * 1000,
    useCount: input.useCount ?? 0,
    pinned: input.pinned ?? true
  };
}

test('buildRecommendations should follow recent/similarity/frequency weighted score', () => {
  const recentRecord = makeRecord({
    id: 'recent',
    previewText: 'dashboard summary',
    lastUsedAt: now,
    useCount: 1
  });
  const relatedRecord = makeRecord({
    id: 'related',
    previewText: 'react dashboard optimization guide',
    lastUsedAt: now - 20 * 24 * 60 * 60 * 1000,
    useCount: 20
  });

  const result = buildRecommendations({
    records: [recentRecord, relatedRecord],
    query: 'react',
    now
  });

  assert.equal(result[0]?.item.id, 'related');
  assert.equal(result[0]?.reason, 'related');
});

test('buildRecommendations should return similarity matches only in relatedOnly mode', () => {
  const records = [
    makeRecord({ id: 'match', previewText: 'npm error failed at build step' }),
    makeRecord({ id: 'other', previewText: 'weekly note without keyword' })
  ];

  const result = buildRecommendations({
    records,
    query: 'error',
    relatedOnly: true,
    now
  });

  assert.deepEqual(result.map((item) => item.item.id), ['match']);
});

test('buildRecommendations should classify frequent reason when useCount dominates', () => {
  const records = [
    makeRecord({
      id: 'freq',
      previewText: 'manual checklist',
      lastUsedAt: now - 29 * 24 * 60 * 60 * 1000,
      useCount: 80
    }),
    makeRecord({
      id: 'normal',
      previewText: 'manual checklist',
      lastUsedAt: now - 29 * 24 * 60 * 60 * 1000,
      useCount: 2
    })
  ];

  const result = buildRecommendations({ records, now });
  assert.equal(result[0]?.item.id, 'freq');
  assert.equal(result[0]?.reason, 'frequent');
});

