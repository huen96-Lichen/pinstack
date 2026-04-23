import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { SourceRecord, TopicRecord } from '../src/shared/knowledge3';
import { KnowledgeStore } from '../server/src/knowledgeStore';

function buildSource(partial: Partial<SourceRecord> = {}): SourceRecord {
  const now = Date.now();
  return {
    sourceId: partial.sourceId ?? 'src_1',
    title: partial.title ?? 'Source title',
    contentType: partial.contentType ?? 'text',
    entryMethod: partial.entryMethod ?? 'clipboard',
    sourcePlatform: partial.sourcePlatform ?? 'PinStack',
    sourceLink: partial.sourceLink,
    siteName: partial.siteName,
    publishedAt: partial.publishedAt,
    heroImageUrl: partial.heroImageUrl,
    pageType: partial.pageType,
    rawDocumentLink: partial.rawDocumentLink,
    rawDocumentId: partial.rawDocumentId,
    desktopRecordId: partial.desktopRecordId,
    oneLineSummary: partial.oneLineSummary ?? 'Summary',
    coreConclusion: partial.coreConclusion ?? 'Conclusion',
    keywords: partial.keywords ?? ['k1'],
    topicIds: partial.topicIds ?? [],
    projectIds: partial.projectIds ?? [],
    currentStatus: partial.currentStatus ?? 'Inbox',
    nextAction: partial.nextAction ?? 'Next',
    reusable: partial.reusable ?? false,
    enteredKnowledgePage: partial.enteredKnowledgePage ?? false,
    knowledgePageLink: partial.knowledgePageLink,
    syncStatus: partial.syncStatus ?? 'pending',
    syncError: partial.syncError ?? null,
    rawDocumentStatus: partial.rawDocumentStatus ?? 'pending',
    rawDocumentError: partial.rawDocumentError ?? null,
    lastSyncedAt: partial.lastSyncedAt,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now
  };
}

function buildTopic(partial: Partial<TopicRecord> = {}): TopicRecord {
  return {
    topicId: partial.topicId ?? 'topic_1',
    name: partial.name ?? 'Topic',
    description: partial.description ?? 'desc',
    sourceIds: partial.sourceIds ?? [],
    projectIds: partial.projectIds ?? [],
    assetIds: partial.assetIds ?? [],
    currentConclusion: partial.currentConclusion ?? 'conclusion',
    openQuestions: partial.openQuestions ?? [],
    lifecycle: partial.lifecycle ?? 'active',
    archivedAt: partial.archivedAt,
    mergedInto: partial.mergedInto,
    updatedAt: partial.updatedAt ?? Date.now()
  };
}

test('KnowledgeStore should not lint archived topics as orphan/stale', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-knowledge-store-'));
  try {
    const store = new KnowledgeStore(root);
    await store.init();

    await store.upsertTopic(buildTopic({ topicId: 'topic_archived', lifecycle: 'archived' }));
    await store.upsertSource(
      buildSource({
        sourceId: 'src_archived_status',
        currentStatus: 'Archived',
        topicIds: []
      })
    );

    const issues = store.getState().lintIssues;
    assert.equal(issues.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('KnowledgeStore removeTopic should persist and recompute relations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-knowledge-store-'));
  try {
    const store = new KnowledgeStore(root);
    await store.init();

    await store.upsertTopic(buildTopic({ topicId: 'topic_keep' }));
    await store.upsertTopic(buildTopic({ topicId: 'topic_drop' }));
    await store.upsertSource(
      buildSource({
        sourceId: 'src_2',
        topicIds: ['topic_keep']
      })
    );

    await store.removeTopic('topic_drop');
    const next = store.getState();
    assert.equal(next.topics.some((item) => item.topicId === 'topic_drop'), false);
    assert.equal(next.topics.some((item) => item.topicId === 'topic_keep'), true);
    assert.equal(next.topics.find((item) => item.topicId === 'topic_keep')?.sourceIds.includes('src_2'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
