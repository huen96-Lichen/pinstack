import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeSettings } from '../src/shared/types';
import { RuleEngine, suggestClassification } from '../src/main/ruleEngine';

const baseRuntime: RuntimeSettings = {
  mode: 'auto',
  pinBehaviorMode: 'auto',
  enableImagePin: true,
  enableTextPin: true,
  enableFlowPin: true,
  dashboardSizePreset: 'medium',
  uiMode: 'modern',
  dashboardAlwaysOnTop: true,
  enableCaptureLauncher: true,
  rememberCaptureRecentSizes: true,
  defaultCaptureSizePreset: 'recent',
  showStatusHints: true,
  captureRecentSizes: [],
  capsule: {
    enabled: true,
    surfaceMode: 'glass',
    anchorDisplayPolicy: 'active-display',
    hoverEnabled: true,
    animationPreset: 'smooth',
    expandedAutoCollapseMs: 2200,
    balancedEntryOrder: ['screenshot', 'ai', 'workspace'],
    displayTitle: 'PinStack',
    quickApps: [],
    enabledModules: ['screenshot', 'ai', 'workspace'],
    showMusicContent: true
  }
};

function makeEngine(runtimePatch: Partial<RuntimeSettings> = {}, appBlacklist: string[] = ['ChatGPT', 'Codex']) {
  const runtime = { ...baseRuntime, ...runtimePatch };
  return new RuleEngine({
    appBlacklist,
    getRuntimeSettings: () => runtime
  });
}

test('mode=off should ignore text content', () => {
  const engine = makeEngine({ mode: 'off' });
  const result = engine.evaluate({
    content: { type: 'text', text: 'hello world' },
    metadata: {}
  });
  assert.equal(result.action, 'ignore');
  assert.equal(result.matchedRule, 'settings.mode.off.ignore');
});

test('mode=off should still save image content', () => {
  const engine = makeEngine({ mode: 'off' });
  const result = engine.evaluate({
    content: { type: 'image' },
    metadata: {}
  });
  assert.equal(result.action, 'save');
  assert.equal(result.matchedRule, 'settings.mode.off.image.save');
});

test('mode=silent should save without pin', () => {
  const engine = makeEngine({ mode: 'silent' });
  const result = engine.evaluate({
    content: { type: 'image' },
    metadata: {}
  });
  assert.equal(result.action, 'save');
  assert.equal(result.matchedRule, 'settings.mode.silent.save');
});

test('blacklist app should save', () => {
  const engine = makeEngine();
  const result = engine.evaluate({
    content: { type: 'text', text: 'long enough text' },
    metadata: { sourceApp: 'ChatGPT' }
  });
  assert.equal(result.action, 'save');
  assert.equal(result.matchedRule, 'app.blacklist.save');
});

test('flow source with flow pin disabled should save', () => {
  const engine = makeEngine({ enableFlowPin: false });
  const result = engine.evaluate({
    content: { type: 'text', text: 'this should be flow text' },
    metadata: { sourceApp: 'Terminal' }
  });
  assert.equal(result.action, 'save');
  assert.equal(result.matchedRule, 'settings.flowPinDisabled.save');
});

test('image pin disabled should save image', () => {
  const engine = makeEngine({ enableImagePin: false });
  const result = engine.evaluate({
    content: { type: 'image' },
    metadata: {}
  });
  assert.equal(result.action, 'save');
  assert.equal(result.matchedRule, 'settings.imagePinDisabled.save');
});

test('text pin disabled should save text', () => {
  const engine = makeEngine({ enableTextPin: false });
  const result = engine.evaluate({
    content: { type: 'text', text: 'abcdef' },
    metadata: { length: 6 }
  });
  assert.equal(result.action, 'save');
  assert.equal(result.matchedRule, 'settings.textPinDisabled.save');
});

test('empty text should ignore', () => {
  const engine = makeEngine();
  const result = engine.evaluate({
    content: { type: 'text', text: '   ' },
    metadata: {}
  });
  assert.equal(result.action, 'ignore');
  assert.equal(result.matchedRule, 'content.emptyText.ignore');
});

test('short text should ignore', () => {
  const engine = makeEngine();
  const result = engine.evaluate({
    content: { type: 'text', text: 'ab' },
    metadata: {}
  });
  assert.equal(result.action, 'ignore');
  assert.equal(result.matchedRule, 'content.shortText.ignore');
});

test('normal long text should fallback to pin', () => {
  const engine = makeEngine();
  const result = engine.evaluate({
    content: { type: 'text', text: 'this text is long enough' },
    metadata: {}
  });
  assert.equal(result.action, 'pin');
  assert.equal(result.matchedRule, 'default.fallback');
});

test('normal image should fallback to pin', () => {
  const engine = makeEngine();
  const result = engine.evaluate({
    content: { type: 'image' },
    metadata: { sourceApp: 'Finder' }
  });
  assert.equal(result.action, 'pin');
  assert.equal(result.matchedRule, 'default.fallback');
});

test('suggestion should classify input keyword to prompt(useCase)', () => {
  const result = suggestClassification({
    content: { type: 'text', text: '请帮我优化这个 React 组件' },
    metadata: { sourceApp: 'Codex', length: null }
  });
  assert.equal(result.suggestedUseCase, 'input');
  assert.equal(result.useCase, 'prompt');
  assert.ok(result.tags.includes('codex'));
  assert.ok(result.tags.includes('react'));
});

test('suggestion should classify issue keyword to fix(useCase)', () => {
  const result = suggestClassification({
    content: { type: 'text', text: 'npm ERR! command failed, 为什么会报错？' },
    metadata: { sourceApp: 'Terminal', length: null }
  });
  assert.equal(result.suggestedUseCase, 'issue');
  assert.equal(result.useCase, 'fix');
  assert.ok(result.tags.includes('terminal'));
  assert.ok(result.tags.includes('bug'));
});

test('suggestion should classify command steps to method(useCase)', () => {
  const result = suggestClassification({
    content: { type: 'text', text: '1. cd app\n2. npm install\n3. git status' },
    metadata: { sourceApp: 'Terminal', length: null }
  });
  assert.equal(result.suggestedUseCase, 'method');
  assert.equal(result.useCase, 'flow');
  assert.ok(result.tags.includes('code'));
});

test('suggestion should fallback to inbox when no clear signal', () => {
  const result = suggestClassification({
    content: { type: 'image' },
    metadata: { sourceApp: 'Finder', length: null }
  });
  assert.equal(result.suggestedUseCase, 'inbox');
  assert.equal(result.useCase, 'unclassified');
});
