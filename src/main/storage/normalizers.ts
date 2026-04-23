/**
 * Storage normalizers — pure functions for record field normalization.
 * Extracted from storage.ts to reduce file size.
 */
import type {
  RecordCategory,
  RecordType,
  RecordUseCase,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FAVORITE_TAG = 'favorite';

export const VALID_USE_CASES: RecordUseCase[] = ['prompt', 'output', 'fix', 'flow', 'reference', 'unclassified'];
export const VALID_RECORD_TYPES: RecordType[] = ['text', 'image', 'video'];

export const TERMINAL_SOURCE_KEYWORDS = ['terminal', 'iterm'];
export const FIX_ERROR_KEYWORDS = ['error', 'failed', 'not found', 'npm err', 'command not found'];
export const PROMPT_KEYWORDS = ['帮我', '请帮我', '生成', '写一个', '优化', '修改', '实现', '设计', 'please', 'implement', 'generate'];
export const OUTPUT_HINT_KEYWORDS = ['总结', '建议', '说明', '步骤', '分析', '结论', 'summary', 'explain', 'analysis', 'recommendation'];
export const FLOW_HINT_KEYWORDS = ['todo', 'next step', 'pending', 'wip', 'flow', '中间', '草稿', '临时', '待办', '半成品'];
export const REFERENCE_HINT_KEYWORDS = ['readme', 'spec', '规范', '文档', 'reference', '资料', '手册', 'guide', 'checklist'];
export const OUTPUT_MIN_TEXT_LENGTH = 60;
export const FALLBACK_PREVIEW_LIMIT = 300;

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/** Extract the first HTTP(S) URL from a text string. */
export function extractFirstHttpUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/);
  return match?.[0] || undefined;
}

/** Normalize an original URL value to a clean string or undefined. */
export function normalizeOriginalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  return value.trim();
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function formatImageTimeLabel(value: number): string {
  const date = new Date(value);
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}-${hh}-${mm}-${ss}`;
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function trimToCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join('');
}

export function compactTimeToken(value: number): string {
  return Math.floor(value).toString(36);
}

export function buildFallbackPreview(text: string): string {
  return trimToCodePoints(text.replace(/\s+/g, ' ').trim(), FALLBACK_PREVIEW_LIMIT);
}

export function includesAny(source: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => source.includes(keyword));
}

// ---------------------------------------------------------------------------
// Array / type normalizers
// ---------------------------------------------------------------------------

export function normalizeUseCase(value: unknown): RecordUseCase | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return (VALID_USE_CASES as string[]).includes(value) ? (value as RecordUseCase) : undefined;
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const dedup = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim().toLowerCase();
    if (!normalized) continue;
    dedup.add(normalized);
  }
  return [...dedup];
}

export function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeTypeArray(values: unknown): RecordType[] {
  if (!Array.isArray(values)) return [];
  return values.filter((item): item is RecordType => VALID_RECORD_TYPES.includes(item as RecordType));
}

export function normalizeUseCaseArray(values: unknown): RecordUseCase[] {
  if (!Array.isArray(values)) return [];
  return values.filter((item): item is RecordUseCase => VALID_USE_CASES.includes(item as RecordUseCase));
}

// ---------------------------------------------------------------------------
// Source / use-case inference
// ---------------------------------------------------------------------------

export function isTerminalSource(sourceApp: string | null | undefined): boolean {
  const normalized = normalizeText(sourceApp);
  return normalized.length > 0 && TERMINAL_SOURCE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function inferUseCase(input: {
  text: string;
  sourceApp: string | null;
  category: RecordCategory;
}): RecordUseCase {
  const normalizedText = normalizeText(input.text);

  if (isTerminalSource(input.sourceApp) && includesAny(normalizedText, FIX_ERROR_KEYWORDS)) {
    return 'fix';
  }

  if (includesAny(normalizedText, PROMPT_KEYWORDS)) {
    return 'prompt';
  }

  const hasListPattern = /(^|\n)\s*([-*•]|\d+\.)\s+/.test(input.text);
  const hasOutputHints = includesAny(normalizedText, OUTPUT_HINT_KEYWORDS);
  const isLongExplanation =
    (hasListPattern && normalizedText.length >= 20) || (hasOutputHints && normalizedText.length >= OUTPUT_MIN_TEXT_LENGTH);
  if (isLongExplanation) {
    return 'output';
  }

  if (input.category === 'flow' || includesAny(normalizedText, FLOW_HINT_KEYWORDS)) {
    return 'flow';
  }

  if (includesAny(normalizedText, REFERENCE_HINT_KEYWORDS)) {
    return 'reference';
  }

  return 'unclassified';
}
