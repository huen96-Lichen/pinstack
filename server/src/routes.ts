import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AskAiQuery } from '../../src/shared/knowledge3';
import type { KnowledgeRuntime } from './knowledgeRuntime';

export interface RouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  runtime: KnowledgeRuntime;
  method: string;
  pathname: string;
  url: URL;
  requestOrigin: string | null;
  json: (statusCode: number, data: unknown) => void;
  html: (content: string) => void;
  match: RegExpExecArray | null;
}

export interface Route {
  method: string;
  pattern: string | RegExp;
  handler: (ctx: RouteContext) => Promise<void>;
}

function matchPattern(pattern: string | RegExp, pathname: string): RegExpExecArray | null {
  if (pattern instanceof RegExp) {
    return pattern.exec(pathname);
  }
  if (pattern === pathname) {
    return [] as unknown as RegExpExecArray;
  }
  return null;
}

export async function dispatchRoutes(
  routes: Route[],
  ctx: RouteContext
): Promise<boolean> {
  for (const route of routes) {
    if (route.method !== ctx.method) {
      continue;
    }
    const match = matchPattern(route.pattern, ctx.pathname);
    if (match) {
      await route.handler({ ...ctx, match });
      return true;
    }
  }
  return false;
}

// --- Route definitions ---

export function createRoutes(): Route[] {
  return [
    // Health & Workspace
    { method: 'GET', pattern: '/health', handler: handleHealth },
    { method: 'GET', pattern: '/workspace/snapshot', handler: handleWorkspaceSnapshot },

    // V1 Inbox
    { method: 'GET', pattern: '/v1/inbox-items', handler: handleListV1InboxItems },
    { method: 'POST', pattern: '/v1/capture/inbox-items', handler: handleCaptureV1InboxItem },
    { method: 'POST', pattern: /^\/v1\/pipeline\/process\/([^/]+)$/, handler: handleProcessV1InboxItem },

    // V1 Knowledge Items
    { method: 'GET', pattern: '/v1/knowledge/items', handler: handleListV1KnowledgeItems },
    { method: 'POST', pattern: '/v1/knowledge/items', handler: handleCreateV1KnowledgeItem },
    { method: 'PATCH', pattern: /^\/v1\/knowledge\/items\/([^/]+)$/, handler: handleUpdateV1KnowledgeItem },

    // V1 Topics
    { method: 'GET', pattern: '/v1/knowledge/topics', handler: handleListV1TopicPages },
    { method: 'POST', pattern: '/v1/knowledge/topics', handler: handleCreateV1TopicPage },
    { method: 'PATCH', pattern: /^\/v1\/knowledge\/topics\/([^/]+)$/, handler: handleUpdateV1TopicPage },

    // V1 Projects
    { method: 'GET', pattern: '/v1/projects', handler: handleListV1Projects },
    { method: 'POST', pattern: '/v1/projects', handler: handleCreateV1Project },
    { method: 'PATCH', pattern: /^\/v1\/projects\/([^/]+)$/, handler: handleUpdateV1Project },

    // V1 Tasks
    { method: 'GET', pattern: '/v1/tasks', handler: handleListV1Tasks },
    { method: 'POST', pattern: '/v1/tasks', handler: handleCreateV1Task },
    { method: 'PATCH', pattern: /^\/v1\/tasks\/([^/]+)$/, handler: handleUpdateV1Task },
    { method: 'POST', pattern: /^\/v1\/tasks\/([^/]+)\/status$/, handler: handleUpdateV1TaskStatus },

    // V1 Timeline & Home
    { method: 'GET', pattern: '/v1/timeline/events', handler: handleListV1Events },
    { method: 'GET', pattern: '/v1/home/focus', handler: handleGetV1HomeFocus },

    // V1 Reviews
    { method: 'GET', pattern: '/v1/reviews', handler: handleListV1Reviews },
    { method: 'POST', pattern: '/v1/reviews/generate', handler: handleGenerateV1Review },

    // V1 Assistant
    { method: 'POST', pattern: '/v1/assistant/query', handler: handleAssistantV1Query },

    // Sources (v0)
    { method: 'GET', pattern: '/sources', handler: handleListSources },

    // Topics (v0)
    { method: 'GET', pattern: '/topics', handler: handleListTopics },
    { method: 'POST', pattern: '/topics', handler: handleCreateTopic },
    { method: 'PATCH', pattern: /^\/topics\/([^/]+)$/, handler: handleUpdateTopic },
    { method: 'POST', pattern: /^\/topics\/([^/]+)\/archive$/, handler: handleArchiveTopic },
    { method: 'POST', pattern: '/topics/merge', handler: handleMergeTopics },
    { method: 'DELETE', pattern: /^\/topics\/([^/]+)$/, handler: handleDeleteTopic },

    // Projects (v0)
    { method: 'GET', pattern: '/projects', handler: handleListProjects },
    { method: 'POST', pattern: '/projects', handler: handleCreateProject },
    { method: 'PATCH', pattern: /^\/projects\/([^/]+)$/, handler: handleUpdateProject },
    { method: 'POST', pattern: /^\/projects\/([^/]+)\/archive$/, handler: handleArchiveProject },
    { method: 'POST', pattern: '/projects/merge', handler: handleMergeProjects },
    { method: 'DELETE', pattern: /^\/projects\/([^/]+)$/, handler: handleDeleteProject },

    // Decisions
    { method: 'GET', pattern: '/decisions', handler: handleListDecisions },
    { method: 'POST', pattern: '/decisions/draft', handler: handleCreateDecisionDraft },
    { method: 'PATCH', pattern: /^\/decisions\/([^/]+)$/, handler: handleUpdateDecision },
    { method: 'POST', pattern: /^\/decisions\/([^/]+)\/archive$/, handler: handleArchiveDecision },
    { method: 'DELETE', pattern: /^\/decisions\/([^/]+)$/, handler: handleDeleteDecision },

    // Assets
    { method: 'GET', pattern: '/assets', handler: handleListAssets },
    { method: 'POST', pattern: '/assets/draft', handler: handleCreateAssetDraft },
    { method: 'POST', pattern: '/assets/version', handler: handleUpdateAssetVersion },
    { method: 'PATCH', pattern: /^\/assets\/([^/]+)$/, handler: handleUpdateAsset },
    { method: 'POST', pattern: /^\/assets\/([^/]+)\/archive$/, handler: handleArchiveAsset },
    { method: 'DELETE', pattern: /^\/assets\/([^/]+)$/, handler: handleDeleteAsset },

    // Lint
    { method: 'GET', pattern: '/lint/issues', handler: handleListLintIssues },
    { method: 'POST', pattern: '/lint/resolve', handler: handleResolveLintIssue },
    { method: 'POST', pattern: '/lint/fix', handler: handleApplyLintQuickFix },

    // Ingest
    { method: 'POST', pattern: '/ingest/text', handler: handleIngestText },
    { method: 'POST', pattern: '/ingest/web', handler: handleIngestWeb },
    { method: 'POST', pattern: '/ingest/capture', handler: handleIngestCapture },
    { method: 'POST', pattern: '/ingest/image', handler: handleIngestImage },
    { method: 'POST', pattern: '/ingest/video', handler: handleIngestVideo },
    { method: 'POST', pattern: '/ingest/audio', handler: handleIngestAudio },
    { method: 'POST', pattern: '/scan/directory', handler: handleScanDirectory },

    // Ask AI
    { method: 'POST', pattern: '/ask-ai', handler: handleAskAi },
    { method: 'POST', pattern: '/ask-ai/deposit', handler: handleDepositAskAnswer },

    // Source actions
    { method: 'POST', pattern: /^\/sources\/([^/]+)\/status$/, handler: handleUpdateSourceStatus },
    { method: 'POST', pattern: /^\/sources\/([^/]+)\/resync$/, handler: handleResyncSource },
    { method: 'POST', pattern: /^\/sources\/([^/]+)\/topics$/, handler: handleAttachSourceToTopic },
    { method: 'GET', pattern: /^\/sources\/([^/]+)\/topic-suggestions$/, handler: handleRecommendTopicsForSource },
    { method: 'POST', pattern: /^\/sources\/([^/]+)\/projects$/, handler: handleAttachSourceToProject },

    // Topic-Project attachment
    { method: 'POST', pattern: /^\/topics\/([^/]+)\/projects$/, handler: handleAttachTopicToProject },
  ];
}

