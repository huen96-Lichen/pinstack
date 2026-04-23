import type { StorageService } from '../../src/main/storage';
import type { LocalModelService } from '../../src/shared/ai/localModel/types';
import type {
  AskAiAnswer,
  AskAiQuery,
  AssetRecord,
  DecisionRecord,
  KnowledgeIngestRecordResult,
  KnowledgeRuntimeStatus,
  ProjectRecord,
  TopicRecord,
  TopicSuggestion
} from '../../src/shared/knowledge3';
import type {
  AssistantAnswer,
  AssistantQueryInput,
  CaptureInboxItemInput,
  Event,
  HomeFocusSnapshot,
  InboxItem,
  KnowledgeItem,
  ProcessInboxItemResult,
  Project,
  ProjectStatus,
  Review,
  ReviewPeriod,
  Task,
  TaskPriority,
  TaskStatus,
  TopicPage
} from '../../src/shared/pinosV1';
import { KnowledgeStore } from './knowledgeStore';
import { PinosV1Store } from './pinosV1Store';
import { SourcePersistenceService } from './sourcePersistence';
import { LocalKnowledgeWorkspace, type WorkspaceSnapshot } from './localKnowledgeWorkspace';
import * as sourceOps from './knowledgeSourceOps';
import * as topicOps from './knowledgeTopicOps';
import * as projectOps from './knowledgeProjectOps';
import * as decisionOps from './knowledgeDecisionOps';
import * as assetOps from './knowledgeAssetOps';
import * as inboxOps from './knowledgeInboxOps';
import * as aiOps from './knowledgeAiOps';

interface KnowledgeRuntimeOptions {
  storageRoot: string;
  storage: StorageService;
  localModelService: LocalModelService;
  getWebUrl: () => string;
  getApiBaseUrl: () => string;
}

export class KnowledgeRuntime {
  private readonly store: KnowledgeStore;
  private readonly v1Store: PinosV1Store;
  private readonly storage: StorageService;
  private readonly sourcePersistence: SourcePersistenceService;
  private readonly localKnowledgeWorkspace: LocalKnowledgeWorkspace;
  private readonly getWebUrl: () => string;
  private readonly getApiBaseUrl: () => string;

  // Cached deps objects for passing to module functions
  private sourceDeps!: sourceOps.SourceOpsDeps;
  private topicDeps!: topicOps.TopicOpsDeps;
  private projectDeps!: projectOps.ProjectOpsDeps;
  private decisionDeps!: decisionOps.DecisionOpsDeps;
  private assetDeps!: assetOps.AssetOpsDeps;
  private inboxDeps!: inboxOps.InboxOpsDeps;
  private aiDeps!: aiOps.AiOpsDeps;

  public constructor(options: KnowledgeRuntimeOptions) {
    this.store = new KnowledgeStore(options.storageRoot);
    this.v1Store = new PinosV1Store(options.storageRoot);
    this.storage = options.storage;
    this.localKnowledgeWorkspace = new LocalKnowledgeWorkspace({
      storageRoot: options.storageRoot,
      workspaceRootOverride: process.env.PINSTACK_WORKSPACE_PATH
    });
    this.sourcePersistence = new SourcePersistenceService({
      storage: options.storage,
      store: this.store,
      localModelService: options.localModelService,
      localKnowledgeWorkspace: this.localKnowledgeWorkspace
    });
    this.getWebUrl = options.getWebUrl;
    this.getApiBaseUrl = options.getApiBaseUrl;
  }

  public async init(): Promise<void> {
    await this.store.init();
    await this.v1Store.init();
    await this.localKnowledgeWorkspace.init();
    await this.localKnowledgeWorkspace.syncFromStore(this.store);

    // Initialize deps objects
    this.sourceDeps = {
      store: this.store,
      storage: this.storage,
      sourcePersistence: this.sourcePersistence,
      localKnowledgeWorkspace: this.localKnowledgeWorkspace,
      getWebUrl: this.getWebUrl
    };
    this.topicDeps = {
      store: this.store,
      getWebUrl: this.getWebUrl
    };
    this.projectDeps = {
      store: this.store,
      getWebUrl: this.getWebUrl
    };
    this.decisionDeps = {
      store: this.store
    };
    this.assetDeps = {
      store: this.store
    };
    this.inboxDeps = {
      v1Store: this.v1Store,
      appendV1Event: (input) => this.appendV1Event(input),
      ensureV1TopicPage: (title, abstract) => this.ensureV1TopicPage(title, abstract)
    };
    this.aiDeps = {
      store: this.store,
      v1Store: this.v1Store
    };
  }

