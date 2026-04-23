import { randomUUID } from 'node:crypto';
import type {
  CaptureInboxItemInput,
  InboxItem,
  KnowledgeItem,
  ProcessInboxItemResult,
  TopicPage
} from '../../src/shared/pinosV1';
import type { PinosV1Store } from './pinosV1Store';

export interface InboxOpsDeps {
  v1Store: PinosV1Store;
  appendV1Event: (input: {
    type: string;
    actor: 'user' | 'assistant';
    objectType: string;
    objectId: string;
    projectId?: string;
    taskId?: string;
    knowledgeItemId?: string;
    payload?: Record<string, string | number | boolean | null>;
    happenedAt: number;
  }) => Promise<import('../../src/shared/pinosV1').Event>;
  ensureV1TopicPage: (title: string, abstract?: string) => Promise<TopicPage>;
}

export async function listV1InboxItems(deps: InboxOpsDeps): Promise<InboxItem[]> {
  return deps.v1Store.getState().inboxItems;
}

export async function captureV1InboxItem(deps: InboxOpsDeps, input: CaptureInboxItemInput): Promise<InboxItem> {
  const now = Date.now();
  const content = input.contentText?.trim();
  const titleFromContent = content ? content.slice(0, 60) : undefined;
  const inboxItem: InboxItem = {
    id: `inbox_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    type: input.type,
    status: 'new',
    title: input.title?.trim() || titleFromContent || `Untitled ${input.type}`,
    contentText: content,
    attachmentPath: input.attachmentPath?.trim(),
    source: input.source ?? {},
    suggestedTopicNames: [],
    suggestedProjectIds: [],
    suggestedTaskTitles: [],
    aiSummary: undefined,
    aiTags: [],
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };
  await deps.v1Store.upsertInboxItem(inboxItem);
  await deps.appendV1Event({
    type: 'inbox.captured',
    actor: 'user',
    objectType: 'inbox_item',
    objectId: inboxItem.id,
    happenedAt: now,
    payload: {
      inboxType: inboxItem.type
    }
  });
  return inboxItem;
}

export async function processV1InboxItem(deps: InboxOpsDeps, inboxItemId: string): Promise<ProcessInboxItemResult> {
  const state = deps.v1Store.getState();
  const inboxItem = state.inboxItems.find((item) => item.id === inboxItemId);
  if (!inboxItem) {
    throw new Error('InboxItem not found');
  }
  if (inboxItem.lifecycle !== 'active') {
    throw new Error('Archived InboxItem cannot be processed');
  }

  const now = Date.now();
  const aiSummary = summarizeText(inboxItem.contentText || inboxItem.title);
  const aiTags = extractTags(`${inboxItem.title} ${inboxItem.contentText || ''}`);
  const suggestedTopicNames = buildSuggestedTopicNames(inboxItem, aiTags);
  const suggestedProjectIds = suggestProjectIds(state.projects, inboxItem, aiTags);
  const suggestedTaskTitles = buildSuggestedTaskTitles(inboxItem, aiTags);

  const processedInbox: InboxItem = {
    ...inboxItem,
    status: 'processed',
    aiSummary,
    aiTags,
    suggestedTopicNames,
    suggestedProjectIds,
    suggestedTaskTitles,
    processedAt: now,
    updatedAt: now
  };
  await deps.v1Store.upsertInboxItem(processedInbox);
  await deps.appendV1Event({
    type: 'inbox.processed',
    actor: 'assistant',
    objectType: 'inbox_item',
    objectId: processedInbox.id,
    happenedAt: now
  });

  const knowledgeItem: KnowledgeItem = {
    id: `ki_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    title: processedInbox.title,
    summary: aiSummary,
    tags: aiTags,
    keyPoints: splitKeyPoints(processedInbox.contentText || processedInbox.title),
    quoteRefs: [],
    sourceInboxItemId: processedInbox.id,
    sourceRefs: [processedInbox.source],
    topicPageIds: [],
    projectIds: suggestedProjectIds.slice(0, 1),
    suggestedNextActions: suggestedTaskTitles.slice(0, 3),
    valueScore: estimateValueScore(processedInbox),
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };

  const ensuredTopicPages: TopicPage[] = [];
  for (const topicName of suggestedTopicNames.slice(0, 2)) {
    const topicPage = await deps.ensureV1TopicPage(topicName);
    if (!topicPage.knowledgeItemIds.includes(knowledgeItem.id)) {
      const updatedTopicPage: TopicPage = {
        ...topicPage,
        knowledgeItemIds: [...topicPage.knowledgeItemIds, knowledgeItem.id],
        updatedAt: now
      };
      await deps.v1Store.upsertTopicPage(updatedTopicPage);
      ensuredTopicPages.push(updatedTopicPage);
    } else {
      ensuredTopicPages.push(topicPage);
    }
  }
  knowledgeItem.topicPageIds = ensuredTopicPages.map((item) => item.id);

  await deps.v1Store.upsertKnowledgeItem(knowledgeItem);
  await deps.appendV1Event({
    type: 'knowledge.created',
    actor: 'assistant',
    objectType: 'knowledge_item',
    objectId: knowledgeItem.id,
    knowledgeItemId: knowledgeItem.id,
    happenedAt: now
  });

  for (const topicPage of ensuredTopicPages) {
    await deps.appendV1Event({
      type: 'knowledge.linked_topic',
      actor: 'assistant',
      objectType: 'topic_page',
      objectId: topicPage.id,
      knowledgeItemId: knowledgeItem.id,
      happenedAt: now
    });
  }

  const linkedProject = state.projects.find((item) => item.id === knowledgeItem.projectIds[0]);
  if (linkedProject) {
    await deps.appendV1Event({
      type: 'knowledge.linked_project',
      actor: 'assistant',
      objectType: 'project',
      objectId: linkedProject.id,
      knowledgeItemId: knowledgeItem.id,
      projectId: linkedProject.id,
      happenedAt: now
    });
  }

  return {
    inboxItem: processedInbox,
    draftKnowledgeItem: knowledgeItem,
    suggestedTopicNames,
    suggestedProjectIds,
    suggestedTaskTitles
  };
}

