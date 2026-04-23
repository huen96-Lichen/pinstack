import { randomUUID } from 'node:crypto';
import type { AskAiAnswer, AskAiQuery } from '../../src/shared/knowledge3';
import type {
  AssistantAnswer,
  AssistantQueryInput,
  Event,
  EventType,
  HomeFocusSnapshot,
  Project,
  ProjectStatus,
  Review,
  ReviewPeriod,
  Task,
  TaskPriority,
  TaskStatus,
  TopicPage
} from '../../src/shared/pinosV1';
import { buildAskAiAnswer } from './knowledgeHeuristics';
import type { KnowledgeStore } from './knowledgeStore';
import type { PinosV1Store } from './pinosV1Store';

export interface AiOpsDeps {
  store: KnowledgeStore;
  v1Store: PinosV1Store;
}

export async function askAi(deps: AiOpsDeps, query: AskAiQuery): Promise<AskAiAnswer> {
  const state = deps.store.getState();
  const answer = buildAskAiAnswer({
    query,
    sources: state.sources,
    topics: state.topics,
    projects: state.projects
  });
  const askAnswerId = `ask_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const highValue = Boolean(answer.relatedTopicIds.length > 0 || answer.relatedProjectIds.length > 0 || answer.evidence.length >= 4);

  await deps.store.appendAskAnswerLog({
    askAnswerId,
    query: query.query.trim(),
    answer: answer.answer,
    relatedTopicIds: answer.relatedTopicIds,
    relatedProjectIds: answer.relatedProjectIds,
    supportingSourceIds: answer.supportingSourceIds,
    highValue,
    deposited: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  return {
    ...answer,
    askAnswerId,
    highValue,
    deposited: false
  };
}

export async function depositAskAnswer(
  deps: AiOpsDeps,
  input: {
    answer: string;
    askAnswerId?: string;
    topicId?: string;
    projectId?: string;
  }
): Promise<{ ok: true; targetType: 'topic' | 'project'; targetId: string }> {
  const answerText = input.answer.trim();
  if (!answerText) {
    throw new Error('回答内容为空，无法沉淀。');
  }

  if (input.topicId) {
    const state = deps.store.getState();
    const topic = state.topics.find((item) => item.topicId === input.topicId);
    if (!topic) {
      throw new Error('Topic not found');
    }
    await deps.store.upsertTopic({
      ...topic,
      currentConclusion: answerText.slice(0, 800),
      updatedAt: Date.now()
    });
    if (input.askAnswerId) {
      await deps.store.markAskAnswerDeposited(input.askAnswerId);
    }
    return {
      ok: true,
      targetType: 'topic',
      targetId: topic.topicId
    };
  }

  if (input.projectId) {
    const state = deps.store.getState();
    const project = state.projects.find((item) => item.projectId === input.projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    await deps.store.upsertProject({
      ...project,
      goal: answerText.slice(0, 800),
      updatedAt: Date.now()
    });
    if (input.askAnswerId) {
      await deps.store.markAskAnswerDeposited(input.askAnswerId);
    }
    return {
      ok: true,
      targetType: 'project',
      targetId: project.projectId
    };
  }

  throw new Error('请先指定 Topic 或 Project 再沉淀回答。');
}

export function listLintIssues(deps: AiOpsDeps) {
  return deps.store.getState().lintIssues;
}

export async function resolveLintIssue(deps: AiOpsDeps, lintId: string) {
  return deps.store.resolveLintIssue(lintId);
}

export async function applyLintQuickFix(
  deps: AiOpsDeps,
  lintId: string,
  createTopicFn: (input: { name: string; description?: string }) => Promise<import('../../src/shared/knowledge3').TopicRecord>,
  attachSourceToTopicFn: (input: { sourceId: string; topicId?: string; topicName?: string }) => Promise<{ ok: true; sourceId: string; topicId: string }>,
  createDecisionDraftFn: (input: {
    title?: string;
    background?: string;
    conclusion: string;
    reasons?: string[];
    topicId?: string;
    projectId?: string;
    sourceIds?: string[];
  }) => Promise<import('../../src/shared/knowledge3').DecisionRecord>
): Promise<{ ok: true; lintId: string }> {
  const state = deps.store.getState();
  const issue = state.lintIssues.find((item) => item.lintId === lintId);
  if (!issue) {
    throw new Error('Lint issue not found');
  }

  if (issue.issueType === 'orphan' && issue.objectType === 'source') {
    const source = state.sources.find((item) => item.sourceId === issue.objectId);
    if (!source) {
      throw new Error('Source not found');
    }
    const topic = await createTopicFn({
      name: `${source.sourcePlatform || 'Source'} / ${source.contentType}`,
      description: `自动修复挂接：${source.title}`
    });
    await attachSourceToTopicFn({
      sourceId: source.sourceId,
      topicId: topic.topicId
    });
  } else if (issue.issueType === 'orphan' && issue.objectType === 'topic') {
    const topic = state.topics.find((item) => item.topicId === issue.objectId);
    if (!topic) {
      throw new Error('Topic not found');
    }
    const candidate = state.sources.find((source) =>
      [source.title, source.oneLineSummary, source.coreConclusion]
        .join(' ')
        .toLowerCase()
        .includes(topic.name.toLowerCase())
    );
    if (!candidate) {
      throw new Error('未找到可自动挂接的 Source，请手动挂接。');
    }
    await attachSourceToTopicFn({
      sourceId: candidate.sourceId,
      topicId: topic.topicId
    });
  } else if (issue.issueType === 'stale' && issue.objectType === 'topic') {
    const topic = state.topics.find((item) => item.topicId === issue.objectId);
    if (!topic) {
      throw new Error('Topic not found');
    }
    const sources = state.sources.filter((source) => topic.sourceIds.includes(source.sourceId));
    const newest = sources.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    const nextConclusion = newest.map((item, index) => `${index + 1}. ${item.oneLineSummary}`).join(' ');
    await deps.store.upsertTopic({
      ...topic,
      currentConclusion: nextConclusion || topic.currentConclusion,
      updatedAt: Date.now()
    });
  } else if (issue.issueType === 'pending_deposit' && issue.objectType === 'ask_answer') {
    const askAnswer = state.askAnswerLogs.find((item) => item.askAnswerId === issue.objectId);
    if (!askAnswer) {
      throw new Error('Ask answer log not found');
    }
    await createDecisionDraftFn({
      title: `Decision / ${askAnswer.query.slice(0, 32) || 'Ask AI'}`,
      background: '由 Lint 快速修复触发的高价值问答沉淀。',
      conclusion: askAnswer.answer.slice(0, 1200),
      reasons: [
        `关联 Topic: ${askAnswer.relatedTopicIds.length}`,
        `关联 Project: ${askAnswer.relatedProjectIds.length}`,
        `支撑 Source: ${askAnswer.supportingSourceIds.length}`
      ],
      topicId: askAnswer.relatedTopicIds[0],
      projectId: askAnswer.relatedProjectIds[0],
      sourceIds: askAnswer.supportingSourceIds
    });
    await deps.store.markAskAnswerDeposited(askAnswer.askAnswerId);
  } else {
    throw new Error('该问题类型当前不支持自动修复。');
  }

  await deps.store.resolveLintIssue(lintId);
  return {
    ok: true,
    lintId
  };
}

// --- V1 AI / Review / Home Focus ---

export async function listV1TopicPages(deps: AiOpsDeps): Promise<TopicPage[]> {
  return deps.v1Store.getState().topicPages;
}

export async function createV1TopicPage(
  deps: AiOpsDeps,
  input: { title: string; abstract?: string },
  ensureV1TopicPage: (title: string, abstract?: string) => Promise<TopicPage>
): Promise<TopicPage> {
  return ensureV1TopicPage(input.title, input.abstract);
}

export async function updateV1TopicPage(
  deps: AiOpsDeps,
  input: {
    topicPageId: string;
    title?: string;
    abstract?: string;
    currentConclusion?: string;
    openQuestions?: string[];
    projectIds?: string[];
    lifecycle?: 'active' | 'archived';
  },
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
  }) => Promise<Event>
): Promise<TopicPage> {
  const state = deps.v1Store.getState();
  const page = state.topicPages.find((current) => current.id === input.topicPageId);
  if (!page) {
    throw new Error('TopicPage not found');
  }
  const nextLifecycle = input.lifecycle ?? page.lifecycle;
  const nextPage: TopicPage = {
    ...page,
    slug: input.title ? slugify(input.title) : page.slug,
    title: input.title?.trim() || page.title,
    abstract: input.abstract?.trim() || page.abstract,
    currentConclusion: input.currentConclusion?.trim() || page.currentConclusion,
    openQuestions: input.openQuestions ? uniqueNormalizedStrings(input.openQuestions) : page.openQuestions,
    projectIds: input.projectIds ? uniqueNormalizedStrings(input.projectIds) : page.projectIds,
    lifecycle: nextLifecycle,
    archivedAt: nextLifecycle === 'archived' ? Date.now() : undefined,
    updatedAt: Date.now()
  };
  await deps.v1Store.upsertTopicPage(nextPage);
  if (nextLifecycle === 'archived' && page.lifecycle !== 'archived') {
    await appendV1Event({
      type: 'object.archived',
      actor: 'user',
      objectType: 'topic_page',
      objectId: nextPage.id,
      happenedAt: Date.now()
    });
  }
  return nextPage;
}

export async function listV1Projects(deps: AiOpsDeps): Promise<Project[]> {
  return deps.v1Store.getState().projects;
}

export async function createV1Project(
  deps: AiOpsDeps,
  input: { name: string; goal?: string; phase?: string },
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
  }) => Promise<Event>
): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: `proj_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: input.name.trim(),
    goal: input.goal?.trim() || `${input.name.trim()} 目标待补充`,
    status: 'active',
    phase: input.phase?.trim(),
    focusScore: 0.5,
    knowledgeItemIds: [],
    taskIds: [],
    latestEventIds: [],
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };
  await deps.v1Store.upsertProject(project);
  return project;
}

