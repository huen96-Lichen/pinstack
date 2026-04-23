import type { RenameInput } from '../types';
import { LOCAL_MODEL_CATEGORIES, LOCAL_MODEL_SOURCES } from '../types';

export function buildRenamePrompt(input: RenameInput): string {
  return [
    '任务：为笔记生成规范命名。',
    '必须输出 JSON: {"category","short_title","keyword","source","canonical_title","confidence"}',
    `category 必须使用以下分类字典之一: ${LOCAL_MODEL_CATEGORIES.join(', ')}`,
    `source 必须使用以下来源字典之一: ${LOCAL_MODEL_SOURCES.join(', ')}`,
    `recordType=${input.recordType}`,
    `displayName=${input.displayName ?? ''}`,
    `previewText=${input.previewText ?? ''}`,
    `textContent=${input.textContent ?? ''}`,
    `sourceApp=${input.sourceApp ?? ''}`,
    `source=${input.source ?? ''}`,
  ].join('\n');
}
