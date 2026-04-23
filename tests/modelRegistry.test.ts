import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_MODEL_REGISTRY,
  getEnabledAiModels,
  mergeAiModelCatalog,
  getAiModelStatusLabel,
  type AiModelCatalogOverride,
  type AiModelRegistryItem,
} from '../src/shared/ai/modelRegistry';

// ---------------------------------------------------------------------------
// getEnabledAiModels
// ---------------------------------------------------------------------------

test('getEnabledAiModels returns only enabled models', () => {
  const enabled = getEnabledAiModels();
  for (const model of enabled) {
    assert.ok(model.enabled, `model ${model.id} should be enabled`);
  }
});

test('getEnabledAiModels excludes disabled models', () => {
  // All current models are enabled; simulate by checking registry length
  const enabled = getEnabledAiModels();
  const allEnabled = AI_MODEL_REGISTRY.filter((m) => m.enabled);
  assert.equal(enabled.length, allEnabled.length);
});

test('getEnabledAiModels sorts recommended first', () => {
  const models = getEnabledAiModels();
  const recommended = models.filter((m) => m.isRecommended);
  const notRecommended = models.filter((m) => !m.isRecommended);
  if (recommended.length > 0 && notRecommended.length > 0) {
    const firstRecommendedIdx = models.findIndex((m) => m.isRecommended);
    const firstNotRecommendedIdx = models.findIndex((m) => !m.isRecommended);
    assert.ok(
      firstRecommendedIdx < firstNotRecommendedIdx,
      'recommended models should appear before non-recommended'
    );
  }
});

test('getEnabledAiModels puts currentModelId first', () => {
  const models = getEnabledAiModels('qwen2.5:14b');
  assert.equal(models[0]?.id, 'qwen2.5:14b');
});

// ---------------------------------------------------------------------------
// mergeAiModelCatalog
// ---------------------------------------------------------------------------

test('mergeAiModelCatalog returns catalog items for all enabled models', () => {
  const catalog = mergeAiModelCatalog();
  const enabled = getEnabledAiModels();
  assert.equal(catalog.length, enabled.length);
});

test('mergeAiModelCatalog applies overrides', () => {
  const overrides: AiModelCatalogOverride[] = [
    { id: 'gemma4:e4b', isInstalled: true, isAvailable: true, status: 'available' }
  ];
  const catalog = mergeAiModelCatalog(overrides);
  const gemma = catalog.find((m) => m.id === 'gemma4:e4b');
  assert.ok(gemma);
  assert.equal(gemma.isInstalled, true);
  assert.equal(gemma.isAvailable, true);
  assert.equal(gemma.status, 'available');
});

test('mergeAiModelCatalog marks current model', () => {
  const catalog = mergeAiModelCatalog([], 'gemma3:12b');
  const current = catalog.find((m) => m.isCurrent);
  assert.ok(current);
  assert.equal(current.id, 'gemma3:12b');
});

test('mergeAiModelCatalog includes userFacingStatusLabel', () => {
  const catalog = mergeAiModelCatalog();
  for (const item of catalog) {
    assert.ok(typeof item.userFacingStatusLabel === 'string');
    assert.ok(item.userFacingStatusLabel.length > 0);
  }
});

test('mergeAiModelCatalog includes cloudSetupHint for cloud models', () => {
  const catalog = mergeAiModelCatalog();
  const cloudModel = catalog.find((m) => m.channel === 'cloud');
  assert.ok(cloudModel);
  assert.ok(cloudModel.cloudSetupHint);
  assert.equal(cloudModel.cloudSetupHint?.title, '云端接入预留');
});

test('mergeAiModelCatalog does not include cloudSetupHint for local models', () => {
  const catalog = mergeAiModelCatalog();
  const localModel = catalog.find((m) => m.channel === 'local');
  assert.ok(localModel);
  assert.equal(localModel.cloudSetupHint, undefined);
});

test('mergeAiModelCatalog marks gemma4:e4b as primary local choice', () => {
  const catalog = mergeAiModelCatalog();
  const gemma = catalog.find((m) => m.id === 'gemma4:e4b');
  assert.ok(gemma);
  assert.equal(gemma.isPrimaryLocalChoice, true);
});

test('mergeAiModelCatalog supports custom registry input without touching global registry', () => {
  const beforeLength = AI_MODEL_REGISTRY.length;
  const customOnly: AiModelRegistryItem[] = [
    {
      id: 'custom:model',
      label: 'custom:model',
      displayName: 'Custom Model',
      provider: 'ollama' as const,
      providerName: 'Ollama',
      channel: 'local' as const,
      isSupported: true,
      isInstalled: true,
      isConfigured: true,
      isAvailable: true,
      isRecommended: true,
      description: 'custom',
      recommendedTasks: ['rename'],
      status: 'available' as const,
      enabled: true,
      priority: 999
    }
  ];

  const catalog = mergeAiModelCatalog([], 'custom:model', customOnly);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.id, 'custom:model');
  assert.equal(catalog[0]?.isCurrent, true);
  assert.equal(AI_MODEL_REGISTRY.length, beforeLength);
});

// ---------------------------------------------------------------------------
// getAiModelStatusLabel
// ---------------------------------------------------------------------------

test('getAiModelStatusLabel: local available installed', () => {
  const label = getAiModelStatusLabel({
    channel: 'local',
    status: 'available',
    isInstalled: true,
    isConfigured: true,
    isAvailable: true,
  });
  assert.equal(label, '系统支持 · 已安装');
});

test('getAiModelStatusLabel: local installable', () => {
  const label = getAiModelStatusLabel({
    channel: 'local',
    status: 'installable',
    isInstalled: false,
    isConfigured: true,
    isAvailable: false,
  });
  assert.equal(label, '系统支持 · 未安装');
});

test('getAiModelStatusLabel: local not ready', () => {
  const label = getAiModelStatusLabel({
    channel: 'local',
    status: 'unavailable',
    isInstalled: false,
    isConfigured: false,
    isAvailable: false,
  });
  assert.equal(label, '系统支持 · 运行未就绪');
});

test('getAiModelStatusLabel: cloud available configured', () => {
  const label = getAiModelStatusLabel({
    channel: 'cloud',
    status: 'available',
    isInstalled: false,
    isConfigured: true,
    isAvailable: true,
  });
  assert.equal(label, '已配置');
});

test('getAiModelStatusLabel: cloud available mock', () => {
  const label = getAiModelStatusLabel({
    channel: 'cloud',
    status: 'available',
    isInstalled: false,
    isConfigured: false,
    isAvailable: true,
  });
  assert.equal(label, 'mock 占位');
});

test('getAiModelStatusLabel: cloud not configured', () => {
  const label = getAiModelStatusLabel({
    channel: 'cloud',
    status: 'not_configured',
    isInstalled: false,
    isConfigured: false,
    isAvailable: false,
  });
  assert.equal(label, '系统支持 · 未配置');
});

test('getAiModelStatusLabel: cloud fallback', () => {
  const label = getAiModelStatusLabel({
    channel: 'cloud',
    status: 'unavailable',
    isInstalled: false,
    isConfigured: false,
    isAvailable: false,
  });
  assert.equal(label, '系统支持 · 运行未就绪');
});
