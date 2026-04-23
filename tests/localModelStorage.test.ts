import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StorageService } from '../src/main/storage';
import { LocalModelServiceImpl } from '../src/main/services/localModel/localModelService';
import type {
  DedupeInput,
  DedupeResult,
  ImageUnderstandingInput,
  ImageUnderstandingResult,
  LocalModelError,
  LocalModelInventory,
  LocalModelRuntimeStatus,
  LocalModelService,
  RenameInput,
  RenameResult,
  SummaryInput,
  SummaryResult,
} from '../src/shared/ai/localModel/types';
import type { RecordItem } from '../src/shared/types';

async function waitFor(predicate: () => boolean, timeoutMs: number = 1000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out while waiting');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

class FakeLocalModelService implements LocalModelService {
  private renameCounter = 0;
  private lastError?: LocalModelError;
  private model = 'gemma3:12b';

  public constructor(
    private readonly options: {
      dedupeSuggestion?: DedupeResult;
      summaryShouldError?: boolean;
    } = {}
  ) {}

  public async init(): Promise<void> {}
  public isEnabled(): boolean {
    return true;
  }
  public getMode(): 'mock' | 'real' {
    return 'mock';
  }
  public getEffectiveMode(): 'mock' | 'real' {
    return 'mock';
  }
  public getEffectiveProvider(): 'mock' | 'ollama' {
    return 'mock';
  }
  public getModel(): string {
    return this.model;
  }
  public getLastError(): LocalModelError | undefined {
    return this.lastError;
  }
  public async setModel(model: string): Promise<void> {
    this.model = model;
  }
  public async getRuntimeStatus(): Promise<LocalModelRuntimeStatus> {
    return {
      enabled: true,
      configuredMode: 'mock',
      effectiveMode: 'mock',
      provider: 'mock',
      configuredModel: this.model,
      effectiveModel: this.model,
      model: this.model,
      ollamaBaseUrl: 'http://localhost:11434',
      connectionStatus: 'unknown',
      modelStatus: 'unknown',
      lastError: this.lastError
    };
  }
  public async getInventory(): Promise<LocalModelInventory> {
    return {
      reachable: true,
      modelNames: [this.model],
      checkedAt: Date.now()
    };
  }
  public clearLastError(): void {
    this.lastError = undefined;
  }

  public async renameNoteWithLocalModel(_input: RenameInput): Promise<RenameResult> {
    this.renameCounter += 1;
    return {
      category: 'AI',
      short_title: `自动标题${this.renameCounter}`,
      keyword: '工作流',
      source: 'PinStack',
      canonical_title: `AI_自动标题${this.renameCounter}_工作流_PinStack`,
      confidence: 0.8
    };
  }

  public async dedupePairWithLocalModel(_input: DedupeInput): Promise<DedupeResult> {
    return (
      this.options.dedupeSuggestion ?? {
        is_duplicate: true,
        confidence: 0.9,
        reason: 'force-B',
        primary_choice: 'B'
      }
    );
  }

  public async summarizeForKnowledgeBase(_input: SummaryInput): Promise<SummaryResult> {
    if (this.options.summaryShouldError) {
      this.lastError = {
        message: 'summary provider failed',
        capability: 'summarizeForKnowledgeBase',
        provider: 'mock',
        timestamp: Date.now()
      };
    }
    return {
      summary: 'local summary',
      category: 'AI',
      keyword: '工作流',
      confidence: 0.77,
      source: 'localModel'
    };
  }

  public async understandImageBasic(_input: ImageUnderstandingInput): Promise<ImageUnderstandingResult> {
    return {
      image_summary: 'image summary',
      tags: ['img'],
      suggested_category: '设计',
      confidence: 0.66
    };
  }
}

test('local rename should not override user-edited title', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-local-title-lock-'));
  const service = new StorageService(root, {
    localModelService: new FakeLocalModelService()
  });

  try {
    await service.init();
    const created = await service.createTextRecord('这是一个本地模型自动命名测试文本');

    await waitFor(() => {
      const next = service.getRecord(created.id);
      return (next.localModel?.systemGeneratedTitle ?? '').startsWith('AI_自动标题1');
    });

    const renamedByUser = await service.renameRecord(created.id, '用户手改标题');
    assert.equal(renamedByUser.displayName, '用户手改标题');
    assert.equal(renamedByUser.localModel?.titleLockedByUser, true);
    assert.equal(renamedByUser.localModel?.userEditedTitle, '用户手改标题');

    const afterDebugRename = await service.debugRenameNoteWithLocalModel(created.id);
    assert.equal(afterDebugRename.displayName, '用户手改标题');
    assert.equal(afterDebugRename.localModel?.titleLockedByUser, true);
    assert.equal(afterDebugRename.localModel?.userEditedTitle, '用户手改标题');
    assert.ok((afterDebugRename.localModel?.systemGeneratedTitle ?? '').startsWith('AI_自动标题2'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dedupe suggestion should not override heuristic primary selection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-local-dedupe-suggest-'));
  const dayFolder = path.join(root, '2026-04-10');
  const fileA = path.join(dayFolder, 'a.txt');
  const fileB = path.join(dayFolder, 'b.txt');
  const text = '重复文本 https://example.com/same-url';

  await mkdir(dayFolder, { recursive: true });
  await writeFile(fileA, text, 'utf8');
  await writeFile(fileB, text, 'utf8');

  const now = Date.now();
  const recordA: RecordItem = {
    id: 'pin_a',
    type: 'text',
    category: 'text',
    path: fileA,
    displayName: 'A',
    previewText: text.slice(0, 120),
    sourceApp: 'ChatGPT',
    source: 'clipboard',
    useCase: 'reference',
    tags: ['favorite'],
    originalUrl: 'https://example.com/same-url',
    createdAt: now - 1000,
    lastUsedAt: now - 1000,
    useCount: 0,
    pinned: true
  };
  const recordB: RecordItem = {
    ...recordA,
    id: 'pin_b',
    path: fileB,
    displayName: 'B',
    createdAt: now,
    lastUsedAt: now
  };
  await writeFile(path.join(root, 'index.jsonl'), `${JSON.stringify(recordA)}\n${JSON.stringify(recordB)}\n`, 'utf8');

  const service = new StorageService(root, {
    localModelService: new FakeLocalModelService({
      dedupeSuggestion: {
        is_duplicate: true,
        confidence: 0.95,
        reason: 'always-B',
        primary_choice: 'B'
      }
    })
  });

  try {
    await service.init();
    const candidate = await service.debugDedupePairWithLocalModel('pin_a', 'pin_b');
    assert.equal(candidate.localModel?.dedupeSuggestion?.primary_choice, 'B');
    assert.equal(candidate.localModel?.dedupeSuggestion?.confidence, 0.95);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local summary should persist source=localModel and structured lastError', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-local-summary-source-'));
  const service = new StorageService(root, {
    localModelService: new FakeLocalModelService({ summaryShouldError: true })
  });

  try {
    await service.init();
    const record = await service.createTextRecord('用于测试 summary source 的文本');
    const updated = await service.debugSummarizeForKnowledgeBase(record.id);

    assert.equal(updated.localModel?.summary?.source, 'localModel');
    assert.equal(updated.localModel?.lastError?.capability, 'summarizeForKnowledgeBase');
    assert.equal(updated.localModel?.lastError?.provider, 'mock');
    assert.equal(typeof updated.localModel?.lastError?.timestamp, 'number');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('localModel version should be backfilled for old records', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinstack-local-version-migrate-'));
  const dayFolder = path.join(root, '2026-04-10');
  const textPath = path.join(dayFolder, 'legacy.txt');
  await mkdir(dayFolder, { recursive: true });
  await writeFile(textPath, 'legacy text', 'utf8');

  const legacyLine = JSON.stringify({
    id: 'legacy_1',
    type: 'text',
    category: 'text',
    path: textPath,
    previewText: 'legacy',
    source: 'clipboard',
    useCase: 'reference',
    tags: [],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    useCount: 0,
    pinned: true,
    localModel: {
      systemGeneratedTitle: '旧标题'
    }
  });

  await writeFile(path.join(root, 'index.jsonl'), `${legacyLine}\n`, 'utf8');

  const service = new StorageService(root);
  try {
    await service.init();
    const migrated = service.getRecord('legacy_1');
    assert.equal(migrated.localModel?.version, 'v1');
    assert.equal(migrated.localModel?.systemGeneratedTitle, '旧标题');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('real mode should run ollama preflight and downgrade with structured error', async () => {
  const prevEnabled = process.env.LOCAL_MODEL_ENABLED;
  const prevMode = process.env.LOCAL_MODEL_MODE;
  const prevName = process.env.LOCAL_MODEL_NAME;
  const prevBase = process.env.OLLAMA_BASE_URL;

  process.env.LOCAL_MODEL_ENABLED = 'true';
  process.env.LOCAL_MODEL_MODE = 'real';
  process.env.LOCAL_MODEL_NAME = 'gemma3:12b';
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9';

  try {
    const service = new LocalModelServiceImpl({ isDev: true });
    await service.init();

    assert.equal(service.getMode(), 'real');
    const error = service.getLastError();
    assert.ok(error);
    assert.equal(error?.provider, 'ollama');
    assert.equal(typeof error?.timestamp, 'number');
  } finally {
    process.env.LOCAL_MODEL_ENABLED = prevEnabled;
    process.env.LOCAL_MODEL_MODE = prevMode;
    process.env.LOCAL_MODEL_NAME = prevName;
    process.env.OLLAMA_BASE_URL = prevBase;
  }
});

test('local model should reject unregistered local model name', async () => {
  const prevName = process.env.LOCAL_MODEL_NAME;
  process.env.LOCAL_MODEL_NAME = 'llama3:8b';

  try {
    assert.throws(() => new LocalModelServiceImpl({ isDev: true }), /Unsupported local model/);
  } finally {
    process.env.LOCAL_MODEL_NAME = prevName;
  }
});