// --- Helper to extract param from match ---

function getParam(ctx: RouteContext, index: number): string {
  return decodeURIComponent((ctx.match as RegExpExecArray)[index] ?? '');
}

// --- Handler implementations ---

async function handleHealth(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.getStatus());
}

async function handleWorkspaceSnapshot(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.getLocalWorkspaceSnapshot());
}

async function handleListV1InboxItems(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listV1InboxItems());
}

async function handleCaptureV1InboxItem(ctx: RouteContext) {
  const body = await readJsonBody<{
    type: 'link' | 'text' | 'note' | 'image' | 'pdf' | 'message' | 'email';
    title?: string;
    contentText?: string;
    attachmentPath?: string;
    source?: { title?: string; url?: string; sourcePlatform?: string; sourceType?: 'link' | 'text' | 'note' | 'image' | 'pdf' | 'message' | 'email'; capturedAt?: number };
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.captureV1InboxItem(body));
}

async function handleProcessV1InboxItem(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.processV1InboxItem(getParam(ctx, 1)));
}

async function handleListV1KnowledgeItems(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listV1KnowledgeItems());
}

async function handleCreateV1KnowledgeItem(ctx: RouteContext) {
  const body = await readJsonBody<{
    title: string;
    summary: string;
    tags?: string[];
    sourceInboxItemId: string;
    topicPageIds?: string[];
    projectIds?: string[];
    suggestedNextActions?: string[];
    valueScore?: number;
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.createV1KnowledgeItem(body));
}

