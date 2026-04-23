/**
 * WikiAgent × VaultKeeper 集成类型定义
 *
 * 定义 WikiAgent 知识库的配置、状态和查询接口。
 */

/** WikiAgent LLM 配置 */
export interface WikiLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** WikiAgent 功能配置（嵌入 AppSettings.vaultkeeper.wiki） */
export interface WikiSettings {
  /** 是否启用 wiki_ingesting 后处理阶段 */
  enabled: boolean;
  /** LLM API 地址（OpenAI 兼容） */
  baseUrl: string;
  /** LLM API Key */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 自定义知识库根目录（默认 {storageRoot}/wiki） */
  wikiDir?: string;
  /** 是否在每次 ingest 后自动 lint */
  autoLint: boolean;
  /** 自动 lint 间隔（小时） */
  autoLintIntervalHours: number;
}

/** 知识库统计状态 */
export interface WikiStatus {
  /** Wiki 功能是否启用 */
  enabled: boolean;
  /** 知识库根目录 */
  wikiDir: string;
  /** index.md 中的页面总数 */
  totalPages: number;
  /** sources/ 页面数 */
  sourcesCount: number;
  /** entities/ 页面数 */
  entitiesCount: number;
  /** concepts/ 页面数 */
  conceptsCount: number;
  /** topics/ 页面数 */
  topicsCount: number;
  /** log.md 最后一条记录的时间 */
  lastUpdated: string | null;
  /** 最近一次 lint 报告摘要 */
  lastLintReport: string | null;
  /** WikiAgent Python 依赖是否可用 */
  pythonAvailable: boolean;
}

/** Wiki 查询请求 */
export interface WikiQueryInput {
  question: string;
}

/** Wiki 查询结果 */
export interface WikiQueryResult {
  answer: string;
  pagesRead: number;
  timestamp: string;
}

/** Wiki lint 结果 */
export interface WikiLintResult {
  report: string;
  autoFixed: number;
  needsReview: number;
  timestamp: string;
}

/** WikiAgent bridge.py 通过 stdin/stdout 通信的指令格式 */
export type WikiBridgeAction = 'ingest' | 'query' | 'lint';

export interface WikiBridgeIngestInput {
  action: 'ingest';
  source_path: string;
  source_title?: string;
  source_type?: string;
  source_url?: string;
}

export interface WikiBridgeQueryInput {
  action: 'query';
  question: string;
}

export interface WikiBridgeLintInput {
  action: 'lint';
}

export type WikiBridgeInput = WikiBridgeIngestInput | WikiBridgeQueryInput | WikiBridgeLintInput;

export interface WikiBridgeResult {
  ok: boolean;
  content?: string;
  error?: string;
}
