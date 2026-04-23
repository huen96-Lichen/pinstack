import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildDynamicRegistry, getAiModelById, getEnabledAiModels, mergeAiModelCatalog, type AiModelCatalogItem, type AiModelCatalogOverride, type AiModelCapability, type AiModelRegistryItem } from '../../../shared/ai/modelRegistry';
import type {
  AiDiagnosticsSnapshot,
  AiHealthResult,
  AiChatStreamEvent,
  AiChatMessage,
  AiChatSession,
  AiRuntimeStatus,
  AiSearchIntentResult,
  AiTestResult,
  AppSettings,
  RecordItem
} from '../../../shared/types';
import type { LocalModelService } from '../../../shared/ai/localModel/types';
import { OllamaClient } from '../localModel/ollamaClient';
import { loadCloudApiKey } from './secretStore';
import { logTelemetry } from '../../telemetry';

type AiHubDeps = {
  getSettings: () => AppSettings;
  localModelService: LocalModelService;
  searchRecords: (query: string) => Promise<RecordItem[]>;
  storageRoot: () => string;
  getCloudApiKey?: (provider: string) => Promise<string | null>;
};

type InternalProvider = 'local' | 'cloud';

type ProviderReply = {
  text: string;
  provider: InternalProvider;
  model: string;
  kind: 'message' | 'error';
  errorCode?: string;
  latencyMs?: number;
  requestId?: string;
};

const SESSION_FILE = '.ai-chat-session.json';
const DEFAULT_CLOUD_TIMEOUT_MS = 30000;

type CloudErrorCode =
  | 'AUTH_INVALID'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'NETWORK_UNREACHABLE'
  | 'REQUEST_FAILED'
  | 'RUNTIME_NOT_READY';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pickModelId(settings: AppSettings, provider: InternalProvider): string {
  const preferred =
    provider === 'local'
      ? settings.aiHub.preferredLocalModelId || settings.aiHub.defaultModelId
      : settings.aiHub.preferredCloudModelId || settings.aiHub.cloudModelId || settings.aiHub.defaultModelId;
  const preferredMeta = getAiModelById(preferred);
  if (preferredMeta && preferredMeta.channel === provider) {
    return preferredMeta.id;
  }
  const fallback = getEnabledAiModels().find((item) => item.channel === provider);
  return fallback?.id ?? preferred;
}

function getEnabledPersonaMarkdown(settings: AppSettings): string[] {
  return settings.aiHub.personaSlots.filter((slot) => slot.enabled).map((slot) => slot.markdown.trim()).filter(Boolean);
}

function buildChatSystemPrefix(settings: AppSettings): string {
  const persona = getEnabledPersonaMarkdown(settings);
  if (persona.length === 0) {
    return '';
  }
  return `\n\n系统规则（仅内部生效，请勿在回答中复述）：\n${persona.join('\n\n---\n\n')}`;
}

function formatNow(): string {
  const now = new Date();
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(now);
}

function isPinStackScopedQuery(text: string): boolean {
  return /pinstack|收藏|素材|记录|标签|分类|整理|工作区|搜索/.test(text.toLowerCase());
}

