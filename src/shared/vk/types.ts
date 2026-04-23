export type VKSourceType =
  | 'file'
  | 'folder'
  | 'url'
  | 'image_url'
  | 'audio'
  | 'video'
  | 'record';

export type VKTaskType =
  | 'extract'
  | 'convert'
  | 'transcribe'
  | 'normalize'
  | 'enhance'
  | 'export';

export type VKTaskStatus =
  | 'waiting'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export type VKTaskStage =
  | 'created'
  | 'preflight'
  | 'extracting'
  | 'converting'
  | 'transcribing'
  | 'normalizing'
  | 'enhancing'
  | 'exporting'
  | 'wiki_ingesting'
  | 'done';

export interface VKTaskInput {
  id: string;
  sourceType: VKSourceType;
  sourcePath?: string;
  sourceUrl?: string;
  sourceRecordId?: string;
  mimeType?: string;
  options?: Record<string, unknown>;
  createdAt: string;
}

export interface VKTask {
  id: string;
  type: VKTaskType;
  input: VKTaskInput;
  status: VKTaskStatus;
  stage: VKTaskStage;
  progress: number;
  logs: string[];
  errorMessage?: string;
  outputPath?: string;
  logPath?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface VKDraftDocument {
  id: string;
  title?: string;
  rawMarkdown: string;
  sourceType: string;
  sourcePath?: string;
  sourceUrl?: string;
  extractedMetadata?: Record<string, unknown>;
  attachments?: string[];
}

export interface VKProcessedDocument {
  id: string;
  title: string;
  markdown: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  outputPath?: string;
}

export type VKOutputMode = 'draft' | 'inbox' | 'library' | 'custom';

export interface VKRuntimeDependency {
  key: string;
  available: boolean;
  version?: string;
  path?: string;
  lastCheckedAt: string;
  hint: string;
  installCommand?: string;
}

export interface VKRuntimeStatus {
  service: 'idle' | 'running' | 'error';
  queueLength: number;
  runningTaskId?: string;
  dependencies: VKRuntimeDependency[];
}

export interface VKTaskCreateInput {
  type: VKTaskType;
  sourceType: VKSourceType;
  sourcePath?: string;
  sourceUrl?: string;
  sourceRecordId?: string;
  options?: Record<string, unknown>;
}

export interface VKTaskExecutionResult {
  ok: boolean;
  stage: VKTaskStage;
  outputPath?: string;
  draft?: VKDraftDocument;
  processed?: VKProcessedDocument;
  error?: string;
  logs?: string[];
}

export interface VKTaskListResponse {
  tasks: VKTask[];
  total: number;
}
