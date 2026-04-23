/**
 * AI Local Model operations for StorageService.
 * Extracted from storage.ts to reduce file size.
 *
 * These functions operate on StorageService state via a thin interface,
 * avoiding circular dependencies while keeping AI logic separate.
 */
import type { RecordItem } from '../../shared/types';
import type {
  DedupeResult,
  ImageUnderstandingResult,
  LocalModelError,
  LocalModelMeta,
  SummaryResult,
} from '../../shared/ai/localModel/types';
import {
  LOCAL_MODEL_META_VERSION,
} from '../../shared/ai/localModel/types';
import { isLocalOllamaModel } from '../../shared/ai/modelRegistry';

// ---------------------------------------------------------------------------
// Meta creation / merging
// ---------------------------------------------------------------------------

export function createInitialLocalModelMeta(): LocalModelMeta {
  return {
    version: LOCAL_MODEL_META_VERSION
  };
}

export function mergeLocalModelMeta(existing: LocalModelMeta | undefined, patch: Partial<LocalModelMeta>): LocalModelMeta {
  return {
    version: existing?.version || LOCAL_MODEL_META_VERSION,
    ...existing,
    ...patch,
    lastUpdatedAt: Date.now()
  };
}

// ---------------------------------------------------------------------------
// Meta normalization
// ---------------------------------------------------------------------------

export function normalizeLocalModelMeta(value: unknown): LocalModelMeta | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Partial<LocalModelMeta>;
  const normalizeError = (input: unknown): LocalModelError | undefined => {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const errorRaw = input as Partial<LocalModelError>;
    const capability =
      errorRaw.capability === 'renameNoteWithLocalModel' ||
      errorRaw.capability === 'dedupePairWithLocalModel' ||
      errorRaw.capability === 'summarizeForKnowledgeBase' ||
      errorRaw.capability === 'understandImageBasic'
        ? errorRaw.capability
        : undefined;
    const provider = errorRaw.provider === 'mock' || errorRaw.provider === 'ollama' ? errorRaw.provider : undefined;
    if (!capability || !provider || typeof errorRaw.message !== 'string' || !errorRaw.message.trim()) {
      return undefined;
    }
    return {
      message: errorRaw.message.trim(),
      capability,
      provider,
      timestamp:
        typeof errorRaw.timestamp === 'number' && Number.isFinite(errorRaw.timestamp)
          ? Math.floor(errorRaw.timestamp)
          : Date.now()
    };
  };

  const normalizeSummary = (input: unknown): SummaryResult | undefined => {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const summary = input as Partial<SummaryResult>;
    if (
      typeof summary.summary !== 'string' ||
      typeof summary.category !== 'string' ||
      typeof summary.keyword !== 'string' ||
      typeof summary.confidence !== 'number'
    ) {
      return undefined;
    }
    return {
      summary: summary.summary,
      category: summary.category as SummaryResult['category'],
      keyword: summary.keyword,
      confidence: Math.max(0, Math.min(1, summary.confidence)),
      source: 'localModel'
    };
  };

  const normalizeDedupe = (input: unknown): DedupeResult | undefined => {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const dedupe = input as Partial<DedupeResult>;
    if (
      typeof dedupe.is_duplicate !== 'boolean' ||
      typeof dedupe.confidence !== 'number' ||
      typeof dedupe.reason !== 'string'
    ) {
      return undefined;
    }
    return {
      is_duplicate: dedupe.is_duplicate,
      confidence: Math.max(0, Math.min(1, dedupe.confidence)),
      reason: dedupe.reason,
      primary_choice: dedupe.primary_choice === 'A' || dedupe.primary_choice === 'B' ? dedupe.primary_choice : null
    };
  };

  const normalizeImage = (input: unknown): ImageUnderstandingResult | undefined => {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const image = input as Partial<ImageUnderstandingResult>;
    if (
      typeof image.image_summary !== 'string' ||
      !Array.isArray(image.tags) ||
      typeof image.suggested_category !== 'string' ||
      typeof image.confidence !== 'number'
    ) {
      return undefined;
    }
    return {
      image_summary: image.image_summary,
      tags: image.tags.filter((item): item is string => typeof item === 'string'),
      suggested_category: image.suggested_category as ImageUnderstandingResult['suggested_category'],
      confidence: Math.max(0, Math.min(1, image.confidence))
    };
  };

  const version = typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : LOCAL_MODEL_META_VERSION;
  const normalized: LocalModelMeta = {
    version,
    mode: raw.mode === 'mock' || raw.mode === 'real' ? raw.mode : undefined,
    model: typeof raw.model === 'string' && isLocalOllamaModel(raw.model) ? raw.model : undefined,
    systemGeneratedTitle:
      typeof raw.systemGeneratedTitle === 'string' && raw.systemGeneratedTitle.trim() ? raw.systemGeneratedTitle : undefined,
    userEditedTitle:
      typeof raw.userEditedTitle === 'string' && raw.userEditedTitle.trim() ? raw.userEditedTitle : undefined,
    titleLockedByUser: typeof raw.titleLockedByUser === 'boolean' ? raw.titleLockedByUser : undefined,
    summary: normalizeSummary(raw.summary),
    dedupeSuggestion: normalizeDedupe(raw.dedupeSuggestion),
    imageUnderstanding: normalizeImage(raw.imageUnderstanding),
    lastError: normalizeError(raw.lastError),
    lastUpdatedAt:
      typeof raw.lastUpdatedAt === 'number' && Number.isFinite(raw.lastUpdatedAt)
        ? Math.floor(raw.lastUpdatedAt)
        : undefined
  };

  const hasValue =
    normalized.mode !== undefined ||
    normalized.model !== undefined ||
    normalized.systemGeneratedTitle !== undefined ||
    normalized.userEditedTitle !== undefined ||
    normalized.titleLockedByUser !== undefined ||
    normalized.summary !== undefined ||
    normalized.dedupeSuggestion !== undefined ||
    normalized.imageUnderstanding !== undefined ||
    normalized.lastError !== undefined ||
    normalized.lastUpdatedAt !== undefined;

  return hasValue || normalized.version ? normalized : undefined;
}

export function isLocalModelMetaEqual(left: LocalModelMeta | undefined, right: unknown): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right || typeof right !== 'object') {
    return false;
  }
  const raw = right as Partial<LocalModelMeta>;
  return (
    left.version === raw.version &&
    left.mode === raw.mode &&
    left.model === raw.model &&
    left.systemGeneratedTitle === raw.systemGeneratedTitle &&
    left.userEditedTitle === raw.userEditedTitle &&
    left.titleLockedByUser === raw.titleLockedByUser &&
    JSON.stringify(left.summary) === JSON.stringify(raw.summary) &&
    JSON.stringify(left.dedupeSuggestion) === JSON.stringify(raw.dedupeSuggestion) &&
    JSON.stringify(left.imageUnderstanding) === JSON.stringify(raw.imageUnderstanding) &&
    JSON.stringify(left.lastError) === JSON.stringify(raw.lastError) &&
    left.lastUpdatedAt === raw.lastUpdatedAt
  );
}
