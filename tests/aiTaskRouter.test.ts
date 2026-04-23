import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultAppSettings } from '../src/shared/defaultSettings';
import type { AiRuntimeStatus, AppSettings } from '../src/shared/types';
import { deriveAiOrchestratorStrategy, planAiTaskRoute, resolveTaskOutputTarget, taskRequiresRecord } from '../src/main/services/aiHub/taskRouter';

function mockRuntime(overrides: Partial<AiRuntimeStatus> = {}): AiRuntimeStatus {
  return {
    enabled: true,
    configuredProvider: 'local',
    effectiveProvider: 'local',
    configuredModel: 'gemma4:e4b',
    effectiveModel: 'gemma4:e4b',
    selectedModelLabel: 'Gemma 4 E4B',
    connectionState: 'connected',
    responseMode: 'live',
    message: 'ok',
    reachable: true,
    ...overrides
  };
}

function withAiSettings(mutator: (settings: AppSettings) => void): AppSettings {
  const settings = createDefaultAppSettings();
  mutator(settings);
  return settings;
}

test('deriveAiOrchestratorStrategy should use high_quality for cloud default provider', () => {
  const settings = withAiSettings((s) => {
    s.aiHub.defaultProvider = 'cloud';
  });
  assert.equal(deriveAiOrchestratorStrategy(settings), 'high_quality');
});

test('deriveAiOrchestratorStrategy should use balanced when local with fallback', () => {
  const settings = withAiSettings((s) => {
    s.aiHub.defaultProvider = 'local';
    s.aiHub.allowFallback = true;
  });
  assert.equal(deriveAiOrchestratorStrategy(settings), 'balanced');
});

test('taskRequiresRecord should match task profile', () => {
  assert.equal(taskRequiresRecord('organize_current'), true);
  assert.equal(taskRequiresRecord('generate_summary'), true);
  assert.equal(taskRequiresRecord('enrich_metadata'), true);
  assert.equal(taskRequiresRecord('format_markdown'), false);
  assert.equal(taskRequiresRecord('write_formal_doc'), false);
  assert.equal(taskRequiresRecord('open_vaultkeeper'), false);
});

test('planAiTaskRoute should include timeout and retry config from profile', () => {
  const settings = withAiSettings((s) => {
    s.aiHub.defaultProvider = 'local';
  });
  const route = planAiTaskRoute(
    { taskType: 'format_markdown' },
    settings,
    mockRuntime({ effectiveProvider: 'cloud', effectiveModel: 'gpt-4o-mini' })
  );
  assert.equal(route.provider, 'cloud');
  assert.equal(route.model, 'gpt-4o-mini');
  assert.equal(route.strategy, 'balanced');
  assert.equal(route.timeoutMs, 60000);
  assert.equal(route.retryLimit, 2);
  assert.equal(route.outputTarget, '资料库 Markdown');
});

test('resolveTaskOutputTarget should return deterministic output target', () => {
  assert.equal(resolveTaskOutputTarget('generate_summary'), '摘要字段');
  assert.equal(resolveTaskOutputTarget('open_vaultkeeper'), 'VaultKeeper 流程');
});
