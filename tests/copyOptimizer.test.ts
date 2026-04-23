import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeTextForCopy } from '../src/main/copyOptimizer';

test('optimize copy should collapse excessive blank lines and trim trailing spaces', () => {
  const raw = 'line1   \n\n\nline2\t\t\n\nline3   ';
  const optimized = optimizeTextForCopy(raw, 'output');
  assert.equal(optimized, 'line1\n\nline2\n\nline3');
});

test('optimize copy should strip common prompt prefix for prompt useCase', () => {
  const raw = '好的，下面是优化后的提示词：\n\n请帮我优化这段代码';
  const optimized = optimizeTextForCopy(raw, 'prompt');
  assert.equal(optimized, '请帮我优化这段代码');
});

test('optimize copy should keep fix steps structure', () => {
  const raw = '1. 检查端口\\n2. 结束占用进程\\n3. 重启服务';
  const optimized = optimizeTextForCopy(raw, 'fix');
  assert.equal(optimized, raw);
});
