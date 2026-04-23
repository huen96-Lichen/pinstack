import type { RecordUseCase } from '../shared/types';
import { optimizeContentForReuse } from '../shared/rewriteEngine';

export function optimizeTextForCopy(text: string, useCase: RecordUseCase): string {
  return optimizeContentForReuse(text, useCase);
}
