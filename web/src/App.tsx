import { useEffect, useMemo, useState } from 'react';
import type {
  AssetRecord,
  AskAiAnswer,
  DecisionRecord,
  KnowledgeRuntimeStatus,
  LintIssue,
  ProjectRecord,
  SourceRecord,
  TopicRecord
} from '../../src/shared/knowledge3';
import type { InboxItemType } from '../../src/shared/pinosV1';

type PageKey = 'workspace' | 'inbox' | 'topics' | 'projects' | 'decisions' | 'assets' | 'graph' | 'ai';
type CaptureType = InboxItemType | 'video' | 'audio' | 'template';

type TimeRangeKey = 'all' | '7d' | '30d';

const API_BASE_URL = (import.meta.env.VITE_PINSTACK_API_BASE_URL as string | undefined)?.trim() || 'http://127.0.0.1:4860';

interface WorkspaceSourceSnapshot {
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

interface WorkspaceTopicSnapshot {
  topicId: string;
  name: string;
  description: string;
  currentConclusion: string;
  sourceIds: string[];
  projectIds: string[];
  topicFile: string;
  updatedAt: number;
}

interface WorkspaceProjectSnapshot {
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

interface WorkspaceDecisionSnapshot {
  decisionId: string;
  title: string;
  conclusion: string;
  projectId?: string;
  topicId?: string;
  decisionFile: string;
  updatedAt: number;
}

interface WorkspaceAssetSnapshot {
  assetId: string;
  name: string;
  assetType: string;
  usageScene: string;
  projectIds: string[];
  topicIds: string[];
  assetFile: string;
  updatedAt: number;
}

interface WorkspaceGraphNodeSnapshot {
  nodeId: string;
  nodeType: 'source' | 'topic' | 'project';
  label: string;
  refId: string;
  updatedAt: number;
}

interface WorkspaceGraphEdgeSnapshot {
  edgeId: string;
  edgeType: 'source-topic' | 'source-project' | 'topic-project' | 'topic-topic';
  from: string;
  to: string;
  updatedAt: number;
}

interface WorkspaceSnapshot {
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
    sources: WorkspaceSourceSnapshot[];
    topics: WorkspaceTopicSnapshot[];
    projects: WorkspaceProjectSnapshot[];
    decisions: WorkspaceDecisionSnapshot[];
    assets: WorkspaceAssetSnapshot[];
  };
  graph: {
    nodes: WorkspaceGraphNodeSnapshot[];
    edges: WorkspaceGraphEdgeSnapshot[];
  };
}

const PAGE_META: Array<{
  key: PageKey;
  navLabel: string;
  title: string;
  subtitle: string;
}> = [
  {
    key: 'workspace',
    navLabel: '知识工作台',
    title: '知识工作台',
    subtitle: '采集 → 理解 → 关联 → 决策 → 复用'
  },
  {
    key: 'inbox',
    navLabel: '待整理',
    title: '待整理',
    subtitle: '刚进入系统、还未进一步挂接与沉淀的内容'
  },
  {
    key: 'topics',
    navLabel: '主题库',
    title: '主题库',
    subtitle: '按问题和方向整理后的知识主题'
  },
  {
    key: 'projects',
    navLabel: '项目库',
    title: '项目库',
    subtitle: '与具体推进任务相关的知识集合'
  },
  {
    key: 'decisions',
    navLabel: '决策记录',
    title: '决策记录',
    subtitle: '记录为什么这样做，以及做过哪些关键判断'
  },
  {
    key: 'assets',
    navLabel: '可复用内容',
    title: '可复用内容',
    subtitle: '可直接再次使用的模板、规范与方法'
  },
  {
    key: 'graph',
    navLabel: '关系图谱',
    title: '关系图谱',
    subtitle: '查看主题、项目与内容之间的连接关系'
  },
  {
    key: 'ai',
    navLabel: 'AI 问答',
    title: 'AI 问答',
    subtitle: '基于知识层发问，并将高价值回答继续沉淀'
  }
];

const ENTRY_METHOD_LABEL: Record<SourceRecord['entryMethod'], string> = {
  clipboard: '剪贴板',
  web_import: '网页导入',
  image_capture: '截图导入',
  video_import: '视频导入',
  audio_note: '语音记录',
  template: '模板录入',
  directory_scan: '目录扫描'
};

const SOURCE_STATUS_LABEL: Record<SourceRecord['currentStatus'], string> = {
  Inbox: '待整理',
  Collected: '已收集',
  Processed: '已处理',
  Linked: '已关联',
  Reusable: '可复用',
  Archived: '已归档'
};

const CONTENT_TYPE_LABEL: Record<SourceRecord['contentType'], string> = {
  text: '文本',
  web: '网页',
  image: '图片',
  video: '视频',
  audio: '音频',
  chat: '对话',
  doc: '文档'
};

const PROJECT_STATUS_LABEL: Record<ProjectRecord['status'], string> = {
  active: '进行中',
  paused: '暂停',
  done: '已完成'
};

const ASSET_TYPE_LABEL: Record<AssetRecord['assetType'], string> = {
  prompt: 'Prompt 模板',
  spec: '规范文档',
  workflow: '工作流',
  guideline: '指南',
  template: '模板',
  other: '其他'
};

function pageMetaByKey(key: PageKey) {
  return PAGE_META.find((item) => item.key === key) ?? PAGE_META[0];
}

async function fetchJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

function formatDateTime(timestamp?: number): string {
  if (!timestamp) return '未知';
  return new Date(timestamp).toLocaleString();
}

function stableTrim(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return stableTrim(value).toLowerCase();
}

function sortByUpdatedAtDesc<T extends { updatedAt: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

function countRecentByDays(items: Array<{ createdAt?: number; updatedAt?: number }>, days: number): number {
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => (item.createdAt ?? item.updatedAt ?? 0) >= threshold).length;
}

function statusBadgeClass(status: SourceRecord['currentStatus']): string {
  if (status === 'Inbox') return 'badge badge-warn';
  if (status === 'Linked' || status === 'Reusable' || status === 'Processed') return 'badge badge-ok';
  return 'badge badge-neutral';
}

function keywordOverlapScore(source: WorkspaceSourceSnapshot, topic: WorkspaceTopicSnapshot): number {
  const sourceTerms = normalizeText(`${source.title} ${source.oneLineSummary} ${source.keywords.join(' ')}`);
  const topicTerms = normalizeText(`${topic.name} ${topic.description} ${topic.currentConclusion}`);
  let score = 0;
  for (const keyword of source.keywords) {
    const normalized = normalizeText(keyword);
    if (!normalized) continue;
    if (topicTerms.includes(normalized)) score += 2;
    if (sourceTerms.includes(normalized) && normalizeText(topic.name).includes(normalized)) score += 1;
  }
  if (sourceTerms.includes(normalizeText(topic.name))) score += 1;
  return score;
}

export function App(): JSX.Element {
  const [activePage, setActivePage] = useState<PageKey>('workspace');
  const [status, setStatus] = useState<KnowledgeRuntimeStatus | null>(null);

  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [topics, setTopics] = useState<TopicRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [workspaceSnapshotLoading, setWorkspaceSnapshotLoading] = useState(false);
  const [workspaceSnapshotError, setWorkspaceSnapshotError] = useState<string | null>(null);

  const [captureType, setCaptureType] = useState<CaptureType>('text');
  const [captureTitle, setCaptureTitle] = useState('');
  const [captureSourceUrl, setCaptureSourceUrl] = useState('');
  const [captureBody, setCaptureBody] = useState('');
  const [captureMethod, setCaptureMethod] = useState('手动录入');

  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [question, setQuestion] = useState('我最近主要在推进什么？');
  const [selectedAskTopicId, setSelectedAskTopicId] = useState('');
  const [selectedAskProjectId, setSelectedAskProjectId] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all');
  const [askResult, setAskResult] = useState<AskAiAnswer | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentMeta = pageMetaByKey(activePage);

  const activeTopics = useMemo(() => topics.filter((item) => item.lifecycle === 'active'), [topics]);
  const activeProjects = useMemo(() => projects.filter((item) => item.lifecycle === 'active'), [projects]);

  const topicById = useMemo(() => new Map(topics.map((item) => [item.topicId, item])), [topics]);

  const loadAll = async (): Promise<void> => {
    setLoading(true);
    setWorkspaceSnapshotLoading(true);
    setError(null);
    try {
      const [health, nextSources, nextTopics, nextProjects, nextDecisions, nextAssets, nextLint] = await Promise.all([
        fetchJson<KnowledgeRuntimeStatus>('/health'),
        fetchJson<SourceRecord[]>('/sources'),
        fetchJson<TopicRecord[]>('/topics'),
        fetchJson<ProjectRecord[]>('/projects'),
        fetchJson<DecisionRecord[]>('/decisions'),
        fetchJson<AssetRecord[]>('/assets'),
        fetchJson<LintIssue[]>('/lint/issues')
      ]);
      setStatus(health);
      setSources(nextSources);
      setTopics(nextTopics);
      setProjects(nextProjects);
      setDecisions(nextDecisions);
      setAssets(nextAssets);
      setLintIssues(nextLint);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }

    try {
      const nextSnapshot = await fetchJson<WorkspaceSnapshot>('/workspace/snapshot');
      setWorkspaceSnapshot(nextSnapshot);
      setWorkspaceSnapshotError(null);
    } catch (snapshotError) {
      setWorkspaceSnapshotError(snapshotError instanceof Error ? snapshotError.message : '快照加载失败');
    } finally {
      setWorkspaceSnapshotLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const resetNotice = () => {
    window.setTimeout(() => setNotice(null), 1800);
  };

  const submitCapture = async (): Promise<void> => {
    if (!stableTrim(captureBody) && !stableTrim(captureTitle) && !stableTrim(captureSourceUrl)) {
      setError('请输入标题、链接或正文中的至少一项。');
      return;
    }

    try {
      setError(null);
      await fetchJson('/ingest/capture', {
        method: 'POST',
        body: JSON.stringify({
          type: captureType,
          title: stableTrim(captureTitle) || undefined,
          contentText: stableTrim(captureBody) || undefined,
          sourceUrl: stableTrim(captureSourceUrl) || undefined,
          sourcePlatform: stableTrim(captureMethod) || '手动录入'
        })
      });
      setCaptureTitle('');
      setCaptureSourceUrl('');
      setCaptureBody('');
      setNotice('已加入待整理');
      resetNotice();
      await loadAll();
      setActivePage('inbox');
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : '加入待整理失败');
    }
  };

  const attachSourceToTopic = async (sourceId: string): Promise<void> => {
    try {
      const topicInput = window.prompt('输入要挂接的主题名称（已存在则复用，不存在则新建）');
      if (!topicInput?.trim()) return;
      const normalizedName = normalizeText(topicInput);
      const matched = activeTopics.find((item) => normalizeText(item.name) === normalizedName);
      const topicId = matched
        ? matched.topicId
        : (
            await fetchJson<TopicRecord>('/topics', {
              method: 'POST',
              body: JSON.stringify({ name: stableTrim(topicInput) })
            })
          ).topicId;

      await fetchJson(`/sources/${encodeURIComponent(sourceId)}/topics`, {
        method: 'POST',
        body: JSON.stringify({ topicId })
      });
      setNotice('已挂接到主题');
      resetNotice();
      await loadAll();
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : '挂接主题失败');
    }
  };

  const attachSourceToProject = async (sourceId: string): Promise<void> => {
    try {
      const projectInput = window.prompt('输入要挂接的项目名称（已存在则复用，不存在则新建）');
      if (!projectInput?.trim()) return;
      const normalizedName = normalizeText(projectInput);
      const matched = activeProjects.find((item) => normalizeText(item.name) === normalizedName);
      const projectId = matched
        ? matched.projectId
        : (
            await fetchJson<ProjectRecord>('/projects', {
              method: 'POST',
              body: JSON.stringify({ name: stableTrim(projectInput) })
            })
          ).projectId;

      await fetchJson(`/sources/${encodeURIComponent(sourceId)}/projects`, {
        method: 'POST',
        body: JSON.stringify({ projectId })
      });
      setNotice('已挂接到项目');
      resetNotice();
      await loadAll();
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : '挂接项目失败');
    }
  };

