import type { SummaryInput } from '../types';
import { LOCAL_MODEL_CATEGORIES } from '../types';

export function buildSummaryPrompt(input: SummaryInput): string {
  return [
    '任务：输出知识库入库摘要。',
    '必须输出 JSON: {"summary","category","keyword","confidence","source"}',
    `category 必须使用以下分类字典之一: ${LOCAL_MODEL_CATEGORIES.join(', ')}`,
    'source 固定为 "localModel"。',
    `displayName=${input.displayName ?? ''}`,
    `previewText=${input.previewText ?? ''}`,
    `textContent=${input.textContent}`,
  ].join('\n');
}
