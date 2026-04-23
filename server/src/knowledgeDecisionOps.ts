import { randomUUID } from 'node:crypto';
import type { DecisionRecord } from '../../src/shared/knowledge3';
import type { KnowledgeStore } from './knowledgeStore';

export interface DecisionOpsDeps {
  store: KnowledgeStore;
}

export function listDecisions(deps: DecisionOpsDeps) {
  return deps.store.getState().decisions;
}

export async function updateDecision(
  deps: DecisionOpsDeps,
  input: {
    decisionId: string;
    title?: string;
    background?: string;
    conclusion?: string;
    reasons?: string[];
    impactScope?: string;
    alternatives?: string[];
    nextActions?: string[];
  }
): Promise<DecisionRecord> {
  const state = deps.store.getState();
  const decision = state.decisions.find((item) => item.decisionId === input.decisionId);
  if (!decision) {
    throw new Error('Decision not found');
  }

  const nextTitle = input.title?.trim() ?? decision.title;
  const nextConclusion = input.conclusion?.trim() ?? decision.conclusion;
  if (!nextTitle) {
    throw new Error('Decision 标题不能为空');
  }
  if (!nextConclusion) {
    throw new Error('Decision 结论不能为空');
  }

  const nextDecision: DecisionRecord = {
    ...decision,
    title: nextTitle,
    background: input.background?.trim() ?? decision.background,
    conclusion: nextConclusion,
    reasons: input.reasons?.map((item) => item.trim()).filter(Boolean).slice(0, 10) ?? decision.reasons,
    impactScope: input.impactScope?.trim() ?? decision.impactScope,
    alternatives: input.alternatives?.map((item) => item.trim()).filter(Boolean).slice(0, 10) ?? decision.alternatives,
    nextActions: input.nextActions?.map((item) => item.trim()).filter(Boolean).slice(0, 10) ?? decision.nextActions,
    updatedAt: Date.now()
  };
  await deps.store.upsertDecision(nextDecision);
  return nextDecision;
}

export async function createDecisionDraft(
  deps: DecisionOpsDeps,
  input: {
    title?: string;
    background?: string;
    conclusion: string;
    reasons?: string[];
    topicId?: string;
    projectId?: string;
    sourceIds?: string[];
  }
): Promise<DecisionRecord> {
  const conclusion = input.conclusion.trim();
  if (!conclusion) {
    throw new Error('Decision 结论不能为空');
  }

  const state = deps.store.getState();
  const topic = input.topicId ? state.topics.find((item) => item.topicId === input.topicId) : undefined;
  const project = input.projectId ? state.projects.find((item) => item.projectId === input.projectId) : undefined;

  if (input.topicId && !topic) {
    throw new Error('Topic not found');
  }
  if (input.projectId && !project) {
    throw new Error('Project not found');
  }

  const decision: DecisionRecord = {
    decisionId: `dec_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    title:
      input.title?.trim() ||
      `Decision / ${(topic?.name || project?.name || 'General').slice(0, 40)}`,
    projectId: project?.projectId,
    topicId: topic?.topicId,
    background: input.background?.trim() || '由 Ask AI 或知识页触发的快速决策沉淀。',
    conclusion: conclusion.slice(0, 1200),
    reasons: (input.reasons ?? []).filter((item) => item.trim()).slice(0, 5),
    impactScope: project?.name || topic?.name || '待补充',
    alternatives: [],
    nextActions: [
      '在对应 Topic / Project 页面补充验证结果',
      '如需落地实现，拆成可执行任务单'
    ],
    sourceIds: (input.sourceIds ?? []).slice(0, 10),
    lifecycle: 'active',
    updatedAt: Date.now()
  };

  await deps.store.upsertDecision(decision);
  return decision;
}

export async function archiveDecision(deps: DecisionOpsDeps, decisionId: string): Promise<DecisionRecord> {
  const state = deps.store.getState();
  const decision = state.decisions.find((item) => item.decisionId === decisionId);
  if (!decision) {
    throw new Error('Decision not found');
  }
  const nextDecision: DecisionRecord = {
    ...decision,
    lifecycle: 'archived',
    archivedAt: Date.now(),
    updatedAt: Date.now()
  };
  await deps.store.upsertDecision(nextDecision);
  return nextDecision;
}

export async function deleteDecision(
  deps: DecisionOpsDeps,
  decisionId: string
): Promise<{ ok: true; decisionId: string }> {
  const state = deps.store.getState();
  const exists = state.decisions.some((item) => item.decisionId === decisionId);
  if (!exists) {
    throw new Error('Decision not found');
  }
  await deps.store.removeDecision(decisionId);
  return { ok: true, decisionId };
}
