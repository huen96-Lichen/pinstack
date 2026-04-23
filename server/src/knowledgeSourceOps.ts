import type { StorageService } from '../../src/main/storage';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  KnowledgeIngestRecordResult,
  SourceContentType,
  SourceEntryMethod,
  TopicRecord,
  TopicSuggestion
} from '../../src/shared/knowledge3';
import type { KnowledgeStore } from './knowledgeStore';
import type { LocalKnowledgeWorkspace } from './localKnowledgeWorkspace';
import type { SourcePersistenceService } from './sourcePersistence';

export interface SourceOpsDeps {
  store: KnowledgeStore;
  storage: StorageService;
  sourcePersistence: SourcePersistenceService;
  localKnowledgeWorkspace: LocalKnowledgeWorkspace;
  getWebUrl: () => string;
}

export async function ingestExistingRecord(
  deps: SourceOpsDeps,
  recordId: string
): Promise<KnowledgeIngestRecordResult> {
  const existing = deps.store.findSourceByDesktopRecordId(recordId);
  if (existing && existing.syncStatus === 'synced') {
    return {
      source: existing,
      createdRawDocument: Boolean(existing.rawDocumentId)
    };
  }

  const record = deps.storage.getRecord(recordId);
  if (record.type !== 'text') {
    throw new Error('PinStack 3.0 alpha 当前只支持把文本记录送入知识 Inbox。');
  }

  const content = await deps.storage.getRecordContent(recordId);
  if (content.type !== 'text') {
    throw new Error('记录内容类型不匹配。');
  }

  return deps.sourcePersistence.persist({
    desktopRecordId: record.id,
    title: record.displayName?.trim() || record.previewText?.trim() || '未命名资料',
    textContent: content.text,
    contentType: 'text',
    entryMethod: 'clipboard',
    sourcePlatform: record.sourceApp?.trim() || 'PinStack',
    sourceLink: record.originalUrl?.trim() || undefined
  });
}

export async function ingestText(
  deps: SourceOpsDeps,
  input: {
    title: string;
    text: string;
    sourcePlatform?: string;
    sourceLink?: string;
  }
): Promise<KnowledgeIngestRecordResult> {
  const record = await deps.storage.createTextRecord(input.text, {
    source: 'clipboard',
    sourceApp: input.sourcePlatform?.trim() || 'PinStack 3.0',
    tags: ['knowledge-source']
  });

  if (input.sourceLink?.trim()) {
    await deps.storage.updateRecordMeta(record.id, {
      originalUrl: input.sourceLink.trim()
    });
  }
  if (input.title.trim()) {
    await deps.storage.renameRecord(record.id, input.title.trim());
  }

  return deps.sourcePersistence.persist({
    desktopRecordId: record.id,
    title: input.title.trim() || record.displayName?.trim() || '未命名资料',
    textContent: input.text,
    contentType: 'text',
    entryMethod: 'clipboard',
    sourcePlatform: input.sourcePlatform?.trim() || 'PinStack 3.0',
    sourceLink: input.sourceLink?.trim() || undefined
  });
}

export async function ingestWeb(
  deps: SourceOpsDeps,
  input: { url: string }
): Promise<KnowledgeIngestRecordResult> {
  const metadata = await fetchWebMetadata(input.url);
  const record = await deps.storage.createTextRecord(metadata.textContent, {
    source: 'clipboard',
    sourceApp: metadata.siteName || metadata.sourcePlatform || '网页采集',
    tags: ['web', 'knowledge-source']
  });

  await deps.storage.renameRecord(record.id, metadata.title);
  await deps.storage.updateRecordMeta(record.id, {
    originalUrl: metadata.sourceLink
  });

  return deps.sourcePersistence.persist({
    desktopRecordId: record.id,
    title: metadata.title,
    textContent: metadata.textContent,
    contentType: 'web',
    entryMethod: 'web_import',
    sourcePlatform: metadata.sourcePlatform,
    sourceLink: metadata.sourceLink,
    siteName: metadata.siteName,
    publishedAt: metadata.publishedAt,
    heroImageUrl: metadata.heroImageUrl,
    pageType: metadata.pageType
  });
}

