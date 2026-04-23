import type { RecordItem } from '../../../../shared/types';
import type { DashboardContentSubtype } from './dashboard.types';

const COMMAND_PATTERN = /(^|\n)\s*(?:\$|#)?\s*(npm|pnpm|yarn|git|cd)\b/i;
const ERROR_PATTERN = /\b(error|exception|traceback|failed|failure|npm\s+err)\b/i;
const CODE_FENCE_PATTERN = /```[\s\S]+?```/;
const CODE_SYMBOL_PATTERN = /({[\s\S]*}|;\s*($|\n))/;

export function inferContentSubtypeFromText(rawText: string): DashboardContentSubtype {
  const text = rawText.trim();
  if (!text) {
    return 'plain';
  }

  if (ERROR_PATTERN.test(text)) {
    return 'error';
  }

  if (COMMAND_PATTERN.test(text)) {
    return 'command';
  }

  if (CODE_FENCE_PATTERN.test(text) || CODE_SYMBOL_PATTERN.test(text)) {
    return 'code';
  }

  return 'plain';
}

export function inferRecordContentSubtype(record: RecordItem): DashboardContentSubtype | undefined {
  if (record.type !== 'text') {
    return undefined;
  }

  return inferContentSubtypeFromText(record.previewText ?? '');
}
