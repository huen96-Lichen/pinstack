import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { InboxItem, Project } from '../src/shared/pinosV1';
import { PinosV1Store } from '../server/src/pinosV1Store';

function createTempRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'pinos-v1-store-'));
}

function makeInbox(now: number): InboxItem {
  return {
    id: 'inbox_1',
    type: 'text',
    status: 'new',
    title: 'hello',
    contentText: 'hello world',
    source: {},
    suggestedTopicNames: [],
    suggestedProjectIds: [],
    suggestedTaskTitles: [],
    aiTags: [],
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };
}

function makeProject(now: number): Project {
  return {
    id: 'proj_1',
    name: 'Project 1',
    goal: 'Goal 1',
    status: 'active',
    knowledgeItemIds: [],
    taskIds: [],
    latestEventIds: [],
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };
}

test('PinosV1Store initializes with empty state', async () => {
  const root = createTempRoot();
  try {
    const store = new PinosV1Store(root);
    await store.init();
    const state = store.getState();
    assert.equal(state.inboxItems.length, 0);
    assert.equal(state.knowledgeItems.length, 0);
    assert.equal(state.projects.length, 0);
    assert.equal(state.tasks.length, 0);
    assert.equal(state.events.length, 0);
    assert.equal(state.reviews.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PinosV1Store upsert persists and updates by id', async () => {
  const root = createTempRoot();
  try {
    const now = Date.now();
    const store = new PinosV1Store(root);
    await store.init();

    const inbox = makeInbox(now);
    await store.upsertInboxItem(inbox);
    await store.upsertProject(makeProject(now));

    const updatedInbox: InboxItem = {
      ...inbox,
      status: 'processed',
      aiSummary: 'summary',
      updatedAt: now + 1000
    };
    await store.upsertInboxItem(updatedInbox);

    const reloaded = new PinosV1Store(root);
    await reloaded.init();
    const state = reloaded.getState();

    assert.equal(state.inboxItems.length, 1);
    assert.equal(state.inboxItems[0]?.status, 'processed');
    assert.equal(state.inboxItems[0]?.aiSummary, 'summary');
    assert.equal(state.projects.length, 1);
    assert.equal(state.projects[0]?.name, 'Project 1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