export async function ingestCapture(
  deps: SourceOpsDeps,
  input: {
    type: 'text' | 'link' | 'note' | 'image' | 'pdf' | 'message' | 'email' | 'video' | 'audio' | 'template';
    title?: string;
    contentText?: string;
    sourceUrl?: string;
    sourcePlatform?: string;
  }
): Promise<KnowledgeIngestRecordResult> {
  const normalizedTitle = input.title?.trim() || '未命名资料';
  const normalizedText = input.contentText?.trim() || '';
  const normalizedUrl = input.sourceUrl?.trim() || undefined;
  const normalizedPlatform = input.sourcePlatform?.trim() || 'PinStack 3.0';

  if (input.type === 'link' && normalizedUrl) {
    return ingestWeb(deps, { url: normalizedUrl });
  }

  const mapping = mapCaptureTypeToKnowledgeType(input.type);
  const fallbackText =
    normalizedText ||
    (normalizedUrl ? `来源链接：${normalizedUrl}` : '') ||
    `${mapping.label}内容，待补充详细文本。`;

  const record = await deps.storage.createTextRecord(fallbackText, {
    source: 'clipboard',
    sourceApp: normalizedPlatform,
    tags: ['knowledge-source', `capture-${input.type}`]
  });

  if (normalizedUrl) {
    await deps.storage.updateRecordMeta(record.id, { originalUrl: normalizedUrl });
  }
  if (normalizedTitle) {
    await deps.storage.renameRecord(record.id, normalizedTitle);
  }

  return deps.sourcePersistence.persist({
    desktopRecordId: record.id,
    title: normalizedTitle,
    textContent: fallbackText,
    contentType: mapping.contentType,
    entryMethod: mapping.entryMethod,
    sourcePlatform: normalizedPlatform,
    sourceLink: normalizedUrl
  });
}

export async function updateSourceStatus(
  deps: SourceOpsDeps,
  sourceId: string,
  currentStatus: 'Processed' | 'Archived' | 'Linked'
): Promise<void> {
  const state = deps.store.getState();
  const source = state.sources.find((item) => item.sourceId === sourceId);
  if (!source) {
    throw new Error('Source not found');
  }
  await deps.store.upsertSource({
    ...source,
    currentStatus,
    updatedAt: Date.now()
  });
}

export async function resyncSource(
  deps: SourceOpsDeps,
  sourceId: string
): Promise<KnowledgeIngestRecordResult> {
  const source = deps.store.findSourceById(sourceId);
  if (!source) {
    throw new Error('Source not found');
  }
  if (!source.desktopRecordId) {
    throw new Error('该 Source 缺少 desktop record，当前无法重新同步。');
  }

  const record = deps.storage.getRecord(source.desktopRecordId);
  if (record.type !== 'text') {
    throw new Error('当前仅支持文本 Source 重新同步。');
  }
  const content = await deps.storage.getRecordContent(source.desktopRecordId);
  if (content.type !== 'text') {
    throw new Error('记录内容类型不匹配。');
  }

  return deps.sourcePersistence.persist({
    desktopRecordId: source.desktopRecordId,
    title: source.title,
    textContent: content.text,
    contentType: source.contentType,
    entryMethod: source.entryMethod,
    sourcePlatform: source.sourcePlatform,
    sourceLink: source.sourceLink,
    siteName: source.siteName,
    publishedAt: source.publishedAt,
    heroImageUrl: source.heroImageUrl,
    pageType: source.pageType
  });
}

export function listSources(deps: SourceOpsDeps) {
  return deps.store.getState().sources;
}

export async function attachSourceToTopic(
  deps: SourceOpsDeps,
  input: { sourceId: string; topicId?: string; topicName?: string },
  createTopic: (input: { name: string; description?: string }) => Promise<TopicRecord>
): Promise<{ ok: true; sourceId: string; topicId: string }> {
  const source = deps.store.findSourceById(input.sourceId);
  if (!source) {
    throw new Error('Source not found');
  }

  const state = deps.store.getState();
  let topic = input.topicId ? state.topics.find((item) => item.topicId === input.topicId) : undefined;
  if (!topic && input.topicName?.trim()) {
    const normalizedName = input.topicName.trim().toLowerCase();
    topic = state.topics.find((item) => item.name.trim().toLowerCase() === normalizedName);
    if (!topic) {
      topic = await createTopic({ name: input.topicName.trim() });
    }
  }

  if (!topic) {
    throw new Error('Topic not found');
  }
  if (topic.lifecycle !== 'active') {
    throw new Error('归档 Topic 不能继续挂接，请先恢复或选择活跃 Topic。');
  }

  const nextTopicIds = source.topicIds.includes(topic.topicId) ? source.topicIds : [...source.topicIds, topic.topicId];
  const nextStatus = source.currentStatus === 'Inbox' ? 'Linked' : source.currentStatus;

  await deps.store.upsertSource({
    ...source,
    topicIds: nextTopicIds,
    enteredKnowledgePage: true,
    knowledgePageLink: `${deps.getWebUrl()}#/topics/${encodeURIComponent(topic.topicId)}`,
    currentStatus: nextStatus,
    updatedAt: Date.now()
  });

  return {
    ok: true,
    sourceId: source.sourceId,
    topicId: topic.topicId
  };
}

