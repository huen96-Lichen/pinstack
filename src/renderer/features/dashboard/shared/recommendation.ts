import type { RecordItem } from '../../../../shared/types';

export type RecommendationReason = 'frequent' | 'recent' | 'related';

export interface RecommendationItem<TRecord extends RecordItem = RecordItem> {
  item: TRecord;
  score: number;
  reason: RecommendationReason;
}

interface RecommendationInput<TRecord extends RecordItem = RecordItem> {
  records: TRecord[];
  query?: string;
  limit?: number;
  now?: number;
  relatedOnly?: boolean;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  );
}

function buildRecordText(record: RecordItem): string {
  return normalizeText(
    `${record.displayName ?? ''}\n${record.previewText ?? ''}\n${record.ocrText ?? ''}\n${record.tags.join(' ')}\n${
      record.useCase
    }\n${record.sourceApp ?? ''}`
  );
}

function computeRecentScore(lastUsedAt: number, now: number): number {
  if (!Number.isFinite(lastUsedAt) || lastUsedAt <= 0) {
    return 0;
  }

  const age = Math.max(0, now - lastUsedAt);
  return Math.max(0, 1 - age / THIRTY_DAYS_MS);
}

function computeSimilarityScore(query: string, queryTokens: Set<string>, recordText: string, recordTokens: Set<string>): number {
  if (!query) {
    return 0;
  }

  const substringMatched = recordText.includes(query);
  let tokenMatched = 0;
  if (queryTokens.size > 0) {
    for (const token of queryTokens) {
      if (recordTokens.has(token)) {
        tokenMatched += 1;
      }
    }
  }
  const tokenScore = queryTokens.size > 0 ? tokenMatched / queryTokens.size : 0;
  const substringScore = substringMatched ? 1 : 0;
  return Math.max(tokenScore, substringScore);
}

function resolveReason(input: { recent: number; similarity: number; frequency: number }): RecommendationReason {
  if (input.similarity >= input.recent && input.similarity >= input.frequency && input.similarity > 0) {
    return 'related';
  }
  if (input.recent >= input.frequency) {
    return 'recent';
  }
  return 'frequent';
}

export function buildRecommendations<TRecord extends RecordItem>({
  records,
  query,
  limit = 8,
  now = Date.now(),
  relatedOnly = false
}: RecommendationInput<TRecord>): RecommendationItem<TRecord>[] {
  if (records.length === 0 || limit <= 0) {
    return [];
  }

  const normalizedQuery = normalizeText(query);
  const queryTokens = tokenize(normalizedQuery);
  const maxUseCount = Math.max(1, ...records.map((item) => Math.max(0, item.useCount)));

  return records
    .map((item) => {
      const safeLastUsedAt = item.lastUsedAt > 0 ? item.lastUsedAt : item.createdAt;
      const recordText = buildRecordText(item);
      const recordTokens = tokenize(recordText);
      const similarity = computeSimilarityScore(normalizedQuery, queryTokens, recordText, recordTokens);
      if (relatedOnly && similarity <= 0) {
        return null;
      }

      const recent = computeRecentScore(safeLastUsedAt, now);
      const frequency = Math.log1p(Math.max(0, item.useCount)) / Math.log1p(maxUseCount);
      const score = recent * 0.5 + similarity * 0.3 + frequency * 0.2;

      return {
        item,
        score,
        reason: resolveReason({ recent, similarity, frequency })
      };
    })
    .filter((entry): entry is RecommendationItem<TRecord> => entry !== null)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.item.lastUsedAt !== a.item.lastUsedAt) {
        return b.item.lastUsedAt - a.item.lastUsedAt;
      }
      if (b.item.useCount !== a.item.useCount) {
        return b.item.useCount - a.item.useCount;
      }
      if (b.item.createdAt !== a.item.createdAt) {
        return b.item.createdAt - a.item.createdAt;
      }
      return a.item.id.localeCompare(b.item.id);
    })
    .slice(0, limit);
}

