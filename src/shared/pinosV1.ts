import type { ObjectLifecycle } from './types';

export type PinObjectLifecycle = ObjectLifecycle;

export type InboxItemType = 'link' | 'text' | 'note' | 'image' | 'pdf' | 'message' | 'email';
export type InboxItemStatus = 'new' | 'processed' | 'archived';

export type TaskStatus = 'idea' | 'next' | 'doing' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type ProjectStatus = 'active' | 'paused' | 'archived';

export type ReviewPeriod = 'daily' | 'weekly' | 'monthly';

export type EventType =
  | 'inbox.captured'
  | 'inbox.processed'
  | 'knowledge.created'
  | 'knowledge.linked_topic'
  | 'knowledge.linked_project'
  | 'task.created'
  | 'task.status_changed'
  | 'project.status_changed'
  | 'review.generated'
  | 'object.archived';

export interface BasePinObject {
  id: string;
  createdAt: number;
  updatedAt: number;
  lifecycle: PinObjectLifecycle;
  archivedAt?: number;
}

export interface SourceRef {
  title?: string;
  url?: string;
  sourcePlatform?: string;
  sourceType?: InboxItemType;
  capturedAt?: number;
}

export interface QuoteRef {
  quote: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

export interface InboxItem extends BasePinObject {
  type: InboxItemType;
  status: InboxItemStatus;
  title: string;
  contentText?: string;
  attachmentPath?: string;
  source: SourceRef;
  suggestedTopicNames: string[];
  suggestedProjectIds: string[];
  suggestedTaskTitles: string[];
  aiSummary?: string;
  aiTags: string[];
  processedAt?: number;
}

export interface KnowledgeItem extends BasePinObject {
  title: string;
  summary: string;
  tags: string[];
  keyPoints: string[];
  quoteRefs: QuoteRef[];
  sourceInboxItemId: string;
  sourceRefs: SourceRef[];
  topicPageIds: string[];
  projectIds: string[];
  suggestedNextActions: string[];
  valueScore: number;
  lastReviewedAt?: number;
}

export interface TopicPage extends BasePinObject {
  slug: string;
  title: string;
  abstract: string;
  currentConclusion: string;
  openQuestions: string[];
  knowledgeItemIds: string[];
  projectIds: string[];
  markdownExportPath?: string;
  lastCompiledAt?: number;
}

export interface Project extends BasePinObject {
  name: string;
  goal: string;
  status: ProjectStatus;
  phase?: string;
  focusScore?: number;
  knowledgeItemIds: string[];
  taskIds: string[];
  latestEventIds: string[];
}

export interface Task extends BasePinObject {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  relatedKnowledgeItemIds: string[];
  blockedReason?: string;
  suggestedNextStep?: string;
  dueAt?: number;
  completedAt?: number;
}

export interface Event extends BasePinObject {
  type: EventType;
  actor: 'user' | 'assistant' | 'system';
  objectType: 'inbox_item' | 'knowledge_item' | 'topic_page' | 'project' | 'task' | 'review';
  objectId: string;
  projectId?: string;
  taskId?: string;
  knowledgeItemId?: string;
  payload?: Record<string, string | number | boolean | null>;
  happenedAt: number;
}

export interface Review extends BasePinObject {
  period: ReviewPeriod;
  windowStart: number;
  windowEnd: number;
  eventIds: string[];
  completedTasks: string[];
  blockedProjects: string[];
  unactedHighValueKnowledgeItemIds: string[];
  summary: string;
  nextStageSuggestions: string[];
  generatedBy: 'assistant' | 'system';
}

export interface HomeFocusSnapshot {
  currentFocusProjectIds: string[];
  nextActionTaskIds: string[];
  blockedTaskIds: string[];
  recentImportantInboxItemIds: string[];
}

export interface CaptureInboxItemInput {
  type: InboxItemType;
  title?: string;
  contentText?: string;
  attachmentPath?: string;
  source?: SourceRef;
}

export interface ProcessInboxItemResult {
  inboxItem: InboxItem;
  draftKnowledgeItem?: KnowledgeItem;
  suggestedTopicNames: string[];
  suggestedProjectIds: string[];
  suggestedTaskTitles: string[];
}

export interface AssistantQueryInput {
  question: string;
  projectId?: string;
  from?: number;
  to?: number;
}

export interface AssistantAnswer {
  answer: string;
  evidence: Array<{
    kind: 'project' | 'task' | 'knowledge_item' | 'event' | 'review';
    id: string;
    title: string;
    summary: string;
  }>;
  recommendedActions: string[];
  generatedAt: number;
}
