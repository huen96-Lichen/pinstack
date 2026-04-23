import type { LocalModelCategory, SummaryResult } from '../../src/shared/ai/localModel/types';
import type {
  AskAiAnswer,
  AskAiEvidence,
  AskAiQuery,
  ProjectRecord,
  SourceContentType,
  SourceEntryMethod,
  SourceRecord,
  TopicRecord
} from '../../src/shared/knowledge3';

export interface KnowledgeDraftInsight {
  oneLineSummary: string;
  coreConclusion: string;
  keywords: string[];
  topicName?: string;
  projectName?: string;
  nextAction: string;
  reusable: boolean;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => (value ?? '').trim()).filter(Boolean))];
}

export function buildKnowledgeDraftInsight(input: {
  title: string;
  textContent: string;
  contentType: SourceContentType;
  entryMethod: SourceEntryMethod;
  sourcePlatform: string;
  sourceLink?: string;
  summaryResult?: SummaryResult | null;
}): KnowledgeDraftInsight {
  const summary = input.summaryResult?.summary?.trim() || input.textContent.trim().slice(0, 140) || '待补充摘要';
  const keyword = input.summaryResult?.keyword?.trim() || deriveKeywordFromTitle(input.title);
  const category = input.summaryResult?.category ?? inferCategory(input.contentType, input.sourcePlatform);
  const topicName = buildTopicName(input.contentType, category, input.sourcePlatform, input.sourceLink);
  const projectName = inferProjectName(input.title, input.textContent);

  return {
    oneLineSummary: summary,
    coreConclusion: buildCoreConclusion(summary, input.textContent),
    keywords: uniqueStrings([keyword, category, input.sourcePlatform]),
    topicName,
    projectName,
    nextAction: projectName ? '挂接到项目并补充决策上下文' : '挂接到主题并继续整理',
    reusable: category === '开发' || category === '设计' || category === 'AI'
  };
}

function inferCategory(contentType: SourceContentType, sourcePlatform: string): LocalModelCategory {
  const normalizedPlatform = sourcePlatform.trim().toLowerCase();
  if (contentType === 'video') {
    return '视频';
  }
  if (normalizedPlatform.includes('figma') || normalizedPlatform.includes('dribbble')) {
    return '设计';
  }
  if (normalizedPlatform.includes('github') || normalizedPlatform.includes('cursor') || normalizedPlatform.includes('codex')) {
    return '开发';
  }
  if (normalizedPlatform.includes('chatgpt') || normalizedPlatform.includes('claude') || normalizedPlatform.includes('deepseek')) {
    return 'AI';
  }
  return '待处理';
}

function deriveKeywordFromTitle(title: string): string {
  const normalized = title
    .replace(/[^\p{L}\p{N}\s/-]+/gu, ' ')
    .split(/\s+|\/|-/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return normalized[0] ?? '待整理';
}

function buildTopicName(
  contentType: SourceContentType,
  category: LocalModelCategory,
  sourcePlatform: string,
  sourceLink?: string
): string {
  if (contentType === 'web') {
    try {
      const host = sourceLink ? new URL(sourceLink).hostname.replace(/^www\./, '') : sourcePlatform;
      return `网页采集 / ${host || '网页资料'}`;
    } catch {
      return `网页采集 / ${sourcePlatform || '网页资料'}`;
    }
  }
  if (contentType === 'video') {
    return `视频理解 / ${category}`;
  }
  return `PinStack / ${category}`;
}

function inferProjectName(title: string, textContent: string): string | undefined {
  const combined = `${title}\n${textContent}`.toLowerCase();
  if (combined.includes('pinstack 3.0') || combined.includes('pinstack 3')) {
    return 'PinStack 3.0';
  }
  return undefined;
}

function buildCoreConclusion(summary: string, textContent: string): string {
  const normalized = summary.trim();
  if (normalized) {
    return normalized;
  }
  return textContent.trim().slice(0, 220) || '待补充结论';
}

export function buildAskAiAnswer(input: {
  query: AskAiQuery;
  sources: SourceRecord[];
  topics: TopicRecord[];
  projects: ProjectRecord[];
}): AskAiAnswer {
  const topicLead = input.query.topicId ? input.topics.find((topic) => topic.topicId === input.query.topicId) : undefined;
  const projectLead = input.query.projectId ? input.projects.find((project) => project.projectId === input.query.projectId) : undefined;
  const matchedSources = matchSources(input.sources, input.query);

  const relatedTopicIds = uniqueStrings([
    topicLead?.topicId,
    ...matchedSources.flatMap((source) => source.topicIds),
    ...(projectLead ? projectLead.topicIds : [])
  ]);
  const relatedProjectIds = uniqueStrings([
    projectLead?.projectId,
    ...matchedSources.flatMap((source) => source.projectIds)
  ]);

  const leadLine = topicLead
    ? `当前聚焦主题：${topicLead.name}。${topicLead.currentConclusion || topicLead.description || '该主题仍在整理中。'}`
    : projectLead
      ? `当前聚焦项目：${projectLead.name}。目标是 ${projectLead.goal || '待补充目标'}。`
      : '当前回答基于 PinStack 3.0 已进入知识网络的资料源。';

  const evidence: AskAiEvidence[] = [];
  if (topicLead) {
    evidence.push({
      kind: 'topic',
      id: topicLead.topicId,
      title: topicLead.name,
      summary: topicLead.currentConclusion || topicLead.description || '主题内容待补充'
    });
  }
  if (projectLead) {
    evidence.push({
      kind: 'project',
      id: projectLead.projectId,
      title: projectLead.name,
      summary: projectLead.goal || '项目目标待补充'
    });
  }
  for (const source of matchedSources.slice(0, 5)) {
    evidence.push({
      kind: 'source',
      id: source.sourceId,
      title: source.title,
      summary: source.oneLineSummary || source.coreConclusion || '资料摘要待补充'
    });
  }

  const knowledgeLines = evidence
    .filter((item) => item.kind !== 'source')
    .map((item, index) => `${index + 1}. [${item.kind}] ${item.title}：${item.summary}`);

  const sourceLines = evidence
    .filter((item) => item.kind === 'source')
    .map((item, index) => `${index + 1}. ${item.title}：${item.summary}`);

  const answer = [
    leadLine,
    '',
    knowledgeLines.length > 0 ? '知识层依据（优先）：' : '暂无可用知识页依据。',
    ...knowledgeLines,
    '',
    sourceLines.length > 0 ? '原始资料补充：' : '未匹配到直接原始资料，建议扩大时间范围或先补充 Source。',
    ...sourceLines
  ].join('\n');

  return {
    strategy: 'knowledge-first',
    answer,
    evidence,
    supportingSourceIds: matchedSources.map((source) => source.sourceId),
    relatedTopicIds,
    relatedProjectIds,
    createdAt: Date.now()
  };
}

function matchSources(sources: SourceRecord[], query: AskAiQuery): SourceRecord[] {
  const normalizedQuery = query.query.trim().toLowerCase();
  return sources.filter((source) => {
    if (query.topicId && !source.topicIds.includes(query.topicId)) {
      return false;
    }
    if (query.projectId && !source.projectIds.includes(query.projectId)) {
      return false;
    }
    if (typeof query.from === 'number' && source.createdAt < query.from) {
      return false;
    }
    if (typeof query.to === 'number' && source.createdAt > query.to) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      source.title,
      source.oneLineSummary,
      source.coreConclusion,
      source.keywords.join(' ')
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
