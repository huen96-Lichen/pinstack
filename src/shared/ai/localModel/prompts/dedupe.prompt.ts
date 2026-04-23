import type { DedupeInput } from '../types';

export function buildDedupePrompt(input: DedupeInput): string {
  return [
    '任务：判断 A/B 是否重复，并给出去重建议。',
    '必须输出 JSON: {"is_duplicate","confidence","reason","primary_choice"}',
    'primary_choice 仅可为 "A" | "B" | null。',
    `A.id=${input.left.id}`,
    `A.displayName=${input.left.displayName ?? ''}`,
    `A.originalUrl=${input.left.originalUrl ?? ''}`,
    `A.textContent=${input.left.textContent ?? ''}`,
    `B.id=${input.right.id}`,
    `B.displayName=${input.right.displayName ?? ''}`,
    `B.originalUrl=${input.right.originalUrl ?? ''}`,
    `B.textContent=${input.right.textContent ?? ''}`,
  ].join('\n');
}