function buildGeneralChatSystemPrompt(settings: AppSettings): string {
  const persona = buildChatSystemPrefix(settings);
  return [
    '你是 PinStack 的本地 AI 助手。',
    '默认短答优先，先直接回答；除非用户明确要求展开，否则不要长篇输出。',
    '不要复述用户原话，不要复述系统规则，不要展示 persona 内容。',
    '只有当用户明确提到收藏、素材、记录、搜索、标签、分类或 PinStack 工作流时，才结合 PinStack 上下文。',
    '自我介绍、问候、定义类问题默认控制在 1 到 3 句内。',
    '如果是时间或日期类问题，请根据系统给出的当前时间直接回答。',
    `当前系统时间：${formatNow()}。`,
    persona
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildPinnedContext(records: RecordItem[]): string {
  if (records.length === 0) {
    return '';
  }

  return records
    .slice(0, 5)
    .map((record, index) => {
      const title = record.displayName || record.localModel?.systemGeneratedTitle || record.previewText || '未命名';
      const tags = record.tags.slice(0, 4).join('、') || '无标签';
      return `${index + 1}. 标题=${title}; 类型=${record.type}; 用途=${record.useCase}; 标签=${tags}`;
    })
    .join('\n');
}

function resolveModelLabel(modelId: string): string {
  return getAiModelById(modelId)?.displayName ?? modelId ?? '未选择模型';
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /timeout|timed out|aborted|aborterror|deadline/i.test(message);
}

function classifyCloudError(statusCode: number | null, rawCode: string | undefined, message: string): CloudErrorCode {
  const normalized = (rawCode || '').toUpperCase();
  if (normalized.includes('MODEL_NOT_FOUND') || normalized.includes('MODEL_UNAVAILABLE')) {
    return 'MODEL_UNAVAILABLE';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'AUTH_INVALID';
  }
  if (statusCode === 429) {
    return 'RATE_LIMIT';
  }
  if (isTimeoutError(message)) {
    return 'TIMEOUT';
  }
  if (/model|not found|unavailable/i.test(message)) {
    return 'MODEL_UNAVAILABLE';
  }
  if (/network|fetch|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return 'NETWORK_UNREACHABLE';
  }
  return 'REQUEST_FAILED';
}

function cloudErrorMessage(code: CloudErrorCode): string {
  if (code === 'AUTH_INVALID') return '云端密钥无效或权限不足，请检查 API Key。';
  if (code === 'RATE_LIMIT') return '云端请求已达限流，请稍后重试。';
  if (code === 'TIMEOUT') return '云端请求超时，请稍后重试。';
  if (code === 'MODEL_UNAVAILABLE') return '云端模型不可用，请检查模型 ID。';
  if (code === 'NETWORK_UNREACHABLE') return '网络不可用，无法连接云端 AI。';
  if (code === 'RUNTIME_NOT_READY') return '云端配置不完整，请在设置中补全。';
  return '云端请求失败，请稍后重试。';
}

function latencyBucket(ms: number): string {
  if (ms < 500) return '<500ms';
  if (ms < 1500) return '500ms-1.5s';
  if (ms < 5000) return '1.5s-5s';
  if (ms < 15000) return '5s-15s';
  return '>=15s';
}

function buildLocalUnavailableMessage(local: Awaited<ReturnType<LocalModelService['getRuntimeStatus']>>): string {
  if (local.connectionStatus === 'unreachable') {
    return '本地 AI 运行环境未启动。';
  }
  if (local.modelStatus === 'missing') {
    return '当前模型未安装或不可用。';
  }
  if (local.effectiveMode !== 'real' || local.provider !== 'ollama') {
    return '当前未连接真实模型，以下内容不是实时生成结果。';
  }
  return '本地 AI 当前不可用，请稍后重试。';
}

function deriveConnectionState(local: Awaited<ReturnType<LocalModelService['getRuntimeStatus']>>): AiRuntimeStatus['connectionState'] {
  if (local.provider === 'ollama' && local.effectiveMode === 'real' && local.connectionStatus === 'reachable' && local.modelStatus === 'installed') {
    return 'connected';
  }
  if (local.modelStatus === 'missing') {
    return 'model_missing';
  }
  if (local.fallbackReason === 'timeout' || /timeout|timed out/i.test(local.lastError?.message ?? '')) {
    return 'timeout';
  }
  if (local.lastError?.message) {
    return 'error';
  }
  return 'unavailable';
}

function deriveResponseMode(local: Awaited<ReturnType<LocalModelService['getRuntimeStatus']>>): AiRuntimeStatus['responseMode'] {
  if (local.provider === 'ollama' && local.effectiveMode === 'real' && local.connectionStatus === 'reachable' && local.modelStatus === 'installed') {
    return 'live';
  }
  return local.effectiveMode !== 'real' || local.fallbackReason ? 'degraded' : 'unavailable';
}

export class AiHubService {
  private readonly deps: AiHubDeps;
  private chatSessionCache: AiChatSession | null = null;
  private lastCloudErrorCode?: string;
  private lastRequestId?: string;
  private lastCheckedAt?: number;

  public constructor(deps: AiHubDeps) {
    this.deps = deps;
  }

  public async getDiagnosticsSnapshot(): Promise<AiDiagnosticsSnapshot> {
    const runtime = await this.getRuntimeStatus();
    return {
      provider: runtime.effectiveProvider,
      model: runtime.effectiveModel || runtime.configuredModel,
      timeoutMs: DEFAULT_CLOUD_TIMEOUT_MS,
      fallbackReason: runtime.fallbackReason,
      lastErrorCode: runtime.errorCode ?? this.lastCloudErrorCode,
      requestId: runtime.requestId ?? this.lastRequestId,
      checkedAt: runtime.checkedAt ?? Date.now()
    };
  }

  public async getRuntimeStatus(): Promise<AiRuntimeStatus> {
    const settings = this.deps.getSettings();
    const configuredProvider = settings.aiHub.defaultProvider;
    const configuredModel = pickModelId(settings, configuredProvider);
    const configuredLabel = resolveModelLabel(configuredModel);

    if (!settings.aiHub.enabled) {
      return {
        enabled: false,
        configuredProvider,
        effectiveProvider: configuredProvider,
        configuredModel,
        effectiveModel: configuredModel,
        selectedModelLabel: configuredLabel,
        connectionState: 'unavailable',
        responseMode: 'unavailable',
        message: 'AI 当前未启用',
        reachable: false,
        checkedAt: Date.now(),
        lastError: 'AI disabled'
      };
    }

    if (configuredProvider === 'cloud') {
      const providerName = settings.aiHub.cloudProvider?.trim() || 'openai';
      const cloudApiKey =
        (await (this.deps.getCloudApiKey?.(providerName) ?? loadCloudApiKey(providerName))) ||
        settings.aiHub.cloudApiKey?.trim() ||
        '';
      const cloudModel = settings.aiHub.cloudModelId?.trim() || configuredModel;
      const baseUrl = settings.aiHub.cloudBaseUrl?.trim() || 'https://api.openai.com/v1';
      const ready = Boolean(providerName && cloudApiKey && cloudModel && baseUrl);
      return {
        enabled: true,
        configuredProvider,
        effectiveProvider: 'cloud',
        configuredModel,
        effectiveModel: cloudModel,
        selectedModelLabel: resolveModelLabel(cloudModel),
        connectionState: ready ? 'connected' : 'unavailable',
        responseMode: ready ? 'live' : 'unavailable',
        message: ready ? '云端 AI 已就绪。' : '云端配置未完成，请检查 provider / key / model / baseUrl。',
        reachable: ready,
        errorCode: ready ? undefined : 'RUNTIME_NOT_READY',
        providerReachability: ready ? 'reachable' : 'unknown',
        checkedAt: Date.now(),
        lastError: ready ? undefined : 'cloud runtime not ready',
        requestId: this.lastRequestId
      };
    }

    const local = await this.deps.localModelService.getRuntimeStatus(false);
    const effectiveModel = local.effectiveModel || configuredModel;
    const effectiveLabel = resolveModelLabel(effectiveModel);
    const connectionState = deriveConnectionState(local);
    const responseMode = deriveResponseMode(local);
    const isConnected = connectionState === 'connected';
    const message = isConnected ? '本地 AI 已连接，可实时响应。' : buildLocalUnavailableMessage(local);
    return {
      enabled: true,
      configuredProvider,
      effectiveProvider: 'local',
      configuredModel,
      effectiveModel,
      selectedModelLabel: effectiveLabel,
      connectionState,
      responseMode,
      message,
      reachable: isConnected,
      fallbackReason: local.fallbackReason,
      lastError: local.lastError?.message,
      errorCode: this.lastCloudErrorCode,
      requestId: this.lastRequestId,
      providerReachability: isConnected ? 'reachable' : 'degraded',
      checkedAt: local.checkedAt
    };
  }

  public async listModels(): Promise<AiModelCatalogItem[]> {
    const settings = this.deps.getSettings();
    const currentModelId = settings.aiHub.defaultModelId;

    // Dynamic mode: get all installed models from Ollama
    const localInventory = await this.deps.localModelService.getInventory();
    const dynamicRegistry = buildDynamicRegistry(localInventory.modelNames, currentModelId);
    const overrides: AiModelCatalogOverride[] = [];

    for (const model of dynamicRegistry) {
      if (!localInventory.reachable) {
        overrides.push({
          id: model.id,
          isInstalled: false,
          isConfigured: true,
          isAvailable: false,
          status: 'unavailable',
          note: localInventory.lastError?.message ?? 'Ollama 未连接',
          checkedAt: localInventory.checkedAt
        });
      } else {
        overrides.push({
          id: model.id,
          isInstalled: true,
          isConfigured: true,
          isAvailable: true,
          status: 'available',
          checkedAt: localInventory.checkedAt
        });
      }
    }

    const registry: AiModelRegistryItem[] = [...dynamicRegistry];
    const cloud = settings.aiHub;
    const cloudProvider = cloud.cloudProvider?.trim();
    const cloudModelId = cloud.cloudModelId?.trim();
    const cloudKey =
      cloudProvider
        ? (await (this.deps.getCloudApiKey?.(cloudProvider) ?? loadCloudApiKey(cloudProvider)))
        : null;
    const cloudConfigured = Boolean(cloudProvider && cloudModelId && cloudKey?.trim());
    if (cloudProvider && cloudModelId) {
      registry.push({
        id: cloudModelId,
        label: cloudModelId,
        displayName: cloudModelId,
        provider: 'cloud',
        providerName: cloudProvider,
        channel: 'cloud',
        isSupported: true,
        isInstalled: false,
        isConfigured: cloudConfigured,
        isAvailable: cloudConfigured,
        isRecommended: false,
        description: `云端模型 (${cloudProvider})`,
        recommendedTasks: ['rename', 'classify', 'summary', 'organize_materials'],
        status: cloudConfigured ? 'available' : 'not_configured',
        enabled: true,
        priority: 50
      });
      overrides.push({
        id: cloudModelId,
        isInstalled: false,
        isConfigured: cloudConfigured,
        isAvailable: cloudConfigured,
        status: cloudConfigured ? 'available' : 'not_configured',
        checkedAt: Date.now()
      });
    }

    return mergeAiModelCatalog(overrides, currentModelId, registry);
  }

  public async getChatSession(): Promise<AiChatSession> {
    if (this.chatSessionCache) {
      return this.chatSessionCache;
    }
    const loaded = await this.readSession();
    this.chatSessionCache = loaded;
    return loaded;
  }

  public async clearChatSession(): Promise<AiChatSession> {
    const next: AiChatSession = {
      sessionId: makeId('chat'),
      messages: [],
      updatedAt: Date.now()
    };
    this.chatSessionCache = next;
    await this.persistSession(next);
    return next;
  }

  public async healthCheck(): Promise<AiHealthResult> {
    const startedAt = Date.now();
    const settings = this.deps.getSettings();
    const configuredProvider = settings.aiHub.defaultProvider;
    const configuredModel = pickModelId(settings, configuredProvider);

    if (!settings.aiHub.enabled) {
      return {
        ok: false,
        provider: configuredProvider,
        model: configuredModel,
        connectionStatus: 'unavailable',
        responseMode: 'unavailable',
        message: 'AI 当前未启用',
        checkedAt: Date.now(),
        latencyMs: Date.now() - startedAt
      };
    }

    if (configuredProvider === 'cloud') {
      const reply = await this.runCloudHealthCheck(settings);
      return {
        ok: reply.kind === 'message',
        provider: 'cloud',
        model: reply.model,
        connectionStatus: reply.kind === 'message' ? 'connected' : reply.errorCode === 'TIMEOUT' ? 'timeout' : 'error',
        responseMode: reply.kind === 'message' ? 'live' : 'degraded',
        message: reply.kind === 'message' ? '云端 AI 探测成功。' : reply.text,
        requestId: reply.requestId,
        errorCode: reply.kind === 'message' ? undefined : reply.errorCode,
        checkedAt: Date.now(),
        latencyMs: reply.latencyMs ?? Date.now() - startedAt
      };
    }

    const runtime = await this.deps.localModelService.getRuntimeStatus(true);
    const connectionStatus = deriveConnectionState(runtime);
    const responseMode = deriveResponseMode(runtime);

    if (connectionStatus !== 'connected') {
      return {
        ok: false,
        provider: 'local',
        model: runtime.effectiveModel || configuredModel,
        connectionStatus,
        responseMode,
        message: buildLocalUnavailableMessage(runtime),
        checkedAt: Date.now(),
        latencyMs: Date.now() - startedAt
      };
    }

    try {
      const result = await this.runLocalChat('只回复：OK', settings, {
        sessionId: 'health-check',
        messages: [],
        updatedAt: Date.now()
      });
      return {
        ok: result.kind === 'message',
        provider: 'local',
        model: result.model,
        connectionStatus:
          result.kind === 'message'
            ? 'connected'
            : result.errorCode === 'timeout' || result.errorCode === 'TIMEOUT'
              ? 'timeout'
              : 'error',
        responseMode: result.kind === 'message' ? 'live' : 'degraded',
        message: result.kind === 'message' ? '本地 AI 已连接，探测请求成功。' : result.text,
        requestId: result.requestId,
        errorCode: result.errorCode,
        checkedAt: Date.now(),
        latencyMs: result.latencyMs ?? Date.now() - startedAt
      };
    } catch (error) {
      return {
        ok: false,
        provider: 'local',
        model: runtime.effectiveModel || configuredModel,
        connectionStatus: isTimeoutError(error) ? 'timeout' : 'error',
        responseMode: 'degraded',
        message: isTimeoutError(error) ? '请求超时，请稍后重试或切换更轻量模型。' : '本地 AI 请求失败，请稍后重试。',
        errorCode: isTimeoutError(error) ? 'TIMEOUT' : 'REQUEST_FAILED',
        checkedAt: Date.now(),
        latencyMs: Date.now() - startedAt
      };
    }
  }

  public async test(): Promise<AiTestResult> {
    const settings = this.deps.getSettings();
    const runtime = await this.getRuntimeStatus();
    const model = runtime.effectiveModel || runtime.configuredModel;

    if (!settings.aiHub.enabled) {
      return {
        ok: false,
        provider: runtime.effectiveProvider,
        model,
        mode: 'unavailable',
        errorCode: 'UNAVAILABLE',
        errorMessage: '当前默认路径不是可执行的本地 AI'
      };
    }

    if (runtime.effectiveProvider === 'cloud') {
      const result = await this.runCloudChat('请只用不超过12个字介绍你自己。', settings);
      if (result.kind === 'error') {
        return {
          ok: false,
          provider: 'cloud',
          model: result.model,
          mode: result.errorCode === 'TIMEOUT' ? 'degraded' : 'unavailable',
          requestId: result.requestId,
          errorCode: result.errorCode ?? 'REQUEST_FAILED',
          errorMessage: result.text,
          latencyMs: result.latencyMs
        };
      }
      return {
        ok: true,
        provider: 'cloud',
        model: result.model,
        mode: 'live',
        text: result.text,
        requestId: result.requestId,
        latencyMs: result.latencyMs
      };
    }

    const result = await this.runLocalChat('请只用不超过12个字介绍你自己。', settings, {
      sessionId: 'test-call',
      messages: [],
      updatedAt: Date.now()
    });

    if (result.kind === 'error') {
      return {
        ok: false,
        provider: 'local',
        model: result.model,
        mode: result.errorCode === 'timeout' || result.errorCode === 'TIMEOUT' ? 'degraded' : 'unavailable',
        requestId: result.requestId,
        errorCode: result.errorCode ?? 'REQUEST_FAILED',
        errorMessage: result.text,
        latencyMs: result.latencyMs
      };
    }

    return {
      ok: true,
      provider: 'local',
      model: result.model,
      mode: 'live',
      text: result.text,
      requestId: result.requestId,
      latencyMs: result.latencyMs
    };
  }

  public async sendChat(text: string, onStream?: (event: AiChatStreamEvent) => void): Promise<AiChatSession> {
    const settings = this.deps.getSettings();
    const session = await this.getChatSession();
    const trimmedText = text.trim();
    const runtime = await this.getRuntimeStatus();
    const provider = runtime.effectiveProvider;
    const model = runtime.effectiveModel;
    const userMessage: AiChatMessage = {
      id: makeId('u'),
      role: 'user',
      text: trimmedText,
      createdAt: Date.now(),
      provider,
      model
    };

    if (!settings.aiHub.enabled) {
      const disabledReply: AiChatMessage = {
        id: makeId('a'),
        role: 'assistant',
        text: 'AI 当前未启用。请先在设置 > AI 中枢中开启 AI 功能。',
        createdAt: Date.now(),
        provider,
        model,
        kind: 'error'
      };
      const nextDisabled: AiChatSession = {
        sessionId: session.sessionId || makeId('chat'),
        messages: [...session.messages, userMessage, disabledReply].slice(-60),
        updatedAt: Date.now()
      };
      this.chatSessionCache = nextDisabled;
      await this.persistSession(nextDisabled);
      return nextDisabled;
    }

    const providerReply =
      provider === 'cloud'
        ? await this.runCloudWithFallback(trimmedText, settings, session, onStream)
        : await this.runLocal(trimmedText, settings, session, onStream);

    const assistantMessage: AiChatMessage = {
      id: makeId('a'),
      role: 'assistant',
      text: providerReply.text,
      createdAt: Date.now(),
      provider: providerReply.provider,
      model: providerReply.model,
      kind: providerReply.kind
    };

    const next: AiChatSession = {
      sessionId: session.sessionId || makeId('chat'),
      messages: [...session.messages, userMessage, assistantMessage].slice(-8),
      updatedAt: Date.now()
    };

    this.chatSessionCache = next;
    await this.persistSession(next);
    logTelemetry('ai.task.completed', {
      source: 'chat',
      provider: providerReply.provider,
      model: providerReply.model,
      latencyMs: providerReply.latencyMs ?? null,
      requestId: providerReply.requestId ?? null
    });
    return next;
  }

  public async inferSearchIntent(query: string): Promise<AiSearchIntentResult> {
    const text = query.trim();
    const normalized = text.replace(/\s+/g, ' ');
    const lower = normalized.toLowerCase();
    const settings = this.deps.getSettings();

    const suggestedType: AiSearchIntentResult['suggestedType'] =
      /图片|image|截图|photo|视频|video/.test(lower) ? 'image' : /文本|text|代码|prompt|fix|error/.test(lower) ? 'text' : 'all';

    const suggestedSource = settings.aiHub.sourceDictionary.find((source) => source && lower.includes(source.toLowerCase()));
    const hashTags = normalized
      .split(/\s+/)
      .filter((token) => token.startsWith('#'))
      .map((token) => token.slice(1).trim())
      .filter(Boolean);

    let suggestedAction = 'search';
    if (/整理|归类|分类/.test(lower)) {
      suggestedAction = 'organize';
    } else if (/重命名|命名/.test(lower)) {
      suggestedAction = 'rename';
    } else if (/摘要|总结/.test(lower)) {
      suggestedAction = 'summary';
    }

    return {
      normalizedQuery: normalized,
      suggestedSource,
      suggestedType,
      suggestedTags: hashTags.slice(0, 5),
      suggestedAction
    };
  }

  private async runLocal(text: string, settings: AppSettings, session: AiChatSession, onStream?: (event: AiChatStreamEvent) => void): Promise<ProviderReply> {
    const runtime = await this.deps.localModelService.getRuntimeStatus(false);
    if (runtime.provider !== 'ollama' || runtime.effectiveMode !== 'real' || !runtime.ollamaBaseUrl.trim() || runtime.connectionStatus !== 'reachable' || runtime.modelStatus !== 'installed') {
      return {
        provider: 'local',
        model: this.deps.localModelService.getModel(),
        text: buildLocalUnavailableMessage(runtime),
        kind: 'error',
        errorCode: runtime.modelStatus === 'missing' ? 'MODEL_MISSING' : runtime.connectionStatus === 'unreachable' ? 'UNAVAILABLE' : 'RUNTIME_NOT_READY'
      };
    }

    return this.runLocalChat(text, settings, session, onStream);
  }

  private async runCloudWithFallback(
    text: string,
    settings: AppSettings,
    session: AiChatSession,
    onStream?: (event: AiChatStreamEvent) => void
  ): Promise<ProviderReply> {
    const cloudReply = await this.runCloudChat(text, settings, session);
    if (cloudReply.kind === 'message') {
      return cloudReply;
    }
    if (!settings.aiHub.allowFallback) {
      return cloudReply;
    }
    const localReply = await this.runLocal(text, settings, session, onStream);
    logTelemetry('ai.fallback.triggered', {
      source: 'chat',
      fromProvider: 'cloud',
      toProvider: 'local',
      errorCode: cloudReply.errorCode ?? null,
      requestId: cloudReply.requestId ?? null
    });
    return localReply;
  }

  private async runLocalChat(
    text: string,
    settings: AppSettings,
    session: AiChatSession,
    onStream?: (event: AiChatStreamEvent) => void
  ): Promise<ProviderReply> {
    const startedAt = Date.now();
    const runtime = await this.deps.localModelService.getRuntimeStatus(false);
    try {
      const related = isPinStackScopedQuery(text) ? await this.deps.searchRecords(text).catch(() => []) : [];
      const history = session.messages
        .slice(-8)
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          role: message.role,
          content: message.text
        })) as Array<{ role: 'user' | 'assistant'; content: string }>;
      const context = buildPinnedContext(related);
      const client = new OllamaClient({
        baseUrl: runtime.ollamaBaseUrl
      });
      const messages = [
        { role: 'system' as const, content: buildGeneralChatSystemPrompt(settings) },
        ...(context ? [{ role: 'system' as const, content: `PinStack 相关上下文（仅在相关时使用）：\n${context}` }] : []),
        ...history,
        { role: 'user' as const, content: text }
      ];
      onStream?.({
        phase: 'start',
        model: runtime.effectiveModel
      });
      const answer = await client.chatStream({
        model: runtime.effectiveModel,
        messages,
        timeoutMs: 90_000,
        onDelta: (delta) => {
          onStream?.({
            phase: 'delta',
            model: runtime.effectiveModel,
            delta
          });
        }
      });
      onStream?.({
        phase: 'done',
        model: runtime.effectiveModel,
        text: answer
      });
      return {
        provider: 'local',
        model: runtime.effectiveModel,
        text: answer.trim(),
        kind: 'message',
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      onStream?.({
        phase: 'error',
        model: runtime.effectiveModel || this.deps.localModelService.getModel(),
        errorMessage: isTimeoutError(error) ? '请求超时，请稍后重试或切换更轻量模型。' : '本地 AI 请求失败，请稍后重试。'
      });
      return {
        provider: 'local',
        model: runtime.effectiveModel || this.deps.localModelService.getModel(),
        text: isTimeoutError(error) ? '请求超时，请稍后重试或切换更轻量模型。' : '本地 AI 请求失败，请稍后重试。',
        kind: 'error',
        errorCode: isTimeoutError(error) ? 'timeout' : 'REQUEST_FAILED',
        latencyMs: Date.now() - startedAt
      };
    }
  }

  private async runCloudChat(text: string, settings: AppSettings, session?: AiChatSession): Promise<ProviderReply> {
    const startedAt = Date.now();
    const provider = settings.aiHub.cloudProvider?.trim() || 'openai';
    const model = settings.aiHub.cloudModelId?.trim() || pickModelId(settings, 'cloud');
    const baseUrl = (settings.aiHub.cloudBaseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const apiKey =
      (await (this.deps.getCloudApiKey?.(provider) ?? loadCloudApiKey(provider))) ||
      settings.aiHub.cloudApiKey?.trim() ||
      '';

    if (!apiKey || !model || !baseUrl) {
      return {
        provider: 'cloud',
        model,
        text: cloudErrorMessage('RUNTIME_NOT_READY'),
        kind: 'error',
        errorCode: 'RUNTIME_NOT_READY',
        latencyMs: Date.now() - startedAt
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_CLOUD_TIMEOUT_MS);
    const requestId = `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.lastRequestId = requestId;
    this.lastCheckedAt = Date.now();
    logTelemetry('ai.task.started', {
      source: 'cloud-chat',
      provider,
      model,
      requestId
    });
    logTelemetry('ai.route.selected', {
      source: 'cloud-chat',
      provider,
      model,
      requestId
    });
    try {
      const related = session && isPinStackScopedQuery(text) ? await this.deps.searchRecords(text).catch(() => []) : [];
      const history = session
        ? session.messages
            .slice(-8)
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({
              role: message.role,
              content: message.text
            }))
        : [];
      const context = buildPinnedContext(related);
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: buildGeneralChatSystemPrompt(settings) },
            ...(context ? [{ role: 'system', content: `PinStack 相关上下文（仅在相关时使用）：\n${context}` }] : []),
            ...history,
            { role: 'user', content: text }
          ]
        }),
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: { code?: string; type?: string; message?: string };
        choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
      };

      if (!response.ok) {
        const message = payload.error?.message || `HTTP ${response.status}`;
        const errorCode = classifyCloudError(response.status, payload.error?.code || payload.error?.type, message);
        this.lastCloudErrorCode = errorCode;
        logTelemetry('ai.task.failed', {
          source: 'cloud-chat',
          provider,
          model,
          requestId,
          status: response.status,
          errorCode
        }, 'warn');
        logTelemetry('ai.latency.bucket', {
          source: 'cloud-chat',
          provider,
          model,
          requestId,
          latencyBucket: latencyBucket(Date.now() - startedAt)
        });
        return {
          provider: 'cloud',
          model,
          text: cloudErrorMessage(errorCode),
          kind: 'error',
          errorCode,
          requestId,
          latencyMs: Date.now() - startedAt
        };
      }

      const rawContent = payload.choices?.[0]?.message?.content;
      const outputText =
        typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((item) => item.text ?? '').join('').trim()
            : '';
      const finalText = outputText || '云端返回了空结果，请稍后重试。';
      this.lastCloudErrorCode = undefined;
      logTelemetry('ai.task.completed', {
        source: 'cloud-chat',
        provider,
        model,
        requestId,
        latencyMs: Date.now() - startedAt
      });
      logTelemetry('ai.latency.bucket', {
        source: 'cloud-chat',
        provider,
        model,
        requestId,
        latencyBucket: latencyBucket(Date.now() - startedAt)
      });
      return {
        provider: 'cloud',
        model,
        text: finalText,
        kind: 'message',
        requestId,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      const errorCode = classifyCloudError(null, undefined, error instanceof Error ? error.message : String(error));
      this.lastCloudErrorCode = errorCode;
      logTelemetry(
        'ai.task.failed',
        {
          source: 'cloud-chat',
          provider,
          model,
          requestId,
          errorCode
        },
        'warn'
      );
      logTelemetry('ai.latency.bucket', {
        source: 'cloud-chat',
        provider,
        model,
        requestId,
        latencyBucket: latencyBucket(Date.now() - startedAt)
      });
      return {
        provider: 'cloud',
        model,
        text: cloudErrorMessage(errorCode),
        kind: 'error',
        errorCode,
        requestId,
        latencyMs: Date.now() - startedAt
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async runCloudHealthCheck(settings: AppSettings): Promise<ProviderReply> {
    return this.runCloudChat('只回复：OK', settings);
  }

  private async sessionFilePath(): Promise<string> {
    const storageRoot = this.deps.storageRoot();
    await fs.mkdir(storageRoot, { recursive: true });
    return path.join(storageRoot, SESSION_FILE);
  }

  private async readSession(): Promise<AiChatSession> {
    const filePath = await this.sessionFilePath();
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as AiChatSession;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) {
        throw new Error('invalid session');
      }
      return {
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : makeId('chat'),
        messages: parsed.messages.slice(-60),
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
      };
    } catch {
      return {
        sessionId: makeId('chat'),
        messages: [],
        updatedAt: Date.now()
      };
    }
  }

  private async persistSession(session: AiChatSession): Promise<void> {
    const filePath = await this.sessionFilePath();
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8');
  }
}
