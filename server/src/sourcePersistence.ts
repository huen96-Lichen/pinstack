import { randomUUID } from 'node:crypto';
import type { StorageService } from '../../src/main/storage';
import type { SummaryResult, LocalModelService } from '../../src/shared/ai/localModel/types';
import type {
  IngestLog,
  KnowledgeIngestRecordResult,
  ProjectRecord,
  SourceContentType,
  SourceEntryMethod,
  SourceRecord,
  SourceSyncStatus,
  TopicRecord,
  WebPageType
} from '../../src/shared/knowledge3';
import { buildKnowledgeDraftInsight } from './knowledgeHeuristics';
import { KnowledgeStore } from './knowledgeStore';
import type { LocalKnowledgeWorkspace } from './localKnowledgeWorkspace';

export interface PersistSourceInput {
  desktopRecordId?: string;
  title: string;
  textContent: string;
  contentType: SourceContentType;
  entryMethod: SourceEntryMethod;
  sourcePlatform: string;
  sourceLink?: string;
  siteName?: string;
  publishedAt?: number;
  heroImageUrl?: string;
  pageType?: WebPageType;
  originFilePath?: string;
  originFileHash?: string;
  originDirRoot?: string;
  skipAiSummary?: boolean;
}

interface SourcePersistenceOptions {
  storage: StorageService;
  store: KnowledgeStore;
  localModelService: LocalModelService;
  localKnowledgeWorkspace?: LocalKnowledgeWorkspace;
}

export class SourcePersistenceService {
  private readonly storage: StorageService;
  private readonly store: KnowledgeStore;
  private readonly localModelService: LocalModelService;
  private readonly localKnowledgeWorkspace?: LocalKnowledgeWorkspace;

  public constructor(options: SourcePersistenceOptions) {
    this.storage = options.storage;
    this.store = options.store;
    this.localModelService = options.localModelService;
    this.localKnowledgeWorkspace = options.localKnowledgeWorkspace;
  }

  public async persist(input: PersistSourceInput): Promise<KnowledgeIngestRecordResult> {
    const existing = input.desktopRecordId
      ? this.store.findSourceByDesktopRecordId(input.desktopRecordId)
      : input.originFilePath
        ? this.store.findSourceByOriginFilePath(input.originFilePath)
        : undefined;
    const sourceId = existing?.sourceId ?? this.buildId('src');
    const existingSource = existing;
    const now = Date.now();

    const summaryResult = input.skipAiSummary
      ? buildFallbackSummaryResult(input.textContent)
      : await this.localModelService.summarizeForKnowledgeBase({
          recordId: input.desktopRecordId ?? sourceId,
          displayName: input.title,
          previewText: input.textContent.slice(0, 160),
          textContent: input.textContent
        });
    const insight = buildKnowledgeDraftInsight({
      title: input.title,
      textContent: input.textContent,
      contentType: input.contentType,
      entryMethod: input.entryMethod,
      sourcePlatform: input.sourcePlatform,
      sourceLink: input.sourceLink,
      summaryResult
    });
    const topic = insight.topicName ? await this.ensureTopic(insight.topicName, insight.oneLineSummary) : undefined;
    const project = insight.projectName ? await this.ensureProject(insight.projectName) : undefined;

    let source: SourceRecord = {
      sourceId,
      title: input.title,
      contentType: input.contentType,
      entryMethod: input.entryMethod,
      sourcePlatform: input.sourcePlatform,
      sourceLink: input.sourceLink,
      siteName: input.siteName,
      publishedAt: input.publishedAt,
      heroImageUrl: input.heroImageUrl,
      pageType: input.pageType,
      rawDocumentLink: existingSource?.rawDocumentLink,
      rawDocumentId: existingSource?.rawDocumentId,
      desktopRecordId: input.desktopRecordId,
      oneLineSummary: insight.oneLineSummary,
      coreConclusion: buildCoreConclusion(summaryResult, insight.coreConclusion),
      keywords: insight.keywords,
      topicIds: topic ? [topic.topicId] : existingSource?.topicIds ?? [],
      projectIds: project ? [project.projectId] : existingSource?.projectIds ?? [],
      currentStatus: existingSource?.currentStatus ?? 'Inbox',
      nextAction: insight.nextAction,
      reusable: insight.reusable,
      enteredKnowledgePage: existingSource?.enteredKnowledgePage ?? false,
      knowledgePageLink: existingSource?.knowledgePageLink,
      syncStatus: existingSource?.syncStatus ?? 'pending',
      syncError: existingSource?.syncError ?? null,
      rawDocumentStatus: existingSource?.rawDocumentStatus ?? 'pending',
      rawDocumentError: existingSource?.rawDocumentError ?? null,
      lastSyncedAt: existingSource?.lastSyncedAt ?? Date.now(),
      createdAt: existingSource?.createdAt ?? now,
      updatedAt: now,
      originFilePath: input.originFilePath,
      originFileHash: input.originFileHash,
      originDirRoot: input.originDirRoot
    };

    // Defer upsert until after all sync operations complete
    // Feishu document sync removed — source record persisted without remote document
    await this.store.upsertSource(source);
    await this.store.appendIngestLog(this.buildIngestLog(source, input.entryMethod));
    if (this.localKnowledgeWorkspace) {
      await this.localKnowledgeWorkspace.persistIngest({
        source,
        insight,
        summaryResult,
        topic,
        project
      });
    }

    return {
      source,
      createdRawDocument: false
    };
  }