export async function attachSourceToProject(
  deps: SourceOpsDeps,
  input: { sourceId: string; projectId?: string; projectName?: string },
  createProject: (input: { name: string; goal?: string }) => Promise<import('../../src/shared/knowledge3').ProjectRecord>
): Promise<{ ok: true; sourceId: string; projectId: string }> {
  const source = deps.store.findSourceById(input.sourceId);
  if (!source) {
    throw new Error('Source not found');
  }

  const state = deps.store.getState();
  let project = input.projectId ? state.projects.find((item) => item.projectId === input.projectId) : undefined;
  if (!project && input.projectName?.trim()) {
    const normalizedName = input.projectName.trim().toLowerCase();
    project = state.projects.find((item) => item.name.trim().toLowerCase() === normalizedName);
    if (!project) {
      project = await createProject({ name: input.projectName.trim() });
    }
  }

  if (!project) {
    throw new Error('Project not found');
  }
  if (project.lifecycle !== 'active') {
    throw new Error('归档 Project 不能继续挂接，请先恢复或选择活跃 Project。');
  }

  const nextProjectIds = source.projectIds.includes(project.projectId) ? source.projectIds : [...source.projectIds, project.projectId];
  const nextStatus = source.currentStatus === 'Inbox' ? 'Linked' : source.currentStatus;

  await deps.store.upsertSource({
    ...source,
    projectIds: nextProjectIds,
    enteredKnowledgePage: true,
    knowledgePageLink: `${deps.getWebUrl()}#/projects/${encodeURIComponent(project.projectId)}`,
    currentStatus: nextStatus,
    updatedAt: Date.now()
  });

  return {
    ok: true,
    sourceId: source.sourceId,
    projectId: project.projectId
  };
}

export async function recommendTopicsForSource(
  deps: SourceOpsDeps,
  sourceId: string
): Promise<TopicSuggestion[]> {
  const source = deps.store.findSourceById(sourceId);
  if (!source) {
    throw new Error('Source not found');
  }

  const state = deps.store.getState();
  const sourceTerms = tokenize(
    [source.title, source.oneLineSummary, source.coreConclusion, source.keywords.join(' ')].join(' ')
  );
  const suggestions: TopicSuggestion[] = [];
  for (const topic of state.topics) {
    const topicTerms = tokenize([topic.name, topic.description, topic.currentConclusion].join(' '));
    const overlap = intersectionCount(sourceTerms, topicTerms);
    const score = overlap + Math.max(0, 3 - Math.abs(topic.sourceIds.length - 3)) * 0.1;
    if (score <= 0) {
      continue;
    }
    suggestions.push({
      topicId: topic.topicId,
      topicName: topic.name,
      reason: overlap > 0 ? `关键词重合 ${overlap} 项` : '主题规模接近，建议先归类',
      score: Number(score.toFixed(2)),
      isNew: false
    });
  }
  suggestions.sort((a, b) => b.score - a.score);
  const topSuggestions = suggestions.slice(0, 3);

  if (topSuggestions.length > 0) {
    return topSuggestions;
  }

  const base = source.siteName || source.sourcePlatform || '知识主题';
  const fallbackName = `${base} / ${source.contentType}`;
  return [
    {
      topicName: fallbackName,
      reason: '未匹配到现有 Topic，建议新建并挂接',
      score: 0.1,
      isNew: true
    }
  ];
}

// --- Web metadata helpers ---

interface WebMetadata {
  title: string;
  siteName: string;
  sourcePlatform: string;
  sourceLink: string;
  publishedAt?: number;
  heroImageUrl?: string;
  pageType: import('../../src/shared/knowledge3').WebPageType;
  textContent: string;
}

