import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AssetRecord, DecisionRecord, IngestLog, LintIssue, ProjectRecord, SourceRecord, TopicRecord } from '../../src/shared/knowledge3';

interface KnowledgeStoreState {
  sources: SourceRecord[];
  topics: TopicRecord[];
  projects: ProjectRecord[];
  decisions: DecisionRecord[];
  assets: AssetRecord[];
  ingestLogs: IngestLog[];
  askAnswerLogs: AskAnswerLog[];
  lintIssues: LintIssue[];
}

interface AskAnswerLog {
  askAnswerId: string;
  query: string;
  answer: string;
  relatedTopicIds: string[];
  relatedProjectIds: string[];
  supportingSourceIds: string[];
  highValue: boolean;
  deposited: boolean;
  createdAt: number;
  updatedAt: number;
}

function createEmptyState(): KnowledgeStoreState {
  return {
    sources: [],
    topics: [],
    projects: [],
    decisions: [],
    assets: [],
    ingestLogs: [],
    askAnswerLogs: [],
    lintIssues: []
  };
}

export class KnowledgeStore {
  private state: KnowledgeStoreState = createEmptyState();
  private readonly dataPath: string;
  private persistChain: Promise<void> = Promise.resolve();

  public constructor(storageRoot: string) {
    this.dataPath = path.join(storageRoot, 'knowledge3', 'store.json');
  }

