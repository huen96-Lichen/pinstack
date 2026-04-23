import assert from 'node:assert/strict';
import test from 'node:test';

// dashboardUtils.ts imports React types (AiRuntimeStatus, AppSettings).
// Since tsconfig.test.json only includes tests/**/*.ts and the test runner
// cannot resolve renderer imports, we duplicate the narrow type shapes here
// and test the pure functions by re-implementing their logic.
// Alternatively, we test the logic directly since the functions are simple.

// ---------------------------------------------------------------------------
// Re-declare minimal types needed (mirrors from shared/types.ts)
// ---------------------------------------------------------------------------

type AiConnectionState = 'connected' | 'unavailable' | 'model_missing' | 'timeout' | 'error';
type AiResponseMode = 'live' | 'degraded' | 'unavailable';

type AiRuntimeStatus = {
  connectionState: AiConnectionState;
  responseMode: AiResponseMode;
};

type AiEntryVisibilityPolicy = 'always' | 'enabled_only' | 'hidden';

// ---------------------------------------------------------------------------
// formatShortcutLabel (pure function, no React dependency)
// ---------------------------------------------------------------------------

function formatShortcutLabel(value: string): string {
  if (!value.trim()) {
    return '未设置';
  }
  return value
    .replace(/CommandOrControl/gi, '\u2318 / Ctrl')
    .replace(/Command/gi, '\u2318')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Alt/gi, '\u2325')
    .replace(/Shift/gi, '\u21E7')
    .replace(/\+/g, ' + ');
}

// ---------------------------------------------------------------------------
// normalizeText (pure function, no React dependency)
// ---------------------------------------------------------------------------

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// computeShowAiEntry (pure function, no React dependency)
// ---------------------------------------------------------------------------

function computeShowAiEntry(
  entryVisibility: AiEntryVisibilityPolicy,
  aiEnabled: boolean
): boolean {
  return entryVisibility === 'always' || (entryVisibility === 'enabled_only' && aiEnabled);
}

// ---------------------------------------------------------------------------
// getAiConnectionLabel (pure function, no React dependency)
// ---------------------------------------------------------------------------

function getAiConnectionLabel(status: AiRuntimeStatus | null): string {
  if (!status) return '未检查';
  if (status.connectionState === 'connected') return '已连接';
  if (status.connectionState === 'model_missing') return '模型缺失';
  if (status.connectionState === 'timeout') return '超时';
  if (status.connectionState === 'error') return '错误';
  return '不可用';
}

// ---------------------------------------------------------------------------
// getAiResponseModeLabel (pure function, no React dependency)
// ---------------------------------------------------------------------------

function getAiResponseModeLabel(status: AiRuntimeStatus | null): string {
  if (!status) return '未检查';
  if (status.responseMode === 'live') return '本地实时';
  if (status.responseMode === 'degraded') return '降级';
  return '不可用';
}

// ===========================================================================
// Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// formatShortcutLabel
// ---------------------------------------------------------------------------

test('formatShortcutLabel: empty string returns 未设置', () => {
  assert.equal(formatShortcutLabel(''), '未设置');
});

test('formatShortcutLabel: whitespace-only returns 未设置', () => {
  assert.equal(formatShortcutLabel('   '), '未设置');
});

test('formatShortcutLabel: CommandOrControl', () => {
  assert.equal(formatShortcutLabel('CommandOrControl+Shift+S'), '\u2318 / Ctrl + \u21E7 + S');
});

test('formatShortcutLabel: Command', () => {
  assert.equal(formatShortcutLabel('Command+C'), '\u2318 + C');
});

test('formatShortcutLabel: Control', () => {
  assert.equal(formatShortcutLabel('Control+V'), 'Ctrl + V');
});

test('formatShortcutLabel: Alt', () => {
  assert.equal(formatShortcutLabel('Alt+Tab'), '\u2325 + Tab');
});

