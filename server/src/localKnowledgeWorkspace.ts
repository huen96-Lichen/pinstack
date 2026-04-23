import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SummaryResult } from '../../src/shared/ai/localModel/types';
import type { KnowledgeStore } from './knowledgeStore';
import type { KnowledgeDraftInsight } from './knowledgeHeuristics';
import type { ProjectRecord, SourceRecord, TopicRecord } from '../../src/shared/knowledge3';

interface WorkspaceSourceIndexItem {
  sourceId: string;
  title: string;
  contentType: SourceRecord['contentType'];
  entryMethod: SourceRecord['entryMethod'];
  sourcePlatform: string;
  sourceLink?: string;
  oneLineSummary: string;
  nextAction: string;
  reusable: boolean;
  keywords: string[];
  topicIds: string[];
  projectIds: string[];
  currentStatus: SourceRecord['currentStatus'];
  syncStatus: SourceRecord['syncStatus'];
  sourceFile: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceTopicIndexItem {
  topicId: string;
  name: string;
  description: string;
  currentConclusion: string;
  sourceIds: string[];
  projectIds: string[];
  topicFile: string;
  updatedAt: number;
}

interface WorkspaceProjectIndexItem {
  projectId: string;
  name: string;
  goal: string;
  currentVersion: string;
  status: ProjectRecord['status'];
  topicIds: string[];
  sourceIds: string[];
  projectFile: string;
  updatedAt: number;
}

interface WorkspaceDecisionIndexItem {
  decisionId: string;
  title: string;
  conclusion: string;
  projectId?: string;
  topicId?: string;
  decisionFile: string;
  updatedAt: number;
}

interface WorkspaceAssetIndexItem {
  assetId: string;
  name: string;
  assetType: string;
  usageScene: string;
  projectIds: string[];
  topicIds: string[];
  assetFile: string;
  updatedAt: number;
}

interface WorkspaceGraphNode {
  nodeId: string;
  nodeType: 'source' | 'topic' | 'project';
  label: string;
  refId: string;
  updatedAt: number;
}

interface WorkspaceGraphEdge {
  edgeId: string;
  edgeType: 'source-topic' | 'source-project' | 'topic-project' | 'topic-topic';
  from: string;
  to: string;
  updatedAt: number;
}

export interface WorkspaceSnapshot {
  workspaceRoot: string;
  generatedAt: number;
  counts: {
    sources: number;
    topics: number;
    projects: number;
    decisions: number;
    assets: number;
    nodes: number;
    edges: number;
  };
  indexes: {
    sources: WorkspaceSourceIndexItem[];
    topics: WorkspaceTopicIndexItem[];
    projects: WorkspaceProjectIndexItem[];
    decisions: WorkspaceDecisionIndexItem[];
    assets: WorkspaceAssetIndexItem[];
  };
  graph: {
    nodes: WorkspaceGraphNode[];
    edges: WorkspaceGraphEdge[];
  };
}

interface LocalKnowledgeWorkspaceOptions {
  storageRoot: string;
  workspaceRootOverride?: string;
}

const SOURCE_TYPES: SourceRecord['contentType'][] = ['text', 'web', 'image', 'video', 'audio', 'chat', 'doc'];

export class LocalKnowledgeWorkspace {
  private readonly workspaceRoot: string;
  private readonly systemRoot: string;
  private readonly rawRoot: string;
  private readonly knowledgeRoot: string;
  private readonly indexRoot: string;
  private readonly e4bLogPath: string;

  public constructor(options: LocalKnowledgeWorkspaceOptions) {
    this.workspaceRoot = options.workspaceRootOverride?.trim() || path.join(options.storageRoot, 'PinStack_3_Knowledge');
    this.systemRoot = path.join(this.workspaceRoot, '00_system');
    this.rawRoot = path.join(this.workspaceRoot, '01_raw_sources');
    this.knowledgeRoot = path.join(this.workspaceRoot, '02_knowledge');
    this.indexRoot = path.join(this.workspaceRoot, '03_index');
    this.e4bLogPath = path.join(this.systemRoot, 'logs', 'e4b_log.md');
  }

