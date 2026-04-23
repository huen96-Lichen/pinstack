import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StorageService } from '../src/main/storage';
import { SYSTEM_SUGGESTION_TAG } from '../src/shared/classificationSuggestion';

async function withTempStorage(run: (service: StorageService, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-storage-test-'));
  const service = new StorageService(root);
  try {
    await service.init();
    await run(service, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('createTextRecord should write file/index and infer prompt useCase', async () => {
  await withTempStorage(async (service, root) => {
    const record = await service.createTextRecord('请帮我优化这段代码');

    assert.equal(record.type, 'text');
    assert.equal(record.useCase, 'prompt');
    assert.deepEqual(record.tags, []);
    await access(record.path);

    const indexPath = path.join(root, 'index.jsonl');
    const content = await readFile(indexPath, 'utf8');
    assert.match(content, new RegExp(record.id));
    assert.match(content, /"useCase":"prompt"/);
  });
});

test('deleteRecord success should remove file and index entry', async () => {
  await withTempStorage(async (service, root) => {
    const record = await service.createTextRecord('to be deleted');
    await service.deleteRecord(record.id);

    await assert.rejects(async () => {
      await access(record.path);
    });

    assert.throws(() => service.getRecord(record.id), /Record not found/);
    const indexPath = path.join(root, 'index.jsonl');
    const content = await readFile(indexPath, 'utf8');
    assert.ok(!content.includes(record.id));
  });
});

test('deleteRecord should rollback when index persist fails', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord('rollback case');

    const originalPersist = (service as unknown as { persistIndexQueued: () => Promise<void> }).persistIndexQueued;
    (service as unknown as { persistIndexQueued: () => Promise<void> }).persistIndexQueued = async () => {
      throw new Error('forced persist failure');
    };

    await assert.rejects(
      async () => {
        await service.deleteRecord(record.id);
      },
      /forced persist failure/
    );

    (service as unknown as { persistIndexQueued: () => Promise<void> }).persistIndexQueued = originalPersist;

    const restored = service.getRecord(record.id);
    assert.equal(restored.id, record.id);
    await access(record.path);
  });
});

test('searchRecords should keep stable ranking: displayName exact > prefix > contains > tags', async () => {
  await withTempStorage(async (service) => {
    const exact = await service.createTextRecord('alpha content');
    const prefix = await service.createTextRecord('target starts here');
    const contains = await service.createTextRecord('before target after');
    const tagsOnly = await service.createTextRecord('unrelated text');

    await service.renameRecord(exact.id, 'target');
    await service.updateRecordMeta(tagsOnly.id, { tags: ['target-tag'] });

    const result = service.searchRecords({ query: 'target' });
    assert.deepEqual(result.map((item) => item.id), [exact.id, prefix.id, contains.id, tagsOnly.id]);
  });
});

test('updateRecordMeta and bulkUpdateRecordMeta should persist useCase/tags changes', async () => {
  await withTempStorage(async (service) => {
    const one = await service.createTextRecord('first item');
    const two = await service.createTextRecord('second item');

    const updated = await service.updateRecordMeta(one.id, { useCase: 'reference', tags: ['doc', 'spec'] });
    assert.equal(updated.useCase, 'reference');
    assert.deepEqual(updated.tags, ['doc', 'spec']);

    const bulk = await service.bulkUpdateRecordMeta([one.id, two.id], { useCase: 'fix' });
    assert.deepEqual(bulk.failed, []);
    assert.deepEqual(new Set(bulk.updated), new Set([one.id, two.id]));

    assert.equal(service.getRecord(one.id).useCase, 'fix');
    assert.equal(service.getRecord(two.id).useCase, 'fix');
  });
});

test('markRecordUsed should update lastUsedAt and useCount', async () => {
  await withTempStorage(async (service) => {
    const one = await service.createTextRecord('usage tracking');
    assert.equal(one.useCount, 0);

    const touched = await service.markRecordUsed(one.id);
    assert.equal(touched.useCount, 1);
    assert.ok(touched.lastUsedAt >= one.lastUsedAt);

    const touchedAgain = await service.markRecordUsed(one.id);
    assert.equal(touchedAgain.useCount, 2);
    assert.ok(touchedAgain.lastUsedAt >= touched.lastUsedAt);
  });
});

test('manual meta update should remove system suggestion marker tag', async () => {
  await withTempStorage(async (service) => {
    const item = await service.createTextRecord('请帮我整理这段内容', {
      useCase: 'prompt',
      tags: [SYSTEM_SUGGESTION_TAG, 'react']
    });
    assert.ok(item.tags.includes(SYSTEM_SUGGESTION_TAG));

    const updated = await service.updateRecordMeta(item.id, {
      useCase: 'reference',
      tags: [SYSTEM_SUGGESTION_TAG, 'react', 'doc']
    });

    assert.equal(updated.useCase, 'reference');
    assert.deepEqual(updated.tags, ['react', 'doc']);
    assert.equal(updated.tags.includes(SYSTEM_SUGGESTION_TAG), false);
  });
});

test('searchRecords should support useCase/tags/sourceApps/types combined filters', async () => {
  await withTempStorage(async (service) => {
    const prompt = await service.createTextRecord('请帮我写一个脚本', {
      sourceApp: 'ChatGPT',
      useCase: 'prompt',
      tags: ['automation', 'script']
    });
    await service.createTextRecord('这是普通笔记', {
      sourceApp: 'Notes',
      useCase: 'reference',
      tags: ['note']
    });

    const result = service.searchRecords({
      query: 'script',
      useCase: ['prompt'],
      tags: ['automation'],
      sourceApps: ['chatgpt'],
      types: ['text']
    });

    assert.deepEqual(result.map((item) => item.id), [prompt.id]);
  });
});

test('createFlowRecord should create flow bundle record with referenced recordIds', async () => {
  await withTempStorage(async (service) => {
    const one = await service.createTextRecord('first step');
    const two = await service.createTextRecord('second step');
    const flow = await service.createFlowRecord([one.id, two.id, one.id]);

    assert.equal(flow.type, 'text');
    assert.equal(flow.category, 'flow');
    assert.equal(flow.useCase, 'flow');
    assert.equal(flow.displayName, 'Flow Bundle (2)');
    assert.deepEqual(flow.tags, ['flow-bundle']);

    const content = await service.getRecordContent(flow.id);
    assert.equal(content.type, 'text');
    assert.deepEqual(JSON.parse(content.text), {
      recordIds: [one.id, two.id]
    });
  });
});

test('init should migrate legacy records to useCase/tags without changing core fields', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-storage-migrate-test-'));
  try {
    const dayDir = path.join(root, '2026-03-29');
    await mkdir(dayDir, { recursive: true });
    await writeFile(path.join(dayDir, 'legacy.txt'), 'legacy content', 'utf8');
    const legacyLine = JSON.stringify({
      id: 'legacy-1',
      type: 'text',
      category: 'text',
      path: path.join(dayDir, 'legacy.txt'),
      previewText: 'legacy prompt',
      sourceApp: 'ChatGPT',
      source: 'clipboard',
      createdAt: Date.now(),
      pinned: true
    });
    await writeFile(path.join(root, 'index.jsonl'), `${legacyLine}\n`, 'utf8');

    const service = new StorageService(root);
    await service.init();

    const migrated = service.getRecord('legacy-1');
    assert.equal(migrated.category, 'text');
    assert.equal(Array.isArray(migrated.tags), true);
    assert.ok(['prompt', 'output', 'fix', 'flow', 'reference', 'unclassified'].includes(migrated.useCase));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