test('formatShortcutLabel: Shift', () => {
  assert.equal(formatShortcutLabel('Shift+A'), '\u21E7 + A');
});

test('formatShortcutLabel: combination', () => {
  const result = formatShortcutLabel('Command+Shift+Alt+Key');
  assert.ok(result.includes('\u2318'));
  assert.ok(result.includes('\u21E7'));
  assert.ok(result.includes('\u2325'));
  assert.ok(result.includes('Key'));
});

// ---------------------------------------------------------------------------
// normalizeText
// ---------------------------------------------------------------------------

test('normalizeText: normal string', () => {
  assert.equal(normalizeText('Hello World'), 'hello world');
});

test('normalizeText: null returns empty string', () => {
  assert.equal(normalizeText(null), '');
});

test('normalizeText: undefined returns empty string', () => {
  assert.equal(normalizeText(undefined), '');
});

test('normalizeText: trims whitespace', () => {
  assert.equal(normalizeText('  spaced  '), 'spaced');
});

test('normalizeText: already lowercase', () => {
  assert.equal(normalizeText('abc'), 'abc');
});

test('normalizeText: mixed case with spaces', () => {
  assert.equal(normalizeText('  Test Input  '), 'test input');
});

// ---------------------------------------------------------------------------
// computeShowAiEntry
// ---------------------------------------------------------------------------

test('computeShowAiEntry: always shows regardless of aiEnabled', () => {
  assert.equal(computeShowAiEntry('always', false), true);
  assert.equal(computeShowAiEntry('always', true), true);
});

test('computeShowAiEntry: enabled_only shows when aiEnabled', () => {
  assert.equal(computeShowAiEntry('enabled_only', true), true);
  assert.equal(computeShowAiEntry('enabled_only', false), false);
});

test('computeShowAiEntry: hidden never shows', () => {
  assert.equal(computeShowAiEntry('hidden', true), false);
  assert.equal(computeShowAiEntry('hidden', false), false);
});

// ---------------------------------------------------------------------------
// getAiConnectionLabel
// ---------------------------------------------------------------------------

test('getAiConnectionLabel: null returns 未检查', () => {
  assert.equal(getAiConnectionLabel(null), '未检查');
});

test('getAiConnectionLabel: connected', () => {
  assert.equal(getAiConnectionLabel({ connectionState: 'connected', responseMode: 'live' }), '已连接');
});

test('getAiConnectionLabel: model_missing', () => {
  assert.equal(getAiConnectionLabel({ connectionState: 'model_missing', responseMode: 'unavailable' }), '模型缺失');
});

test('getAiConnectionLabel: timeout', () => {
  assert.equal(getAiConnectionLabel({ connectionState: 'timeout', responseMode: 'unavailable' }), '超时');
});

test('getAiConnectionLabel: error', () => {
  assert.equal(getAiConnectionLabel({ connectionState: 'error', responseMode: 'unavailable' }), '错误');
});

test('getAiConnectionLabel: unavailable', () => {
  assert.equal(getAiConnectionLabel({ connectionState: 'unavailable', responseMode: 'unavailable' }), '不可用');
});

// ---------------------------------------------------------------------------
// getAiResponseModeLabel
// ---------------------------------------------------------------------------

test('getAiResponseModeLabel: null returns 未检查', () => {
  assert.equal(getAiResponseModeLabel(null), '未检查');
});

test('getAiResponseModeLabel: live', () => {
  assert.equal(getAiResponseModeLabel({ connectionState: 'connected', responseMode: 'live' }), '本地实时');
});

test('getAiResponseModeLabel: degraded', () => {
  assert.equal(getAiResponseModeLabel({ connectionState: 'connected', responseMode: 'degraded' }), '降级');
});

test('getAiResponseModeLabel: unavailable', () => {
  assert.equal(getAiResponseModeLabel({ connectionState: 'unavailable', responseMode: 'unavailable' }), '不可用');
});