  public async init(): Promise<void> {
    await fs.mkdir(path.join(this.systemRoot, 'logs'), { recursive: true });
    await fs.mkdir(path.join(this.systemRoot, 'rules'), { recursive: true });
    await fs.mkdir(path.join(this.systemRoot, 'prompts'), { recursive: true });
    await fs.mkdir(path.join(this.systemRoot, 'schemas'), { recursive: true });

    for (const sourceType of SOURCE_TYPES) {
      await fs.mkdir(path.join(this.rawRoot, sourceType), { recursive: true });
    }

    await fs.mkdir(path.join(this.knowledgeRoot, 'topics'), { recursive: true });
    await fs.mkdir(path.join(this.knowledgeRoot, 'projects'), { recursive: true });
    await fs.mkdir(path.join(this.knowledgeRoot, 'decisions'), { recursive: true });
    await fs.mkdir(path.join(this.knowledgeRoot, 'assets'), { recursive: true });
    await fs.mkdir(path.join(this.knowledgeRoot, 'compare'), { recursive: true });

    await fs.mkdir(this.indexRoot, { recursive: true });

    await this.ensureJsonFile(path.join(this.systemRoot, 'workspace.json'), {
      workspaceName: 'PinStack_3_Knowledge',
      schemaVersion: 'v1',
      updatedAt: Date.now()
    });

    await this.ensureJsonFile(this.sourcesIndexPath(), []);
    await this.ensureJsonFile(this.topicsIndexPath(), []);
    await this.ensureJsonFile(this.projectsIndexPath(), []);
    await this.ensureJsonFile(this.decisionsIndexPath(), []);
    await this.ensureJsonFile(this.assetsIndexPath(), []);
    await this.ensureJsonFile(this.graphNodesPath(), []);
    await this.ensureJsonFile(this.graphEdgesPath(), []);
    await this.ensureJsonFile(this.graphPath(), {
      generatedAt: Date.now(),
      nodes: [],
      edges: []
    });

    await this.ensureTextFile(
      this.e4bLogPath,
      '# e4b 执行日志\n\n| 时间 | source_id | 标题 | 推荐主题 | 推荐项目 | 关键词 |\n| --- | --- | --- | --- | --- | --- |\n'
    );
  }

