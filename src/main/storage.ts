import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NativeImage } from 'electron';
import type {
  RecordCategory,
  RecordContent,
  RecordItem,
  RecordMetaBulkResult,
  RecordMetaPatch,
  RecordType,
  RecordUseCase,
  SearchRecordsInput
} from '../shared/types';
import type { LocalModelService } from '../shared/ai/localModel/types';
import type { LocalModelMeta } from '../shared/ai/localModel/types';
import { stripSystemSuggestionTags } from '../shared/classificationSuggestion';
import { AppError } from './errors';
import {
  extractFirstHttpUrl,
  formatImageTimeLabel,
  inferUseCase,
  normalizeOriginalUrl,
  normalizeTags,
  normalizeText,
  normalizeTypeArray,
  normalizeUseCase,
  normalizeUseCaseArray,
  normalizeStringArray,
} from './storage/normalizers';
import {
  createInitialLocalModelMeta,
  isLocalModelMetaEqual,
  mergeLocalModelMeta,
  normalizeLocalModelMeta,
} from './storage/aiLocalModel';

// Re-export FAVORITE_TAG for backward compatibility
export { FAVORITE_TAG } from './storage/normalizers';

type NewContentInput =
  | { type: 'text'; text: string }
  | { type: 'image'; image: NativeImage };

interface NewRecordOptions {
  source?: RecordItem['source'];
  category?: RecordCategory;
  sourceApp?: string | null;
  useCase?: RecordUseCase;
  tags?: string[];
}

interface StorageServiceOptions {
  localModelService?: LocalModelService;
  onBackgroundMutation?: () => void;
}

export class StorageService {
  public readonly rootPath: string;

  private readonly indexPath: string;
  private readonly records: Map<string, RecordItem> = new Map();
  private persistChain: Promise<void> = Promise.resolve();
  private readonly localModelService?: LocalModelService;
  private readonly onBackgroundMutation?: () => void;

  public constructor(rootPath: string = path.join(os.homedir(), 'PinStack'), options: StorageServiceOptions = {}) {
    this.rootPath = rootPath;
    this.indexPath = path.join(this.rootPath, 'index.jsonl');
    this.localModelService = options.localModelService;
    this.onBackgroundMutation = options.onBackgroundMutation;
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.rootPath, { recursive: true });

