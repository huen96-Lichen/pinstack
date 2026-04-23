import { randomUUID } from 'node:crypto';
import type { ProjectRecord, TopicRecord } from '../../src/shared/knowledge3';
import type { KnowledgeStore } from './knowledgeStore';

export interface ProjectOpsDeps {
  store: KnowledgeStore;
  getWebUrl: () => string;
}

export function listProjects(deps: ProjectOpsDeps) {
  return deps.store.getState().projects;
}

export async function updateProject(
  deps: ProjectOpsDeps,
  input: {
    projectId: string;
    name?: string;
    goal?: string;
    currentVersion?: string;
    status?: ProjectRecord['status'];
  }
): Promise<ProjectRecord> {
  const project = requireProject(deps, input.projectId);
  const nextName = input.name?.trim() ?? project.name;
  if (!nextName) {
    throw new Error('Project 名称不能为空');
  }
  const nextGoal = input.goal?.trim() ?? project.goal;
  if (!nextGoal) {
    throw new Error('Project 目标不能为空');
  }
  const nextVersion = input.currentVersion?.trim() ?? project.currentVersion;
  if (!nextVersion) {
    throw new Error('Project 版本不能为空');
  }

  const nextProject: ProjectRecord = {
    ...project,
    name: nextName,
    goal: nextGoal,
    currentVersion: nextVersion,
    status: input.status ?? project.status,
    updatedAt: Date.now()
  };
  await deps.store.upsertProject(nextProject);
  return nextProject;
}

export async function createProject(
  deps: ProjectOpsDeps,
  input: { name: string; goal?: string }
): Promise<ProjectRecord> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Project 名称不能为空');
  }

  const state = deps.store.getState();
  const existing = state.projects.find((project) => project.name.trim().toLowerCase() === trimmedName.toLowerCase());
  if (existing) {
    return existing;
  }

  const project: ProjectRecord = {
    projectId: `proj_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: trimmedName,
    goal: input.goal?.trim() || `${trimmedName} 的项目目标待补充。`,
    currentVersion: '3.0-alpha',
    status: 'active',
    topicIds: [],
    decisionIds: [],
    assetIds: [],
    sourceIds: [],
    lifecycle: 'active',
    updatedAt: Date.now()
  };
  await deps.store.upsertProject(project);
  return project;
}

export async function archiveProject(deps: ProjectOpsDeps, projectId: string): Promise<ProjectRecord> {
  const project = requireProject(deps, projectId);
  const nextProject: ProjectRecord = {
    ...project,
    lifecycle: 'archived',
    archivedAt: Date.now(),
    updatedAt: Date.now()
  };
  await deps.store.upsertProject(nextProject);
  return nextProject;
}

export async function mergeProjects(
  deps: ProjectOpsDeps,
  input: { sourceProjectId: string; targetProjectId: string }
): Promise<{ ok: true; sourceProjectId: string; targetProjectId: string }> {
  if (input.sourceProjectId === input.targetProjectId) {
    throw new Error('不能把 Project 合并到自身。');
  }
  const sourceProject = requireProject(deps, input.sourceProjectId);
  const targetProject = requireProject(deps, input.targetProjectId);
  if (sourceProject.lifecycle !== 'active' || targetProject.lifecycle !== 'active') {
    throw new Error('只能合并活跃 Project。');
  }

  const state = deps.store.getState();
  for (const source of state.sources.filter((item) => item.projectIds.includes(sourceProject.projectId))) {
    const nextProjectIds = uniqueIds(source.projectIds.map((item) => (item === sourceProject.projectId ? targetProject.projectId : item)));
    await deps.store.upsertSource({
      ...source,
      projectIds: nextProjectIds,
      enteredKnowledgePage: true,
      knowledgePageLink: `${deps.getWebUrl()}#/projects/${encodeURIComponent(targetProject.projectId)}`,
      updatedAt: Date.now()
    });
  }

  for (const decision of state.decisions.filter((item) => item.projectId === sourceProject.projectId)) {
    await deps.store.upsertDecision({
      ...decision,
      projectId: targetProject.projectId,
      updatedAt: Date.now()
    });
  }

  for (const asset of state.assets.filter((item) => item.projectIds.includes(sourceProject.projectId))) {
    await deps.store.upsertAsset({
      ...asset,
      projectIds: uniqueIds(asset.projectIds.map((item) => (item === sourceProject.projectId ? targetProject.projectId : item))),
      updatedAt: Date.now()
    });
  }

  await deps.store.upsertProject({
    ...targetProject,
    topicIds: uniqueIds([...targetProject.topicIds, ...sourceProject.topicIds]),
    decisionIds: uniqueIds([...targetProject.decisionIds, ...sourceProject.decisionIds]),
    assetIds: uniqueIds([...targetProject.assetIds, ...sourceProject.assetIds]),
    sourceIds: uniqueIds([...targetProject.sourceIds, ...sourceProject.sourceIds]),
    updatedAt: Date.now()
  });
  await deps.store.upsertProject({
    ...sourceProject,
    topicIds: [],
    decisionIds: [],
    assetIds: [],
    sourceIds: [],
    lifecycle: 'archived',
    archivedAt: Date.now(),
    mergedInto: targetProject.projectId,
    updatedAt: Date.now()
  });

  return { ok: true, sourceProjectId: sourceProject.projectId, targetProjectId: targetProject.projectId };
}

export async function deleteProject(
  deps: ProjectOpsDeps,
  projectId: string
): Promise<{ ok: true; projectId: string }> {
  const project = requireProject(deps, projectId);
  const state = deps.store.getState();
  const hasDependencies = Boolean(
    project.topicIds.length ||
    project.decisionIds.length ||
    project.assetIds.length ||
    project.sourceIds.length
  );
  if (hasDependencies) {
    throw new Error('该 Project 仍有关系依赖，当前只允许归档。');
  }
  await deps.store.removeProject(project.projectId);
  return { ok: true, projectId };
}

export async function attachTopicToProject(
  deps: ProjectOpsDeps,
  input: { topicId: string; projectId?: string; projectName?: string },
  createProjectFn: (input: { name: string; goal?: string }) => Promise<ProjectRecord>
) {
  const state = deps.store.getState();
  const topic = state.topics.find((item) => item.topicId === input.topicId);
  if (!topic) {
    throw new Error('Topic not found');
  }

  let project = input.projectId ? state.projects.find((item) => item.projectId === input.projectId) : undefined;
  if (!project && input.projectName?.trim()) {
    const normalizedName = input.projectName.trim().toLowerCase();
    project = state.projects.find((item) => item.name.trim().toLowerCase() === normalizedName);
    if (!project) {
      project = await createProjectFn({ name: input.projectName.trim() });
    }
  }

  if (!project) {
    throw new Error('Project not found');
  }
  if (project.lifecycle !== 'active') {
    throw new Error('归档 Project 不能继续挂接 Topic。');
  }
  if (topic.lifecycle !== 'active') {
    throw new Error('归档 Topic 不能继续挂接 Project。');
  }

  const nextTopicIds = project.topicIds.includes(topic.topicId) ? project.topicIds : [...project.topicIds, topic.topicId];
  await deps.store.upsertProject({
    ...project,
    topicIds: nextTopicIds,
    updatedAt: Date.now()
  });

  return {
    ok: true,
    topicId: topic.topicId,
    projectId: project.projectId
  };
}

function requireProject(deps: ProjectOpsDeps, projectId: string): ProjectRecord {
  const project = deps.store.getState().projects.find((item) => item.projectId === projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  return project;
}

function uniqueIds(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}