  public async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
    try {
      const raw = await fs.readFile(this.dataPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<KnowledgeStoreState>;
      this.state = {
        sources: (parsed.sources ?? []).map((source) => this.normalizeSource(source)),
        topics: (parsed.topics ?? []).map((topic) => this.normalizeTopic(topic)),
        projects: (parsed.projects ?? []).map((project) => this.normalizeProject(project)),
        decisions: (parsed.decisions ?? []).map((decision) => this.normalizeDecision(decision)),
        assets: (parsed.assets ?? []).map((asset) => this.normalizeAsset(asset)),
        ingestLogs: parsed.ingestLogs ?? [],
        askAnswerLogs: (parsed.askAnswerLogs ?? []).map((answer) => this.normalizeAskAnswerLog(answer)),
        lintIssues: parsed.lintIssues ?? []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.persist();
    }
    this.recomputeDerivedState();
  }

  public getState(): KnowledgeStoreState {
    return {
      sources: [...this.state.sources],
      topics: [...this.state.topics],
      projects: [...this.state.projects],
      decisions: [...this.state.decisions],
      assets: [...this.state.assets],
      ingestLogs: [...this.state.ingestLogs],
      askAnswerLogs: [...this.state.askAnswerLogs],
      lintIssues: [...this.state.lintIssues]
    };
  }

  public findSourceByDesktopRecordId(recordId: string): SourceRecord | undefined {
    return this.state.sources.find((source) => source.desktopRecordId === recordId);
  }

  public findSourceById(sourceId: string): SourceRecord | undefined {
    return this.state.sources.find((source) => source.sourceId === sourceId);
  }

  public findSourceByOriginFilePath(filePath: string): SourceRecord | undefined {
    return this.state.sources.find((source) => source.originFilePath === filePath);
  }

  public findSourcesByOriginDir(dirRoot: string): SourceRecord[] {
    return this.state.sources.filter((source) => source.originDirRoot === dirRoot);
  }

  public async upsertSource(source: SourceRecord): Promise<void> {
    const existingIndex = this.state.sources.findIndex((item) => item.sourceId === source.sourceId);
    if (existingIndex >= 0) {
      this.state.sources[existingIndex] = source;
    } else {
      this.state.sources.unshift(source);
    }

    for (const topicId of source.topicIds) {
      const topic = this.state.topics.find((item) => item.topicId === topicId);
      if (topic && !topic.sourceIds.includes(source.sourceId)) {
        topic.sourceIds.push(source.sourceId);
      }
    }

    for (const projectId of source.projectIds) {
      const project = this.state.projects.find((item) => item.projectId === projectId);
      if (project && !project.sourceIds.includes(source.sourceId)) {
        project.sourceIds.push(source.sourceId);
      }
    }

    this.recomputeDerivedState();
    await this.persist();
  }

  public async upsertTopic(topic: TopicRecord): Promise<void> {
    const existingIndex = this.state.topics.findIndex((item) => item.topicId === topic.topicId);
    if (existingIndex >= 0) {
      this.state.topics[existingIndex] = topic;
    } else {
      this.state.topics.unshift(topic);
    }
    this.recomputeDerivedState();
    await this.persist();
  }

  public async upsertProject(project: ProjectRecord): Promise<void> {
    const existingIndex = this.state.projects.findIndex((item) => item.projectId === project.projectId);
    if (existingIndex >= 0) {
      this.state.projects[existingIndex] = project;
    } else {
      this.state.projects.unshift(project);
    }
    this.recomputeDerivedState();
    await this.persist();
  }

  public async upsertDecision(decision: DecisionRecord): Promise<void> {
    const existingIndex = this.state.decisions.findIndex((item) => item.decisionId === decision.decisionId);
    if (existingIndex >= 0) {
      this.state.decisions[existingIndex] = decision;
    } else {
      this.state.decisions.unshift(decision);
    }
    this.recomputeDerivedState();
    await this.persist();
  }

  public async upsertAsset(asset: AssetRecord): Promise<void> {
    const existingIndex = this.state.assets.findIndex((item) => item.assetId === asset.assetId);
    if (existingIndex >= 0) {
      this.state.assets[existingIndex] = asset;
    } else {
      this.state.assets.unshift(asset);
    }
    this.recomputeDerivedState();
    await this.persist();
  }

  public async removeTopic(topicId: string): Promise<void> {
    this.state.topics = this.state.topics.filter((item) => item.topicId !== topicId);
    this.recomputeDerivedState();
    await this.persist();
  }

  public async removeProject(projectId: string): Promise<void> {
    this.state.projects = this.state.projects.filter((item) => item.projectId !== projectId);
    this.recomputeDerivedState();
    await this.persist();
  }

  public async removeDecision(decisionId: string): Promise<void> {
    this.state.decisions = this.state.decisions.filter((item) => item.decisionId !== decisionId);
    this.recomputeDerivedState();
    await this.persist();
  }

  public async removeAsset(assetId: string): Promise<void> {
    this.state.assets = this.state.assets.filter((item) => item.assetId !== assetId);
    this.recomputeDerivedState();
    await this.persist();
  }

  public async appendIngestLog(log: IngestLog): Promise<void> {
    this.state.ingestLogs.unshift(log);
    await this.persist();
  }

  public async resolveLintIssue(lintId: string): Promise<LintIssue | undefined> {
    const issue = this.state.lintIssues.find((item) => item.lintId === lintId);
    if (!issue) {
      return undefined;
    }
    issue.resolved = true;
    issue.updatedAt = Date.now();
    await this.persist();
    return issue;
  }

  public async appendAskAnswerLog(log: AskAnswerLog): Promise<void> {
    this.state.askAnswerLogs.unshift(log);
    this.recomputeDerivedState();
    await this.persist();
  }

  public async markAskAnswerDeposited(askAnswerId: string): Promise<void> {
    const answer = this.state.askAnswerLogs.find((item) => item.askAnswerId === askAnswerId);
    if (!answer) {
      return;
    }
    answer.deposited = true;
    answer.updatedAt = Date.now();
    this.recomputeDerivedState();
    await this.persist();
  }

  private recomputeDerivedState(): void {
    const topicById = new Map(this.state.topics.map((topic) => [topic.topicId, topic] as const));
    const projectById = new Map(this.state.projects.map((project) => [project.projectId, project] as const));

    // Pre-build Sets for O(1) dedup lookups
    const topicSourceIdSets = new Map<string, Set<string>>();
    const topicProjectIdSets = new Map<string, Set<string>>();
    const topicAssetIdSets = new Map<string, Set<string>>();
    const projectSourceIdSets = new Map<string, Set<string>>();
    const projectAssetIdSets = new Map<string, Set<string>>();
    const projectDecisionIdSets = new Map<string, Set<string>>();

    for (const topic of this.state.topics) {
      topic.sourceIds = [];
      topic.projectIds = [];
      topic.assetIds = [];
      topicSourceIdSets.set(topic.topicId, new Set());
      topicProjectIdSets.set(topic.topicId, new Set());
      topicAssetIdSets.set(topic.topicId, new Set());
    }

    for (const project of this.state.projects) {
      project.sourceIds = [];
      project.topicIds = [...new Set(project.topicIds)];
      project.decisionIds = [...new Set(project.decisionIds)];
      project.assetIds = [];
      projectSourceIdSets.set(project.projectId, new Set());
      projectAssetIdSets.set(project.projectId, new Set());
      projectDecisionIdSets.set(project.projectId, new Set());
    }

    for (const source of this.state.sources) {
      for (const topicId of source.topicIds) {
        const topic = topicById.get(topicId);
        if (topic) {
          const idSet = topicSourceIdSets.get(topicId)!;
          if (!idSet.has(source.sourceId)) {
            idSet.add(source.sourceId);
            topic.sourceIds.push(source.sourceId);
          }
        }
      }
      for (const projectId of source.projectIds) {
        const project = projectById.get(projectId);
        if (project) {
          const idSet = projectSourceIdSets.get(projectId)!;
          if (!idSet.has(source.sourceId)) {
            idSet.add(source.sourceId);
            project.sourceIds.push(source.sourceId);
          }
        }
      }
    }

    for (const project of this.state.projects) {
      for (const topicId of project.topicIds) {
        const topic = topicById.get(topicId);
        if (topic) {
          const idSet = topicProjectIdSets.get(topicId)!;
          if (!idSet.has(project.projectId)) {
            idSet.add(project.projectId);
            topic.projectIds.push(project.projectId);
          }
        }
      }
    }

    for (const asset of this.state.assets) {
      for (const topicId of asset.topicIds) {
        const topic = topicById.get(topicId);
        if (topic) {
          const idSet = topicAssetIdSets.get(topicId)!;
          if (!idSet.has(asset.assetId)) {
            idSet.add(asset.assetId);
            topic.assetIds.push(asset.assetId);
          }
        }
      }
      for (const projectId of asset.projectIds) {
        const project = projectById.get(projectId);
        if (project) {
          const idSet = projectAssetIdSets.get(projectId)!;
          if (!idSet.has(asset.assetId)) {
            idSet.add(asset.assetId);
            project.assetIds.push(asset.assetId);
          }
        }
      }
    }

    for (const decision of this.state.decisions) {
      if (!decision.projectId) {
        continue;
      }
      const project = projectById.get(decision.projectId);
      if (project) {
        const idSet = projectDecisionIdSets.get(decision.projectId)!;
        if (!idSet.has(decision.decisionId)) {
          idSet.add(decision.decisionId);
          project.decisionIds.push(decision.decisionId);
        }
      }
    }

    this.state.lintIssues = this.buildLintIssues();
  }

  private normalizeSource(source: SourceRecord): SourceRecord {
    return {
      ...source,
      syncStatus: source.syncStatus ?? (source.rawDocumentLink ? 'partial' : 'pending'),
      syncError: source.syncError ?? null,
      rawDocumentStatus: source.rawDocumentStatus ?? (source.rawDocumentLink ? 'synced' : 'pending'),
      rawDocumentError: source.rawDocumentError ?? null
    };
  }

  private normalizeTopic(topic: TopicRecord): TopicRecord {
    return {
      ...topic,
      sourceIds: topic.sourceIds ?? [],
      projectIds: topic.projectIds ?? [],
      assetIds: topic.assetIds ?? [],
      currentConclusion: topic.currentConclusion ?? topic.description ?? '',
      openQuestions: topic.openQuestions ?? [],
      lifecycle: topic.lifecycle ?? 'active',
      archivedAt: topic.archivedAt,
      mergedInto: topic.mergedInto,
      updatedAt: topic.updatedAt ?? Date.now()
    };
  }

  private normalizeProject(project: ProjectRecord): ProjectRecord {
    return {
      ...project,
      topicIds: project.topicIds ?? [],
      decisionIds: project.decisionIds ?? [],
      assetIds: project.assetIds ?? [],
      sourceIds: project.sourceIds ?? [],
      lifecycle: project.lifecycle ?? 'active',
      archivedAt: project.archivedAt,
      mergedInto: project.mergedInto,
      updatedAt: project.updatedAt ?? Date.now()
    };
  }

  private normalizeDecision(decision: DecisionRecord): DecisionRecord {
    return {
      ...decision,
      reasons: decision.reasons ?? [],
      alternatives: decision.alternatives ?? [],
      nextActions: decision.nextActions ?? [],
      sourceIds: decision.sourceIds ?? [],
      lifecycle: decision.lifecycle ?? 'active',
      archivedAt: decision.archivedAt,
      updatedAt: decision.updatedAt ?? Date.now()
    };
  }

  private normalizeAskAnswerLog(answer: AskAnswerLog): AskAnswerLog {
    return {
      ...answer,
      relatedTopicIds: answer.relatedTopicIds ?? [],
      relatedProjectIds: answer.relatedProjectIds ?? [],
      supportingSourceIds: answer.supportingSourceIds ?? [],
      highValue: Boolean(answer.highValue),
      deposited: Boolean(answer.deposited),
      createdAt: answer.createdAt ?? Date.now(),
      updatedAt: answer.updatedAt ?? answer.createdAt ?? Date.now()
    };
  }

  private normalizeAsset(asset: AssetRecord): AssetRecord {
    return {
      ...asset,
      sourceIds: asset.sourceIds ?? [],
      topicIds: asset.topicIds ?? [],
      projectIds: asset.projectIds ?? [],
      versionNote: asset.versionNote ?? '',
      versionHistory: asset.versionHistory ?? [],
      lifecycle: asset.lifecycle ?? 'active',
      archivedAt: asset.archivedAt,
      updatedAt: asset.updatedAt ?? Date.now()
    };
  }

  private buildLintIssues(): LintIssue[] {
    const issues: LintIssue[] = [];
    const now = Date.now();

    const activeTopics = this.state.topics.filter((topic) => topic.lifecycle !== 'archived');
    const activeSources = this.state.sources.filter((source) => source.currentStatus !== 'Archived');
    const activeTopicIds = new Set(activeTopics.map((item) => item.topicId));

    for (const source of activeSources) {
      if (source.topicIds.length === 0 && source.projectIds.length === 0) {
        issues.push({
          lintId: `lint_orphan_${source.sourceId}`,
          issueType: 'orphan',
          objectType: 'source',
          objectId: source.sourceId,
          title: `资料“${source.title}”尚未挂接主题或项目`,
          suggestion: '优先挂接到 Topic，避免长期留在孤立状态。',
          priority: 'medium',
          resolved: false,
          createdAt: now,
          updatedAt: now
        });
      }

      const danglingTopicIds = source.topicIds.filter((topicId) => !activeTopicIds.has(topicId));
      if (danglingTopicIds.length > 0) {
        issues.push({
          lintId: `lint_missing_topic_${source.sourceId}`,
          issueType: 'missing_topic',
          objectType: 'source',
          objectId: source.sourceId,
          title: `资料“${source.title}”关联了不存在或已归档的主题`,
          suggestion: `请重新挂接有效主题（缺失：${danglingTopicIds.join(', ')}）。`,
          priority: 'high',
          resolved: false,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    for (const topic of activeTopics) {
      if (topic.sourceIds.length === 0) {
        issues.push({
          lintId: `lint_empty_topic_${topic.topicId}`,
          issueType: 'orphan',
          objectType: 'topic',
          objectId: topic.topicId,
          title: `主题“${topic.name}”当前没有关联资料`,
          suggestion: '补充 Source，或考虑归档该主题。',
          priority: 'medium',
          resolved: false,
          createdAt: now,
          updatedAt: now
        });
        continue;
      }

      const linkedSources = this.state.sources.filter((source) => topic.sourceIds.includes(source.sourceId));
      const latestSourceUpdatedAt = linkedSources.length > 0 ? Math.max(...linkedSources.map((source) => source.updatedAt)) : topic.updatedAt;
      if (latestSourceUpdatedAt > topic.updatedAt + 10 * 60 * 1000) {
        issues.push({
          lintId: `lint_stale_topic_${topic.topicId}`,
          issueType: 'stale',
          objectType: 'topic',
          objectId: topic.topicId,
          title: `主题“${topic.name}”可能过时`,
          suggestion: '该主题有较新 Source 进入，但主题结论未及时更新，建议回看并刷新结论。',
          priority: 'medium',
          resolved: false,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    for (const askAnswer of this.state.askAnswerLogs) {
      if (!askAnswer.highValue || askAnswer.deposited) {
        continue;
      }
      issues.push({
        lintId: `lint_pending_deposit_${askAnswer.askAnswerId}`,
        issueType: 'pending_deposit',
        objectType: 'ask_answer',
        objectId: askAnswer.askAnswerId,
        title: '高价值问答尚未沉淀',
        suggestion: `建议将问答“${askAnswer.query.slice(0, 32)}”沉淀到 Topic、Project 或 Decision。`,
        priority: 'high',
        resolved: false,
        createdAt: askAnswer.createdAt,
        updatedAt: now
      });
    }

    const duplicateGroups = new Map<string, SourceRecord[]>();
    for (const source of activeSources) {
      const key = `${source.title.trim().toLowerCase()}::${source.oneLineSummary.trim().toLowerCase()}`;
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, []);
      }
      duplicateGroups.get(key)?.push(source);
    }
    for (const group of duplicateGroups.values()) {
      if (group.length < 2) {
        continue;
      }
      const [primary, ...duplicates] = group.sort((a, b) => a.createdAt - b.createdAt);
      for (const duplicate of duplicates) {
        issues.push({
          lintId: `lint_duplicate_source_${duplicate.sourceId}`,
          issueType: 'duplicate',
          objectType: 'source',
          objectId: duplicate.sourceId,
          title: `资料“${duplicate.title}”疑似重复`,
          suggestion: `建议保留 ${primary.sourceId}，并处理重复项 ${duplicate.sourceId}。`,
          priority: 'medium',
          resolved: false,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return issues;
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(this.state, null, 2);
    this.persistChain = this.persistChain.then(() => fs.writeFile(this.dataPath, payload, 'utf8'));
    await this.persistChain;
  }
}
