import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StorageService } from '../src/main/storage';

async function withTempStorage(run: (service: StorageService) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-usecase-test-'));
  const service = new StorageService(root);
  try {
    await service.init();
    await run(service);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('terminal error text should be classified as fix', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord('npm ERR command not found', {
      sourceApp: 'Terminal'
    });
    assert.equal(record.useCase, 'fix');
  });
});

test('request-like text should be classified as prompt', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord('请帮我实现一个搜索功能');
    assert.equal(record.useCase, 'prompt');
  });
});

test('long structured explanation should be classified as output', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord(
      '总结如下：\n1. 先建立数据模型\n2. 再接入筛选器\n3. 最后完善测试与回归，确保每一步可验证并且结果可复现。'
    );
    assert.equal(record.useCase, 'output');
  });
});

test('legacy flow category should be classified as flow', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord('临时中间步骤，待合并', {
      category: 'flow'
    });
    assert.equal(record.useCase, 'flow');
  });
});

test('reference-like text should be classified as reference', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord('这是 API spec 文档，用于后续 reference');
    assert.equal(record.useCase, 'reference');
  });
});

test('unclear short text should fallback to unclassified', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord('just a note');
    assert.equal(record.useCase, 'unclassified');
  });
});

test('explicit useCase option should override inference', async () => {
  await withTempStorage(async (service) => {
    const record = await service.createTextRecord('请帮我重构这段代码', {
      useCase: 'reference'
    });
    assert.equal(record.useCase, 'reference');
  });
});
