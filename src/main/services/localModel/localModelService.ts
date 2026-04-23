import { createDedupeFallback, createImageFallback, createRenameFallback, createSummaryFallback } from '../../../shared/ai/localModel/schemas';
import { isLocalOllamaModel } from '../../../shared/ai/modelRegistry';
import {
  LOCAL_MODEL_NAME,
  type DedupeInput,
  type DedupeResult,
  type ImageUnderstandingInput,
  type ImageUnderstandingResult,
  type LocalModelCapability,
  type LocalModelError,
  type LocalModelInventory,
  type LocalModelMode,
  type LocalModelName,
  type LocalModelProvider,
  type LocalModelRuntimeStatus,
  type RenameInput,
  type RenameResult,
  type SummaryInput,
  type SummaryResult,
} from '../../../shared/ai/localModel/types';
import { GemmaLocalProvider } from './gemmaLocalProvider';
import { MockLocalProvider } from './mockLocalProvider';
import { OllamaClient } from './ollamaClient';

type LocalModelRuntimeConfig = {
  enabled: boolean;
  mode: LocalModelMode;
  model: string;
  ollamaBaseUrl: string;
};

function toBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return undefined;
}

function resolveConfig(isDev: boolean): LocalModelRuntimeConfig {
  const enabledFromEnv = toBoolean(process.env.LOCAL_MODEL_ENABLED);
  const enabled = enabledFromEnv ?? true;
  const mode = process.env.LOCAL_MODEL_MODE === 'mock' ? 'mock' : 'real';
  const model = (process.env.LOCAL_MODEL_NAME ?? LOCAL_MODEL_NAME).trim();
  if (!isLocalOllamaModel(model)) {
    throw new Error(`Unsupported local model: ${model}. Please use a registered local Ollama model.`);
  }

  return {
    enabled,
    mode,
    model,
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').trim()
  };
}

export class LocalModelServiceImpl {
  private config: LocalModelRuntimeConfig;
  private readonly mockProvider: MockLocalProvider;
  private readonly ollamaClient: OllamaClient;
  private realProvider: GemmaLocalProvider;

  private preflightDone = false;
  private degradedToMock = false;
  private lastPreflightCheckedAt: number | undefined;
  private lastPreflightOk: boolean | undefined;
  private lastError: LocalModelError | undefined;

  public constructor(options: { isDev: boolean }) {
    this.config = resolveConfig(options.isDev);
    this.mockProvider = new MockLocalProvider(this.config.model);
    this.ollamaClient = new OllamaClient({
      baseUrl: this.config.ollamaBaseUrl
    });
    this.realProvider = new GemmaLocalProvider(this.ollamaClient, this.config.model);
  }

