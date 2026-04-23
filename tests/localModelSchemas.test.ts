import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseJsonObject,
  validateRenameResult,
  validateSummaryResult,
  validateDedupeResult,
} from '../src/shared/ai/localModel/schemas';

// ---------------------------------------------------------------------------
// parseJsonObject
// ---------------------------------------------------------------------------

test('parseJsonObject: parses valid JSON object directly', () => {
  const result = parseJsonObject('{"key": "value"}');
  assert.deepEqual(result, { key: 'value' });
});

test('parseJsonObject: extracts JSON from markdown code block', () => {
  const input = 'Here is the result:\n```json\n{"category": "AI", "confidence": 0.9}\n```\nDone.';
  const result = parseJsonObject(input);
  assert.equal(result.category, 'AI');
  assert.equal(result.confidence, 0.9);
});

test('parseJsonObject: extracts JSON from surrounding text', () => {
  const input = 'The model says: {"name": "test", "value": 42} end.';
  const result = parseJsonObject(input);
  assert.equal(result.name, 'test');
  assert.equal(result.value, 42);
});

test('parseJsonObject: parses JSON with whitespace', () => {
  const input = '  { "a": 1, "b": 2 }  ';
  const result = parseJsonObject(input);
  assert.deepEqual(result, { a: 1, b: 2 });
});

test('parseJsonObject: rejects input exceeding 64KB', () => {
  const largeObj = { data: 'x'.repeat(65 * 1024) };
  const largeJson = JSON.stringify(largeObj);
  assert.throws(
    () => parseJsonObject(largeJson),
    { message: 'Model output exceeds maximum allowed size' }
  );
});

test('parseJsonObject: throws on invalid JSON', () => {
  assert.throws(
    () => parseJsonObject('not json at all'),
    { message: 'Model output is not valid JSON object' }
  );
});

test('parseJsonObject: throws on JSON array (not object)', () => {
  assert.throws(
    () => parseJsonObject('[1, 2, 3]'),
    { message: 'Model output is not valid JSON object' }
  );
});

test('parseJsonObject: throws on JSON primitive', () => {
  assert.throws(
    () => parseJsonObject('"just a string"'),
    { message: 'Model output is not valid JSON object' }
  );
});

test('parseJsonObject: throws on empty input', () => {
  assert.throws(
    () => parseJsonObject(''),
    { message: 'Model output is not valid JSON object' }
  );
});

// ---------------------------------------------------------------------------
// validateRenameResult
// ---------------------------------------------------------------------------

test('validateRenameResult: valid input returns expected fields', () => {
  const result = validateRenameResult({
    category: 'AI',
    short_title: '测试标题',
    keyword: '工作流',
    source: 'PinStack',
    canonical_title: 'AI_测试标题_工作流_PinStack',
    confidence: 0.95,
  });
  assert.equal(result.category, 'AI');
  assert.equal(result.short_title, '测试标题');
  assert.equal(result.keyword, '工作流');
  assert.equal(result.source, 'PinStack');
  assert.ok(result.canonical_title.length > 0);
  assert.equal(result.confidence, 0.95);
});

test('validateRenameResult: missing fields use defaults', () => {
  const result = validateRenameResult({});
  assert.equal(result.category, '待处理');
  assert.equal(result.short_title, '未命名收藏');
  assert.equal(result.source, '手动录入');
  assert.ok(result.canonical_title.length > 0);
  assert.equal(result.confidence, 0.72); // default fallback
});

test('validateRenameResult: low confidence is clamped to [0, 1]', () => {
  const result = validateRenameResult({ confidence: -0.5 });
  assert.equal(result.confidence, 0);
});

test('validateRenameResult: high confidence is clamped to [0, 1]', () => {
  const result = validateRenameResult({ confidence: 1.5 });
  assert.equal(result.confidence, 1);
});

test('validateRenameResult: invalid category falls back to 待处理', () => {
  const result = validateRenameResult({ category: 'invalid' });
  assert.equal(result.category, '待处理');
});

test('validateRenameResult: null input uses all defaults', () => {
  const result = validateRenameResult(null);
  assert.equal(result.category, '待处理');
  assert.equal(result.short_title, '未命名收藏');
});

// ---------------------------------------------------------------------------
// validateSummaryResult
// ---------------------------------------------------------------------------

test('validateSummaryResult: valid input returns expected fields', () => {
  const result = validateSummaryResult({
    summary: '这是一段摘要',
    category: '开发',
    keyword: 'Bug修复',
    confidence: 0.88,
  });
  assert.equal(result.summary, '这是一段摘要');
  assert.equal(result.category, '开发');
  assert.equal(result.keyword, 'Bug修复');
  assert.equal(result.confidence, 0.88);
  assert.equal(result.source, 'localModel');
});

test('validateSummaryResult: missing summary uses fallback', () => {
  const result = validateSummaryResult({});
  assert.equal(result.summary, '摘要生成失败，已回退到本地预览。');
});

test('validateSummaryResult: empty summary uses fallback', () => {
  const result = validateSummaryResult({ summary: '   ' });
  assert.equal(result.summary, '摘要生成失败，已回退到本地预览。');
});

test('validateSummaryResult: missing category defaults to 待处理', () => {
  const result = validateSummaryResult({});
  assert.equal(result.category, '待处理');
});

test('validateSummaryResult: null input uses all defaults', () => {
  const result = validateSummaryResult(null);
  assert.equal(result.summary, '摘要生成失败，已回退到本地预览。');
  assert.equal(result.category, '待处理');
  assert.equal(result.source, 'localModel');
});

// ---------------------------------------------------------------------------
// validateDedupeResult
// ---------------------------------------------------------------------------

test('validateDedupeResult: valid duplicate result', () => {
  const result = validateDedupeResult({
    is_duplicate: true,
    confidence: 0.92,
    reason: '内容高度相似',
    primary_choice: 'A',
  });
  assert.equal(result.is_duplicate, true);
  assert.equal(result.confidence, 0.92);
  assert.equal(result.reason, '内容高度相似');
  assert.equal(result.primary_choice, 'A');
});

test('validateDedupeResult: not duplicate', () => {
  const result = validateDedupeResult({
    is_duplicate: false,
    confidence: 0.3,
    reason: '内容不同',
    primary_choice: null,
  });
  assert.equal(result.is_duplicate, false);
  assert.equal(result.primary_choice, null);
});

test('validateDedupeResult: missing fields use defaults', () => {
  const result = validateDedupeResult({});
  assert.equal(result.is_duplicate, false);
  assert.equal(result.reason, 'local model suggestion');
  assert.equal(result.primary_choice, null);
  assert.equal(result.confidence, 0.72); // default fallback
});

test('validateDedupeResult: invalid primary_choice falls back to null', () => {
  const result = validateDedupeResult({ primary_choice: 'C' });
  assert.equal(result.primary_choice, null);
});

test('validateDedupeResult: null input uses defaults', () => {
  const result = validateDedupeResult(null);
  assert.equal(result.is_duplicate, false);
  assert.equal(result.reason, 'local model suggestion');
});

test('validateDedupeResult: reason is trimmed and limited', () => {
  const longReason = 'A'.repeat(500);
  const result = validateDedupeResult({ reason: longReason });
  assert.ok(result.reason.length <= 300);
});
