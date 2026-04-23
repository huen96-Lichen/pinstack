// === VaultKeeper Job Types ===
export type VkJobStatus = 'created' | 'extracting' | 'normalizing' | 'enhancing' | 'packaging' | 'done' | 'failed';
export type VkJobSourceType = 'file' | 'url' | 'video' | 'html';

export interface VkJobLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface VkJobConfig {
  sourceType: VkJobSourceType;
  source: string;
  sourceHtml?: string;
  outputDir: string;
  aiEnhance?: boolean;
  aiModel?: string;
  aiProvider?: string;
  downloadImages?: boolean;
  forceMode?: string;
}

export interface VkJobResult {
  rawPath?: string;
  finalPath?: string;
  exportPath?: string;
  title?: string;
  wordCount?: number;
  duration?: number;
}

export interface VkJob {
  jobId: string;
  status: VkJobStatus;
  result?: VkJobResult;
  logs: VkJobLogEntry[];
  error?: string;
  workspace?: VkJobWorkspace;
}

export interface VkJobWorkspace {
  root: string;
  extracted: string;
  normalized: string;
  exports: string;
}

// === API Request/Response Types ===
export interface VkCreateJobRequest {
  url?: string;
  html?: string;
  filePath?: string;
  outputDir?: string;
  aiEnhance?: boolean;
  aiModel?: string;
  aiProvider?: string;
  downloadImages?: boolean;
  forceMode?: string;
  exportFormat?: 'docx' | 'pdf' | 'html';
}

export interface VkApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface VkExportRequest {
  inputPath: string;
  outputDir?: string;
  format: 'docx' | 'pdf' | 'html';
  toc?: boolean;
  referenceDoc?: string;
}

export interface VkExportResult {
  outputPath: string;
  format: string;
  duration: number;
}

export interface VkExportBatchRequest {
  inputPath: string;
  outputDir?: string;
  formats: ('docx' | 'pdf' | 'html')[];
}

export interface VkToolsInfo {
  markitdown: boolean;
  pandoc: boolean;
}

export interface VkBatchImportRequest {
  sourceDir: string;
  outputDir?: string;
  recursive?: boolean;
  preserveStructure?: boolean;
  aiEnhance?: boolean;
  concurrency?: number;
  extensions?: string[];
  excludePatterns?: string[];
  minSize?: number;
  maxSize?: number;
}

export interface VkBatchImportPreviewRequest {
  sourceDir: string;
  recursive?: boolean;
  extensions?: string[];
  excludePatterns?: string[];
  minSize?: number;
  maxSize?: number;
}

export interface VkSmartClipRequest {
  url?: string;
  html?: string;
  filePath?: string;
  outputDir?: string;
  aiEnhance?: boolean;
  aiModel?: string;
  aiProvider?: string;
  downloadImages?: boolean;
  forceMode?: string;
}

export interface VkSuggestRequest {
  content: string;
  title?: string;
  source?: string;
  sourceType?: string;
  format?: string;
  author?: string;
  useAi?: boolean;
  existingNotes?: string[];
  existingTags?: string[];
}

export interface VkQualityRequest {
  content: string;
  minLength?: number;
  maxGarbageRatio?: number;
  maxRepetitionRatio?: number;
}

export interface VkRetryRequest {
  maxRetries?: number;
  strategy?: string;
  baseDelay?: number;
}

export interface VkClipHtmlRequest {
  html: string;
  sourceUrl?: string;
  outputDir?: string;
  aiEnhance?: boolean;
  downloadImages?: boolean;
}

// === Process State ===
export type VkProcessState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface VkRuntimeStatus {
  state: VkProcessState;
  port: number;
  baseUrl: string;
  pid?: number;
  version?: string;
  tools?: VkToolsInfo;
  error?: string;
  startedAt?: number;
}

// === PinStack -> VK Bridge ===
export interface VkSendRecordRequest {
  recordId: string;
  options?: {
    aiEnhance?: boolean;
    exportFormat?: 'docx' | 'pdf' | 'html';
    outputDir?: string;
  };
}