export async function listV1KnowledgeItems(deps: InboxOpsDeps): Promise<KnowledgeItem[]> {
  return deps.v1Store.getState().knowledgeItems;
}

export async function createV1KnowledgeItem(
  deps: InboxOpsDeps,
  input: {
    title: string;
    summary: string;
    tags?: string[];
    sourceInboxItemId: string;
    topicPageIds?: string[];
    projectIds?: string[];
    suggestedNextActions?: string[];
    valueScore?: number;
  }
): Promise<KnowledgeItem> {
  const now = Date.now();
  const item: KnowledgeItem = {
    id: `ki_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    title: input.title.trim(),
    summary: input.summary.trim(),
    tags: uniqueNormalizedStrings(input.tags),
    keyPoints: splitKeyPoints(input.summary),
    quoteRefs: [],
    sourceInboxItemId: input.sourceInboxItemId.trim(),
    sourceRefs: [],
    topicPageIds: uniqueNormalizedStrings(input.topicPageIds),
    projectIds: uniqueNormalizedStrings(input.projectIds),
    suggestedNextActions: uniqueNormalizedStrings(input.suggestedNextActions),
    valueScore: clampScore(input.valueScore ?? 0.5),
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };
  await deps.v1Store.upsertKnowledgeItem(item);
  await deps.appendV1Event({
    type: 'knowledge.created',
    actor: 'user',
    objectType: 'knowledge_item',
    objectId: item.id,
    knowledgeItemId: item.id,
    happenedAt: now
  });
  return item;
}

export async function updateV1KnowledgeItem(
  deps: InboxOpsDeps,
  input: {
    knowledgeItemId: string;
    title?: string;
    summary?: string;
    tags?: string[];
    topicPageIds?: string[];
    projectIds?: string[];
    suggestedNextActions?: string[];
    valueScore?: number;
    lifecycle?: 'active' | 'archived';
  }
): Promise<KnowledgeItem> {
  const state = deps.v1Store.getState();
  const item = state.knowledgeItems.find((current) => current.id === input.knowledgeItemId);
  if (!item) {
    throw new Error('KnowledgeItem not found');
  }
  const nextLifecycle = input.lifecycle ?? item.lifecycle;
  const nextItem: KnowledgeItem = {
    ...item,
    title: input.title?.trim() || item.title,
    summary: input.summary?.trim() || item.summary,
    tags: input.tags ? uniqueNormalizedStrings(input.tags) : item.tags,
    topicPageIds: input.topicPageIds ? uniqueNormalizedStrings(input.topicPageIds) : item.topicPageIds,
    projectIds: input.projectIds ? uniqueNormalizedStrings(input.projectIds) : item.projectIds,
    suggestedNextActions: input.suggestedNextActions ? uniqueNormalizedStrings(input.suggestedNextActions) : item.suggestedNextActions,
    valueScore: input.valueScore === undefined ? item.valueScore : clampScore(input.valueScore),
    lifecycle: nextLifecycle,
    archivedAt: nextLifecycle === 'archived' ? Date.now() : undefined,
    updatedAt: Date.now()
  };
  await deps.v1Store.upsertKnowledgeItem(nextItem);
  if (nextLifecycle === 'archived' && item.lifecycle !== 'archived') {
    await deps.appendV1Event({
      type: 'object.archived',
      actor: 'user',
      objectType: 'knowledge_item',
      objectId: nextItem.id,
      knowledgeItemId: nextItem.id,
      happenedAt: Date.now()
    });
  }
  return nextItem;
}

// --- Helper functions ---

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '暂无可用摘要。';
  }
  return normalized.slice(0, 180);
}

function extractTags(text: string): string[] {
  return uniqueNormalizedStrings(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((item) => item.length >= 2)
      .slice(0, 8)
  );
}

function buildSuggestedTopicNames(inboxItem: InboxItem, aiTags: string[]): string[] {
  const fromSource = inboxItem.source.sourcePlatform?.trim();
  const fromType = inboxItem.type === 'email' || inboxItem.type === 'message' ? '沟通' : '知识';
  return uniqueNormalizedStrings([
    fromSource ? `${fromSource} / ${fromType}` : undefined,
    aiTags[0] ? `topic / ${aiTags[0]}` : undefined
  ]);
}

function suggestProjectIds(projects: import('../../src/shared/pinosV1').Project[], inboxItem: InboxItem, aiTags: string[]): string[] {
  const targetTerms = tokenize(`${inboxItem.title} ${inboxItem.contentText || ''} ${aiTags.join(' ')}`);
  return projects
    .map((project) => {
      const overlap = intersectionCount(targetTerms, tokenize(`${project.name} ${project.goal}`));
      return { projectId: project.id, score: overlap };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.projectId);
}

function buildSuggestedTaskTitles(inboxItem: InboxItem, aiTags: string[]): string[] {
  const anchor = aiTags[0] || inboxItem.type;
  return uniqueNormalizedStrings([
    `整理 ${anchor} 资料并确认下一步`,
    `把 ${anchor} 转为可执行任务`,
    `验证 ${anchor} 的关键结论`
  ]);
}

function splitKeyPoints(text: string): string[] {
  const pieces = text
    .split(/[。.!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return pieces.slice(0, 5);
}

function estimateValueScore(inboxItem: InboxItem): number {
  const base = inboxItem.contentText?.length ? Math.min(1, inboxItem.contentText.length / 1200) : 0.3;
  const sourceBonus = inboxItem.source.url ? 0.1 : 0;
  return clampScore(base + sourceBonus);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

function uniqueNormalizedStrings(values: Array<string | undefined> | undefined): string[] {
  if (!values) {
    return [];
  }
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function tokenize(input: string): Set<string> {
  const terms = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return new Set(terms);
}

function intersectionCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}
