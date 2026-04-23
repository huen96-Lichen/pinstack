import {
  type DedupeInput,
  type DedupeResult,
  type ImageUnderstandingInput,
  type ImageUnderstandingResult,
  type LocalModelPreflightResult,
  type LocalModelProvider,
  LOCAL_MODEL_NAME,
  type RenameInput,
  type RenameResult,
  type SummaryInput,
  type SummaryResult,
} from '../../../shared/ai/localModel/types';
import {
  createDedupeFallback,
  createImageFallback,
  createRenameFallback,
  createSummaryFallback,
} from '../../../shared/ai/localModel/schemas';

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function inferCategory(text: string): RenameResult['category'] {
  const normalized = text.toLowerCase();
  if (/bug|error|修复|异常|debug/.test(normalized)) {
    return '开发';
  }
  if (/ui|设计|视觉|布局/.test(normalized)) {
    return '设计';
  }
  if (/prompt|模型|llm|agent|ai/.test(normalized)) {
    return 'AI';
  }
  return '待处理';
}

export class MockLocalProvider implements LocalModelProvider {
  public readonly provider = 'mock' as const;
  private model: string;

  public constructor(model: string = LOCAL_MODEL_NAME) {
    this.model = model;
  }

  public setModel(model: string): void {
    this.model = model;
  }

  public async preflight(): Promise<LocalModelPreflightResult> {
    return {
      ok: true,
      provider: 'mock',
      model: this.model,
      checkedAt: Date.now(),
      message: 'Mock provider is always ready.'
    };
  }

  public async renameNoteWithLocalModel(input: RenameInput): Promise<RenameResult> {
    const fallback = createRenameFallback(input);
    const seed = `${input.displayName ?? ''}|${input.previewText ?? ''}|${input.textContent ?? ''}`;
    const hash = stableHash(seed);
    const category = inferCategory(seed);
    return {
      ...fallback,
      category,
      short_title: (input.displayName ?? input.previewText ?? fallback.short_title).slice(0, 20) || fallback.short_title,
      keyword: fallback.keyword,
      source: 'PinStack',
      canonical_title: `${category}_${(input.displayName ?? fallback.short_title).slice(0, 14)}_${fallback.keyword}_PinStack`,
      confidence: 0.62 + (hash % 10) / 100
    };
  }

  public async dedupePairWithLocalModel(input: DedupeInput): Promise<DedupeResult> {
    const fallback = createDedupeFallback();
    const left = `${input.left.displayName ?? ''} ${input.left.textContent ?? ''}`.toLowerCase();
    const right = `${input.right.displayName ?? ''} ${input.right.textContent ?? ''}`.toLowerCase();
    const sameUrl = Boolean(input.left.originalUrl && input.right.originalUrl && input.left.originalUrl === input.right.originalUrl);
    const likely = sameUrl || (left && right && (left.includes(right.slice(0, 20)) || right.includes(left.slice(0, 20))));

    if (!likely) {
      return fallback;
    }

    return {
      is_duplicate: true,
      confidence: sameUrl ? 0.91 : 0.76,
      reason: sameUrl ? 'matched-original-url' : 'high-text-overlap',
      primary_choice: 'A'
    };
  }

  public async summarizeForKnowledgeBase(input: SummaryInput): Promise<SummaryResult> {
    const fallback = createSummaryFallback(input);
    return {
      ...fallback,
      summary: (input.previewText ?? input.textContent).replace(/\s+/g, ' ').trim().slice(0, 180) || fallback.summary,
      category: inferCategory(input.textContent),
      confidence: 0.66,
      source: 'localModel'
    };
  }

  public async understandImageBasic(input: ImageUnderstandingInput): Promise<ImageUnderstandingResult> {
    const fallback = createImageFallback(input);
    const text = `${input.displayName ?? ''} ${input.previewText ?? ''} ${input.ocrText ?? ''}`;
    const category = inferCategory(text);
    return {
      ...fallback,
      image_summary: input.previewText?.trim() || '图片内容待人工确认。',
      tags: text
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5),
      suggested_category: category,
      confidence: 0.58
    };
  }
}