export async function updateV1Project(
  deps: AiOpsDeps,
  input: {
    projectId: string;
    name?: string;
    goal?: string;
    phase?: string;
    focusScore?: number;
    status?: ProjectStatus;
  },
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
  }) => Promise<Event>
): Promise<Project> {
  const state = deps.v1Store.getState();
  const project = state.projects.find((current) => current.id === input.projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  const nextStatus = input.status ?? project.status;
  const nextLifecycle = nextStatus === 'archived' ? 'archived' : 'active';
  const updatedProject: Project = {
    ...project,
    name: input.name?.trim() || project.name,
    goal: input.goal?.trim() || project.goal,
    phase: input.phase?.trim() || project.phase,
    focusScore: input.focusScore === undefined ? project.focusScore : clampScore(input.focusScore),
    status: nextStatus,
    lifecycle: nextLifecycle,
    archivedAt: nextLifecycle === 'archived' ? Date.now() : undefined,
    updatedAt: Date.now()
  };
  await deps.v1Store.upsertProject(updatedProject);
  if (project.status !== updatedProject.status) {
    await appendV1Event({
      type: 'project.status_changed',
      actor: 'user',
      objectType: 'project',
      objectId: updatedProject.id,
      projectId: updatedProject.id,
      happenedAt: Date.now(),
      payload: {
        from: project.status,
        to: updatedProject.status
      }
    });
  }
  return updatedProject;
}

export async function listV1Tasks(deps: AiOpsDeps): Promise<Task[]> {
  return deps.v1Store.getState().tasks;
}

export async function createV1Task(
  deps: AiOpsDeps,
  input: {
    title: string;
    projectId: string;
    priority?: TaskPriority;
    description?: string;
    relatedKnowledgeItemIds?: string[];
    suggestedNextStep?: string;
    dueAt?: number;
  },
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
  }) => Promise<Event>
): Promise<Task> {
  const state = deps.v1Store.getState();
  const project = state.projects.find((item) => item.id === input.projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  const now = Date.now();
  const task: Task = {
    id: `task_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    title: input.title.trim(),
    description: input.description?.trim(),
    status: 'idea',
    priority: input.priority ?? 'medium',
    projectId: project.id,
    relatedKnowledgeItemIds: uniqueNormalizedStrings(input.relatedKnowledgeItemIds),
    blockedReason: undefined,
    suggestedNextStep: input.suggestedNextStep?.trim(),
    dueAt: input.dueAt,
    completedAt: undefined,
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };
  await deps.v1Store.upsertTask(task);
  await deps.v1Store.upsertProject({
    ...project,
    taskIds: project.taskIds.includes(task.id) ? project.taskIds : [...project.taskIds, task.id],
    updatedAt: now
  });
  await appendV1Event({
    type: 'task.created',
    actor: 'user',
    objectType: 'task',
    objectId: task.id,
    taskId: task.id,
    projectId: task.projectId,
    happenedAt: now
  });
  return task;
}

export async function updateV1Task(
  deps: AiOpsDeps,
  input: {
    taskId: string;
    title?: string;
    description?: string;
    priority?: TaskPriority;
    relatedKnowledgeItemIds?: string[];
    suggestedNextStep?: string;
    dueAt?: number;
    blockedReason?: string;
  }
): Promise<Task> {
  const state = deps.v1Store.getState();
  const task = state.tasks.find((item) => item.id === input.taskId);
  if (!task) {
    throw new Error('Task not found');
  }
  const updatedTask: Task = {
    ...task,
    title: input.title?.trim() || task.title,
    description: input.description?.trim() || task.description,
    priority: input.priority ?? task.priority,
    relatedKnowledgeItemIds: input.relatedKnowledgeItemIds ? uniqueNormalizedStrings(input.relatedKnowledgeItemIds) : task.relatedKnowledgeItemIds,
    suggestedNextStep: input.suggestedNextStep?.trim() || task.suggestedNextStep,
    dueAt: input.dueAt ?? task.dueAt,
    blockedReason: input.blockedReason?.trim() || task.blockedReason,
    updatedAt: Date.now()
  };
  await deps.v1Store.upsertTask(updatedTask);
  return updatedTask;
}

export async function updateV1TaskStatus(
  deps: AiOpsDeps,
  input: { taskId: string; status: TaskStatus; blockedReason?: string },
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
  }) => Promise<Event>
): Promise<Task> {
  const state = deps.v1Store.getState();
  const task = state.tasks.find((item) => item.id === input.taskId);
  if (!task) {
    throw new Error('Task not found');
  }
  const now = Date.now();
  const updatedTask: Task = {
    ...task,
    status: input.status,
    blockedReason: input.blockedReason?.trim() || (input.status === 'blocked' ? task.blockedReason || '待补充阻塞原因' : undefined),
    completedAt: input.status === 'done' ? now : task.completedAt,
    updatedAt: now
  };
  await deps.v1Store.upsertTask(updatedTask);
  await appendV1Event({
    type: 'task.status_changed',
    actor: 'user',
    objectType: 'task',
    objectId: updatedTask.id,
    projectId: updatedTask.projectId,
    taskId: updatedTask.id,
    happenedAt: now,
    payload: {
      from: task.status,
      to: updatedTask.status
    }
  });
  return updatedTask;
}

export async function listV1Events(
  deps: AiOpsDeps,
  input?: { projectId?: string; taskId?: string; from?: number; to?: number }
): Promise<Event[]> {
  const events = deps.v1Store.getState().events;
  return events
    .filter((event) => (input?.projectId ? event.projectId === input.projectId : true))
    .filter((event) => (input?.taskId ? event.taskId === input.taskId : true))
    .filter((event) => (input?.from ? event.happenedAt >= input.from : true))
    .filter((event) => (input?.to ? event.happenedAt <= input.to : true))
    .sort((a, b) => b.happenedAt - a.happenedAt);
}

export async function generateV1Review(
  deps: AiOpsDeps,
  period: ReviewPeriod,
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
  }) => Promise<Event>
): Promise<Review> {
  const state = deps.v1Store.getState();
  const now = Date.now();
  const windowStart = reviewWindowStart(period, now);
  const windowEnd = now;

  const events = state.events.filter((event) => event.happenedAt >= windowStart && event.happenedAt <= windowEnd);
  const completedTasks = state.tasks
    .filter((task) => task.completedAt !== undefined && task.completedAt >= windowStart && task.completedAt <= windowEnd)
    .map((task) => task.id);
  const blockedProjectIds = [...new Set(state.tasks.filter((task) => task.status === 'blocked').map((task) => task.projectId))];
  const unactedHighValueKnowledgeItemIds = state.knowledgeItems
    .filter((item) => item.valueScore >= 0.7)
    .filter((item) => !state.tasks.some((task) => task.relatedKnowledgeItemIds.includes(item.id)))
    .map((item) => item.id);

  const review: Review = {
    id: `review_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    period,
    windowStart,
    windowEnd,
    eventIds: events.map((item) => item.id),
    completedTasks,
    blockedProjects: blockedProjectIds,
    unactedHighValueKnowledgeItemIds,
    summary: `本周期事件 ${events.length} 条，完成任务 ${completedTasks.length} 个，阻塞项目 ${blockedProjectIds.length} 个。`,
    nextStageSuggestions: buildReviewSuggestions({
      blockedCount: blockedProjectIds.length,
      unactedCount: unactedHighValueKnowledgeItemIds.length,
      completedCount: completedTasks.length
    }),
    generatedBy: 'assistant',
    createdAt: now,
    updatedAt: now,
    lifecycle: 'active'
  };
  await deps.v1Store.upsertReview(review);
  await appendV1Event({
    type: 'review.generated',
    actor: 'assistant',
    objectType: 'review',
    objectId: review.id,
    happenedAt: now,
    payload: {
      period
    }
  });
  return review;
}

export async function listV1Reviews(deps: AiOpsDeps): Promise<Review[]> {
  return deps.v1Store.getState().reviews;
}

export async function getV1HomeFocusSnapshot(deps: AiOpsDeps): Promise<HomeFocusSnapshot> {
  const state = deps.v1Store.getState();
  const activeProjects = state.projects.filter((project) => project.status === 'active' && project.lifecycle === 'active');
  const projectFocus = activeProjects
    .map((project) => ({
      projectId: project.id,
      score:
        state.tasks.filter((task) => task.projectId === project.id && task.status === 'doing').length * 2 +
        state.tasks.filter((task) => task.projectId === project.id && task.status === 'next').length
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.projectId);

  const nextActionTaskIds = state.tasks
    .filter((task) => task.status === 'next')
    .sort((a, b) => scoreTaskPriority(b.priority) - scoreTaskPriority(a.priority))
    .slice(0, 8)
    .map((task) => task.id);

  const blockedTaskIds = state.tasks
    .filter((task) => task.status === 'blocked')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
    .map((task) => task.id);

  const recentImportantInboxItemIds = state.inboxItems
    .filter((item) => item.status === 'processed' && item.lifecycle === 'active')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
    .map((item) => item.id);

  return {
    currentFocusProjectIds: projectFocus,
    nextActionTaskIds,
    blockedTaskIds,
    recentImportantInboxItemIds
  };
}

export async function assistantV1Query(
  deps: AiOpsDeps,
  input: AssistantQueryInput
): Promise<AssistantAnswer> {
  const state = deps.v1Store.getState();
  const question = input.question.trim();
  if (!question) {
    throw new Error('question is required');
  }
  const normalized = question.toLowerCase();

  const answerParts: string[] = [];
  const evidence: AssistantAnswer['evidence'] = [];
  const recommendedActions: string[] = [];

  if (normalized.includes('推进') || normalized.includes('最近')) {
    const doingTasks = state.tasks.filter((task) => task.status === 'doing').slice(0, 5);
    answerParts.push(`最近主要在推进 ${doingTasks.length} 个进行中任务。`);
    for (const task of doingTasks) {
      evidence.push({
        kind: 'task',
        id: task.id,
        title: task.title,
        summary: `状态 ${task.status}，优先级 ${task.priority}`
      });
    }
    recommendedActions.push('把 doing 任务拆成下一步可执行动作并限定截止时间');
  }

  if (normalized.includes('高价值') || normalized.includes('未行动')) {
    const unacted = state.knowledgeItems
      .filter((item) => item.valueScore >= 0.7)
      .filter((item) => !state.tasks.some((task) => task.relatedKnowledgeItemIds.includes(item.id)))
      .slice(0, 5);
    answerParts.push(`当前有 ${unacted.length} 条高价值但未行动的知识条目。`);
    for (const item of unacted) {
      evidence.push({
        kind: 'knowledge_item',
        id: item.id,
        title: item.title,
        summary: item.summary
      });
    }
    recommendedActions.push('从高价值知识中创建 1-2 个 next 状态任务');
  }

  if (normalized.includes('下周') || normalized.includes('3 件事') || normalized.includes('三件事')) {
    const candidates = state.tasks
      .filter((task) => task.status === 'next' || task.status === 'idea')
      .sort((a, b) => scoreTaskPriority(b.priority) - scoreTaskPriority(a.priority))
      .slice(0, 3);
    answerParts.push(`下周最值得推进的 3 件事已按优先级筛出 ${candidates.length} 项。`);
    for (const task of candidates) {
      evidence.push({
        kind: 'task',
        id: task.id,
        title: task.title,
        summary: `状态 ${task.status}，优先级 ${task.priority}`
      });
    }
    recommendedActions.push('先确认这 3 项是否都绑定到 active 项目');
  }

  if (answerParts.length === 0) {
    const snapshot = await getV1HomeFocusSnapshot(deps);
    answerParts.push(
      `当前 focus 项目 ${snapshot.currentFocusProjectIds.length} 个，next 任务 ${snapshot.nextActionTaskIds.length} 个，blocked 任务 ${snapshot.blockedTaskIds.length} 个。`
    );
    recommendedActions.push('优先清理 blocked 列表，避免项目停滞');
  }

  return {
    answer: answerParts.join(' '),
    evidence,
    recommendedActions: uniqueNormalizedStrings(recommendedActions).slice(0, 5),
    generatedAt: Date.now()
  };
}

// --- Helper functions ---

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

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'topic';
}

function scoreTaskPriority(priority: TaskPriority): number {
  if (priority === 'critical') {
    return 4;
  }
  if (priority === 'high') {
    return 3;
  }
  if (priority === 'medium') {
    return 2;
  }
  return 1;
}

function reviewWindowStart(period: ReviewPeriod, now: number): number {
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (period === 'daily') {
    return now - oneDayMs;
  }
  if (period === 'weekly') {
    return now - oneDayMs * 7;
  }
  return now - oneDayMs * 30;
}

function buildReviewSuggestions(input: { blockedCount: number; unactedCount: number; completedCount: number }): string[] {
  const suggestions: string[] = [];
  if (input.blockedCount > 0) {
    suggestions.push('优先解除 blocked 项目中的首要阻塞。');
  }
  if (input.unactedCount > 0) {
    suggestions.push('从高价值未行动知识中挑选两条转成 next 任务。');
  }
  if (input.completedCount === 0) {
    suggestions.push('下个周期先确保至少完成一项高优先级任务。');
  } else {
    suggestions.push('延续已完成任务对应的项目节奏，推进下一里程碑。');
  }
  return suggestions.slice(0, 3);
}
