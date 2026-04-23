import type { RecordUseCase } from './types';

export type RewriteMode = 'optimize' | 'rewrite';

const PROMPT_PREFIX_PATTERNS: RegExp[] = [
  /^好的[，,:：\s]*/i,
  /^当然[，,:：\s]*/i,
  /^下面(?:是|给你|为你|提供).*?[：:]\s*/i,
  /^以下(?:是|为).*?[：:]\s*/i
];

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n?/g, '\n');
}

function removeExcessBlankLines(input: string): string {
  const lines = input.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));
  const compact: string[] = [];
  let previousBlank = false;

  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      if (previousBlank) {
        continue;
      }
      compact.push('');
      previousBlank = true;
      continue;
    }

    compact.push(line);
    previousBlank = false;
  }

  while (compact.length > 0 && compact[0].trim().length === 0) {
    compact.shift();
  }
  while (compact.length > 0 && compact[compact.length - 1].trim().length === 0) {
    compact.pop();
  }

  return compact.join('\n');
}

function stripPromptPrefix(text: string): string {
  let next = text;
  let changed = true;

  while (changed) {
    changed = false;
    for (const pattern of PROMPT_PREFIX_PATTERNS) {
      if (pattern.test(next)) {
        next = next.replace(pattern, '');
        changed = true;
      }
    }
  }

  return next;
}

export function optimizeContentForReuse(text: string, useCase: RecordUseCase): string {
  let next = normalizeLineEndings(text);
  next = removeExcessBlankLines(next);

  if (useCase === 'prompt') {
    next = stripPromptPrefix(next);
    next = removeExcessBlankLines(next);
  }

  return next;
}

function wrapTemplate(prefix: string, content: string): string {
  const clean = content.trim();
  if (!clean) {
    return prefix;
  }
  return `${prefix}\n\n${clean}`;
}

export function rewriteByUseCase(text: string, useCase: RecordUseCase): string {
  const optimized = optimizeContentForReuse(text, useCase);

  if (useCase === 'fix') {
    return wrapTemplate('请帮我分析以下问题并给出解决方案：', optimized);
  }

  if (useCase === 'output') {
    return wrapTemplate('请基于以下内容进行优化或扩展：', optimized);
  }

  if (useCase === 'prompt') {
    return wrapTemplate('请优化以下提示词，使其更清晰、更专业：', optimized);
  }

  return wrapTemplate('请基于以下内容进行优化或扩展：', optimized);
}

export function buildRewritePreview(text: string, useCase: RecordUseCase, mode: RewriteMode): string {
  if (mode === 'optimize') {
    if (useCase === 'prompt') {
      return rewriteByUseCase(text, useCase);
    }
    return optimizeContentForReuse(text, useCase);
  }

  return rewriteByUseCase(text, useCase);
}