  private async ensureTopic(name: string, description: string): Promise<TopicRecord> {
    const state = this.store.getState();
    const existing = state.topics.find((topic) => topic.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      return existing;
    }

    const topic: TopicRecord = {
      topicId: this.buildId('topic'),
      name,
      description,
      sourceIds: [],
      projectIds: [],
      assetIds: [],
      currentConclusion: description,
      openQuestions: [],
      lifecycle: 'active',
      updatedAt: Date.now()
    };
    await this.store.upsertTopic(topic);
    return topic;
  }

  private async ensureProject(name: string): Promise<ProjectRecord> {
    const state = this.store.getState();
    const existing = state.projects.find((project) => project.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      return existing;
    }

    const project: ProjectRecord = {
      projectId: this.buildId('proj'),
      name,
      goal: '待补充项目目标',
      currentVersion: '3.0-alpha',
      status: 'active',
      topicIds: [],
      decisionIds: [],
      assetIds: [],
      sourceIds: [],
      lifecycle: 'active',
      updatedAt: Date.now()
    };
    await this.store.upsertProject(project);
    return project;
  }

  private buildIngestLog(source: SourceRecord, entryMethod: SourceEntryMethod): IngestLog {
    return {
      ingestId: this.buildId('ingest'),
      sourceId: source.sourceId,
      entryMethod,
      status: source.syncStatus === 'synced' || source.syncStatus === 'partial' ? 'success' : 'failed',
      note:
        source.syncStatus === 'synced'
          ? 'Source 已完成原始资料写入。'
          : source.syncStatus === 'partial'
            ? `Source 已本地落库，但远端写入部分失败：${source.syncError ?? '未知错误'}`
            : `Source 远端写入失败：${source.syncError ?? '未知错误'}`,
      createdAt: Date.now()
    };
  }

  private buildId(prefix: 'src' | 'topic' | 'proj' | 'ingest'): string {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
}

function resolveOverallSyncStatus(
  rawDocumentStatus: SourceRecord['rawDocumentStatus']
): SourceSyncStatus {
  return rawDocumentStatus;
}

function buildCoreConclusion(summaryResult: SummaryResult, fallback: string): string {
  return summaryResult.summary.trim() || fallback || '待补充核心结论';
}

function buildFallbackSummaryResult(textContent: string): SummaryResult {
  return {
    summary: textContent.slice(0, 120).replace(/\n/g, ' ').trim(),
    category: '待处理',
    keyword: '',
    confidence: 0,
    source: 'localModel'
  };
}
