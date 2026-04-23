import { randomUUID } from 'node:crypto';
import type { AssetRecord } from '../../src/shared/knowledge3';
import type { KnowledgeStore } from './knowledgeStore';

export interface AssetOpsDeps {
  store: KnowledgeStore;
}

export function listAssets(deps: AssetOpsDeps) {
  return deps.store.getState().assets;
}

export async function updateAsset(
  deps: AssetOpsDeps,
  input: {
    assetId: string;
    name?: string;
    assetType?: AssetRecord['assetType'];
    usageScene?: string;
    version?: string;
    versionNote?: string;
  }
): Promise<AssetRecord> {
  const state = deps.store.getState();
  const asset = state.assets.find((item) => item.assetId === input.assetId);
  if (!asset) {
    throw new Error('Asset not found');
  }

  const nextName = input.name?.trim() ?? asset.name;
  if (!nextName) {
    throw new Error('Asset 名称不能为空');
  }
  const nextUsageScene = input.usageScene?.trim() ?? asset.usageScene;
  if (!nextUsageScene) {
    throw new Error('Asset 使用场景不能为空');
  }

  const nextAsset: AssetRecord = {
    ...asset,
    name: nextName,
    assetType: input.assetType ?? asset.assetType,
    usageScene: nextUsageScene,
    version: input.version?.trim() || asset.version,
    versionNote: input.versionNote?.trim() ?? asset.versionNote,
    updatedAt: Date.now()
  };
  await deps.store.upsertAsset(nextAsset);
  return nextAsset;
}

export async function createAssetDraft(
  deps: AssetOpsDeps,
  input: {
    name?: string;
    usageScene?: string;
    content?: string;
    topicId?: string;
    projectId?: string;
    sourceIds?: string[];
    assetType?: AssetRecord['assetType'];
  }
): Promise<AssetRecord> {
  const state = deps.store.getState();
  const topic = input.topicId ? state.topics.find((item) => item.topicId === input.topicId) : undefined;
  const project = input.projectId ? state.projects.find((item) => item.projectId === input.projectId) : undefined;

  if (input.topicId && !topic) {
    throw new Error('Topic not found');
  }
  if (input.projectId && !project) {
    throw new Error('Project not found');
  }

  const assetName =
    input.name?.trim() ||
    `Asset / ${(topic?.name || project?.name || 'Reusable').slice(0, 40)}`;
  const usageScene =
    input.usageScene?.trim() ||
    (project ? `用于项目「${project.name}」` : topic ? `用于主题「${topic.name}」` : '用于复用沉淀');
  const rawContent = input.content?.trim() || '';

  const asset: AssetRecord = {
    assetId: `asset_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: assetName,
    assetType: input.assetType ?? 'template',
    usageScene,
    sourceIds: (input.sourceIds ?? []).slice(0, 12),
    topicIds: topic ? [topic.topicId] : [],
    projectIds: project ? [project.projectId] : [],
    version: 'v0.1-draft',
    versionNote: '初始草稿版本',
    versionHistory: [],
    lifecycle: 'active',
    updatedAt: Date.now()
  };

  if (rawContent) {
    const enrichedUsage = `${usageScene}｜${rawContent.slice(0, 120)}`;
    asset.usageScene = enrichedUsage;
  }

  await deps.store.upsertAsset(asset);
  return asset;
}

export async function updateAssetVersion(
  deps: AssetOpsDeps,
  input: { assetId: string; version: string; note?: string }
): Promise<AssetRecord> {
  const state = deps.store.getState();
  const asset = state.assets.find((item) => item.assetId === input.assetId);
  if (!asset) {
    throw new Error('Asset not found');
  }

  const nextVersion = input.version.trim();
  if (!nextVersion) {
    throw new Error('版本号不能为空');
  }

  const nextAsset: AssetRecord = {
    ...asset,
    version: nextVersion,
    versionNote: input.note?.trim() || '',
    versionHistory: [
      ...(asset.versionHistory ?? []),
      {
        version: asset.version,
        note: asset.versionNote ?? '',
        updatedAt: asset.updatedAt
      }
    ],
    updatedAt: Date.now()
  };
  await deps.store.upsertAsset(nextAsset);
  return nextAsset;
}

export async function archiveAsset(deps: AssetOpsDeps, assetId: string): Promise<AssetRecord> {
  const state = deps.store.getState();
  const asset = state.assets.find((item) => item.assetId === assetId);
  if (!asset) {
    throw new Error('Asset not found');
  }
  const nextAsset: AssetRecord = {
    ...asset,
    lifecycle: 'archived',
    archivedAt: Date.now(),
    updatedAt: Date.now()
  };
  await deps.store.upsertAsset(nextAsset);
  return nextAsset;
}

export async function deleteAsset(
  deps: AssetOpsDeps,
  assetId: string
): Promise<{ ok: true; assetId: string }> {
  const state = deps.store.getState();
  const exists = state.assets.some((item) => item.assetId === assetId);
  if (!exists) {
    throw new Error('Asset not found');
  }
  await deps.store.removeAsset(assetId);
  return { ok: true, assetId };
}
