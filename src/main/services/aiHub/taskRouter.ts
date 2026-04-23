import type { AiOrchestratorTaskInput, AiOrchestratorTaskRoute, AiOrchestratorStrategy, AiOrchestratorTaskType, AiRuntimeStatus, AppSettings } from '../../../shared/types';

type TaskRouteProfile = {
  outputTarget: string;
  timeoutMs: number;
  retryLimit: number;
  requiresRecord: boolean;
};

const TASK_ROUTE_PROFILES: Record<AiOrchestratorTaskType, TaskRouteProfile> = {
  organize_current: {
    outputTarget: '当前卡片',
    timeoutMs: 45_000,
    retryLimit: 1,
    requiresRecord: true
  },
  generate_summary: {
    outputTarget: '摘要字段',
    timeoutMs: 45_000,
    retryLimit: 1,
    requiresRecord: true
  },
  enrich_metadata: {
    outputTarget: 'tags / frontmatter',
    timeoutMs: 30_000,
    retryLimit: 1,
    requiresRecord: true
  },
  format_markdown: {
    outputTarget: '资料库 Markdown',
    timeoutMs: 60_000,
    retryLimit: 2,
    requiresRecord: false
  },
  write_formal_doc: {
    outputTarget: '卡片或项目文档',
    timeoutMs: 60_000,
    retryLimit: 2,
    requiresRecord: false
  },
  open_vaultkeeper: {
    outputTarget: 'VaultKeeper 流程',
    timeoutMs: 15_000,
    retryLimit: 0,
    requiresRecord: false
  }
};

export function deriveAiOrchestratorStrategy(settings: AppSettings): AiOrchestratorStrategy {
  if (settings.aiHub.defaultProvider === 'cloud') {
    return 'high_quality';
  }
  return settings.aiHub.allowFallback ? 'balanced' : 'local_first';
}

export function taskRequiresRecord(taskType: AiOrchestratorTaskType): boolean {
  return TASK_ROUTE_PROFILES[taskType].requiresRecord;
}

export function resolveTaskOutputTarget(taskType: AiOrchestratorTaskType): string {
  return TASK_ROUTE_PROFILES[taskType].outputTarget;
}

export function planAiTaskRoute(input: AiOrchestratorTaskInput, settings: AppSettings, runtime: AiRuntimeStatus): AiOrchestratorTaskRoute {
  const strategy = deriveAiOrchestratorStrategy(settings);
  const profile = TASK_ROUTE_PROFILES[input.taskType];
  return {
    provider: runtime.effectiveProvider,
    model: runtime.effectiveModel || runtime.configuredModel,
    strategy,
    timeoutMs: profile.timeoutMs,
    retryLimit: profile.retryLimit,
    outputTarget: profile.outputTarget
  };
}