async function handleUpdateV1KnowledgeItem(ctx: RouteContext) {
  const body = await readJsonBody<{
    title?: string;
    summary?: string;
    tags?: string[];
    topicPageIds?: string[];
    projectIds?: string[];
    suggestedNextActions?: string[];
    valueScore?: number;
    lifecycle?: 'active' | 'archived';
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateV1KnowledgeItem({ knowledgeItemId: getParam(ctx, 1), ...body }));
}

async function handleListV1TopicPages(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listV1TopicPages());
}

async function handleCreateV1TopicPage(ctx: RouteContext) {
  const body = await readJsonBody<{ title: string; abstract?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.createV1TopicPage(body));
}

async function handleUpdateV1TopicPage(ctx: RouteContext) {
  const body = await readJsonBody<{
    title?: string;
    abstract?: string;
    currentConclusion?: string;
    openQuestions?: string[];
    projectIds?: string[];
    lifecycle?: 'active' | 'archived';
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateV1TopicPage({ topicPageId: getParam(ctx, 1), ...body }));
}

async function handleListV1Projects(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listV1Projects());
}

async function handleCreateV1Project(ctx: RouteContext) {
  const body = await readJsonBody<{ name: string; goal?: string; phase?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.createV1Project(body));
}

async function handleUpdateV1Project(ctx: RouteContext) {
  const body = await readJsonBody<{ name?: string; goal?: string; phase?: string; focusScore?: number; status?: 'active' | 'paused' | 'archived' }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateV1Project({ projectId: getParam(ctx, 1), ...body }));
}

async function handleListV1Tasks(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listV1Tasks());
}

async function handleCreateV1Task(ctx: RouteContext) {
  const body = await readJsonBody<{
    title: string;
    projectId: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    description?: string;
    relatedKnowledgeItemIds?: string[];
    suggestedNextStep?: string;
    dueAt?: number;
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.createV1Task(body));
}

async function handleUpdateV1Task(ctx: RouteContext) {
  const body = await readJsonBody<{
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    relatedKnowledgeItemIds?: string[];
    suggestedNextStep?: string;
    dueAt?: number;
    blockedReason?: string;
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateV1Task({ taskId: getParam(ctx, 1), ...body }));
}

async function handleUpdateV1TaskStatus(ctx: RouteContext) {
  const body = await readJsonBody<{ status: 'idea' | 'next' | 'doing' | 'blocked' | 'done'; blockedReason?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateV1TaskStatus({ taskId: getParam(ctx, 1), ...body }));
}

async function handleListV1Events(ctx: RouteContext) {
  const projectId = ctx.url.searchParams.get('projectId') || undefined;
  const taskId = ctx.url.searchParams.get('taskId') || undefined;
  const fromRaw = ctx.url.searchParams.get('from');
  const toRaw = ctx.url.searchParams.get('to');
  const from = fromRaw ? Number(fromRaw) : undefined;
  const to = toRaw ? Number(toRaw) : undefined;
  ctx.json(200, await ctx.runtime.listV1Events({ projectId, taskId, from, to }));
}

async function handleGetV1HomeFocus(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.getV1HomeFocusSnapshot());
}

