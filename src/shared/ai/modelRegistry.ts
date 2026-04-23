export type AiModelProvider = 'ollama' | 'cloud';
export type AiModelChannel = 'local' | 'cloud';
export type AiModelStatus = 'available' | 'installable' | 'not_configured' | 'unavailable';

export type AiModelCapability =
  | 'rename'
  | 'classify'
  | 'summary'
  | 'dedupe_suggestion'
  | 'image_understanding'
  | 'organize_materials';

export type AiModelRegistryItem = {
  id: string;
  label: string;
  displayName: string;
  provider: AiModelProvider;
  providerName: string;
  channel: AiModelChannel;
  isSupported: boolean;
  isInstalled: boolean;
  isConfigured: boolean;
  isAvailable: boolean;
  isRecommended: boolean;
  isMockOnly?: boolean;
  recommendedRole?: string;
  description: string;
  recommendedDevices?: string[];
  installUrl?: string;
  recommendedTasks: AiModelCapability[];
  status: AiModelStatus;
  enabled: boolean;
  priority: number;
};

export type AiModelCatalogOverride = {
  id: string;
  isInstalled?: boolean;
  isConfigured?: boolean;
  isAvailable?: boolean;
  status?: AiModelStatus;
  note?: string;
  checkedAt?: number;
};

export type AiModelCatalogItem = AiModelRegistryItem & {
  isCurrent: boolean;
  note?: string;
  checkedAt?: number;
  userFacingStatusLabel: string;
  userFacingRoleLabel: string;
  isPrimaryLocalChoice: boolean;
  userFacingDeviceLabel?: string;
  installUrl?: string;
  cloudSetupHint?: {
    title: string;
    description: string;
    requiredFields: string[];
  };
};

/** Static registry for controlled model selection. */
export const AI_MODEL_REGISTRY: AiModelRegistryItem[] = [
  {
    id: 'gemma4:e4b',
    label: 'gemma4:e4b',
    displayName: 'Gemma 4 E4B',
    provider: 'ollama',
    providerName: 'Ollama',
    channel: 'local',
    isSupported: true,
    isInstalled: true,
    isConfigured: true,
    isAvailable: true,
    isRecommended: true,
    recommendedRole: '默认本地模型',
    description: '本地通用模型',
    recommendedTasks: ['rename', 'classify', 'summary', 'dedupe_suggestion', 'image_understanding', 'organize_materials'],
    status: 'available',
    enabled: true,
    priority: 100
  },
  {
    id: 'gemma3:12b',
    label: 'gemma3:12b',
    displayName: 'Gemma 3 12B',
    provider: 'ollama',
    providerName: 'Ollama',
    channel: 'local',
    isSupported: true,
    isInstalled: true,
    isConfigured: true,
    isAvailable: true,
    isRecommended: false,
    recommendedRole: '高质量本地推理',
    description: '本地高质量模型',
    recommendedTasks: ['rename', 'classify', 'summary', 'dedupe_suggestion', 'image_understanding', 'organize_materials'],
    status: 'available',
    enabled: true,
    priority: 90
  },
  {
    id: 'qwen2.5:14b',
    label: 'qwen2.5:14b',
    displayName: 'Qwen 2.5 14B',
    provider: 'ollama',
    providerName: 'Ollama',
    channel: 'local',
    isSupported: true,
    isInstalled: true,
    isConfigured: true,
    isAvailable: true,
    isRecommended: false,
    recommendedRole: '中文理解增强',
    description: '本地中文场景模型',
    recommendedTasks: ['rename', 'classify', 'summary', 'dedupe_suggestion', 'image_understanding', 'organize_materials'],
    status: 'available',
    enabled: true,
    priority: 80
  },
  {
    id: 'cloud:mock',
    label: 'cloud:mock',
    displayName: 'Cloud Mock',
    provider: 'cloud',
    providerName: 'Cloud',
    channel: 'cloud',
    isSupported: true,
    isInstalled: false,
    isConfigured: false,
    isAvailable: true,
    isRecommended: false,
    isMockOnly: true,
    recommendedRole: '云端能力占位',
    description: '云端接入占位模型',
    recommendedTasks: ['summary', 'organize_materials'],
    status: 'available',
    enabled: true,
    priority: 10
  }
];

/* ------------------------------------------------------------------ */
/*  Dynamic registry builder                                           */
/* ------------------------------------------------------------------ */

export function buildDynamicRegistry(
  modelNames: string[],
  currentModelId?: string
): AiModelRegistryItem[] {
  return modelNames.map((name, index) => ({
    id: name,
    label: name,
    displayName: name,
    provider: 'ollama' as const,
    providerName: 'Ollama',
    channel: 'local' as const,
    isSupported: true,
    isInstalled: true,
    isConfigured: true,
    isAvailable: true,
    isRecommended: index === 0,
    description: `本地 Ollama 模型`,
    recommendedTasks: ['rename', 'classify', 'summary', 'dedupe_suggestion', 'image_understanding', 'organize_materials'] as AiModelCapability[],
    status: 'available' as const,
    enabled: true,
    priority: 100 - index
  }));
}

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