  // --- Status & Workspace ---

  public async scanDirectory(options: {
    dirPath: string;
    extensions?: string[];
    excludePatterns?: string[];
  }): Promise<{
    totalFiles: number;
    newFiles: number;
    modifiedFiles: number;
    unchangedFiles: number;
    skippedFiles: number;
  }> {
    const { scanDirectory: doScan } = await import('./directoryScanner');

    // 构建已有文件的哈希映射
    const existingSources = this.store.findSourcesByOriginDir(options.dirPath);
    const existingHashes = new Map<string, string>();
    for (const source of existingSources) {
      if (source.originFilePath && source.originFileHash) {
        existingHashes.set(source.originFilePath, source.originFileHash);
      }
    }

    const result = await doScan(options, existingHashes);

    // 批量导入新文件和变更文件
    const { ingestFromFile } = await import('./knowledgeSourceOps');
    for (const file of [...result.newFiles, ...result.modifiedFiles]) {
      try {
        await ingestFromFile(this.sourceDeps, {
          filePath: file.absolutePath,
          dirRoot: options.dirPath,
          contentHash: file.contentHash,
          sourcePlatform: 'Obsidian'
        });
      } catch (err) {
        console.error(`[knowledge] Failed to ingest file: ${file.absolutePath}`, err);
      }
    }

    return {
      totalFiles: result.totalFiles,
      newFiles: result.newFiles.length,
      modifiedFiles: result.modifiedFiles.length,
      unchangedFiles: result.unchangedFiles.length,
      skippedFiles: result.skippedFiles
    };
  }

  public async getStatus(): Promise<KnowledgeRuntimeStatus> {
    const state = this.store.getState();
    return {
      running: true,
      apiBaseUrl: this.getApiBaseUrl(),
      webUrl: this.getWebUrl(),
      counts: {
        sources: state.sources.length,
        topics: state.topics.length,
        projects: state.projects.length,
        decisions: state.decisions.length,
        assets: state.assets.length,
        lintIssues: state.lintIssues.length
      }
    };
  }

