import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRewritePreview, optimizeContentForReuse, rewriteByUseCase } from '../src/shared/rewriteEngine';

test('optimizeContentForReuse should normalize blank lines and trim trailing spaces', () => {
  const raw = 'line1  \n\n\nline2\t\n\nline3   ';
  const result = optimizeContentForReuse(raw, 'output');
  assert.equal(result, 'line1\n\nline2\n\nline3');
});

test('rewriteByUseCase should map fix to issue-analysis prompt template', () => {
  const raw = 'npm ERR! failed to build';
  const result = rewriteByUseCase(raw, 'fix');
  assert.equal(result, '请帮我分析以下问题并给出解决方案：\n\nnpm ERR! failed to build');
});

test('rewriteByUseCase should map output to optimization template', () => {
  const raw = '这里是一段结论说明';
  const result = rewriteByUseCase(raw, 'output');
  assert.equal(result, '请基于以下内容进行优化或扩展：\n\n这里是一段结论说明');
});

test('buildRewritePreview optimize should wrap prompt as professional optimization request', () => {
  const raw = '好的：请帮我写一个登录页';
  const result = buildRewritePreview(raw, 'prompt', 'optimize');
  assert.equal(result, '请优化以下提示词，使其更清晰、更专业：\n\n请帮我写一个登录页');
});