  const markSourceProcessed = async (sourceId: string): Promise<void> => {
    try {
      await fetchJson(`/sources/${encodeURIComponent(sourceId)}/status`, {
        method: 'POST',
        body: JSON.stringify({ currentStatus: 'Processed' })
      });
      setNotice('已标记为已处理');
      resetNotice();
      await loadAll();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '标记失败');
    }
  };

  const resyncSource = async (sourceId: string): Promise<void> => {
    try {
      await fetchJson(`/sources/${encodeURIComponent(sourceId)}/resync`, { method: 'POST' });
      setNotice('已触发重新同步');
      resetNotice();
      await loadAll();
    } catch (resyncError) {
      setError(resyncError instanceof Error ? resyncError.message : '重新同步失败');
    }
  };

  const copySourceId = async (sourceId: string): Promise<void> => {
    await navigator.clipboard.writeText(sourceId);
    setNotice('source_id 已复制');
    resetNotice();
  };

  const runAsk = async (): Promise<void> => {
    if (!stableTrim(question)) {
      setError('请输入问题。');
      return;
    }
    const now = Date.now();
    const from = timeRange === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : timeRange === '30d' ? now - 30 * 24 * 60 * 60 * 1000 : undefined;
    const to = timeRange === 'all' ? undefined : now;

    try {
      setError(null);
      const answer = await fetchJson<AskAiAnswer>('/ask-ai', {
        method: 'POST',
        body: JSON.stringify({
          query: stableTrim(question),
          topicId: selectedAskTopicId || undefined,
          projectId: selectedAskProjectId || undefined,
          from,
          to
        })
      });
      setAskResult(answer);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : '提问失败');
    }
  };

  const depositAnswerToTopic = async (): Promise<void> => {
    if (!askResult?.answer?.trim()) {
      setError('当前没有可沉淀的回答。');
      return;
    }
    if (!selectedAskTopicId) {
      setError('请先选择一个主题。');
      return;
    }
    try {
      await fetchJson(`/topics/${encodeURIComponent(selectedAskTopicId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ currentConclusion: askResult.answer })
      });
      setNotice('已沉淀为主题补充');
      resetNotice();
      await loadAll();
    } catch (depositError) {
      setError(depositError instanceof Error ? depositError.message : '沉淀到主题失败');
    }
  };

  const depositAnswerToDecision = async (): Promise<void> => {
    if (!askResult?.answer?.trim()) {
      setError('当前没有可沉淀的回答。');
      return;
    }
    try {
      await fetchJson('/decisions/draft', {
        method: 'POST',
        body: JSON.stringify({
          title: `AI 判断 / ${stableTrim(question).slice(0, 20) || '新问题'}`,
          conclusion: askResult.answer,
          topicId: selectedAskTopicId || undefined,
          projectId: selectedAskProjectId || undefined,
          reasons: askResult.evidence.map((item) => `${item.kind}: ${item.title}`).slice(0, 5)
        })
      });
      setNotice('已沉淀为决策记录');
      resetNotice();
      await loadAll();
      setActivePage('decisions');
    } catch (depositError) {
      setError(depositError instanceof Error ? depositError.message : '沉淀为决策失败');
    }
  };

  const depositAnswerToAsset = async (): Promise<void> => {
    if (!askResult?.answer?.trim()) {
      setError('当前没有可沉淀的回答。');
      return;
    }
    try {
      await fetchJson('/assets/draft', {
        method: 'POST',
        body: JSON.stringify({
          name: `AI 可复用条目 / ${stableTrim(question).slice(0, 20) || '新问题'}`,
          usageScene: '来自 AI 问答沉淀，可直接复用',
          content: askResult.answer,
          topicId: selectedAskTopicId || undefined,
          projectId: selectedAskProjectId || undefined,
          assetType: 'workflow'
        })
      });
      setNotice('已沉淀为可复用内容');
      resetNotice();
      await loadAll();
      setActivePage('assets');
    } catch (depositError) {
      setError(depositError instanceof Error ? depositError.message : '沉淀为可复用内容失败');
    }
  };

  const recentInboxCandidates = useMemo(() => {
    return sortByUpdatedAtDesc(
      sources.filter((item) => item.currentStatus === 'Inbox' || item.currentStatus === 'Collected' || item.currentStatus === 'Processed')
    ).slice(0, 8);
  }, [sources]);

  const workspaceTopics = useMemo(() => sortByUpdatedAtDesc(activeTopics).slice(0, 6), [activeTopics]);
  const workspaceProjects = useMemo(() => sortByUpdatedAtDesc(activeProjects).slice(0, 6), [activeProjects]);

  const snapshotSources = workspaceSnapshot?.indexes.sources ?? [];
  const snapshotTopics = workspaceSnapshot?.indexes.topics ?? [];
  const snapshotProjects = workspaceSnapshot?.indexes.projects ?? [];
  const snapshotDecisions = workspaceSnapshot?.indexes.decisions ?? [];
  const snapshotAssets = workspaceSnapshot?.indexes.assets ?? [];
  const snapshotGraphNodes = workspaceSnapshot?.graph.nodes ?? [];
  const snapshotGraphEdges = workspaceSnapshot?.graph.edges ?? [];

  const snapshotRecentSources = useMemo(() => {
    return [...snapshotSources]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);
  }, [snapshotSources]);

  const snapshotPendingOrWeakSources = useMemo(() => {
    return [...snapshotSources]
      .filter((item) => {
        const isPending = item.currentStatus === 'Inbox' || item.currentStatus === 'Collected';
        const isWeakLinked = item.topicIds.length === 0 || item.projectIds.length === 0;
        return isPending || isWeakLinked;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);
  }, [snapshotSources]);

  const snapshotHotTopics = useMemo(() => {
    return [...snapshotTopics]
      .sort((a, b) => b.sourceIds.length + b.projectIds.length - (a.sourceIds.length + a.projectIds.length))
      .slice(0, 5)
      .map((item) => ({
        topicId: item.topicId,
        name: item.name,
        heat: item.sourceIds.length + item.projectIds.length
      }));
  }, [snapshotTopics]);

  const aiPrioritySources = useMemo(() => {
    return [...snapshotSources]
      .map((source) => {
        const isPending = source.currentStatus === 'Inbox' || source.currentStatus === 'Collected';
        const missingTopic = source.topicIds.length === 0;
        const missingProject = source.projectIds.length === 0;
        const relationPenalty = Number(missingTopic) + Number(missingProject);
        const freshnessBoost = source.updatedAt / 1e13;
        const score = Number(isPending) * 3 + relationPenalty * 2 + freshnessBoost;

        const recommendedTopic = [...snapshotTopics]
          .sort((a, b) => keywordOverlapScore(source, b) - keywordOverlapScore(source, a))[0];

        return {
          source,
          score,
          recommendedTopicName: recommendedTopic && keywordOverlapScore(source, recommendedTopic) > 0 ? recommendedTopic.name : undefined
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [snapshotSources, snapshotTopics]);

  const aiDecisionCandidates = useMemo(() => {
    return [...snapshotSources]
      .filter((item) => item.currentStatus !== 'Archived' && (item.topicIds.length > 0 || item.projectIds.length > 0))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3)
      .map((item) => ({
        sourceId: item.sourceId,
        title: item.title,
        topicHint: item.topicIds[0],
        projectHint: item.projectIds[0],
        nextAction: item.nextAction
      }));
  }, [snapshotSources]);

  const snapshotLastUpdatedAt = useMemo(() => {
    if (workspaceSnapshot?.generatedAt) {
      return workspaceSnapshot.generatedAt;
    }
    const candidates = [
      ...snapshotSources.map((item) => item.updatedAt),
      ...snapshotTopics.map((item) => item.updatedAt),
      ...snapshotProjects.map((item) => item.updatedAt),
      ...snapshotDecisions.map((item) => item.updatedAt),
      ...snapshotAssets.map((item) => item.updatedAt),
      ...snapshotGraphNodes.map((item) => item.updatedAt),
      ...snapshotGraphEdges.map((item) => item.updatedAt)
    ];
    return candidates.length > 0 ? Math.max(...candidates) : undefined;
  }, [snapshotAssets, snapshotDecisions, snapshotGraphEdges, snapshotGraphNodes, snapshotProjects, snapshotSources, snapshotTopics, workspaceSnapshot?.generatedAt]);

  const knowledgeOverview = useMemo(() => {
    const thisWeekDays = 7;
    return [
      { key: 'week-content', title: '本周新增内容', value: String(countRecentByDays(sources, thisWeekDays)), hint: '过去 7 天新进入系统的内容' },
      { key: 'pending-content', title: '待整理内容', value: String(recentInboxCandidates.length), hint: '尚未完成进一步挂接与沉淀' },
      { key: 'week-topics', title: '最近新增主题', value: String(countRecentByDays(topics, thisWeekDays)), hint: '过去 7 天新增的知识主题' },
      { key: 'week-decisions', title: '最近新增决策', value: String(countRecentByDays(decisions, thisWeekDays)), hint: '过去 7 天新增的关键判断' },
      { key: 'reusable-assets', title: '可复用内容数量', value: String(assets.filter((item) => item.lifecycle === 'active').length), hint: '当前可直接拿来用的内容资产' }
    ];
  }, [assets, decisions, recentInboxCandidates.length, sources, topics]);

  const inboxPool = useMemo(() => {
    return sortByUpdatedAtDesc(
      sources.filter((item) => item.currentStatus !== 'Archived')
    );
  }, [sources]);

  const selectedTopic = selectedTopicId ? topics.find((item) => item.topicId === selectedTopicId) : undefined;
  const selectedProject = selectedProjectId ? projects.find((item) => item.projectId === selectedProjectId) : undefined;

  const selectedTopicRelatedSources = selectedTopic
    ? sources.filter((item) => selectedTopic.sourceIds.includes(item.sourceId)).slice(0, 8)
    : [];
  const selectedTopicRelatedProjects = selectedTopic
    ? projects.filter((item) => selectedTopic.projectIds.includes(item.projectId)).slice(0, 8)
    : [];

  const selectedProjectRelatedTopics = selectedProject
    ? topics.filter((item) => selectedProject.topicIds.includes(item.topicId)).slice(0, 8)
    : [];
  const selectedProjectKeyContent = selectedProject
    ? sources.filter((item) => selectedProject.sourceIds.includes(item.sourceId)).slice(0, 8)
    : [];
  const selectedProjectDecisions = selectedProject
    ? decisions.filter((item) => item.projectId === selectedProject.projectId).slice(0, 6)
    : [];
  const selectedProjectAssets = selectedProject
    ? assets.filter((item) => item.projectIds.includes(selectedProject.projectId)).slice(0, 6)
    : [];

  const pageCounter = (page: PageKey): number => {
    if (page === 'workspace') return recentInboxCandidates.length;
    if (page === 'inbox') return inboxPool.length;
    if (page === 'topics') return activeTopics.length;
    if (page === 'projects') return activeProjects.length;
    if (page === 'decisions') return decisions.length;
    if (page === 'assets') return assets.length;
    if (page === 'graph') return snapshotGraphNodes.length;
    return askResult ? 1 : 0;
  };

  const openNodeDetail = (node: WorkspaceGraphNodeSnapshot): void => {
    if (node.nodeType === 'topic') {
      setSelectedTopicId(node.refId);
      setActivePage('topics');
      return;
    }
    if (node.nodeType === 'project') {
      setSelectedProjectId(node.refId);
      setActivePage('projects');
      return;
    }
    setActivePage('inbox');
  };

  return (
    <div className="ps-shell">
      <aside className="ps-sidebar">
        <div className="ps-brand-block">
          <p className="ps-brand-mini">PinStack 3.0</p>
          <h1>知识工作台</h1>
          <p>采集 → 理解 → 关联 → 决策 → 复用</p>
        </div>

        <nav className="ps-nav">
          {PAGE_META.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === activePage ? 'ps-nav-item ps-nav-item-active' : 'ps-nav-item'}
              onClick={() => setActivePage(item.key)}
            >
              <span>{item.navLabel}</span>
              <strong>{pageCounter(item.key)}</strong>
            </button>
          ))}
        </nav>

        <section className="ps-service-card">
          <div>
            <span>服务状态</span>
            <strong>{status?.running ? '服务在线' : '服务未连接'}</strong>
          </div>
          <div>
            <span>知识接口</span>
            <strong>{status?.apiBaseUrl ?? API_BASE_URL}</strong>
          </div>
          <button type="button" className="ps-btn ps-btn-soft" onClick={() => void loadAll()}>
            {loading ? '刷新中…' : '刷新'}
          </button>
        </section>
      </aside>

      <main className="ps-main">
        <header className="ps-page-header">
          <div>
            <p className="ps-overline">PinStack 3.0 Web</p>
            <h2>{currentMeta.title}</h2>
            <p>{currentMeta.subtitle}</p>
          </div>
          {notice ? <div className="ps-notice">{notice}</div> : null}
        </header>

        {error ? <div className="ps-error">{error}</div> : null}

        {activePage === 'workspace' && (
          <section className="ps-section-stack">
            <section className="ps-capture-bar">
              <div className="ps-capture-row">
                <select value={captureType} onChange={(event) => setCaptureType(event.currentTarget.value as CaptureType)}>
                  <option value="text">文本</option>
                  <option value="link">链接</option>
                  <option value="note">笔记</option>
                  <option value="message">消息</option>
                  <option value="email">邮件</option>
                  <option value="pdf">PDF</option>
                  <option value="image">截图</option>
                  <option value="video">视频</option>
                  <option value="audio">语音</option>
                  <option value="template">模板</option>
                </select>
                <input
                  value={captureTitle}
                  onChange={(event) => setCaptureTitle(event.currentTarget.value)}
                  placeholder="标题（可选，建议一句话）"
                />
                <input
                  value={captureMethod}
                  onChange={(event) => setCaptureMethod(event.currentTarget.value)}
                  placeholder="录入方式（如：手动录入）"
                />
              </div>
              <div className="ps-capture-row ps-capture-row-2">
                <input
                  value={captureSourceUrl}
                  onChange={(event) => setCaptureSourceUrl(event.currentTarget.value)}
                  placeholder="来源链接（可选）"
                />
                <button type="button" className="ps-btn ps-btn-primary" onClick={() => void submitCapture()}>
                  加入待整理
                </button>
              </div>
              <textarea
                value={captureBody}
                onChange={(event) => setCaptureBody(event.currentTarget.value)}
                placeholder="输入正文内容，支持粘贴网页摘要、会议记录、消息内容等"
                rows={3}
              />
            </section>

            <section className="ps-module-grid ps-module-grid-main">
              <Module title="最近进入待整理" subtitle="刚进入系统，尚未完成深入挂接的内容">
                {recentInboxCandidates.length === 0 ? (
                  <EmptyState text="这里还没有内容，先用上方采集条加入一条信息。" />
                ) : (
                  <div className="ps-card-list">
                    {recentInboxCandidates.map((item) => (
                      <article key={item.sourceId} className="ps-object-card">
                        <div className="ps-object-top">
                          <h3>{item.title}</h3>
                          <span className={statusBadgeClass(item.currentStatus)}>{SOURCE_STATUS_LABEL[item.currentStatus]}</span>
                        </div>
                        <p>{item.oneLineSummary || item.coreConclusion || '暂无摘要'}</p>
                        <div className="ps-object-meta">
                          <Meta label="内容类型" value={CONTENT_TYPE_LABEL[item.contentType]} />
                          <Meta label="来源平台" value={item.sourcePlatform || '未知来源'} />
                          <Meta label="更新时间" value={formatDateTime(item.updatedAt)} />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Module>

              <Module title="最近更新主题" subtitle="最近活跃或最近更新的主题节点">
                {workspaceTopics.length === 0 ? (
                  <EmptyState text="主题还在生长中，整理几条内容后会自动出现。" />
                ) : (
                  <div className="ps-card-list">
                    {workspaceTopics.map((item) => (
                      <article key={item.topicId} className="ps-object-card">
                        <div className="ps-object-top">
                          <h3>{item.name}</h3>
                          <span className="badge badge-ok">主题</span>
                        </div>
                        <p>{item.description || item.currentConclusion || '暂无主题说明'}</p>
                        <div className="ps-object-meta">
                          <Meta label="关联内容" value={String(item.sourceIds.length)} />
                          <Meta label="关联项目" value={String(item.projectIds.length)} />
                          <Meta label="最近更新" value={formatDateTime(item.updatedAt)} />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Module>

              <Module title="最近活跃项目" subtitle="最近吸收新知识并持续推进的项目">
                {workspaceProjects.length === 0 ? (
                  <EmptyState text="目前还没有活跃项目，先把内容挂接到项目试试看。" />
                ) : (
                  <div className="ps-card-list">
                    {workspaceProjects.map((item) => (
                      <article key={item.projectId} className="ps-object-card">
                        <div className="ps-object-top">
                          <h3>{item.name}</h3>
                          <span className="badge badge-neutral">{PROJECT_STATUS_LABEL[item.status]}</span>
                        </div>
                        <p>{item.goal || '项目目标待补充'}</p>
                        <div className="ps-object-meta">
                          <Meta label="当前版本" value={item.currentVersion || '3.0-alpha'} />
                          <Meta label="关联主题" value={String(item.topicIds.length)} />
                          <Meta label="最近更新" value={formatDateTime(item.updatedAt)} />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Module>
            </section>

            <section className="ps-module-grid ps-module-grid-side">
              <Module title="AI 推荐整理" subtitle="根据最近输入自动给出的整理建议">
                {workspaceSnapshotLoading ? (
                  <EmptyState text="正在读取本地知识快照…" />
                ) : workspaceSnapshotError ? (
                  <EmptyState text="快照读取失败，请刷新后重试。" />
                ) : (
                  <div className="ps-ai-board">
                    <section className="ps-ai-group">
                      <h4>推荐优先处理的内容</h4>
                      {aiPrioritySources.length === 0 ? (
                        <p>当前没有需要优先处理的内容。</p>
                      ) : (
                        <div className="ps-card-list">
                          {aiPrioritySources.map((item) => (
                            <article key={`priority-${item.source.sourceId}`} className="ps-mini-card">
                              <h4>{item.source.title}</h4>
                              <p>
                                建议挂接主题：{item.recommendedTopicName ?? '建议新建主题'}
                                {' · '}
                                状态：{SOURCE_STATUS_LABEL[item.source.currentStatus]}
                              </p>
                              <span>{item.source.nextAction || '建议下一步：先补充归类，再决定是否沉淀'}</span>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="ps-ai-group">
                      <h4>推荐生成的决策候选</h4>
                      {aiDecisionCandidates.length === 0 ? (
                        <p>当前没有决策候选，先完成内容挂接后会自动出现。</p>
                      ) : (
                        <div className="ps-card-list">
                          {aiDecisionCandidates.map((item) => (
                            <article key={`decision-${item.sourceId}`} className="ps-mini-card">
                              <h4>{item.title}</h4>
                              <p>关联建议：主题 {item.topicHint ?? '-'} / 项目 {item.projectHint ?? '-'}</p>
                              <span>{item.nextAction || '建议补一条决策记录，明确结论与影响范围'}</span>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                    <p className="ps-module-footnote">
                      来源：/workspace/snapshot · 最近更新时间：{formatDateTime(snapshotLastUpdatedAt)}
                    </p>
                  </div>
                )}
              </Module>

              <Module title="知识概览" subtitle="最近一周的知识系统变化">
                <div className="ps-overview-grid">
                  {knowledgeOverview.map((item) => (
                    <article key={item.key} className="ps-overview-card">
                      <p>{item.title}</p>
                      <strong>{item.value}</strong>
                      <span>{item.hint}</span>
                    </article>
                  ))}
                </div>
              </Module>

              <Module title="知识关系预览" subtitle="主题、项目与内容之间的最新连接">
                {workspaceSnapshotLoading ? (
                  <EmptyState text="正在读取本地知识网络快照…" />
                ) : workspaceSnapshotError ? (
                  <EmptyState text="快照读取失败，暂时无法展示关系预览。" />
                ) : !workspaceSnapshot ? (
                  <EmptyState text="当前还没有可用快照，稍后刷新查看。" />
                ) : (
                  <div className="ps-preview-stack">
                    <div className="ps-overview-grid">
                      <article className="ps-overview-card">
                        <p>Source / Topic / Project</p>
                        <strong>{workspaceSnapshot.counts.sources} / {workspaceSnapshot.counts.topics} / {workspaceSnapshot.counts.projects}</strong>
                        <span>本地知识对象总量</span>
                      </article>
                      <article className="ps-overview-card">
                        <p>Decision / Asset</p>
                        <strong>{workspaceSnapshot.counts.decisions} / {workspaceSnapshot.counts.assets}</strong>
                        <span>判断沉淀与可复用内容</span>
                      </article>
                      <article className="ps-overview-card">
                        <p>Graph Nodes / Edges</p>
                        <strong>{workspaceSnapshot.counts.nodes} / {workspaceSnapshot.counts.edges}</strong>
                        <span>知识网络连接规模</span>
                      </article>
                    </div>

                    <div className="ps-preview-list">
                      <h4>最近新增内容</h4>
                      {snapshotRecentSources.length === 0 ? (
                        <p>最近还没有新增内容。</p>
                      ) : (
                        <ul>
                          {snapshotRecentSources.map((item) => (
                            <li key={`recent-${item.sourceId}`}>
                              <span>{item.title}</span>
                              <strong>{formatDateTime(item.createdAt)}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="ps-preview-list">
                      <h4>待整理或未充分挂接</h4>
                      {snapshotPendingOrWeakSources.length === 0 ? (
                        <p>当前没有待整理或挂接不足的内容。</p>
                      ) : (
                        <ul>
                          {snapshotPendingOrWeakSources.map((item) => (
                            <li key={`pending-${item.sourceId}`}>
                              <span>{item.title}</span>
                              <strong>
                                {SOURCE_STATUS_LABEL[item.currentStatus]} · T{item.topicIds.length} / P{item.projectIds.length}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="ps-preview-list">
                      <h4>热门主题</h4>
                      {snapshotHotTopics.length === 0 ? (
                        <p>还没有形成热点主题。</p>
                      ) : (
                        <ul>
                          {snapshotHotTopics.map((item) => (
                            <li key={item.topicId}>
                              <span>{item.name}</span>
                              <strong>连接度 {item.heat}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="ps-module-footnote">
                      来源：/workspace/snapshot · 最近更新时间：{formatDateTime(snapshotLastUpdatedAt)}
                    </p>
                  </div>
                )}
                <button type="button" className="ps-btn ps-btn-soft" onClick={() => setActivePage('graph')}>
                  进入关系图谱
                </button>
              </Module>
            </section>
          </section>
        )}

        {activePage === 'inbox' && (
          <section className="ps-section-stack">
            <Module title="待整理知识池" subtitle="每条内容都是可继续生长的知识对象">
              {inboxPool.length === 0 ? (
                <EmptyState text="这里还没有内容，先从知识工作台加入待整理信息。" />
              ) : (
                <div className="ps-card-list">
                  {inboxPool.map((item) => (
                    <article key={item.sourceId} className="ps-object-card">
                      <div className="ps-object-top">
                        <h3>{item.title}</h3>
                        <span className={statusBadgeClass(item.currentStatus)}>{SOURCE_STATUS_LABEL[item.currentStatus]}</span>
                      </div>

                      <p>{item.oneLineSummary || item.coreConclusion || '暂无摘要'}</p>

                      <div className="ps-object-meta ps-object-meta-2col">
                        <Meta label="内容类型" value={CONTENT_TYPE_LABEL[item.contentType]} />
                        <Meta label="录入方式" value={ENTRY_METHOD_LABEL[item.entryMethod]} />
                        <Meta label="来源平台" value={item.sourcePlatform || '未知来源'} />
                        <Meta label="source_id" value={item.sourceId} />
                        <Meta label="原始资料状态" value={item.rawDocumentStatus} />
                        <Meta label="更新时间" value={formatDateTime(item.updatedAt)} />
                        <Meta label="原始资料链接" value={item.sourceLink ? '可打开' : '无链接'} />
                      </div>

                      <div className="ps-actions">
                        <button type="button" className="ps-btn ps-btn-soft" onClick={() => void copySourceId(item.sourceId)}>
                          复制 source_id
                        </button>
                        <button type="button" className="ps-btn ps-btn-soft" onClick={() => void resyncSource(item.sourceId)}>
                          重新同步
                        </button>
                        <button type="button" className="ps-btn ps-btn-primary" onClick={() => void markSourceProcessed(item.sourceId)}>
                          标记已处理
                        </button>
                        <button
                          type="button"
                          className="ps-btn ps-btn-soft"
                          disabled={!item.sourceLink}
                          onClick={() => {
                            if (item.sourceLink) window.open(item.sourceLink, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          打开原始资料
                        </button>
                        <button type="button" className="ps-btn ps-btn-soft" onClick={() => void attachSourceToTopic(item.sourceId)}>
                          挂到主题
                        </button>
                        <button type="button" className="ps-btn ps-btn-soft" onClick={() => void attachSourceToProject(item.sourceId)}>
                          挂到项目
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Module>
          </section>
        )}

        {activePage === 'topics' && (
          <section className="ps-module-grid ps-module-grid-main">
            <Module title="主题节点" subtitle="每个主题都在持续演化">
              {activeTopics.length === 0 ? (
                <EmptyState text="这里还没有主题，先把待整理内容挂接到主题。" />
              ) : (
                <div className="ps-card-list">
                  {sortByUpdatedAtDesc(activeTopics).map((item) => (
                    <article
                      key={item.topicId}
                      className={selectedTopicId === item.topicId ? 'ps-object-card ps-object-card-active' : 'ps-object-card'}
                      onClick={() => setSelectedTopicId(item.topicId)}
                    >
                      <div className="ps-object-top">
                        <h3>{item.name}</h3>
                        <span className="badge badge-ok">知识节点</span>
                      </div>
                      <p>{item.description || item.currentConclusion || '暂无主题说明'}</p>
                      <div className="ps-object-meta">
                        <Meta label="关联内容" value={String(item.sourceIds.length)} />
                        <Meta label="关联项目" value={String(item.projectIds.length)} />
                        <Meta label="最近更新" value={formatDateTime(item.updatedAt)} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Module>

            <Module title="主题详情" subtitle="主题概述 / 当前结论 / 关联关系 / 未解决问题">
              {!selectedTopic ? (
                <EmptyState text="从左侧选择一个主题，查看完整知识结构。" />
              ) : (
                <div className="ps-detail-stack">
                  <DetailBlock title="主题概述">
                    <p>{selectedTopic.description || '暂无主题概述。'}</p>
                  </DetailBlock>

                  <DetailBlock title="当前结论" emphasis>
                    <p>{selectedTopic.currentConclusion || '当前还没有稳定结论。'}</p>
                  </DetailBlock>

                  <DetailBlock title="关联内容">
                    {selectedTopicRelatedSources.length === 0 ? (
                      <p>还没有关联内容。</p>
                    ) : (
                      <ul>
                        {selectedTopicRelatedSources.map((item) => (
                          <li key={item.sourceId}>{item.title}</li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <DetailBlock title="关联项目">
                    {selectedTopicRelatedProjects.length === 0 ? (
                      <p>还没有关联项目。</p>
                    ) : (
                      <ul>
                        {selectedTopicRelatedProjects.map((item) => (
                          <li key={item.projectId}>{item.name}</li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <DetailBlock title="未解决问题">
                    {selectedTopic.openQuestions.length === 0 ? (
                      <p>当前没有未解决问题。</p>
                    ) : (
                      <ul>
                        {selectedTopic.openQuestions.map((questionItem) => (
                          <li key={questionItem}>{questionItem}</li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <div className="ps-actions">
                    <button type="button" className="ps-btn ps-btn-primary" onClick={() => setActivePage('ai')}>
                      继续用 AI 探索
                    </button>
                  </div>
                </div>
              )}
            </Module>
          </section>
        )}

        {activePage === 'projects' && (
          <section className="ps-module-grid ps-module-grid-main">
            <Module title="项目列表" subtitle="项目吸收了哪些知识，一目了然">
              {activeProjects.length === 0 ? (
                <EmptyState text="这里还没有项目，先把主题挂接到项目。" />
              ) : (
                <div className="ps-card-list">
                  {sortByUpdatedAtDesc(activeProjects).map((item) => (
                    <article
                      key={item.projectId}
                      className={selectedProjectId === item.projectId ? 'ps-object-card ps-object-card-active' : 'ps-object-card'}
                      onClick={() => setSelectedProjectId(item.projectId)}
                    >
                      <div className="ps-object-top">
                        <h3>{item.name}</h3>
                        <span className="badge badge-neutral">{PROJECT_STATUS_LABEL[item.status]}</span>
                      </div>
                      <p>{item.goal || '项目目标待补充。'}</p>
                      <div className="ps-object-meta">
                        <Meta label="当前版本" value={item.currentVersion || '3.0-alpha'} />
                        <Meta label="关联主题数" value={String(item.topicIds.length)} />
                        <Meta label="最近更新" value={formatDateTime(item.updatedAt)} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Module>

            <Module title="项目详情" subtitle="知识驱动项目推进，而不是任务清单页面">
              {!selectedProject ? (
                <EmptyState text="从左侧选择一个项目，查看它吸收了哪些知识。" />
              ) : (
                <div className="ps-detail-stack">
                  <DetailBlock title="项目目标" emphasis>
                    <p>{selectedProject.goal || '暂无项目目标。'}</p>
                  </DetailBlock>

                  <DetailBlock title="当前版本">
                    <p>{selectedProject.currentVersion || '3.0-alpha'}</p>
                  </DetailBlock>

                  <DetailBlock title="核心模块">
                    <ul>
                      {(selectedProject.topicIds.length > 0 ? selectedProject.topicIds : []).slice(0, 5).map((topicId) => (
                        <li key={topicId}>{topicById.get(topicId)?.name ?? topicId}</li>
                      ))}
                      {selectedProject.topicIds.length === 0 ? <li>尚未形成核心模块。</li> : null}
                    </ul>
                  </DetailBlock>

                  <DetailBlock title="关联主题">
                    {selectedProjectRelatedTopics.length === 0 ? (
                      <p>暂无关联主题。</p>
                    ) : (
                      <ul>
                        {selectedProjectRelatedTopics.map((item) => (
                          <li key={item.topicId}>{item.name}</li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <DetailBlock title="关键内容">
                    {selectedProjectKeyContent.length === 0 ? (
                      <p>暂无关键内容。</p>
                    ) : (
                      <ul>
                        {selectedProjectKeyContent.map((item) => (
                          <li key={item.sourceId}>{item.title}</li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <DetailBlock title="最近决策">
                    {selectedProjectDecisions.length === 0 ? (
                      <p>暂无决策记录。</p>
                    ) : (
                      <ul>
                        {selectedProjectDecisions.map((item) => (
                          <li key={item.decisionId}>{item.title}</li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <DetailBlock title="可复用内容">
                    {selectedProjectAssets.length === 0 ? (
                      <p>暂无可复用内容。</p>
                    ) : (
                      <ul>
                        {selectedProjectAssets.map((item) => (
                          <li key={item.assetId}>{item.name}</li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <DetailBlock title="最近更新">
                    <p>{formatDateTime(selectedProject.updatedAt)}</p>
                  </DetailBlock>
                </div>
              )}
            </Module>
          </section>
        )}

        {activePage === 'decisions' && (
          <section className="ps-section-stack">
            <Module title="关键判断沉淀" subtitle="背景、结论与原因分层展示">
              {decisions.length === 0 ? (
                <EmptyState text="这里还没有决策记录，可以在 AI 问答页一键沉淀。" />
              ) : (
                <div className="ps-card-list">
                  {sortByUpdatedAtDesc(decisions).map((item) => (
                    <article key={item.decisionId} className="ps-object-card ps-decision-card">
                      <div className="ps-object-top">
                        <h3>{item.title}</h3>
                        <span className="badge badge-neutral">决策</span>
                      </div>

                      <section>
                        <h4>结论</h4>
                        <p className="ps-strong-text">{item.conclusion || '暂无结论。'}</p>
                      </section>

                      <section className="ps-decision-grid">
                        <div>
                          <h4>背景</h4>
                          <p>{item.background || '暂无背景说明。'}</p>
                        </div>
                        <div>
                          <h4>原因</h4>
                          <p>{item.reasons.length > 0 ? item.reasons.join('；') : '暂无原因。'}</p>
                        </div>
                        <div>
                          <h4>影响范围</h4>
                          <p>{item.impactScope || '待补充'}</p>
                        </div>
                        <div>
                          <h4>关联主题 / 项目</h4>
                          <p>{item.topicId || '-'} / {item.projectId || '-'}</p>
                        </div>
                      </section>
                    </article>
                  ))}
                </div>
              )}
            </Module>
          </section>
        )}

        {activePage === 'assets' && (
          <section className="ps-module-grid ps-module-grid-main">
            <Module title="可复用内容清单" subtitle="可以直接拿来用的模板、规范与方法">
              {assets.length === 0 ? (
                <EmptyState text="这里还没有可复用内容，可以从 AI 回答一键沉淀。" />
              ) : (
                <div className="ps-card-list">
                  {sortByUpdatedAtDesc(assets).map((item) => (
                    <article key={item.assetId} className="ps-object-card">
                      <div className="ps-object-top">
                        <h3>{item.name}</h3>
                        <span className="badge badge-ok">{ASSET_TYPE_LABEL[item.assetType]}</span>
                      </div>
                      <p>{item.usageScene || '暂无使用场景说明。'}</p>
                      <div className="ps-object-meta">
                        <Meta label="所属项目" value={item.projectIds.join('、') || '-'} />
                        <Meta label="关联主题" value={item.topicIds.join('、') || '-'} />
                        <Meta label="版本" value={item.version || 'v1'} />
                        <Meta label="更新时间" value={formatDateTime(item.updatedAt)} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Module>

            <Module title="内容详情视图" subtitle="按“说明-来源-关联-使用方式”阅读">
              {assets.length === 0 ? (
                <EmptyState text="有内容后这里会展示完整详情结构。" />
              ) : (
                <div className="ps-detail-stack">
                  {sortByUpdatedAtDesc(assets)
                    .slice(0, 2)
                    .map((item) => (
                      <DetailBlock key={item.assetId} title={item.name} emphasis>
                        <p>内容说明：{item.usageScene || '暂无说明。'}</p>
                        <p>来源：{item.sourceIds.join('、') || '暂无来源'}</p>
                        <p>关联主题：{item.topicIds.join('、') || '暂无关联主题'}</p>
                        <p>关联项目：{item.projectIds.join('、') || '暂无关联项目'}</p>
                        <p>版本信息：{item.version || 'v1'} {item.versionNote ? `· ${item.versionNote}` : ''}</p>
                        <p>使用方式：按场景复制并调整后即可复用。</p>
                      </DetailBlock>
                    ))}
                </div>
              )}
            </Module>
          </section>
        )}

        {activePage === 'graph' && (
          <section className="ps-module-grid ps-module-grid-main">
            <Module title="关系网络概览" subtitle="来自本地索引的真实节点与边">
              {workspaceSnapshotLoading ? (
                <EmptyState text="正在加载图谱索引…" />
              ) : workspaceSnapshotError ? (
                <EmptyState text="图谱快照加载失败，请刷新重试。" />
              ) : !workspaceSnapshot ? (
                <EmptyState text="还没有可用图谱数据。" />
              ) : (
                <div className="ps-preview-stack">
                  <div className="ps-overview-grid">
                    <article className="ps-overview-card">
                      <p>总节点</p>
                      <strong>{workspaceSnapshot.counts.nodes}</strong>
                      <span>Source / Topic / Project</span>
                    </article>
                    <article className="ps-overview-card">
                      <p>总关系</p>
                      <strong>{workspaceSnapshot.counts.edges}</strong>
                      <span>来自 source-topic / source-project / topic-project / topic-topic</span>
                    </article>
                    <article className="ps-overview-card">
                      <p>Topic ↔ Topic</p>
                      <strong>{snapshotGraphEdges.filter((edge) => edge.edgeType === 'topic-topic').length}</strong>
                      <span>主题间共享资料或项目关系</span>
                    </article>
                  </div>
                  <p className="ps-module-footnote">
                    最近更新时间：{formatDateTime(snapshotLastUpdatedAt)}
                  </p>
                </div>
              )}
            </Module>

            <Module title="图谱摘要" subtitle="最近节点、孤立节点与热点主题">
              {workspaceSnapshotLoading ? (
                <EmptyState text="正在分析图谱结构…" />
              ) : !workspaceSnapshot ? (
                <EmptyState text="暂无图谱摘要。" />
              ) : (
                <div className="ps-graph-summary-grid">
                  <article className="ps-mini-card">
                    <h4>最近新增节点</h4>
                    <p>
                      最近 7 天新增：Source {countRecentByDays(snapshotSources, 7)}、Topic {countRecentByDays(snapshotTopics, 7)}、Project {countRecentByDays(snapshotProjects, 7)}。
                    </p>
                  </article>
                  <article className="ps-mini-card">
                    <h4>孤立节点</h4>
                    {snapshotGraphNodes.filter((node) => !snapshotGraphEdges.some((edge) => edge.from === node.nodeId || edge.to === node.nodeId)).length === 0 ? (
                      <p>当前没有明显孤立节点。</p>
                    ) : (
                      <p>
                        {snapshotGraphNodes
                          .filter((node) => !snapshotGraphEdges.some((edge) => edge.from === node.nodeId || edge.to === node.nodeId))
                          .slice(0, 6)
                          .map((node) => `${node.nodeType}:${node.label}`)
                          .join('；')}
                      </p>
                    )}
                  </article>
                  <article className="ps-mini-card">
                    <h4>热门主题</h4>
                    {snapshotHotTopics.length === 0 ? (
                      <p>暂无热门主题。</p>
                    ) : (
                      <p>{snapshotHotTopics.map((item) => `${item.name}(连接度 ${item.heat})`).join('、')}</p>
                    )}
                  </article>
                  <article className="ps-mini-card">
                    <h4>连接关系分布</h4>
                    <p>
                      Source ↔ Topic {snapshotGraphEdges.filter((edge) => edge.edgeType === 'source-topic').length} 条；
                      Source ↔ Project {snapshotGraphEdges.filter((edge) => edge.edgeType === 'source-project').length} 条；
                      Topic ↔ Project {snapshotGraphEdges.filter((edge) => edge.edgeType === 'topic-project').length} 条。
                    </p>
                  </article>
                </div>
              )}
            </Module>

            <Module title="节点浏览" subtitle="从图谱节点快速打开对象页面">
              {workspaceSnapshotLoading ? (
                <EmptyState text="正在加载节点列表…" />
              ) : !workspaceSnapshot ? (
                <EmptyState text="暂无节点可浏览。" />
              ) : (
                <div className="ps-card-list">
                  {snapshotGraphNodes.slice(0, 18).map((node) => (
                    <article key={node.nodeId} className="ps-mini-card">
                      <h4>{node.label}</h4>
                      <p>{node.nodeType} · {node.refId}</p>
                      <div className="ps-actions">
                        <button type="button" className="ps-btn ps-btn-soft" onClick={() => openNodeDetail(node)}>
                          打开对象
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Module>
          </section>
        )}

        {activePage === 'ai' && (
          <section className="ps-module-grid ps-module-grid-main">
            <Module title="问题输入" subtitle="先问问题，再把回答沉淀回知识层">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.currentTarget.value)}
                rows={4}
                placeholder="例如：最近有哪些高价值但未行动的内容？"
              />
            </Module>

            <Module title="上下文范围" subtitle="按主题 / 项目 / 时间范围限定问答上下文">
              <div className="ps-context-grid">
                <label>
                  主题范围
                  <select value={selectedAskTopicId} onChange={(event) => setSelectedAskTopicId(event.currentTarget.value)}>
                    <option value="">全部主题</option>
                    {activeTopics.map((item) => (
                      <option key={item.topicId} value={item.topicId}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  项目范围
                  <select value={selectedAskProjectId} onChange={(event) => setSelectedAskProjectId(event.currentTarget.value)}>
                    <option value="">全部项目</option>
                    {activeProjects.map((item) => (
                      <option key={item.projectId} value={item.projectId}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  时间范围
                  <select value={timeRange} onChange={(event) => setTimeRange(event.currentTarget.value as TimeRangeKey)}>
                    <option value="all">全部时间</option>
                    <option value="7d">最近 7 天</option>
                    <option value="30d">最近 30 天</option>
                  </select>
                </label>

                <div className="ps-context-actions">
                  <button type="button" className="ps-btn ps-btn-primary" onClick={() => void runAsk()}>
                    开始问答
                  </button>
                </div>
              </div>
            </Module>

            <Module title="回答结果" subtitle="结果、引用来源与沉淀动作">
              {!askResult ? (
                <EmptyState text="这里会展示回答结果、引用来源和后续沉淀按钮。" />
              ) : (
                <div className="ps-detail-stack">
                  <DetailBlock title="回答内容" emphasis>
                    <p>{askResult.answer}</p>
                  </DetailBlock>

                  <DetailBlock title="引用来源">
                    {askResult.evidence.length === 0 ? (
                      <p>本次回答暂无可见引用。</p>
                    ) : (
                      <ul>
                        {askResult.evidence.map((item) => (
                          <li key={`${item.kind}-${item.id}`}>
                            {item.kind} · {item.title} · {item.summary}
                          </li>
                        ))}
                      </ul>
                    )}
                  </DetailBlock>

                  <DetailBlock title="一键沉淀">
                    <div className="ps-actions">
                      <button type="button" className="ps-btn ps-btn-primary" onClick={() => void depositAnswerToTopic()}>
                        沉淀为主题补充
                      </button>
                      <button type="button" className="ps-btn ps-btn-soft" onClick={() => void depositAnswerToDecision()}>
                        沉淀为决策记录
                      </button>
                      <button type="button" className="ps-btn ps-btn-soft" onClick={() => void depositAnswerToAsset()}>
                        沉淀为可复用内容
                      </button>
                    </div>
                  </DetailBlock>
                </div>
              )}
            </Module>
          </section>
        )}
      </main>
    </div>
  );
}

function Module({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="ps-module">
      <header>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <div className="ps-empty">{text}</div>;
}

function Meta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="ps-meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailBlock({ title, emphasis, children }: { title: string; emphasis?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <article className={emphasis ? 'ps-detail-block ps-detail-block-emphasis' : 'ps-detail-block'}>
      <h4>{title}</h4>
      {children}
    </article>
  );
}