    try {
      const raw = await fs.readFile(this.indexPath, 'utf8');
      const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      let shouldRewriteIndex = false;

      for (const line of lines) {
        try {
          const normalized = this.normalizeRecord(JSON.parse(line));
          this.records.set(normalized.record.id, normalized.record);
          if (normalized.migrated) {
            shouldRewriteIndex = true;
          }
        } catch {
          // Ignore corrupt lines to keep startup resilient.
        }
      }

      if (shouldRewriteIndex) {
        await this.persistIndexQueued();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new AppError('FILE_WRITE_FAILED', 'Failed to read index file', String(error));
      }

      await this.atomicWrite(this.indexPath, '');
    }
  }

  public listRecords(limit?: number): RecordItem[] {
    const items = [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt);
    return typeof limit === 'number' ? items.slice(0, limit) : items;
  }

  public searchRecords(input: SearchRecordsInput): RecordItem[] {
    const normalizedQuery = normalizeText(input.query ?? input.keyword ?? '');
    const legacyType = input.type ?? 'all';
    const range = this.resolveTimeRange(input);
    const typeFilter = new Set(normalizeTypeArray(input.types));
    const useCaseFilter = new Set(normalizeUseCaseArray(input.useCase));
    const sourceAppFilter = new Set(normalizeStringArray(input.sourceApps));
    const tagFilter = normalizeStringArray(input.tags);

    const matched = this.listRecords()
      .map((record) => {
        if (legacyType !== 'all' && record.category !== legacyType) {
          return null;
        }
        if (typeFilter.size > 0 && !typeFilter.has(record.type)) {
          return null;
        }
        if (useCaseFilter.size > 0 && !useCaseFilter.has(record.useCase)) {
          return null;
        }

        const sourceApp = normalizeText(record.sourceApp);
        if (sourceAppFilter.size > 0 && !sourceAppFilter.has(sourceApp)) {
          return null;
        }
        if (tagFilter.length > 0 && !record.tags.some((tag) => tagFilter.includes(tag))) {
          return null;
        }
        if (record.createdAt < range.from || record.createdAt > range.to) {
          return null;
        }

        const ranking = this.computeSearchRanking(record, normalizedQuery, Boolean(input.smart));
        if (!ranking.matched) {
          return null;
        }

        return {
          record,
          rank: ranking.rank
        };
      })
      .filter((entry): entry is { record: RecordItem; rank: number } => entry !== null)
      .sort((a, b) => {
        if (a.rank !== b.rank) {
          return a.rank - b.rank;
        }
        if (b.record.createdAt !== a.record.createdAt) {
          return b.record.createdAt - a.record.createdAt;
        }
        return a.record.id.localeCompare(b.record.id);
      })
      .map((entry) => entry.record);

    if (typeof input.limit === 'number') {
      return matched.slice(0, input.limit);
    }

    return matched;
  }

  public listRecentRecords(limit: number = 12): RecordItem[] {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 12;
    return this.listRecords(safeLimit);
  }

  public getRecord(recordId: string): RecordItem {
    const record = this.records.get(recordId);
    if (!record) {
      throw new AppError('RECORD_NOT_FOUND', `Record not found: ${recordId}`);
    }

    return record;
  }

  public async getRecordContent(recordId: string): Promise<RecordContent> {
    const record = this.getRecord(recordId);

    if (record.type === 'text') {
      try {
        const text = await fs.readFile(record.path, 'utf8');
        return { type: 'text', text };
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
          throw new AppError('FILE_MISSING', 'Text record file is missing', record.path);
        }
        throw new AppError('FILE_WRITE_FAILED', 'Failed to read text record', String(error));
      }
    }

    if (record.type === 'video') {
      return {
        type: 'video',
        filePath: record.path
      };
    }

    try {
      const image = await fs.readFile(record.path);
      return { type: 'image', dataUrl: `data:image/png;base64,${image.toString('base64')}` };
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        throw new AppError('FILE_MISSING', 'Image record file is missing', record.path);
      }
      throw new AppError('FILE_WRITE_FAILED', 'Failed to read image record', String(error));
    }
  }

  public async createTextRecord(text: string, options: NewRecordOptions = {}): Promise<RecordItem> {
    if (!text.trim()) {
      throw new AppError('INVALID_ARGUMENT', 'Text record cannot be empty');
    }

    const id = this.generateId();
    const folder = await this.ensureTodayFolder();
    const filePath = path.join(folder, `${id}.txt`);

    try {
      await this.atomicWrite(filePath, text);
    } catch (error) {
      throw new AppError('FILE_WRITE_FAILED', 'Failed to write text file', String(error));
    }

    const createdAt = Date.now();
    const category = options.category ?? 'text';
    const sourceApp = options.sourceApp ?? null;
    const normalizedTags = options.tags ? normalizeTags(options.tags) : [];
    const useCase =
      options.useCase ??
      inferUseCase({
        text,
        sourceApp,
        category
      });

    const item: RecordItem = {
      id,
      type: 'text',
      category,
      path: filePath,
      displayName: undefined,
      previewText: text.trim().slice(0, 120),
      sourceApp,
      source: options.source ?? 'clipboard',
      useCase,
      tags: normalizedTags,
      createdAt,
      lastUsedAt: createdAt,
      useCount: 0,
      pinned: true,
      originalUrl: extractFirstHttpUrl(text),
      localModel: this.createInitialLocalModelMeta()
    };

    this.records.set(item.id, item);
    await this.persistIndexQueued();
    this.scheduleLocalModelForNewRecord(item, { textContent: text });
    return item;
  }

  public async createFlowRecord(recordIds: string[]): Promise<RecordItem> {
    const normalizedRecordIds = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))];
    if (normalizedRecordIds.length < 2) {
      throw new AppError('INVALID_ARGUMENT', 'Flow record requires at least 2 record ids');
    }

    for (const recordId of normalizedRecordIds) {
      this.getRecord(recordId);
    }

    const payloadText = JSON.stringify({ recordIds: normalizedRecordIds }, null, 2);
    const id = this.generateId();
    const folder = await this.ensureTodayFolder();
    const filePath = path.join(folder, `${id}.txt`);

    try {
      await this.atomicWrite(filePath, payloadText);
    } catch (error) {
      throw new AppError('FILE_WRITE_FAILED', 'Failed to write flow record file', String(error));
    }

    const createdAt = Date.now();
    const item: RecordItem = {
      id,
      type: 'text',
      category: 'flow',
      path: filePath,
      displayName: `Flow Bundle (${normalizedRecordIds.length})`,
      previewText: `Flow Bundle (${normalizedRecordIds.length})`,
      sourceApp: 'PinStack',
      source: 'clipboard',
      useCase: 'flow',
      tags: ['flow-bundle'],
      createdAt,
      lastUsedAt: createdAt,
      useCount: 0,
      pinned: true
    };

    this.records.set(item.id, item);
    await this.persistIndexQueued();
    return item;
  }

  public async saveNewContent(
    payload: NewContentInput,
    options: NewRecordOptions = {}
  ): Promise<RecordItem> {
    if (payload.type === 'text') {
      return this.createTextRecord(payload.text, options);
    }

    return this.createImageRecord(payload.image, options);
  }

  public async createImageRecord(image: NativeImage, options: NewRecordOptions = {}): Promise<RecordItem> {
    if (image.isEmpty()) {
      throw new AppError('IMAGE_DECODE_FAILED', 'Clipboard image is empty');
    }

    let pngBuffer: Buffer;
    try {
      pngBuffer = image.toPNG();
    } catch (error) {
      console.error('[StorageService.createImageRecord] Failed to convert image to PNG', error);
      throw new AppError('IMAGE_DECODE_FAILED', 'Failed to decode clipboard image', String(error));
    }

    if (!pngBuffer.length) {
      throw new AppError('IMAGE_DECODE_FAILED', 'Failed to decode clipboard image');
    }

    const id = this.generateId();
    const folder = await this.ensureTodayFolder();
    const filePath = path.join(folder, `${id}.png`);

    try {
      await this.atomicWrite(filePath, pngBuffer);
    } catch (error) {
      throw new AppError('FILE_WRITE_FAILED', 'Failed to write image file', String(error));
    }

    const createdAt = Date.now();
    const category = options.category ?? 'image';
    const sourceApp = options.sourceApp ?? null;
    const normalizedTags = options.tags ? normalizeTags(options.tags) : [];
    const useCase =
      options.useCase ??
      inferUseCase({
        text: '',
        sourceApp,
        category
      });

    const item: RecordItem = {
      id,
      type: 'image',
      category,
      path: filePath,
      displayName: undefined,
      previewText: formatImageTimeLabel(createdAt),
      sourceApp,
      source: options.source ?? 'clipboard',
      useCase,
      tags: normalizedTags,
      createdAt,
      lastUsedAt: createdAt,
      useCount: 0,
      pinned: true,
      localModel: this.createInitialLocalModelMeta()
    };

    this.records.set(item.id, item);
    await this.persistIndexQueued();
    this.scheduleLocalModelForNewRecord(item);
    return item;
  }

  public async createVideoRecord(filePath: string, options: NewRecordOptions = {}): Promise<RecordItem> {
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        throw new AppError('FILE_MISSING', 'Video record file is missing', filePath);
      }
      throw new AppError('FILE_WRITE_FAILED', 'Failed to access video file', String(error));
    }

    if (!stats.isFile()) {
      throw new AppError('INVALID_ARGUMENT', 'Video record path must be a file');
    }

    const id = this.generateId();
    const createdAt = Date.now();
    const item: RecordItem = {
      id,
      type: 'video',
      category: options.category ?? 'video',
      path: filePath,
      displayName: undefined,
      previewText: `录屏 ${formatImageTimeLabel(createdAt)}`,
      sourceApp: options.sourceApp ?? 'PinStack',
      source: options.source ?? 'recording',
      useCase: options.useCase ?? 'reference',
      tags: options.tags ? normalizeTags(options.tags) : [],
      createdAt,
      lastUsedAt: createdAt,
      useCount: 0,
      pinned: false
    };

    this.records.set(item.id, item);
    await this.persistIndexQueued();
    return item;
  }

  public async deleteRecord(recordId: string): Promise<void> {
    const record = this.records.get(recordId);
    if (!record) {
      throw new AppError('RECORD_NOT_FOUND', `Record not found: ${recordId}`);
    }

    const stagedPath = this.buildDeleteStagePath(record.path, record.id);
    try {
      await fs.mkdir(path.dirname(stagedPath), { recursive: true });
      await fs.rename(record.path, stagedPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw new AppError('FILE_WRITE_FAILED', 'Failed to stage record file for deletion', String(error));
      }
    }

    this.records.delete(recordId);

    try {
      await this.persistIndexQueued();
    } catch (error) {
      this.records.set(record.id, record);
      try {
        await fs.rename(stagedPath, record.path);
      } catch (restoreError) {
        const code = (restoreError as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          console.error('[StorageService.deleteRecord] Failed to restore staged file', restoreError);
        }
      }
      throw error;
    }

    try {
      await fs.rm(stagedPath, { force: true });
    } catch (error) {
      console.error('[StorageService.deleteRecord] Failed to remove staged file', error);
      throw new AppError('FILE_WRITE_FAILED', 'Failed to remove staged record file', String(error));
    }
  }

  public async updateRecordOcrText(recordId: string, text: string): Promise<RecordItem> {
    const existing = this.getRecord(recordId);
    const next: RecordItem = {
      ...existing,
      ocrText: text,
      previewText:
        existing.type === 'text' ? existing.previewText : text.slice(0, 120) || formatImageTimeLabel(existing.createdAt)
    };

    this.records.set(recordId, next);
    await this.persistIndexQueued();
    return next;
  }

  public async renameRecord(recordId: string, displayName: string): Promise<RecordItem> {
    const existing = this.getRecord(recordId);
    const trimmed = displayName.trim();
    if (!trimmed) {
      throw new AppError('INVALID_ARGUMENT', 'Display name cannot be empty');
    }

    const next: RecordItem = {
      ...existing,
      displayName: trimmed,
      localModel: this.mergeLocalModelMeta(existing.localModel, {
        userEditedTitle: trimmed,
        titleLockedByUser: true
      })
    };
    this.records.set(recordId, next);
    await this.persistIndexQueued();
    return next;
  }

  public async updateTextRecord(recordId: string, text: string): Promise<RecordItem> {
    const existing = this.getRecord(recordId);
    if (existing.type !== 'text') {
      throw new AppError('INVALID_ARGUMENT', 'Only text record supports content update');
    }

    try {
      await this.atomicWrite(existing.path, text);
    } catch (error) {
      throw new AppError('FILE_WRITE_FAILED', 'Failed to write text record', String(error));
    }

    const next: RecordItem = {
      ...existing,
      previewText: text.trim().slice(0, 120),
      originalUrl: extractFirstHttpUrl(text)
    };
    this.records.set(recordId, next);
    await this.persistIndexQueued();
    return next;
  }

  public async updateRecordMeta(recordId: string, patch: RecordMetaPatch): Promise<RecordItem> {
    const existing = this.getRecord(recordId);
    const next = this.applyRecordMetaPatch(existing, patch);
    this.records.set(recordId, next);
    await this.persistIndexQueued();
    return next;
  }


  public async debugRenameNoteWithLocalModel(recordId: string): Promise<RecordItem> {
    const record = this.getRecord(recordId);
    let textContent: string | undefined;
    if (record.type === 'text') {
      const content = await this.getRecordContent(recordId);
      if (content.type === 'text') {
        textContent = content.text;
      }
    }
    await this.runLocalRename(recordId, textContent);
    return this.getRecord(recordId);
  }

  public async debugDedupePairWithLocalModel(leftRecordId: string, rightRecordId: string): Promise<RecordItem> {
    await this.applyLocalDedupeSuggestion(leftRecordId, rightRecordId);
    return this.getRecord(rightRecordId);
  }

  public async debugSummarizeForKnowledgeBase(recordId: string): Promise<RecordItem> {
    const content = await this.getRecordContent(recordId);
    if (content.type !== 'text') {
      throw new AppError('INVALID_ARGUMENT', 'Summary debug only supports text record');
    }
    await this.runLocalSummaryForKnowledgeBase(recordId, content.text);
    return this.getRecord(recordId);
  }

  public async debugUnderstandImageBasic(recordId: string): Promise<RecordItem> {
    const record = this.getRecord(recordId);
    if (record.type !== 'image') {
      throw new AppError('INVALID_ARGUMENT', 'Image understanding debug only supports image record');
    }
    await this.runLocalImageUnderstanding(recordId);
    return this.getRecord(recordId);
  }

  public async markRecordUsed(recordId: string): Promise<RecordItem> {
    const existing = this.getRecord(recordId);
    const next: RecordItem = {
      ...existing,
      lastUsedAt: Date.now(),
      useCount: Math.max(0, existing.useCount) + 1
    };
    this.records.set(recordId, next);
    await this.persistIndexQueued();
    return next;
  }

  public async bulkUpdateRecordMeta(recordIds: string[], patch: RecordMetaPatch): Promise<RecordMetaBulkResult> {
    const updated: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const recordId of recordIds) {
      try {
        const existing = this.getRecord(recordId);
        const next = this.applyRecordMetaPatch(existing, patch);
        this.records.set(recordId, next);
        updated.push(recordId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        failed.push({ id: recordId, error: message });
      }
    }

    if (updated.length > 0) {
      await this.persistIndexQueued();
    }

    return {
      updated,
      failed
    };
  }

  private normalizeRecord(
    raw: Partial<RecordItem> & { id?: string; type?: RecordItem['type']; path?: string }
  ): { record: RecordItem; migrated: boolean } {
    if (!raw.id || !raw.type || !raw.path) {
      throw new AppError('INVALID_ARGUMENT', 'Corrupt record item');
    }

    const normalizedType: RecordItem['type'] =
      raw.type === 'image' ? 'image' : raw.type === 'video' ? 'video' : 'text';
    const normalizedCreatedAt =
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
        ? Math.floor(raw.createdAt)
        : Date.now();
    const normalizedLastUsedAt =
      typeof raw.lastUsedAt === 'number' && Number.isFinite(raw.lastUsedAt)
        ? Math.max(0, Math.floor(raw.lastUsedAt))
        : normalizedCreatedAt;
    const normalizedUseCount =
      typeof raw.useCount === 'number' && Number.isFinite(raw.useCount)
        ? Math.max(0, Math.floor(raw.useCount))
        : 0;
    const normalizedPreviewText =
      (normalizedType === 'image' || normalizedType === 'video') && (raw.previewText === '[Image]' || !raw.previewText?.trim())
        ? formatImageTimeLabel(normalizedCreatedAt)
        : raw.previewText;
    const normalizedCategory =
      raw.category === 'flow' || raw.category === 'image' || raw.category === 'text' || raw.category === 'video'
        ? raw.category
        : normalizedType === 'image'
          ? 'image'
          : normalizedType === 'video'
            ? 'video'
          : 'text';
    const inferredText = `${raw.displayName ?? ''}\n${raw.previewText ?? ''}\n${raw.ocrText ?? ''}`;
    const normalizedUseCase =
      normalizeUseCase(raw.useCase) ??
      inferUseCase({
        text: inferredText,
        sourceApp: raw.sourceApp ?? null,
        category: normalizedCategory
      });
    const normalizedTags = normalizeTags(raw.tags);
    const normalizedOriginalUrl = normalizeOriginalUrl(raw.originalUrl);
    const normalizedLocalModel = this.normalizeLocalModelMeta((raw as { localModel?: unknown }).localModel);
    const migrated =
      normalizeUseCase(raw.useCase) === undefined ||
      !Array.isArray(raw.tags) ||
      normalizedCategory !== raw.category ||
      normalizedType !== raw.type ||
      normalizedPreviewText !== raw.previewText ||
      normalizedLastUsedAt !== raw.lastUsedAt ||
      normalizedUseCount !== raw.useCount ||
      normalizedOriginalUrl !== raw.originalUrl ||
      !this.isLocalModelMetaEqual(normalizedLocalModel, (raw as { localModel?: unknown }).localModel);

    return {
      record: {
        id: raw.id,
        type: normalizedType,
        category: normalizedCategory,
        path: raw.path,
        displayName: raw.displayName,
        previewText: normalizedPreviewText,
        ocrText: raw.ocrText,
        sourceApp: raw.sourceApp ?? null,
        source: raw.source === 'screenshot' ? 'screenshot' : raw.source === 'recording' ? 'recording' : 'clipboard',
        useCase: normalizedUseCase,
        tags: normalizedTags,
        explainStatus: raw.explainStatus === 'pending' || raw.explainStatus === 'done' ? raw.explainStatus : 'idle',
        explainText: typeof raw.explainText === 'string' ? raw.explainText : undefined,
        createdAt: normalizedCreatedAt,
        lastUsedAt: normalizedLastUsedAt,
        useCount: normalizedUseCount,
        pinned: typeof raw.pinned === 'boolean' ? raw.pinned : true,
        originalUrl: normalizedOriginalUrl,
        localModel: normalizedLocalModel
      },
      migrated
    };
  }

  private applyRecordMetaPatch(existing: RecordItem, patch: RecordMetaPatch): RecordItem {
    const nextUseCase = patch.useCase ?? existing.useCase;
    if (normalizeUseCase(nextUseCase) === undefined) {
      throw new AppError('INVALID_ARGUMENT', `Invalid useCase value: ${String(nextUseCase)}`);
    }

    const nextTagsRaw = patch.tags === undefined ? existing.tags : normalizeTags(patch.tags);
    const shouldPromoteToFormal = patch.useCase !== undefined || patch.tags !== undefined;
    const nextTags = shouldPromoteToFormal ? stripSystemSuggestionTags(nextTagsRaw) : nextTagsRaw;

    const normalizedOriginalUrl =
      patch.originalUrl === undefined ? existing.originalUrl : normalizeOriginalUrl(patch.originalUrl);

    return {
      ...existing,
      useCase: nextUseCase,
      tags: nextTags,
      originalUrl: normalizedOriginalUrl
    };
  }

  private createInitialLocalModelMeta(): LocalModelMeta {
    return createInitialLocalModelMeta();
  }

  private mergeLocalModelMeta(existing: LocalModelMeta | undefined, patch: Partial<LocalModelMeta>): LocalModelMeta {
    return mergeLocalModelMeta(existing, patch);
  }

  private scheduleLocalModelForNewRecord(record: RecordItem, options: { textContent?: string } = {}): void {
    if (!this.localModelService?.isEnabled()) {
      return;
    }

    void this.runLocalRename(record.id, options.textContent).catch((error) => {
      console.error('[StorageService.runLocalRename] failed', { recordId: record.id, error });
    });

    if (record.type === 'image') {
      void this.runLocalImageUnderstanding(record.id).catch((error) => {
        console.error('[StorageService.runLocalImageUnderstanding] failed', { recordId: record.id, error });
      });
    }
  }

  private async runLocalRename(recordId: string, textContent?: string): Promise<void> {
    if (!this.localModelService?.isEnabled()) {
      return;
    }

    const record = this.getRecord(recordId);
    const result = await this.localModelService.renameNoteWithLocalModel({
      recordId: record.id,
      recordType: record.type,
      displayName: record.displayName,
      previewText: record.previewText,
      textContent,
      sourceApp: record.sourceApp,
      source: record.source
    });
    const serviceError = this.localModelService.getLastError();
    this.localModelService.clearLastError();

    const nextLocalModel = this.mergeLocalModelMeta(record.localModel, {
      mode: this.localModelService.getEffectiveMode(),
      model: this.localModelService.getModel(),
      systemGeneratedTitle: result.canonical_title,
      lastError: serviceError
    });

    const shouldApplyDisplayName = !nextLocalModel.titleLockedByUser && !nextLocalModel.userEditedTitle;
    const next: RecordItem = {
      ...record,
      displayName: shouldApplyDisplayName ? result.canonical_title : record.displayName,
      localModel: nextLocalModel
    };
    this.records.set(recordId, next);
    await this.persistIndexQueued();
    this.onBackgroundMutation?.();
  }

  private async runLocalImageUnderstanding(recordId: string): Promise<void> {
    if (!this.localModelService?.isEnabled()) {
      return;
    }

    const record = this.getRecord(recordId);
    const result = await this.localModelService.understandImageBasic({
      recordId: record.id,
      displayName: record.displayName,
      previewText: record.previewText,
      ocrText: record.ocrText,
      sourceApp: record.sourceApp
    });
    const serviceError = this.localModelService.getLastError();
    this.localModelService.clearLastError();

    const next: RecordItem = {
      ...record,
      localModel: this.mergeLocalModelMeta(record.localModel, {
        mode: this.localModelService.getEffectiveMode(),
        model: this.localModelService.getModel(),
        imageUnderstanding: result,
        lastError: serviceError
      })
    };
    this.records.set(recordId, next);
    await this.persistIndexQueued();
    this.onBackgroundMutation?.();
  }


  private async runLocalSummaryForKnowledgeBase(recordId: string, textContent: string): Promise<void> {
    if (!this.localModelService?.isEnabled()) {
      return;
    }

    const record = this.getRecord(recordId);
    const result = await this.localModelService.summarizeForKnowledgeBase({
      recordId,
      displayName: record.displayName,
      previewText: record.previewText,
      textContent
    });
    const serviceError = this.localModelService.getLastError();
    this.localModelService.clearLastError();

    const next: RecordItem = {
      ...record,
      localModel: this.mergeLocalModelMeta(record.localModel, {
        mode: this.localModelService.getEffectiveMode(),
        model: this.localModelService.getModel(),
        summary: result,
        lastError: serviceError
      })
    };
    this.records.set(recordId, next);
    await this.persistIndexQueued();
    this.onBackgroundMutation?.();
  }

  private async applyLocalDedupeSuggestion(primaryRecordId: string, candidateRecordId: string): Promise<void> {
    if (!this.localModelService?.isEnabled()) {
      return;
    }

    let primaryText = '';
    let candidateText = '';
    try {
      const content = await this.getRecordContent(primaryRecordId);
      if (content.type === 'text') {
        primaryText = content.text;
      }
    } catch {
      primaryText = this.getRecord(primaryRecordId).previewText ?? '';
    }
    try {
      const content = await this.getRecordContent(candidateRecordId);
      if (content.type === 'text') {
        candidateText = content.text;
      }
    } catch {
      candidateText = this.getRecord(candidateRecordId).previewText ?? '';
    }

    const primary = this.getRecord(primaryRecordId);
    const candidate = this.getRecord(candidateRecordId);
    const suggestion = await this.localModelService.dedupePairWithLocalModel({
      left: {
        id: primary.id,
        displayName: primary.displayName,
        textContent: primaryText,
        originalUrl: primary.originalUrl
      },
      right: {
        id: candidate.id,
        displayName: candidate.displayName,
        textContent: candidateText,
        originalUrl: candidate.originalUrl
      }
    });
    const serviceError = this.localModelService.getLastError();
    this.localModelService.clearLastError();
    console.info('[localModel.dedupeSuggestion]', {
      primaryRecordId,
      candidateRecordId,
      heuristicPrimary: primaryRecordId,
      suggestedPrimary: suggestion.primary_choice,
      isDuplicate: suggestion.is_duplicate,
      confidence: suggestion.confidence
    });

    const nextCandidate: RecordItem = {
      ...candidate,
      localModel: this.mergeLocalModelMeta(candidate.localModel, {
        mode: this.localModelService.getEffectiveMode(),
        model: this.localModelService.getModel(),
        dedupeSuggestion: suggestion,
        lastError: serviceError
      })
    };
    this.records.set(candidate.id, nextCandidate);
    await this.persistIndexQueued();
  }



  private normalizeLocalModelMeta(value: unknown): LocalModelMeta | undefined {
    return normalizeLocalModelMeta(value);
  }

  private isLocalModelMetaEqual(left: LocalModelMeta | undefined, right: unknown): boolean {
    return isLocalModelMetaEqual(left, right);
  }
  private computeSearchRanking(
    record: RecordItem,
    query: string,
    smart: boolean
  ): {
    matched: boolean;
    rank: number;
  } {
    if (!query) {
      return {
        matched: true,
        rank: 5
      };
    }

    const displayName = normalizeText(record.displayName);
    if (displayName && displayName === query) {
      return {
        matched: true,
        rank: 1
      };
    }

    const content = normalizeText(
      `${record.previewText ?? ''}\n${record.ocrText ?? ''}\n${path.basename(record.path)}\n${record.id}`
    );
    if (content.startsWith(query)) {
      return {
        matched: true,
        rank: 2
      };
    }

    if (content.includes(query) || displayName.includes(query)) {
      return {
        matched: true,
        rank: 3
      };
    }

    const tagsMatched = record.tags.some((tag) => tag.includes(query));
    if (tagsMatched) {
      return {
        matched: true,
        rank: 4
      };
    }

    if (smart && this.smartScore(query, content) > 0) {
      return {
        matched: true,
        rank: 4
      };
    }

    return {
      matched: false,
      rank: 99
    };
  }

  private async ensureTodayFolder(): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const folder = path.join(this.rootPath, `${yyyy}-${mm}-${dd}`);
    await fs.mkdir(folder, { recursive: true });
    return folder;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private buildDeleteStagePath(originalPath: string, recordId: string): string {
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);
    const stagedName = `${base}.${recordId}.deleted${ext}`;
    return path.join(this.rootPath, '.trash', stagedName);
  }

  private async persistIndexQueued(): Promise<void> {
    this.persistChain = this.persistChain
      .catch((error) => {
        console.error('[StorageService.persistIndexQueued] Previous persist failed', error);
      })
      .then(async () => {
        try {
          const lines = this.listRecords()
            .reverse()
            .map((item) => JSON.stringify(item));

          const payload = lines.length > 0 ? `${lines.join('\n')}\n` : '';
          await this.atomicWrite(this.indexPath, payload);
        } catch (error) {
          console.error('[StorageService.persistIndexQueued] Failed to write index.jsonl', error);
          throw new AppError('FILE_WRITE_FAILED', 'Failed to write index.jsonl', String(error));
        }
      });

    return this.persistChain;
  }

  private async atomicWrite(filePath: string, data: string | Buffer): Promise<void> {
    const dir = path.dirname(filePath);
    const tmp = path.join(
      dir,
      `.tmp-${path.basename(filePath)}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  }

  private resolveTimeRange(input: SearchRecordsInput): { from: number; to: number } {
    if (typeof input.from === 'number' || typeof input.to === 'number') {
      return {
        from: typeof input.from === 'number' ? input.from : 0,
        to: typeof input.to === 'number' ? input.to : Number.MAX_SAFE_INTEGER
      };
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const preset = input.preset ?? 'all';

    if (preset === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        from: today.getTime(),
        to: now
      };
    }

    if (preset === '7d') {
      return {
        from: now - dayMs * 7,
        to: now
      };
    }

    if (preset === '30d') {
      return {
        from: now - dayMs * 30,
        to: now
      };
    }

    return {
      from: 0,
      to: Number.MAX_SAFE_INTEGER
    };
  }

  private smartScore(query: string, content: string): number {
    const normalizedContent = content.toLowerCase();
    if (!normalizedContent.trim()) {
      return 0;
    }

    if (normalizedContent.includes(query)) {
      return 5;
    }

    const queryTokens = this.tokenize(query);
    const contentTokens = this.tokenize(normalizedContent);
    if (queryTokens.length === 0 || contentTokens.length === 0) {
      return 0;
    }

    const contentSet = new Set(contentTokens);
    let hits = 0;
    for (const token of queryTokens) {
      if (contentSet.has(token)) {
        hits += 1;
      }
    }

    if (hits === 0) {
      return 0;
    }

    return hits / queryTokens.length;
  }

  private tokenize(input: string): string[] {
    const byWords = input.split(/[^a-z0-9\u4e00-\u9fa5]+/g).filter(Boolean);
    const cnChars = input
      .split('')
      .filter((char) => /[\u4e00-\u9fa5]/.test(char));
    return [...byWords, ...cnChars];
  }
}