async function fetchWebMetadata(url: string): Promise<WebMetadata> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`网页采集失败：${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const title =
    extractMeta(html, 'property', 'og:title') ??
    extractMeta(html, 'name', 'twitter:title') ??
    extractFirst(html, /<title[^>]*>([^<]+)<\/title>/i) ??
    url;
  const siteName =
    extractMeta(html, 'property', 'og:site_name') ??
    extractMeta(html, 'name', 'application-name') ??
    new URL(url).hostname.replace(/^www\./, '');
  const description =
    extractMeta(html, 'name', 'description') ??
    extractMeta(html, 'property', 'og:description') ??
    '';
  const publishedAtText =
    extractMeta(html, 'property', 'article:published_time') ??
    extractMeta(html, 'name', 'pubdate') ??
    extractMeta(html, 'name', 'date');
  const heroImageUrl = extractMeta(html, 'property', 'og:image') ?? extractMeta(html, 'name', 'twitter:image');
  const pageType = inferPageType(url, html, title);
  const mainContent = extractReadableText(html);
  const textContent = [description.trim(), mainContent].filter(Boolean).join('\n\n') || title;

  return {
    title: cleanupTitle(title),
    siteName: cleanupTitle(siteName),
    sourcePlatform: cleanupTitle(siteName),
    sourceLink: url,
    publishedAt: parsePublishedAt(publishedAtText),
    heroImageUrl: heroImageUrl?.trim(),
    pageType,
    textContent
  };
}

function extractMeta(html: string, attrName: 'name' | 'property', attrValue: string): string | undefined {
  const pattern = new RegExp(`<meta[^>]+${attrName}=["']${escapeRegExp(attrValue)}["'][^>]+content=["']([^"']+)["']`, 'i');
  const reversedPattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${escapeRegExp(attrValue)}["']`, 'i');
  return html.match(pattern)?.[1]?.trim() ?? html.match(reversedPattern)?.[1]?.trim();
}

function extractFirst(input: string, pattern: RegExp): string | undefined {
  return input.match(pattern)?.[1]?.trim();
}

function inferPageType(url: string, html: string, title: string): import('../../src/shared/knowledge3').WebPageType {
  const normalizedUrl = url.toLowerCase();
  const normalizedTitle = title.toLowerCase();
  const normalizedHtml = html.toLowerCase();
  if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('bilibili.com') || normalizedHtml.includes('og:type\" content=\"video')) {
    return 'video_page';
  }
  if (normalizedUrl.includes('/docs/') || normalizedUrl.includes('/doc/') || normalizedHtml.includes('documentation')) {
    return 'doc_page';
  }
  if (normalizedUrl.includes('/product') || normalizedTitle.includes('pricing') || normalizedTitle.includes('product')) {
    return 'product_page';
  }
  if (normalizedHtml.includes('<article') || normalizedTitle.length > 0) {
    return 'article';
  }
  if ((html.match(/<li/gi)?.length ?? 0) > 12) {
    return 'list_page';
  }
  return 'unknown';
}

function extractReadableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

function parsePublishedAt(value?: string): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const timestamp = Date.parse(value.trim());
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function cleanupTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function mapCaptureTypeToKnowledgeType(type: 'text' | 'link' | 'note' | 'image' | 'pdf' | 'message' | 'email' | 'video' | 'audio' | 'template'): {
  contentType: SourceContentType;
  entryMethod: SourceEntryMethod;
  label: string;
} {
  if (type === 'image') {
    return { contentType: 'image', entryMethod: 'image_capture', label: '图片' };
  }
  if (type === 'video') {
    return { contentType: 'video', entryMethod: 'video_import', label: '视频' };
  }
  if (type === 'audio') {
    return { contentType: 'audio', entryMethod: 'audio_note', label: '语音' };
  }
  if (type === 'template') {
    return { contentType: 'doc', entryMethod: 'template', label: '模板' };
  }
  if (type === 'link') {
    return { contentType: 'web', entryMethod: 'web_import', label: '网页' };
  }
  if (type === 'message' || type === 'email') {
    return { contentType: 'chat', entryMethod: 'clipboard', label: '沟通' };
  }
  if (type === 'pdf') {
    return { contentType: 'doc', entryMethod: 'clipboard', label: '文档' };
  }
  return { contentType: 'text', entryMethod: 'clipboard', label: '文本' };
}

export async function ingestFromFile(
  deps: SourceOpsDeps,
  input: {
    filePath: string;
    dirRoot: string;
    contentHash: string;
    sourcePlatform?: string;
  }
): Promise<KnowledgeIngestRecordResult> {
  const textContent = await fs.readFile(input.filePath, 'utf8');

  // 从 Markdown frontmatter 或文件名提取标题
  let title = path.basename(input.filePath, path.extname(input.filePath));
  const frontmatterMatch = textContent.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const titleMatch = fm.match(/(?:^|\n)title:\s*(.+)/);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }

  return deps.sourcePersistence.persist({
    title,
    textContent,
    contentType: 'doc',
    entryMethod: 'directory_scan',
    sourcePlatform: input.sourcePlatform || 'Obsidian',
    originFilePath: input.filePath,
    originFileHash: input.contentHash,
    originDirRoot: input.dirRoot,
    skipAiSummary: true
  });
}
