export type SourceContentType = 'text' | 'web' | 'image' | 'video' | 'audio' | 'chat' | 'doc';

export type SourceEntryMethod = 'clipboard' | 'web_import' | 'image_capture' | 'video_import' | 'audio_note' | 'template' | 'directory_scan';

export type SourceLifecycleStatus = 'Inbox' | 'Collected' | 'Processed' | 'Linked' | 'Reusable' | 'Archived';
export type SourceSyncStatus = 'pending' | 'partial' | 'synced' | 'failed';
export type SourceRemoteStageStatus = 'pending' | 'synced' | 'failed';
export type WebPageType = 'article' | 'video_page' | 'product_page' | 'doc_page' | 'list_page' | 'unknown';
import type { ObjectLifecycle } from './types';

export type KnowledgeObjectLifecycle = ObjectLifecycle;

export interface SourceRecord {
  sourceId: string;
  title: string;
  contentType: SourceContentType;
  entryMethod: SourceEntryMethod;
  sourcePlatform: string;
  sourceLink?: string;
  siteName?: string;
  publishedAt?: number;
  heroImageUrl?: string;
  pageType?: WebPageType;
  rawDocumentLink?: string;
  rawDocumentId?: string;
  desktopRecordId?: string;
  oneLineSummary: string;
  coreConclusion: string;
  keywords: string[];
  topicIds: string[];
  projectIds: string[];
  currentStatus: SourceLifecycleStatus;
  nextAction: string;
  reusable: boolean;
  enteredKnowledgePage: boolean;
  knowledgePageLink?: string;
  syncStatus: SourceSyncStatus;
  syncError?: string | null;
  rawDocumentStatus: SourceRemoteStageStatus;
  rawDocumentError?: string | null;
  lastSyncedAt?: number;
  createdAt: number;
  updatedAt: number;
  originFilePath?: string;     // 原始文件绝对路径
  originFileHash?: string;     // 文件内容哈希
  originDirRoot?: string;      // 扫描根目录
}

export interface TopicRecord {
  topicId: string;
  name: string;
  description: string;
  sourceIds: string[];
  projectIds: string[];
  assetIds: string[];
  currentConclusion: string;
  openQuestions: string[];
  lifecycle: KnowledgeObjectLifecycle;
  archivedAt?: number;
  mergedInto?: string;
  updatedAt: number;
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  goal: string;
  currentVersion: string;
  status: 'active' | 'paused' | 'done';
  topicIds: string[];
  decisionIds: string[];
  assetIds: string[];
  sourceIds: string[];
  lifecycle: KnowledgeObjectLifecycle;
  archivedAt?: number;
  mergedInto?: string;
  updatedAt: number;
}

export interface DecisionRecord {
  decisionId: string;
  title: string;
  projectId?: string;
  topicId?: string;
  background: string;
  conclusion: string;
  reasons: string[];
  impactScope: string;
  alternatives: string[];
  nextActions: string[];
  sourceIds: string[];
  lifecycle: KnowledgeObjectLifecycle;
  archivedAt?: number;
  updatedAt: number;
}

export interface AssetRecord {
  assetId: string;
  name: string;
  assetType: 'prompt' | 'spec' | 'workflow' | 'guideline' | 'template' | 'other';
  usageScene: string;
  sourceIds: string[];
  topicIds: string[];
  projectIds: string[];
  version: string;
  versionNote?: string;
  versionHistory?: Array<{
    version: string;
    note?: string;
    updatedAt: number;
  }>;
  lifecycle: KnowledgeObjectLifecycle;
  archivedAt?: number;
  updatedAt: number;
}

export interface IngestLog {
  ingestId: string;
  sourceId: string;
  entryMethod: SourceEntryMethod;
  status: 'success' | 'failed';
  note: string;
  createdAt: number;
}

export interface LintIssue {
  lintId: string;
  issueType: 'conflict' | 'orphan' | 'stale' | 'missing_topic' | 'duplicate' | 'pending_deposit';
  objectType: 'source' | 'topic' | 'project' | 'decision' | 'asset' | 'ask_answer';
  objectId: string;
  title: string;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AskAiQuery {
  query: string;
  topicId?: string;
  projectId?: string;
  from?: number;
  to?: number;
}

export interface AskAiEvidence {
  kind: 'topic' | 'project' | 'source';
  id: string;
  title: string;
  summary: string;
}

export interface AskAiAnswer {
  askAnswerId?: string;
  highValue?: boolean;
  deposited?: boolean;
  strategy: 'knowledge-first';
  answer: string;
  evidence: AskAiEvidence[];
  supportingSourceIds: string[];
  relatedTopicIds: string[];
  relatedProjectIds: string[];
  createdAt: number;
}

export interface TopicSuggestion {
  topicId?: string;
  topicName: string;
  reason: string;
  score: number;
  isNew: boolean;
}

export interface KnowledgeRuntimeStatus {
  running: boolean;
  apiBaseUrl: string;
  webUrl: string;
  counts: {
    sources: number;
    topics: number;
    projects: number;
    decisions: number;
    assets: number;
    lintIssues: number;
  };
}

export interface KnowledgeIngestRecordResult {
  source: SourceRecord;
  createdRawDocument: boolean;
}
