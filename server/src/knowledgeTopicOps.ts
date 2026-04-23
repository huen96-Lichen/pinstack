import { randomUUID } from 'node:crypto';
import type { TopicRecord } from '../../src/shared/knowledge3';
import type { KnowledgeStore } from './knowledgeStore';

export interface TopicOpsDeps {
  store: KnowledgeStore;
  getWebUrl: () => string;
}

export function listTopics(deps: TopicOpsDeps) {
  return deps.store.getState().topics;
}

export async function updateTopic(
  deps: TopicOpsDeps,
  input: {
    topicId: string;
    name?: string;
    description?: string;
    currentConclusion?: string;
    openQuestions?: string[];
  }
): Promise<TopicRecord> {
  const topic = requireTopic(deps, input.topicId);
  const nextName = input.name?.trim() ?? topic.name;
  if (!nextName) {
    throw new Error('Topic 名称不能为空');
  }
  const nextDescription = input.description?.trim() ?? topic.description;
  if (!nextDescription) {
    throw new Error('Topic 描述不能为空');
  }
  const nextConclusion = input.currentConclusion?.trim() ?? topic.currentConclusion;
  const nextOpenQuestions =
    input.openQuestions?.map((item) => item.trim()).filter(Boolean).slice(0, 10) ?? topic.openQuestions;

  const nextTopic: TopicRecord = {
    ...topic,
    name: nextName,
    description: nextDescription,
    currentConclusion: nextConclusion,
    openQuestions: nextOpenQuestions,
    updatedAt: Date.now()
  };
  await deps.store.upsertTopic(nextTopic);
  return nextTopic;
}

export async function createTopic(
  deps: TopicOpsDeps,
  input: { name: string; description?: string }
): Promise<TopicRecord> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Topic 名称不能为空');
  }

  const state = deps.store.getState();
  const existing = state.topics.find((topic) => topic.name.trim().toLowerCase() === trimmedName.toLowerCase());
  if (existing) {
    return existing;
  }

  const description = input.description?.trim() || `${trimmedName} 的主题页待进一步沉淀。`;
  const topic: TopicRecord = {
    topicId: `topic_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: trimmedName,
    description,
    sourceIds: [],
    projectIds: [],
    assetIds: [],
    currentConclusion: description,
    openQuestions: [
      `这个主题"${trimmedName}"当前最关键的未解决问题是什么？`
    ],
    lifecycle: 'active',
    updatedAt: Date.now()
  };
  await deps.store.upsertTopic(topic);
  return topic;
}

export async function archiveTopic(deps: TopicOpsDeps, topicId: string): Promise<TopicRecord> {
  const topic = requireTopic(deps, topicId);
  const nextTopic: TopicRecord = {
    ...topic,
    lifecycle: 'archived',
    archivedAt: Date.now(),
    updatedAt: Date.now()
  };
  await deps.store.upsertTopic(nextTopic);
  return nextTopic;
}

export async function mergeTopics(
  deps: TopicOpsDeps,
  input: { sourceTopicId: string; targetTopicId: string }
): Promise<{ ok: true; sourceTopicId: string; targetTopicId: string }> {
  if (input.sourceTopicId === input.targetTopicId) {
    throw new Error('不能把 Topic 合并到自身。');
  }

  const sourceTopic = requireTopic(deps, input.sourceTopicId);
  const targetTopic = requireTopic(deps, input.targetTopicId);
  if (sourceTopic.lifecycle !== 'active' || targetTopic.lifecycle !== 'active') {
    throw new Error('只能合并活跃 Topic。');
  }

  const state = deps.store.getState();
  for (const source of state.sources.filter((item) => item.topicIds.includes(sourceTopic.topicId))) {
    const nextTopicIds = uniqueIds(source.topicIds.map((item) => (item === sourceTopic.topicId ? targetTopic.topicId : item)));
    await deps.store.upsertSource({
      ...source,
      topicIds: nextTopicIds,
      enteredKnowledgePage: true,
      knowledgePageLink: `${deps.getWebUrl()}#/topics/${encodeURIComponent(targetTopic.topicId)}`,
      updatedAt: Date.now()
    });
  }

  for (const project of state.projects.filter((item) => item.topicIds.includes(sourceTopic.topicId))) {
    await deps.store.upsertProject({
      ...project,
      topicIds: uniqueIds(project.topicIds.map((item) => (item === sourceTopic.topicId ? targetTopic.topicId : item))),
      updatedAt: Date.now()
    });
  }

  for (const decision of state.decisions.filter((item) => item.topicId === sourceTopic.topicId)) {
    await deps.store.upsertDecision({
      ...decision,
      topicId: targetTopic.topicId,
      updatedAt: Date.now()
    });
  }

  for (const asset of state.assets.filter((item) => item.topicIds.includes(sourceTopic.topicId))) {
    await deps.store.upsertAsset({
      ...asset,
      topicIds: uniqueIds(asset.topicIds.map((item) => (item === sourceTopic.topicId ? targetTopic.topicId : item))),
      updatedAt: Date.now()
    });
  }

  await deps.store.upsertTopic({
    ...targetTopic,
    sourceIds: uniqueIds([...targetTopic.sourceIds, ...sourceTopic.sourceIds]),
    projectIds: uniqueIds([...targetTopic.projectIds, ...sourceTopic.projectIds]),
    assetIds: uniqueIds([...targetTopic.assetIds, ...sourceTopic.assetIds]),
    updatedAt: Date.now()
  });
  await deps.store.upsertTopic({
    ...sourceTopic,
    sourceIds: [],
    projectIds: [],
    assetIds: [],
    lifecycle: 'archived',
    archivedAt: Date.now(),
    mergedInto: targetTopic.topicId,
    updatedAt: Date.now()
  });

  return { ok: true, sourceTopicId: sourceTopic.topicId, targetTopicId: targetTopic.topicId };
}

export async function deleteTopic(
  deps: TopicOpsDeps,
  topicId: string
): Promise<{ ok: true; topicId: string }> {
  const topic = requireTopic(deps, topicId);
  const state = deps.store.getState();
  const hasDependencies = Boolean(
    topic.sourceIds.length ||
    topic.projectIds.length ||
    topic.assetIds.length ||
    state.decisions.some((item) => item.topicId === topic.topicId)
  );
  if (hasDependencies) {
    throw new Error('该 Topic 仍有关系依赖，当前只允许归档。');
  }
  await deps.store.removeTopic(topic.topicId);
  return { ok: true, topicId };
}

function requireTopic(deps: TopicOpsDeps, topicId: string): TopicRecord {
  const topic = deps.store.getState().topics.find((item) => item.topicId === topicId);
  if (!topic) {
    throw new Error('Topic not found');
  }
  return topic;
}

function uniqueIds(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}