  public async getLocalWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
    await this.localKnowledgeWorkspace.syncFromStore(this.store);
    return this.localKnowledgeWorkspace.getSnapshot();
  }

  // --- Source Operations (delegated to knowledgeSourceOps) ---

  public async ingestExistingRecord(recordId: string): Promise<KnowledgeIngestRecordResult> {
    return sourceOps.ingestExistingRecord(this.sourceDeps, recordId);
  }

  public async ingestText(input: { title: string; text: string; sourcePlatform?: string; sourceLink?: string }): Promise<KnowledgeIngestRecordResult> {
    return sourceOps.ingestText(this.sourceDeps, input);
  }

  public async ingestWeb(input: { url: string }): Promise<KnowledgeIngestRecordResult> {
    return sourceOps.ingestWeb(this.sourceDeps, input);
  }

  public async ingestCapture(input: {
    type: 'text' | 'link' | 'note' | 'image' | 'pdf' | 'message' | 'email' | 'video' | 'audio' | 'template';
    title?: string;
    contentText?: string;
    sourceUrl?: string;
    sourcePlatform?: string;
  }): Promise<KnowledgeIngestRecordResult> {
    return sourceOps.ingestCapture(this.sourceDeps, input);
  }

  public async updateSourceStatus(sourceId: string, currentStatus: 'Processed' | 'Archived' | 'Linked'): Promise<void> {
    return sourceOps.updateSourceStatus(this.sourceDeps, sourceId, currentStatus);
  }

  public async resyncSource(sourceId: string): Promise<KnowledgeIngestRecordResult> {
    return sourceOps.resyncSource(this.sourceDeps, sourceId);
  }

  public async listSources() {
    return sourceOps.listSources(this.sourceDeps);
  }

  public async attachSourceToTopic(input: { sourceId: string; topicId?: string; topicName?: string }): Promise<{ ok: true; sourceId: string; topicId: string }> {
    return sourceOps.attachSourceToTopic(this.sourceDeps, input, (i) => this.createTopic(i));
  }

  public async attachSourceToProject(input: { sourceId: string; projectId?: string; projectName?: string }) {
    return sourceOps.attachSourceToProject(this.sourceDeps, input, (i) => this.createProject(i));
  }

  public async recommendTopicsForSource(sourceId: string): Promise<TopicSuggestion[]> {
    return sourceOps.recommendTopicsForSource(this.sourceDeps, sourceId);
  }

  // --- Topic Operations (delegated to knowledgeTopicOps) ---

  public async listTopics() {
    return topicOps.listTopics(this.topicDeps);
  }

  public async updateTopic(input: {
    topicId: string;
    name?: string;
    description?: string;
    currentConclusion?: string;
    openQuestions?: string[];
  }): Promise<TopicRecord> {
    return topicOps.updateTopic(this.topicDeps, input);
  }

  public async createTopic(input: { name: string; description?: string }): Promise<TopicRecord> {
    return topicOps.createTopic(this.topicDeps, input);
  }

  public async archiveTopic(topicId: string): Promise<TopicRecord> {
    return topicOps.archiveTopic(this.topicDeps, topicId);
  }

  public async mergeTopics(input: { sourceTopicId: string; targetTopicId: string }): Promise<{ ok: true; sourceTopicId: string; targetTopicId: string }> {
    return topicOps.mergeTopics(this.topicDeps, input);
  }

  public async deleteTopic(topicId: string): Promise<{ ok: true; topicId: string }> {
    return topicOps.deleteTopic(this.topicDeps, topicId);
  }

  // --- Project Operations (delegated to knowledgeProjectOps) ---

  public async listProjects() {
    return projectOps.listProjects(this.projectDeps);
  }

  public async updateProject(input: {
    projectId: string;
    name?: string;
    goal?: string;
    currentVersion?: string;
    status?: ProjectRecord['status'];
  }): Promise<ProjectRecord> {
    return projectOps.updateProject(this.projectDeps, input);
  }

  public async createProject(input: { name: string; goal?: string }): Promise<ProjectRecord> {
    return projectOps.createProject(this.projectDeps, input);
  }

  public async archiveProject(projectId: string): Promise<ProjectRecord> {
    return projectOps.archiveProject(this.projectDeps, projectId);
  }

  public async mergeProjects(input: { sourceProjectId: string; targetProjectId: string }): Promise<{ ok: true; sourceProjectId: string; targetProjectId: string }> {
    return projectOps.mergeProjects(this.projectDeps, input);
  }

  public async deleteProject(projectId: string): Promise<{ ok: true; projectId: string }> {
    return projectOps.deleteProject(this.projectDeps, projectId);
  }

  public async attachTopicToProject(input: { topicId: string; projectId?: string; projectName?: string }) {
    return projectOps.attachTopicToProject(this.projectDeps, input, (i) => this.createProject(i));
  }

  // --- Decision Operations (delegated to knowledgeDecisionOps) ---

  public async listDecisions() {
    return decisionOps.listDecisions(this.decisionDeps);
  }

  public async updateDecision(input: {
    decisionId: string;
    title?: string;
    background?: string;
    conclusion?: string;
    reasons?: string[];
    impactScope?: string;
    alternatives?: string[];
    nextActions?: string[];
  }): Promise<DecisionRecord> {
    return decisionOps.updateDecision(this.decisionDeps, input);
  }

  public async createDecisionDraft(input: {
    title?: string;
    background?: string;
    conclusion: string;
    reasons?: string[];
    topicId?: string;
    projectId?: string;
    sourceIds?: string[];
  }): Promise<DecisionRecord> {
    return decisionOps.createDecisionDraft(this.decisionDeps, input);
  }

  public async archiveDecision(decisionId: string): Promise<DecisionRecord> {
    return decisionOps.archiveDecision(this.decisionDeps, decisionId);
  }

  public async deleteDecision(decisionId: string): Promise<{ ok: true; decisionId: string }> {
    return decisionOps.deleteDecision(this.decisionDeps, decisionId);
  }

  // --- Asset Operations (delegated to knowledgeAssetOps) ---

  public async listAssets() {
    return assetOps.listAssets(this.assetDeps);
  }

  public async updateAsset(input: {
    assetId: string;
    name?: string;
    assetType?: AssetRecord['assetType'];
    usageScene?: string;
    version?: string;
    versionNote?: string;
  }): Promise<AssetRecord> {
    return assetOps.updateAsset(this.assetDeps, input);
  }

  public async createAssetDraft(input: {
    name?: string;
    usageScene?: string;
    content?: string;
    topicId?: string;
    projectId?: string;
    sourceIds?: string[];
    assetType?: AssetRecord['assetType'];
  }): Promise<AssetRecord> {
    return assetOps.createAssetDraft(this.assetDeps, input);
  }

  public async updateAssetVersion(input: { assetId: string; version: string; note?: string }): Promise<AssetRecord> {
    return assetOps.updateAssetVersion(this.assetDeps, input);
  }

  public async archiveAsset(assetId: string): Promise<AssetRecord> {
    return assetOps.archiveAsset(this.assetDeps, assetId);
  }

  public async deleteAsset(assetId: string): Promise<{ ok: true; assetId: string }> {
    return assetOps.deleteAsset(this.assetDeps, assetId);
  }

  // --- AI & Review Operations (delegated to knowledgeAiOps) ---

  public async askAi(query: AskAiQuery): Promise<AskAiAnswer> {
    return aiOps.askAi(this.aiDeps, query);
  }

  public async depositAskAnswer(input: {
    answer: string;
    askAnswerId?: string;
    topicId?: string;
    projectId?: string;
  }): Promise<{ ok: true; targetType: 'topic' | 'project'; targetId: string }> {
    return aiOps.depositAskAnswer(this.aiDeps, input);
  }

  public async listLintIssues() {
    return aiOps.listLintIssues(this.aiDeps);
  }

  public async resolveLintIssue(lintId: string) {
    return aiOps.resolveLintIssue(this.aiDeps, lintId);
  }

  public async applyLintQuickFix(lintId: string): Promise<{ ok: true; lintId: string }> {
    return aiOps.applyLintQuickFix(
      this.aiDeps,
      lintId,
      (input) => this.createTopic(input),
      (input) => this.attachSourceToTopic(input),
      (input) => this.createDecisionDraft(input)
    );
  }

  // --- V1 Inbox Pipeline (delegated to knowledgeInboxOps) ---

  public async listV1InboxItems(): Promise<InboxItem[]> {
    return inboxOps.listV1InboxItems(this.inboxDeps);
  }

  public async captureV1InboxItem(input: CaptureInboxItemInput): Promise<InboxItem> {
    return inboxOps.captureV1InboxItem(this.inboxDeps, input);
  }

  public async processV1InboxItem(inboxItemId: string): Promise<ProcessInboxItemResult> {
    return inboxOps.processV1InboxItem(this.inboxDeps, inboxItemId);
  }

  public async listV1KnowledgeItems(): Promise<KnowledgeItem[]> {
    return inboxOps.listV1KnowledgeItems(this.inboxDeps);
  }

  public async createV1KnowledgeItem(input: {
    title: string;
    summary: string;
    tags?: string[];
    sourceInboxItemId: string;
    topicPageIds?: string[];
    projectIds?: string[];
    suggestedNextActions?: string[];
    valueScore?: number;
  }): Promise<KnowledgeItem> {
    return inboxOps.createV1KnowledgeItem(this.inboxDeps, input);
  }

  public async updateV1KnowledgeItem(input: {
    knowledgeItemId: string;
    title?: string;
    summary?: string;
    tags?: string[];
    topicPageIds?: string[];
    projectIds?: string[];
    suggestedNextActions?: string[];
    valueScore?: number;
    lifecycle?: 'active' | 'archived';
  }): Promise<KnowledgeItem> {
    return inboxOps.updateV1KnowledgeItem(this.inboxDeps, input);
  }

  // --- V1 Topics, Projects, Tasks, Events, Reviews (delegated to knowledgeAiOps) ---

  public async listV1TopicPages(): Promise<TopicPage[]> {
    return aiOps.listV1TopicPages(this.aiDeps);
  }

  public async createV1TopicPage(input: { title: string; abstract?: string }): Promise<TopicPage> {
    return aiOps.createV1TopicPage(this.aiDeps, input, (title, abstract) => this.ensureV1TopicPage(title, abstract));
  }

  public async updateV1TopicPage(input: {
    topicPageId: string;
    title?: string;
    abstract?: string;
    currentConclusion?: string;
    openQuestions?: string[];
    projectIds?: string[];
    lifecycle?: 'active' | 'archived';
  }): Promise<TopicPage> {
    return aiOps.updateV1TopicPage(this.aiDeps, input, (evt) => this.appendV1Event(evt));
  }

  public async listV1Projects(): Promise<Project[]> {
    return aiOps.listV1Projects(this.aiDeps);
  }

  public async createV1Project(input: { name: string; goal?: string; phase?: string }): Promise<Project> {
    return aiOps.createV1Project(this.aiDeps, input, (evt) => this.appendV1Event(evt));
  }

  public async updateV1Project(input: {
    projectId: string;
    name?: string;
    goal?: string;
    phase?: string;
    focusScore?: number;
    status?: ProjectStatus;
  }): Promise<Project> {
    return aiOps.updateV1Project(this.aiDeps, input, (evt) => this.appendV1Event(evt));
  }

  public async listV1Tasks(): Promise<Task[]> {
    return aiOps.listV1Tasks(this.aiDeps);
  }

  public async createV1Task(input: {
    title: string;
    projectId: string;
    priority?: TaskPriority;
    description?: string;
    relatedKnowledgeItemIds?: string[];
    suggestedNextStep?: string;
    dueAt?: number;
  }): Promise<Task> {
    return aiOps.createV1Task(this.aiDeps, input, (evt) => this.appendV1Event(evt));
  }

  public async updateV1Task(input: {
    taskId: string;
    title?: string;
    description?: string;
    priority?: TaskPriority;
    relatedKnowledgeItemIds?: string[];
    suggestedNextStep?: string;
    dueAt?: number;
    blockedReason?: string;
  }): Promise<Task> {
    return aiOps.updateV1Task(this.aiDeps, input);
  }

  public async updateV1TaskStatus(input: { taskId: string; status: TaskStatus; blockedReason?: string }): Promise<Task> {
    return aiOps.updateV1TaskStatus(this.aiDeps, input, (evt) => this.appendV1Event(evt));
  }

  public async listV1Events(input?: { projectId?: string; taskId?: string; from?: number; to?: number }): Promise<Event[]> {
    return aiOps.listV1Events(this.aiDeps, input);
  }

  public async generateV1Review(period: ReviewPeriod): Promise<Review> {
    return aiOps.generateV1Review(this.aiDeps, period, (evt) => this.appendV1Event(evt));
  }

  public async listV1Reviews(): Promise<Review[]> {
    return aiOps.listV1Reviews(this.aiDeps);
  }

  public async getV1HomeFocusSnapshot(): Promise<HomeFocusSnapshot> {
    return aiOps.getV1HomeFocusSnapshot(this.aiDeps);
  }

  public async assistantV1Query(input: AssistantQueryInput): Promise<AssistantAnswer> {
    return aiOps.assistantV1Query(this.aiDeps, input);
  }

  // --- Internal helpers ---

  private async ensureV1TopicPage(title: string, abstract?: string): Promise<TopicPage> {
    const state = this.v1Store.getState();
    const normalizedTitle = title.trim().toLowerCase();
    const existing = state.topicPages.find((item) => item.title.trim().toLowerCase() === normalizedTitle);
    if (existing) {
      return existing;
    }
    const { randomUUID } = await import('node:crypto');
    const now = Date.now();
    const slug = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'topic';
    const topicPage: TopicPage = {
      id: `topic_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      slug,
      title: title.trim(),
      abstract: abstract?.trim() || `${title.trim()} 主题页`,
      currentConclusion: abstract?.trim() || `${title.trim()} 仍在持续沉淀中`,
      openQuestions: [`${title.trim()} 下一步最值得验证的结论是什么？`],
      knowledgeItemIds: [],
      projectIds: [],
      markdownExportPath: undefined,
      lastCompiledAt: undefined,
      createdAt: now,
      updatedAt: now,
      lifecycle: 'active'
    };
    await this.v1Store.upsertTopicPage(topicPage);
    return topicPage;
  }

  private async appendV1Event(input: {
    type: string;
    actor: 'user' | 'assistant';
    objectType: string;
    objectId: string;
    projectId?: string;
    taskId?: string;
    knowledgeItemId?: string;
    payload?: Record<string, string | number | boolean | null>;
    happenedAt: number;
  }): Promise<Event> {
    const { randomUUID } = await import('node:crypto');
    const event: Event = {
      id: `evt_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      type: input.type as Event['type'],
      actor: input.actor,
      objectType: input.objectType as Event['objectType'],
      objectId: input.objectId,
      projectId: input.projectId,
      taskId: input.taskId,
      knowledgeItemId: input.knowledgeItemId,
      payload: input.payload,
      happenedAt: input.happenedAt,
      createdAt: input.happenedAt,
      updatedAt: input.happenedAt,
      lifecycle: 'active'
    };
    await this.v1Store.upsertEvent(event);
    if (event.projectId) {
      const state = this.v1Store.getState();
      const project = state.projects.find((item) => item.id === event.projectId);
      if (project) {
        await this.v1Store.upsertProject({
          ...project,
          latestEventIds: [event.id, ...project.latestEventIds.filter((item) => item !== event.id)].slice(0, 30),
          updatedAt: Math.max(project.updatedAt, event.happenedAt)
        });
      }
    }
    return event;
  }
}
