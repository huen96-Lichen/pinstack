import type { ImageUnderstandingInput } from '../types';
import { LOCAL_MODEL_CATEGORIES } from '../types';

export function buildImagePrompt(input: ImageUnderstandingInput): string {
  return [
    '任务：进行图片基础理解。',
    '必须输出 JSON: {"image_summary","tags","suggested_category","confidence"}',
    `suggested_category 必须使用以下分类字典之一: ${LOCAL_MODEL_CATEGORIES.join(', ')}`,
    `displayName=${input.displayName ?? ''}`,
    `previewText=${input.previewText ?? ''}`,
    `ocrText=${input.ocrText ?? ''}`,
    `sourceApp=${input.sourceApp ?? ''}`,
  ].join('\n');
}