  public async init(): Promise<void> {
    if (!this.config.enabled || this.config.mode !== 'real') {
      this.preflightDone = true;
      return;
    }

    try {
      const preflight = await this.realProvider.preflight?.();
      this.preflightDone = true;
      this.lastPreflightCheckedAt = preflight?.checkedAt ?? Date.now();
      this.lastPreflightOk = Boolean(preflight?.ok);
      if (!preflight?.ok) {
        this.degradedToMock = true;
        this.lastError = {
          message: `[preflight] ${preflight?.message ?? 'Ollama preflight failed.'}`,
          capability: 'renameNoteWithLocalModel',
          provider: 'ollama',
          timestamp: Date.now()
        };
        console.warn('[localModel.fallback]', {
          reason: 'preflight',
          provider: 'ollama',
          mode: this.config.mode,
          message: this.lastError.message
        });
      }
    } catch (error) {
      this.preflightDone = true;
      this.degradedToMock = true;
      this.lastPreflightCheckedAt = Date.now();
      this.lastPreflightOk = false;
      this.lastError = {
        message: `[preflight] ${error instanceof Error ? error.message : 'Ollama preflight failed.'}`,
        capability: 'renameNoteWithLocalModel',
        provider: 'ollama',
        timestamp: Date.now()
      };
      console.warn('[localModel.fallback]', {
        reason: 'preflight',
        provider: 'ollama',
        mode: this.config.mode,
        message: this.lastError.message
      });
    }
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getMode(): LocalModelMode {
    return this.config.mode;
  }

  public getEffectiveMode(): LocalModelMode {
    return this.resolveProvider().provider === 'mock' ? 'mock' : 'real';
  }

  public getEffectiveProvider(): 'mock' | 'ollama' {
    return this.resolveProvider().provider;
  }

  public getModel(): LocalModelName {
    return this.config.model;
  }

  public getLastError(): LocalModelError | undefined {
    return this.lastError;
  }

  public async setModel(model: string): Promise<void> {
    if (!isLocalOllamaModel(model)) {
      throw new Error(`Unsupported local model: ${model}.`);
    }
    if (this.config.model === model) {
      return;
    }
    this.config = {
      ...this.config,
      model
    };
    this.mockProvider.setModel(model);
    this.realProvider.setModel(model);
    this.preflightDone = false;
    this.degradedToMock = false;
    this.lastPreflightOk = undefined;
    this.lastPreflightCheckedAt = undefined;
    this.lastError = undefined;
    if (this.config.mode === 'real') {
      await this.init();
    }
  }

  public async getRuntimeStatus(refreshPreflight = false): Promise<LocalModelRuntimeStatus> {
    if (this.config.mode === 'real' && (!this.preflightDone || refreshPreflight)) {
      await this.init();
    } else if (refreshPreflight) {
      try {
        const preflight = await this.realProvider.preflight?.();
        this.lastPreflightCheckedAt = preflight?.checkedAt ?? Date.now();
        this.lastPreflightOk = Boolean(preflight?.ok);
      } catch {
        this.lastPreflightCheckedAt = Date.now();
        this.lastPreflightOk = false;
      }
    }

    const errorMessage = this.lastError?.message.toLowerCase() ?? '';
    const fallbackReason = this.extractFallbackReason(this.lastError?.message);
    let connectionStatus: LocalModelRuntimeStatus['connectionStatus'] = 'unknown';
    let modelStatus: LocalModelRuntimeStatus['modelStatus'] = 'unknown';

    if (this.lastPreflightOk === true) {
      connectionStatus = 'reachable';
      modelStatus = 'installed';
    } else if (this.lastPreflightOk === false) {
      if (errorMessage.includes('not available') || errorMessage.includes('not found')) {
        connectionStatus = 'reachable';
        modelStatus = 'missing';
      } else if (errorMessage.includes('fetch failed') || errorMessage.includes('request failed') || errorMessage.includes('timeout')) {
        connectionStatus = 'unreachable';
      } else if (this.config.mode === 'real') {
        connectionStatus = 'reachable';
      }
    }

    return {
      enabled: this.config.enabled,
      configuredMode: this.config.mode,
      effectiveMode: this.config.enabled ? this.getEffectiveMode() : 'mock',
      provider: this.config.enabled ? this.getEffectiveProvider() : 'mock',
      configuredModel: this.config.model,
      effectiveModel: this.config.model,
      model: this.config.model,
      ollamaBaseUrl: this.config.ollamaBaseUrl,
      connectionStatus,
      modelStatus,
      fallbackReason,
      lastError: this.lastError,
      checkedAt: this.lastPreflightCheckedAt
    };
  }

  public async getInventory(): Promise<LocalModelInventory> {
    const checkedAt = Date.now();

    try {
      const modelNames = await this.ollamaClient.listModelNames();
      return {
        reachable: true,
        modelNames,
        checkedAt
      };
    } catch (error) {
      return {
        reachable: false,
        modelNames: [],
        checkedAt,
        lastError: {
          message: error instanceof Error ? error.message : 'Failed to query Ollama tags.',
          capability: 'renameNoteWithLocalModel',
          provider: 'ollama',
          timestamp: checkedAt
        }
      };
    }
  }

  public clearLastError(): void {
    this.lastError = undefined;
  }

  public async renameNoteWithLocalModel(input: RenameInput): Promise<RenameResult> {
    return this.execute(
      'renameNoteWithLocalModel',
      () => this.resolveProvider().renameNoteWithLocalModel(input),
      () => createRenameFallback(input)
    );
  }

  public async dedupePairWithLocalModel(input: DedupeInput): Promise<DedupeResult> {
    return this.execute(
      'dedupePairWithLocalModel',
      () => this.resolveProvider().dedupePairWithLocalModel(input),
      () => createDedupeFallback()
    );
  }

  public async summarizeForKnowledgeBase(input: SummaryInput): Promise<SummaryResult> {
    return this.execute(
      'summarizeForKnowledgeBase',
      () => this.resolveProvider().summarizeForKnowledgeBase(input),
      () => createSummaryFallback(input)
    );
  }

  public async understandImageBasic(input: ImageUnderstandingInput): Promise<ImageUnderstandingResult> {
    return this.execute(
      'understandImageBasic',
      () => this.resolveProvider().understandImageBasic(input),
      () => createImageFallback(input)
    );
  }

  private resolveProvider(): LocalModelProvider {
    if (!this.config.enabled) {
      return this.mockProvider;
    }
    if (this.config.mode === 'real' && this.degradedToMock) {
      return this.mockProvider;
    }
    return this.config.mode === 'real' ? this.realProvider : this.mockProvider;
  }

  private async execute<T>(
    capability: LocalModelCapability,
    run: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {
    if (!this.preflightDone && this.config.mode === 'real') {
      await this.init();
    }

    try {
      return await run();
    } catch (error) {
      const provider = this.resolveProvider().provider;
      const reason = this.classifyErrorReason(error);
      this.lastError = {
        message: `[${reason}] ${error instanceof Error ? error.message : `Failed on ${capability}`}`,
        capability,
        provider,
        timestamp: Date.now()
      };
      console.warn('[localModel.fallback]', {
        reason,
        capability,
        provider,
        configuredMode: this.config.mode,
        effectiveMode: this.getEffectiveMode(),
        message: this.lastError.message
      });
      return fallback();
    }
  }

  private classifyErrorReason(error: unknown): 'provider' | 'schema' | 'timeout' {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('timeout') || message.includes('abort')) {
      return 'timeout';
    }
    if (message.includes('schema') || message.includes('json') || message.includes('missing-key')) {
      return 'schema';
    }
    return 'provider';
  }

  private extractFallbackReason(message: string | undefined): LocalModelRuntimeStatus['fallbackReason'] | undefined {
    if (!message) {
      return undefined;
    }
    const matched = message.match(/^\[(preflight|provider|schema|timeout)\]/i);
    if (!matched) {
      return undefined;
    }
    const reason = matched[1].toLowerCase();
    if (reason === 'preflight' || reason === 'provider' || reason === 'schema' || reason === 'timeout') {
      return reason;
    }
    return undefined;
  }
}

export function createLocalModelService(options: { isDev: boolean }): LocalModelServiceImpl {
  return new LocalModelServiceImpl(options);
}
