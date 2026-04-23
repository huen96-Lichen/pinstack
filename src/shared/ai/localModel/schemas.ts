import {
  LOCAL_MODEL_CATEGORIES,
  LOCAL_MODEL_SOURCES,
  type DedupeResult,
  type ImageUnderstandingResult,
  type LocalModelCategory,
  type LocalModelSource,
  type RenameResult,
  type SummaryResult,
} from './types';

const CATEGORY_DEFAULT_KEYWORD: Record<LocalModelCategory, string> = {
  产品: '功能策略',
  设计: 'UI结构',
  开发: 'Bug修复',
  AI: '工作流',
  视频: '分镜设计',
  运营: '增长策略',
  灵感: '创意方向',
  待处理: '待归类',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('');
}

function toCategory(value: unknown): LocalModelCategory {
  if (typeof value === 'string' && (LOCAL_MODEL_CATEGORIES as readonly string[]).includes(value)) {
    return value as LocalModelCategory;
  }
  return '待处理';
}

function toSource(value: unknown): LocalModelSource {
  if (typeof value === 'string' && (LOCAL_MODEL_SOURCES as readonly string[]).includes(value)) {
    return value as LocalModelSource;
  }
  return '手动录入';
}

function toConfidence(value: unknown, fallback: number = 0.72): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function sanitizeKeyword(keyword: unknown, category: LocalModelCategory): string {
  if (typeof keyword === 'string') {
    const normalized = trimCodePoints(normalizeWhitespace(keyword), 24);
    if (normalized) {
      return normalized;
    }
  }
  return CATEGORY_DEFAULT_KEYWORD[category];
}

function sanitizeShortTitle(title: unknown): string {
  if (typeof title === 'string') {
    const normalized = trimCodePoints(normalizeWhitespace(title).replace(/[\\/:*?"<>|[\]{}()]/g, ''), 24);
    if (normalized) {
      return normalized;
    }
  }
  return '未命名收藏';
}

function buildCanonicalTitle(input: {
  category: LocalModelCategory;
  shortTitle: string;
  keyword: string;
  source: LocalModelSource;
}): string {
  const segments = [input.category, input.shortTitle, input.keyword, input.source]
    .map((item) => normalizeWhitespace(item).replace(/[\\/:*?"<>|[\]{}()]/g, '').replace(/_/g, ' ').trim() || '未命名');
  return segments.join('_');
}

function sanitizeCanonicalTitle(value: unknown, fallback: {
  category: LocalModelCategory;
  shortTitle: string;
  keyword: string;
  source: LocalModelSource;
}): string {
  if (typeof value === 'string') {
    const normalized = trimCodePoints(normalizeWhitespace(value), 120);
    const parts = normalized.split('_').map((item) => item.trim()).filter(Boolean);
    if (parts.length >= 4) {
      return normalized;
    }
  }
  return buildCanonicalTitle(fallback);
}

const MAX_JSON_PARSE_SIZE = 64 * 1024; // 64KB

export function parseJsonObject(rawText: string): Record<string, unknown> {
  if (rawText.length > MAX_JSON_PARSE_SIZE) {
    throw new Error('Model output exceeds maximum allowed size');
  }

  const direct = rawText.trim();
  try {
    const parsed = JSON.parse(direct) as unknown;
    const asObj = asRecord(parsed);
    if (asObj) {
      return asObj;
    }
  } catch {
    // continue
  }

  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const sliced = rawText.slice(start, end + 1);
    const parsed = JSON.parse(sliced) as unknown;
    const asObj = asRecord(parsed);
    if (asObj) {
      return asObj;
    }
  }

  throw new Error('Model output is not valid JSON object');
}

export function validateRenameResult(payload: unknown): RenameResult {
  const raw = asRecord(payload) ?? {};
  const category = toCategory(raw.category);
  const source = toSource(raw.source);
  const shortTitle = sanitizeShortTitle(raw.short_title);
  const keyword = sanitizeKeyword(raw.keyword, category);

  return {
    category,
    short_title: shortTitle,
    keyword,
    source,
    canonical_title: sanitizeCanonicalTitle(raw.canonical_title, {
      category,
      shortTitle,
      keyword,
      source,
    }),
    confidence: toConfidence(raw.confidence),
  };
}

export function validateDedupeResult(payload: unknown): DedupeResult {
  const raw = asRecord(payload) ?? {};
  const primaryChoice = raw.primary_choice === 'A' || raw.primary_choice === 'B' ? raw.primary_choice : null;
  return {
    is_duplicate: raw.is_duplicate === true,
    confidence: toConfidence(raw.confidence),
    reason:
      typeof raw.reason === 'string' && normalizeWhitespace(raw.reason)
        ? trimCodePoints(normalizeWhitespace(raw.reason), 300)
        : 'local model suggestion',
    primary_choice: primaryChoice,
  };
}

export function validateSummaryResult(payload: unknown): SummaryResult {
  const raw = asRecord(payload) ?? {};
  const category = toCategory(raw.category);
  return {
    summary:
      typeof raw.summary === 'string' && normalizeWhitespace(raw.summary)
        ? trimCodePoints(normalizeWhitespace(raw.summary), 300)
        : '摘要生成失败，已回退到本地预览。',
    category,
    keyword: sanitizeKeyword(raw.keyword, category),
    confidence: toConfidence(raw.confidence),
    source: 'localModel',
  };
}

export function validateImageUnderstandingResult(payload: unknown): ImageUnderstandingResult {
  const raw = asRecord(payload) ?? {};
  const suggestedCategory = toCategory(raw.suggested_category);
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((item): item is string => typeof item === 'string')
        .map((item) => trimCodePoints(normalizeWhitespace(item), 24))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return {
    image_summary:
      typeof raw.image_summary === 'string' && normalizeWhitespace(raw.image_summary)
        ? trimCodePoints(normalizeWhitespace(raw.image_summary), 200)
        : '图片内容简述不可用。',
    tags,
    suggested_category: suggestedCategory,
    confidence: toConfidence(raw.confidence),
  };
}

export function createRenameFallback(input: { displayName?: string; previewText?: string }): RenameResult {
  const shortTitle = sanitizeShortTitle(input.displayName ?? input.previewText ?? '未命名收藏');
  return {
    category: '待处理',
    short_title: shortTitle,
    keyword: CATEGORY_DEFAULT_KEYWORD['待处理'],
    source: 'PinStack',
    canonical_title: buildCanonicalTitle({
      category: '待处理',
      shortTitle,
      keyword: CATEGORY_DEFAULT_KEYWORD['待处理'],
      source: 'PinStack',
    }),
    confidence: 0.3,
  };
}

export function createDedupeFallback(): DedupeResult {
  return {
    is_duplicate: false,
    confidence: 0.2,
    reason: 'fallback: keep heuristic decision',
    primary_choice: null,
  };
}

export function createSummaryFallback(input: { previewText?: string; textContent?: string }): SummaryResult {
  const fallbackText = normalizeWhitespace(input.previewText ?? input.textContent ?? '暂无摘要').slice(0, 300);
  return {
    summary: fallbackText || '暂无摘要',
    category: '待处理',
    keyword: CATEGORY_DEFAULT_KEYWORD['待处理'],
    confidence: 0.2,
    source: 'localModel',
  };
}

export function createImageFallback(input: { previewText?: string }): ImageUnderstandingResult {
  return {
    image_summary: normalizeWhitespace(input.previewText ?? '图片待理解') || '图片待理解',
    tags: [],
    suggested_category: '待处理',
    confidence: 0.2,
  };
}