async function handleListV1Reviews(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listV1Reviews());
}

async function handleGenerateV1Review(ctx: RouteContext) {
  const body = await readJsonBody<{ period?: 'daily' | 'weekly' | 'monthly' }>(ctx.request);
  ctx.json(200, await ctx.runtime.generateV1Review(body.period ?? 'weekly'));
}

async function handleAssistantV1Query(ctx: RouteContext) {
  const body = await readJsonBody<{ question: string; projectId?: string; from?: number; to?: number }>(ctx.request);
  ctx.json(200, await ctx.runtime.assistantV1Query(body));
}

async function handleListSources(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listSources());
}

async function handleListTopics(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listTopics());
}

async function handleCreateTopic(ctx: RouteContext) {
  const body = await readJsonBody<{ name: string; description?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.createTopic(body));
}

async function handleUpdateTopic(ctx: RouteContext) {
  const body = await readJsonBody<{ name?: string; description?: string; currentConclusion?: string; openQuestions?: string[] }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateTopic({ topicId: getParam(ctx, 1), ...body }));
}

async function handleArchiveTopic(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.archiveTopic(getParam(ctx, 1)));
}

async function handleMergeTopics(ctx: RouteContext) {
  const body = await readJsonBody<{ sourceTopicId: string; targetTopicId: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.mergeTopics(body));
}

async function handleDeleteTopic(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.deleteTopic(getParam(ctx, 1)));
}

async function handleListProjects(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listProjects());
}

async function handleCreateProject(ctx: RouteContext) {
  const body = await readJsonBody<{ name: string; goal?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.createProject(body));
}

async function handleUpdateProject(ctx: RouteContext) {
  const body = await readJsonBody<{ name?: string; goal?: string; currentVersion?: string; status?: 'active' | 'paused' | 'done' }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateProject({ projectId: getParam(ctx, 1), ...body }));
}

async function handleArchiveProject(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.archiveProject(getParam(ctx, 1)));
}

async function handleMergeProjects(ctx: RouteContext) {
  const body = await readJsonBody<{ sourceProjectId: string; targetProjectId: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.mergeProjects(body));
}

async function handleDeleteProject(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.deleteProject(getParam(ctx, 1)));
}

async function handleListDecisions(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listDecisions());
}

async function handleCreateDecisionDraft(ctx: RouteContext) {
  const body = await readJsonBody<{
    title?: string;
    background?: string;
    conclusion: string;
    reasons?: string[];
    topicId?: string;
    projectId?: string;
    sourceIds?: string[];
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.createDecisionDraft(body));
}

async function handleUpdateDecision(ctx: RouteContext) {
  const body = await readJsonBody<{
    title?: string;
    background?: string;
    conclusion?: string;
    reasons?: string[];
    impactScope?: string;
    alternatives?: string[];
    nextActions?: string[];
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateDecision({ decisionId: getParam(ctx, 1), ...body }));
}

async function handleArchiveDecision(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.archiveDecision(getParam(ctx, 1)));
}

async function handleDeleteDecision(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.deleteDecision(getParam(ctx, 1)));
}

async function handleListAssets(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listAssets());
}

async function handleCreateAssetDraft(ctx: RouteContext) {
  const body = await readJsonBody<{
    name?: string;
    usageScene?: string;
    content?: string;
    topicId?: string;
    projectId?: string;
    sourceIds?: string[];
    assetType?: 'prompt' | 'spec' | 'workflow' | 'guideline' | 'template' | 'other';
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.createAssetDraft(body));
}

async function handleUpdateAssetVersion(ctx: RouteContext) {
  const body = await readJsonBody<{ assetId: string; version: string; note?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateAssetVersion(body));
}

async function handleUpdateAsset(ctx: RouteContext) {
  const body = await readJsonBody<{
    name?: string;
    assetType?: 'prompt' | 'spec' | 'workflow' | 'guideline' | 'template' | 'other';
    usageScene?: string;
    version?: string;
    versionNote?: string;
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.updateAsset({ assetId: getParam(ctx, 1), ...body }));
}

async function handleArchiveAsset(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.archiveAsset(getParam(ctx, 1)));
}

async function handleDeleteAsset(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.deleteAsset(getParam(ctx, 1)));
}

async function handleListLintIssues(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.listLintIssues());
}