function compareAiModels(
  left: Pick<AiModelRegistryItem, 'id' | 'isRecommended' | 'isAvailable' | 'priority' | 'displayName'>,
  right: Pick<AiModelRegistryItem, 'id' | 'isRecommended' | 'isAvailable' | 'priority' | 'displayName'>,
  currentModelId?: string
): number {
  const leftCurrent = left.id === currentModelId ? 1 : 0;
  const rightCurrent = right.id === currentModelId ? 1 : 0;
  if (leftCurrent !== rightCurrent) {
    return rightCurrent - leftCurrent;
  }
  if (left.isRecommended !== right.isRecommended) {
    return Number(right.isRecommended) - Number(left.isRecommended);
  }
  if (left.isAvailable !== right.isAvailable) {
    return Number(right.isAvailable) - Number(left.isAvailable);
  }
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
}

export function getEnabledAiModels(currentModelId?: string): AiModelRegistryItem[] {
  return AI_MODEL_REGISTRY
    .filter((item) => item.enabled)
    .sort((left, right) => compareAiModels(left, right, currentModelId));
}

export function getEnabledAiModelsFromRegistry(registry: AiModelRegistryItem[], currentModelId?: string): AiModelRegistryItem[] {
  return registry
    .filter((item) => item.enabled)
    .sort((left, right) => compareAiModels(left, right, currentModelId));
}

export function getAiModelById(modelId: string): AiModelRegistryItem | undefined {
  return AI_MODEL_REGISTRY.find((item) => item.id === modelId && item.enabled);
}

export function isRegisteredAiModel(modelId: string): boolean {
  return AI_MODEL_REGISTRY.some((item) => item.id === modelId && item.enabled);
}

export function isLocalOllamaModel(modelId: string): boolean {
  const model = getAiModelById(modelId);
  return Boolean(model && model.channel === 'local' && model.provider === 'ollama');
}

export function mergeAiModelCatalog(
  overrides: AiModelCatalogOverride[] = [],
  currentModelId?: string,
  registry: AiModelRegistryItem[] = AI_MODEL_REGISTRY
): AiModelCatalogItem[] {
  const overrideMap = new Map(overrides.map((item) => [item.id, item]));

  return getEnabledAiModelsFromRegistry(registry, currentModelId).map((item) => {
    const override = overrideMap.get(item.id);
    const merged = {
      ...item,
      isInstalled: override?.isInstalled ?? item.isInstalled,
      isConfigured: override?.isConfigured ?? item.isConfigured,
      isAvailable: override?.isAvailable ?? item.isAvailable,
      status: override?.status ?? item.status,
      note: override?.note,
      checkedAt: override?.checkedAt,
      isCurrent: item.id === currentModelId
    };
    const userFacingStatusLabel = getAiModelStatusLabel(merged);
    return {
      ...merged,
      userFacingStatusLabel,
      userFacingRoleLabel: item.recommendedRole ?? item.description,
      isPrimaryLocalChoice: item.channel === 'local' && item.id === (currentModelId || 'gemma4:e4b'),
      userFacingDeviceLabel: item.recommendedDevices?.join(' / '),
      installUrl: item.installUrl,
      cloudSetupHint:
        item.channel === 'cloud'
          ? {
              title: '云端接入预留',
              description: '填写 provider、API Key、Base URL 与模型 ID 后启用云端能力。',
              requiredFields: ['provider', 'apiKey', 'baseUrl', 'modelId']
            }
          : undefined
    };
  });
}

export function getAiModelTaskLabels(tasks: AiModelCapability[]): string[] {
  const labels: Record<AiModelCapability, string> = {
    rename: '自动重命名',
    classify: '一级分类',
    summary: '摘要',
    dedupe_suggestion: '去重建议',
    image_understanding: '图片基础理解',
    organize_materials: '素材整理'
  };

  return tasks.map((task) => labels[task]);
}

export function getAiModelStatusLabel(model: Pick<AiModelCatalogItem, 'channel' | 'status' | 'isInstalled' | 'isConfigured' | 'isAvailable'>): string {
  if (model.channel === 'local') {
    if (model.isInstalled && model.isAvailable) {
      return '系统支持 · 已安装';
    }
    if (model.status === 'installable') {
      return '系统支持 · 未安装';
    }
    return '系统支持 · 运行未就绪';
  }

  if (model.isConfigured) {
    return '已配置';
  }
  if (model.status === 'available' && model.isAvailable) {
    return 'mock 占位';
  }
  if (model.status === 'not_configured') {
    return '系统支持 · 未配置';
  }
  return '系统支持 · 运行未就绪';
}