  public async syncFromStore(store: KnowledgeStore): Promise<void> {
    const state = store.getState();

    const sourceItems: WorkspaceSourceIndexItem[] = state.sources.map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      contentType: source.contentType,
      entryMethod: source.entryMethod,
      sourcePlatform: source.sourcePlatform,
      sourceLink: source.sourceLink,
      oneLineSummary: source.oneLineSummary,
      nextAction: source.nextAction,
      reusable: source.reusable,
      keywords: source.keywords,
      topicIds: source.topicIds,
      projectIds: source.projectIds,
      currentStatus: source.currentStatus,
      syncStatus: source.syncStatus,
      sourceFile: this.relativeSourcePath(source),
      createdAt: source.createdAt,
      updatedAt: source.updatedAt
    }));

    const topicItems: WorkspaceTopicIndexItem[] = state.topics.map((topic) => ({
      topicId: topic.topicId,
      name: topic.name,
      description: topic.description,
      currentConclusion: topic.currentConclusion,
      sourceIds: topic.sourceIds,
      projectIds: topic.projectIds,
      topicFile: this.relativeTopicPath(topic),
      updatedAt: topic.updatedAt
    }));

    const projectItems: WorkspaceProjectIndexItem[] = state.projects.map((project) => ({
      projectId: project.projectId,
      name: project.name,
      goal: project.goal,
      currentVersion: project.currentVersion,
      status: project.status,
      topicIds: project.topicIds,
      sourceIds: project.sourceIds,
      projectFile: this.relativeProjectPath(project),
      updatedAt: project.updatedAt
    }));

    const decisionItems: WorkspaceDecisionIndexItem[] = state.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      title: decision.title,
      conclusion: decision.conclusion,
      projectId: decision.projectId,
      topicId: decision.topicId,
      decisionFile: this.relativeDecisionPath(decision.decisionId, decision.title),
      updatedAt: decision.updatedAt
    }));

    const assetItems: WorkspaceAssetIndexItem[] = state.assets.map((asset) => ({
      assetId: asset.assetId,
      name: asset.name,
      assetType: asset.assetType,
      usageScene: asset.usageScene,
      projectIds: asset.projectIds,
      topicIds: asset.topicIds,
      assetFile: this.relativeAssetPath(asset.assetId, asset.name),
      updatedAt: asset.updatedAt
    }));

    const nodes = this.buildGraphNodes(sourceItems, topicItems, projectItems);
    const edges = this.buildGraphEdges(sourceItems, topicItems, projectItems);

    await this.writeJson(this.sourcesIndexPath(), sourceItems);
    await this.writeJson(this.topicsIndexPath(), topicItems);
    await this.writeJson(this.projectsIndexPath(), projectItems);
    await this.writeJson(this.decisionsIndexPath(), decisionItems);
    await this.writeJson(this.assetsIndexPath(), assetItems);
    await this.writeJson(this.graphNodesPath(), nodes);
    await this.writeJson(this.graphEdgesPath(), edges);
    await this.writeJson(this.graphPath(), {
      generatedAt: Date.now(),
      nodes,
      edges
    });

    for (const source of state.sources) {
      const sourceMarkdownPath = path.join(this.workspaceRoot, this.relativeSourcePath(source));
      await fs.mkdir(path.dirname(sourceMarkdownPath), { recursive: true });
      await fs.writeFile(
        sourceMarkdownPath,
        this.buildSourceMarkdown({
          source,
          insight: {
            oneLineSummary: source.oneLineSummary,
            coreConclusion: source.coreConclusion,
            keywords: source.keywords,
            topicName: undefined,
            projectName: undefined,
            nextAction: source.nextAction,
            reusable: source.reusable
          },
          summaryResult: {
            summary: source.oneLineSummary,
            category: '待处理',
            keyword: source.keywords[0] || '待整理',
            confidence: 0.5,
            source: 'localModel'
          }
        }),
        'utf8'
      );
    }

    for (const topic of state.topics) {
      const topicMarkdownPath = path.join(this.workspaceRoot, this.relativeTopicPath(topic));
      await fs.mkdir(path.dirname(topicMarkdownPath), { recursive: true });
      await fs.writeFile(topicMarkdownPath, this.buildTopicMarkdown(topic), 'utf8');
    }

    for (const project of state.projects) {
      const projectMarkdownPath = path.join(this.workspaceRoot, this.relativeProjectPath(project));
      await fs.mkdir(path.dirname(projectMarkdownPath), { recursive: true });
      await fs.writeFile(projectMarkdownPath, this.buildProjectMarkdown(project), 'utf8');
    }

    for (const decision of state.decisions) {
      const decisionMarkdownPath = path.join(this.workspaceRoot, this.relativeDecisionPath(decision.decisionId, decision.title));
      await fs.mkdir(path.dirname(decisionMarkdownPath), { recursive: true });
      await fs.writeFile(decisionMarkdownPath, this.buildDecisionMarkdown(decision), 'utf8');
    }

    for (const asset of state.assets) {
      const assetMarkdownPath = path.join(this.workspaceRoot, this.relativeAssetPath(asset.assetId, asset.name));
      await fs.mkdir(path.dirname(assetMarkdownPath), { recursive: true });
      await fs.writeFile(assetMarkdownPath, this.buildAssetMarkdown(asset), 'utf8');
    }
  }

  public async persistIngest(input: {
    source: SourceRecord;
    insight: KnowledgeDraftInsight;
    summaryResult: SummaryResult;
    topic?: TopicRecord;
    project?: ProjectRecord;
  }): Promise<void> {
    const sourceMarkdownPath = path.join(this.workspaceRoot, this.relativeSourcePath(input.source));
    await fs.mkdir(path.dirname(sourceMarkdownPath), { recursive: true });
    await fs.writeFile(sourceMarkdownPath, this.buildSourceMarkdown(input), 'utf8');

    if (input.topic) {
      const topicMarkdownPath = path.join(this.workspaceRoot, this.relativeTopicPath(input.topic));
      await fs.mkdir(path.dirname(topicMarkdownPath), { recursive: true });
      await fs.writeFile(topicMarkdownPath, this.buildTopicMarkdown(input.topic), 'utf8');
    }

    if (input.project) {
      const projectMarkdownPath = path.join(this.workspaceRoot, this.relativeProjectPath(input.project));
      await fs.mkdir(path.dirname(projectMarkdownPath), { recursive: true });
      await fs.writeFile(projectMarkdownPath, this.buildProjectMarkdown(input.project), 'utf8');
    }

    const sources = await this.readJson<WorkspaceSourceIndexItem[]>(this.sourcesIndexPath(), []);
    const nextSources = this.upsertById(sources, {
      sourceId: input.source.sourceId,
      title: input.source.title,
      contentType: input.source.contentType,
      entryMethod: input.source.entryMethod,
      sourcePlatform: input.source.sourcePlatform,
      sourceLink: input.source.sourceLink,
      oneLineSummary: input.source.oneLineSummary,
      nextAction: input.source.nextAction,
      reusable: input.source.reusable,
      keywords: input.source.keywords,
      topicIds: input.source.topicIds,
      projectIds: input.source.projectIds,
      currentStatus: input.source.currentStatus,
      syncStatus: input.source.syncStatus,
      sourceFile: this.relativeSourcePath(input.source),
      createdAt: input.source.createdAt,
      updatedAt: input.source.updatedAt
    }, 'sourceId');
    await this.writeJson(this.sourcesIndexPath(), nextSources);

    if (input.topic) {
      const topics = await this.readJson<WorkspaceTopicIndexItem[]>(this.topicsIndexPath(), []);
      const nextTopics = this.upsertById(topics, {
        topicId: input.topic.topicId,
        name: input.topic.name,
        description: input.topic.description,
        currentConclusion: input.topic.currentConclusion,
        sourceIds: input.topic.sourceIds,
        projectIds: input.topic.projectIds,
        topicFile: this.relativeTopicPath(input.topic),
        updatedAt: input.topic.updatedAt
      }, 'topicId');
      await this.writeJson(this.topicsIndexPath(), nextTopics);
    }

    if (input.project) {
      const projects = await this.readJson<WorkspaceProjectIndexItem[]>(this.projectsIndexPath(), []);
      const nextProjects = this.upsertById(projects, {
        projectId: input.project.projectId,
        name: input.project.name,
        goal: input.project.goal,
        currentVersion: input.project.currentVersion,
        status: input.project.status,
        topicIds: input.project.topicIds,
        sourceIds: input.project.sourceIds,
        projectFile: this.relativeProjectPath(input.project),
        updatedAt: input.project.updatedAt
      }, 'projectId');
      await this.writeJson(this.projectsIndexPath(), nextProjects);
    }

    const topics = await this.readJson<WorkspaceTopicIndexItem[]>(this.topicsIndexPath(), []);
    const projects = await this.readJson<WorkspaceProjectIndexItem[]>(this.projectsIndexPath(), []);
    const nodes = this.buildGraphNodes(nextSources, topics, projects);
    const edges = this.buildGraphEdges(nextSources, topics, projects);
    await this.writeJson(this.graphNodesPath(), nodes);
    await this.writeJson(this.graphEdgesPath(), edges);
    await this.writeJson(this.graphPath(), {
      generatedAt: Date.now(),
      nodes,
      edges
    });

    const logLine = `| ${new Date().toISOString()} | ${input.source.sourceId} | ${escapeTable(input.source.title)} | ${escapeTable(input.topic?.name || input.insight.topicName || '-')} | ${escapeTable(input.project?.name || input.insight.projectName || '-')} | ${escapeTable(input.source.keywords.join(', '))} |\n`;
    await fs.appendFile(this.e4bLogPath, logLine, 'utf8');
  }

  public async getSnapshot(): Promise<WorkspaceSnapshot> {
    const sources = await this.readJson<WorkspaceSourceIndexItem[]>(this.sourcesIndexPath(), []);
    const topics = await this.readJson<WorkspaceTopicIndexItem[]>(this.topicsIndexPath(), []);
    const projects = await this.readJson<WorkspaceProjectIndexItem[]>(this.projectsIndexPath(), []);
    const decisions = await this.readJson<WorkspaceDecisionIndexItem[]>(this.decisionsIndexPath(), []);
    const assets = await this.readJson<WorkspaceAssetIndexItem[]>(this.assetsIndexPath(), []);
    const nodes = await this.readJson<WorkspaceGraphNode[]>(this.graphNodesPath(), []);
    const edges = await this.readJson<WorkspaceGraphEdge[]>(this.graphEdgesPath(), []);

    return {
      workspaceRoot: this.workspaceRoot,
      generatedAt: Date.now(),
      counts: {
        sources: sources.length,
        topics: topics.length,
        projects: projects.length,
        decisions: decisions.length,
        assets: assets.length,
        nodes: nodes.length,
        edges: edges.length
      },
      indexes: {
        sources,
        topics,
        projects,
        decisions,
        assets
      },
      graph: {
        nodes,
        edges
      }
    };
  }

  private relativeSourcePath(source: SourceRecord): string {
    const title = slugify(source.title).slice(0, 48);
    return path.join('01_raw_sources', source.contentType, `${source.sourceId}_${title || 'source'}.md`);
  }

  private relativeTopicPath(topic: TopicRecord): string {
    const name = slugify(topic.name).slice(0, 48);
    return path.join('02_knowledge', 'topics', `${topic.topicId}_${name || 'topic'}.md`);
  }

  private relativeProjectPath(project: ProjectRecord): string {
    const name = slugify(project.name).slice(0, 48);
    return path.join('02_knowledge', 'projects', `${project.projectId}_${name || 'project'}.md`);
  }

  private relativeDecisionPath(decisionId: string, title: string): string {
    const name = slugify(title).slice(0, 48);
    return path.join('02_knowledge', 'decisions', `${decisionId}_${name || 'decision'}.md`);
  }

  private relativeAssetPath(assetId: string, nameValue: string): string {
    const name = slugify(nameValue).slice(0, 48);
    return path.join('02_knowledge', 'assets', `${assetId}_${name || 'asset'}.md`);
  }

  private buildSourceMarkdown(input: {
    source: SourceRecord;
    insight: KnowledgeDraftInsight;
    summaryResult: SummaryResult;
    topic?: TopicRecord;
    project?: ProjectRecord;
  }): string {
    const { source } = input;
    const lines = [
      `# ${source.title}`,
      '',
      '## 基本信息',
      `- source_id: ${source.sourceId}`,
      `- type: ${source.contentType}`,
      `- input_method: ${source.entryMethod}`,
      `- source_platform: ${source.sourcePlatform}`,
      `- source_url: ${source.sourceLink ?? ''}`,
      `- created_at: ${new Date(source.createdAt).toISOString()}`,
      `- updated_at: ${new Date(source.updatedAt).toISOString()}`,
      `- sync_status: ${source.syncStatus}`,
      '',
      '## 一句话摘要',
      source.oneLineSummary || input.summaryResult.summary || '待补充',
      '',
      '## 核心要点',
      ...toListItems(splitKeyPoints(source.coreConclusion || source.oneLineSummary)),
      '',
      '## e4b 初步归纳',
      `- 推荐主题: ${input.topic?.name || input.insight.topicName || '-'}`,
      `- 推荐项目: ${input.project?.name || input.insight.projectName || '-'}`,
      `- 推荐下一步: ${input.insight.nextAction || source.nextAction}`,
      `- 是否值得沉淀: ${input.insight.reusable ? '是' : '否'}`,
      '',
      '## 关联',
      `- topics: ${(input.topic ? [input.topic.topicId] : source.topicIds).join(', ') || '-'}`,
      `- projects: ${(input.project ? [input.project.projectId] : source.projectIds).join(', ') || '-'}`,
      '- decisions: -',
      '- assets: -',
      ''
    ];
    return lines.join('\n');
  }

  private buildTopicMarkdown(topic: TopicRecord): string {
    return [
      `# ${topic.name}`,
      '',
      '## 主题概述',
      topic.description || '待补充',
      '',
      '## 当前结论',
      topic.currentConclusion || '待补充',
      '',
      '## 关键依据',
      ...toListItems(topic.sourceIds.map((sourceId) => `[[${sourceId}]]`)),
      '',
      '## 相关项目',
      ...toListItems(topic.projectIds.map((projectId) => `[[${projectId}]]`)),
      '',
      '## 未解决问题',
      ...toListItems(topic.openQuestions),
      ''
    ].join('\n');
  }

  private buildProjectMarkdown(project: ProjectRecord): string {
    return [
      `# ${project.name}`,
      '',
      '## 项目目标',
      project.goal || '待补充',
      '',
      '## 当前版本',
      project.currentVersion || '3.0-alpha',
      '',
      '## 当前重点',
      '待补充',
      '',
      '## 关联主题',
      ...toListItems(project.topicIds.map((topicId) => `[[${topicId}]]`)),
      '',
      '## 关键资料',
      ...toListItems(project.sourceIds.map((sourceId) => `[[${sourceId}]]`)),
      ''
    ].join('\n');
  }

  private buildDecisionMarkdown(decision: {
    decisionId: string;
    title: string;
    background: string;
    conclusion: string;
    reasons: string[];
    impactScope: string;
    alternatives: string[];
    nextActions: string[];
    sourceIds: string[];
    topicId?: string;
    projectId?: string;
    updatedAt: number;
  }): string {
    return [
      `# ${decision.title}`,
      '',
      '## 决策背景',
      decision.background || '待补充',
      '',
      '## 结论',
      decision.conclusion || '待补充',
      '',
      '## 原因',
      ...toListItems(decision.reasons),
      '',
      '## 影响范围',
      decision.impactScope || '待补充',
      '',
      '## 可选方案',
      ...toListItems(decision.alternatives),
      '',
      '## 下一步',
      ...toListItems(decision.nextActions),
      '',
      '## 关联',
      `- topic: ${decision.topicId || '-'}`,
      `- project: ${decision.projectId || '-'}`,
      `- sources: ${decision.sourceIds.join(', ') || '-'}`,
      `- updated_at: ${new Date(decision.updatedAt).toISOString()}`,
      ''
    ].join('\n');
  }

  private buildAssetMarkdown(asset: {
    assetId: string;
    name: string;
    assetType: string;
    usageScene: string;
    sourceIds: string[];
    topicIds: string[];
    projectIds: string[];
    version: string;
    versionNote?: string;
    updatedAt: number;
  }): string {
    return [
      `# ${asset.name}`,
      '',
      '## 内容说明',
      asset.usageScene || '待补充',
      '',
      '## 使用场景',
      '待补充',
      '',
      '## 类型与版本',
      `- type: ${asset.assetType}`,
      `- version: ${asset.version || 'v0.1'}`,
      `- note: ${asset.versionNote || '-'}`,
      '',
      '## 关联',
      `- topics: ${asset.topicIds.join(', ') || '-'}`,
      `- projects: ${asset.projectIds.join(', ') || '-'}`,
      `- sources: ${asset.sourceIds.join(', ') || '-'}`,
      `- updated_at: ${new Date(asset.updatedAt).toISOString()}`,
      ''
    ].join('\n');
  }

  private buildGraphNodes(
    sources: WorkspaceSourceIndexItem[],
    topics: WorkspaceTopicIndexItem[],
    projects: WorkspaceProjectIndexItem[]
  ): WorkspaceGraphNode[] {
    const sourceNodes: WorkspaceGraphNode[] = sources.map((source) => ({
      nodeId: `node_source_${source.sourceId}`,
      nodeType: 'source',
      label: source.title,
      refId: source.sourceId,
      updatedAt: source.updatedAt
    }));
    const topicNodes: WorkspaceGraphNode[] = topics.map((topic) => ({
      nodeId: `node_topic_${topic.topicId}`,
      nodeType: 'topic',
      label: topic.name,
      refId: topic.topicId,
      updatedAt: topic.updatedAt
    }));
    const projectNodes: WorkspaceGraphNode[] = projects.map((project) => ({
      nodeId: `node_project_${project.projectId}`,
      nodeType: 'project',
      label: project.name,
      refId: project.projectId,
      updatedAt: project.updatedAt
    }));
    return [...sourceNodes, ...topicNodes, ...projectNodes];
  }

  private buildGraphEdges(
    sources: WorkspaceSourceIndexItem[],
    topics: WorkspaceTopicIndexItem[],
    projects: WorkspaceProjectIndexItem[]
  ): WorkspaceGraphEdge[] {
    const edges: WorkspaceGraphEdge[] = [];

    for (const source of sources) {
      for (const topicId of source.topicIds) {
        edges.push({
          edgeId: `edge_st_${source.sourceId}_${topicId}`,
          edgeType: 'source-topic',
          from: `node_source_${source.sourceId}`,
          to: `node_topic_${topicId}`,
          updatedAt: source.updatedAt
        });
      }
      for (const projectId of source.projectIds) {
        edges.push({
          edgeId: `edge_sp_${source.sourceId}_${projectId}`,
          edgeType: 'source-project',
          from: `node_source_${source.sourceId}`,
          to: `node_project_${projectId}`,
          updatedAt: source.updatedAt
        });
      }
    }

    for (const project of projects) {
      for (const topicId of project.topicIds) {
        if (!topics.some((topic) => topic.topicId === topicId)) {
          continue;
        }
        edges.push({
          edgeId: `edge_tp_${topicId}_${project.projectId}`,
          edgeType: 'topic-project',
          from: `node_topic_${topicId}`,
          to: `node_project_${project.projectId}`,
          updatedAt: project.updatedAt
        });
      }
    }

    for (let index = 0; index < topics.length; index += 1) {
      const left = topics[index];
      if (!left) continue;
      const leftSourceSet = new Set(left.sourceIds);
      for (let rightIndex = index + 1; rightIndex < topics.length; rightIndex += 1) {
        const right = topics[rightIndex];
        if (!right) continue;
        const sharedSources = right.sourceIds.filter((sourceId) => leftSourceSet.has(sourceId));
        const sharedProjects = right.projectIds.filter((projectId) => left.projectIds.includes(projectId));
        if (sharedSources.length === 0 && sharedProjects.length === 0) {
          continue;
        }
        edges.push({
          edgeId: `edge_tt_${left.topicId}_${right.topicId}`,
          edgeType: 'topic-topic',
          from: `node_topic_${left.topicId}`,
          to: `node_topic_${right.topicId}`,
          updatedAt: Math.max(left.updatedAt, right.updatedAt)
        });
      }
    }

    return edges;
  }

  private sourcesIndexPath(): string {
    return path.join(this.indexRoot, 'sources.json');
  }

  private topicsIndexPath(): string {
    return path.join(this.indexRoot, 'topics.json');
  }

  private projectsIndexPath(): string {
    return path.join(this.indexRoot, 'projects.json');
  }

  private decisionsIndexPath(): string {
    return path.join(this.indexRoot, 'decisions.json');
  }

  private assetsIndexPath(): string {
    return path.join(this.indexRoot, 'assets.json');
  }

  private graphNodesPath(): string {
    return path.join(this.indexRoot, 'graph_nodes.json');
  }

  private graphEdgesPath(): string {
    return path.join(this.indexRoot, 'graph_edges.json');
  }

  private graphPath(): string {
    return path.join(this.indexRoot, 'graph.json');
  }

  private async ensureJsonFile(filePath: string, fallback: unknown): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      await this.writeJson(filePath, fallback);
    }
  }

  private async ensureTextFile(filePath: string, fallback: string): Promise<void> {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, fallback, 'utf8');
    }
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(filePath: string, payload: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  private upsertById<T, K extends keyof T>(items: T[], item: T, idKey: K): T[] {
    const idValue = item[idKey];
    const next = [...items];
    const index = next.findIndex((current) => current[idKey] === idValue);
    if (index >= 0) {
      next[index] = item;
      return next;
    }
    next.unshift(item);
    return next;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitKeyPoints(value: string): string[] {
  return value
    .split(/[。.!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function toListItems(values: string[]): string[] {
  if (values.length === 0) {
    return ['- -'];
  }
  return values.map((value) => `- ${value}`);
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '¦').trim();
}