async function handleResolveLintIssue(ctx: RouteContext) {
  const body = await readJsonBody<{ lintId: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.resolveLintIssue(body.lintId));
}

async function handleApplyLintQuickFix(ctx: RouteContext) {
  const body = await readJsonBody<{ lintId: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.applyLintQuickFix(body.lintId));
}

async function handleIngestText(ctx: RouteContext) {
  const body = await readJsonBody<{ title: string; text: string; sourcePlatform?: string; sourceLink?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.ingestText(body));
}

async function handleIngestWeb(ctx: RouteContext) {
  const body = await readJsonBody<{ url: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.ingestWeb(body));
}

async function handleIngestCapture(ctx: RouteContext) {
  const body = await readJsonBody<{
    type: 'text' | 'link' | 'note' | 'image' | 'pdf' | 'message' | 'email' | 'video' | 'audio' | 'template';
    title?: string;
    contentText?: string;
    sourceUrl?: string;
    sourcePlatform?: string;
  }>(ctx.request);
  ctx.json(200, await ctx.runtime.ingestCapture(body));
}

async function handleIngestImage(ctx: RouteContext) {
  const body = await readJsonBody<{ title?: string; contentText?: string; sourceUrl?: string; sourcePlatform?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.ingestCapture({ ...body, type: 'image' }));
}

async function handleIngestVideo(ctx: RouteContext) {
  const body = await readJsonBody<{ title?: string; contentText?: string; sourceUrl?: string; sourcePlatform?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.ingestCapture({ ...body, type: 'video' }));
}

async function handleIngestAudio(ctx: RouteContext) {
  const body = await readJsonBody<{ title?: string; contentText?: string; sourceUrl?: string; sourcePlatform?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.ingestCapture({ ...body, type: 'audio' }));
}

async function handleScanDirectory(ctx: RouteContext) {
  const body = await readJsonBody<{ dirPath?: string; extensions?: string[]; excludePatterns?: string[] }>(ctx.request);
  const dirPath = body.dirPath;
  if (!dirPath || typeof dirPath !== 'string') {
    ctx.json(400, { success: false, message: 'dirPath is required' });
    return;
  }
  try {
    const result = await ctx.runtime.scanDirectory({
      dirPath,
      extensions: body.extensions,
      excludePatterns: body.excludePatterns
    });
    ctx.json(200, { success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan failed';
    ctx.json(500, { success: false, message });
  }
}

async function handleAskAi(ctx: RouteContext) {
  const body = await readJsonBody<AskAiQuery>(ctx.request);
  ctx.json(200, await ctx.runtime.askAi(body));
}

async function handleDepositAskAnswer(ctx: RouteContext) {
  const body = await readJsonBody<{ answer: string; askAnswerId?: string; topicId?: string; projectId?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.depositAskAnswer(body));
}

async function handleUpdateSourceStatus(ctx: RouteContext) {
  const body = await readJsonBody<{ currentStatus: 'Processed' | 'Archived' | 'Linked' }>(ctx.request);
  await ctx.runtime.updateSourceStatus(getParam(ctx, 1), body.currentStatus);
  ctx.json(200, { ok: true });
}

async function handleResyncSource(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.resyncSource(getParam(ctx, 1)));
}

async function handleAttachSourceToTopic(ctx: RouteContext) {
  const sourceId = getParam(ctx, 1);
  const body = await readJsonBody<{ topicId?: string; topicName?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.attachSourceToTopic({ sourceId, ...body }));
}

async function handleRecommendTopicsForSource(ctx: RouteContext) {
  ctx.json(200, await ctx.runtime.recommendTopicsForSource(getParam(ctx, 1)));
}

async function handleAttachSourceToProject(ctx: RouteContext) {
  const sourceId = getParam(ctx, 1);
  const body = await readJsonBody<{ projectId?: string; projectName?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.attachSourceToProject({ sourceId, ...body }));
}

async function handleAttachTopicToProject(ctx: RouteContext) {
  const topicId = getParam(ctx, 1);
  const body = await readJsonBody<{ projectId?: string; projectName?: string }>(ctx.request);
  ctx.json(200, await ctx.runtime.attachTopicToProject({ topicId, ...body }));
}

// --- JSON body reader ---

const MAX_REQUEST_BODY_SIZE = 1024 * 1024; // 1MB

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buffer.length;
    if (totalSize > MAX_REQUEST_BODY_SIZE) {
      throw new Error('Request body too large');
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}
