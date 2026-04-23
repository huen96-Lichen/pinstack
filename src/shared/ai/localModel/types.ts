export const LOCAL_MODEL_NAME = 'gemma4:e4b' as const;
export const LOCAL_MODEL_META_VERSION = 'v1' as const;

export const LOCAL_MODEL_CATEGORIES = ['产品', '设计', '开发', 'AI', '视频', '运营', '灵感', '待处理'] as const;
export const LOCAL_MODEL_SOURCES = ['PinStack', '网页收藏', '手动录入', '会议整理', '外部导入'] as const;

export type LocalModelName = string;
export type LocalModelCategory = (typeof LOCAL_MODEL_CATEGORIES)[number];
export type LocalModelSource = (typeof LOCAL_MODEL_SOURCES)[number];
export type LocalModelMode = 'mock' | 'real';
export type LocalModelProviderName = 'mock' | 'ollama';
export type LocalModelCapability =
  | 'renameNoteWithLocalModel'
  | 'dedupePairWithLocalModel'
  | 'summarizeForKnowledgeBase'
  | 'understandImageBasic';

export type RenameResult = {
  category: LocalModelCategory;
  short_title: string;
  keyword: string;
  source: LocalModelSource;
  canonical_title: string;
  confidence: number;
};

export type DedupeResult = {
  is_duplicate: boolean;
  confidence: number;
  reason: string;
  primary_choice: 'A' | 'B' | null;
};

export type SummaryResult = {
  summary: string;
  category: LocalModelCategory;
  keyword: string;
  confidence: number;
  source: 'localModel';
};

export type ImageUnderstandingResult = {
  image_summary: string;
  tags: string[];
  suggested_category: LocalModelCategory;
  confidence: number;
};

export type LocalModelError = {
  message: string;
  capability: LocalModelCapability;
  provider: LocalModelProviderName;
  timestamp: number;
};

export type RenameInput = {
  recordId: string;
  recordType: 'text' | 'image' | 'video';
  displayName?: string;
  previewText?: string;
  textContent?: string;
  sourceApp?: string | null;
  source?: string;
};

export type DedupeInput = {
  left: {
    id: string;
    displayName?: string;
    textContent?: string;
    originalUrl?: string;
  };
  right: {
    id: string;
    displayName?: string;
    textContent?: string;
    originalUrl?: string;
  };
};

export type SummaryInput = {
  recordId: string;
  displayName?: string;
  previewText?: string;
  textContent: string;
};

export type ImageUnderstandingInput = {
  recordId: string;
  displayName?: string;
  previewText?: string;
  ocrText?: string;
  sourceApp?: string | null;
};

export type LocalModelPreflightResult = {
  ok: boolean;
  provider: LocalModelProviderName;
  model: LocalModelName;
  checkedAt: number;
  message?: string;
};

export type LocalModelRuntimeStatus = {
  enabled: boolean;
  configuredMode: LocalModelMode;
  effectiveMode: LocalModelMode;
  provider: LocalModelProviderName;
  configuredModel: string;
  effectiveModel: string;
  model: LocalModelName;
  ollamaBaseUrl: string;
  connectionStatus: 'reachable' | 'unreachable' | 'unknown';
  modelStatus: 'installed' | 'missing' | 'unknown';
  fallbackReason?: 'preflight' | 'provider' | 'schema' | 'timeout';
  lastError?: LocalModelError;
  checkedAt?: number;
};

export type LocalModelInventory = {
  reachable: boolean;
  modelNames: string[];
  checkedAt: number;
  lastError?: LocalModelError;
};

export interface LocalModelProvider {
  readonly provider: LocalModelProviderName;
  preflight?(): Promise<LocalModelPreflightResult>;
  renameNoteWithLocalModel(input: RenameInput): Promise<RenameResult>;
  dedupePairWithLocalModel(input: DedupeInput): Promise<DedupeResult>;
  summarizeForKnowledgeBase(input: SummaryInput): Promise<SummaryResult>;
  understandImageBasic(input: ImageUnderstandingInput): Promise<ImageUnderstandingResult>;
}

export interface LocalModelService {
  init(): Promise<void>;
  isEnabled(): boolean;
  getMode(): LocalModelMode;
  getEffectiveMode(): LocalModelMode;
  getEffectiveProvider(): LocalModelProviderName;
  getModel(): LocalModelName;
  getLastError(): LocalModelError | undefined;
  setModel(model: string): Promise<void>;
  getRuntimeStatus(refreshPreflight?: boolean): Promise<LocalModelRuntimeStatus>;
  getInventory(): Promise<LocalModelInventory>;
  clearLastError(): void;
  renameNoteWithLocalModel(input: RenameInput): Promise<RenameResult>;
  dedupePairWithLocalModel(input: DedupeInput): Promise<DedupeResult>;
  summarizeForKnowledgeBase(input: SummaryInput): Promise<SummaryResult>;
  understandImageBasic(input: ImageUnderstandingInput): Promise<ImageUnderstandingResult>;
}

export type LocalModelMeta = {
  version: string;
  mode?: LocalModelMode;
  model?: LocalModelName;
  systemGeneratedTitle?: string;
  userEditedTitle?: string;
  titleLockedByUser?: boolean;
  summary?: SummaryResult;
  dedupeSuggestion?: DedupeResult;
  imageUnderstanding?: ImageUnderstandingResult;
  lastError?: LocalModelError;
  lastUpdatedAt?: number;
};
