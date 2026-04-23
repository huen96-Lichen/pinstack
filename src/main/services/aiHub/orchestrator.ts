/**
 * AI Orchestrator — task routing and execution.
 *
 * Extracted from index.ts initIpc() to reduce main-process entry size.
 */
import type {
  AiOrchestratorTaskInput,
  AiOrchestratorTaskResult,
} from '../../../shared/types';
import { planAiTaskRoute, resolveTaskOutputTarget, taskRequiresRecord } from './taskRouter';
import { logTelemetry } from '../../telemetry';
import type { AppContext } from '../../appContext';

export interface OrchestratorDeps {
  ctx: AppContext;
  notifyRecordsChanged: () => void;
}

export function createAiOrchestratorTask(deps: OrchestratorDeps) {
  const { ctx, notifyRecordsChanged } = deps;

  return async (input: AiOrchestratorTaskInput): Promise<AiOrchestratorTaskResult> => {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const recordId = input.recordId?.trim() || '';
    const needsRecord = taskRequiresRecord(input.taskType);
    if (needsRecord && !recordId) {
      const route = planAiTaskRoute(
        input,
        ctx.settings,
        {
          enabled: ctx.settings.aiHub.enabled,
          configuredProvider: ctx.settings.aiHub.defaultProvider,
          effectiveProvider: ctx.settings.aiHub.defaultProvider,
          configuredModel: ctx.settings.aiHub.defaultModelId || 'unknown',
          effectiveModel: ctx.settings.aiHub.defaultModelId || 'unknown',
          selectedModelLabel: ctx.settings.aiHub.defaultModelId || 'unknown',
          connectionState: 'unavailable',
          responseMode: 'unavailable',
          message: 'AI runtime not resolved',
          reachable: false
        }
      );
      return {
        taskId,
        taskType: input.taskType,
        status: 'warning',
        message: '请先选择一条记录后再执行该任务。',
        route,
        recordId: 'n/a',
        outputTarget: resolveTaskOutputTarget(input.taskType),
        updatedFields: [],
        nextAction: 'select_record',
        errorCode: 'RECORD_REQUIRED',
        latencyMs: Date.now() - startedAt,
        finishedAt: Date.now()
      };
    }

    const record = recordId ? ctx.storage.getRecord(recordId) : null;
    const runtime = await ctx.aiHubService.getRuntimeStatus();
    const route = planAiTaskRoute(input, ctx.settings, runtime);
    const strategy = route.strategy;
    logTelemetry('ai.route.selected', {
      taskId,
      taskType: input.taskType,
      provider: route.provider,
      model: route.model,
      strategy,
      timeoutMs: route.timeoutMs ?? null,
      retryLimit: route.retryLimit ?? null
    });
    logTelemetry('ai.task.started', {
      taskId,
      taskType: input.taskType,
      provider: route.provider,
      model: route.model,
      timeoutMs: route.timeoutMs ?? null,
      retryLimit: route.retryLimit ?? null,
      strategy
    });
    const base = {
      taskId,
      taskType: input.taskType,
      route,
      recordId: recordId || 'n/a',
      finishedAt: Date.now(),
      latencyMs: 0
    } as const;

    try {
      if (input.taskType === 'organize_current') {
        const currentRecord = ctx.storage.getRecord(recordId);
        await ctx.storage.debugRenameNoteWithLocalModel(recordId);
        const fields = ['displayName'];
        if (currentRecord.type === 'text') {
          await ctx.storage.debugSummarizeForKnowledgeBase(recordId);
          fields.push('summary');
        }
        const latest = ctx.storage.getRecord(recordId);
        const mergedTags = [...new Set([...(latest.tags ?? []), 'ai-reviewed'])];
        await ctx.storage.updateRecordMeta(recordId, { tags: mergedTags });
        fields.push('tags');
        notifyRecordsChanged();
        return {
          ...base,
          status: 'success',
          message: '已完成标题、摘要与标签整理并写回当前记录。',
          outputTarget: resolveTaskOutputTarget(input.taskType),
          updatedFields: fields,
          latencyMs: Date.now() - startedAt,
          finishedAt: Date.now()
        };
      }

      if (input.taskType === 'generate_summary') {
        if (record?.type !== 'text') {
          return {
            ...base,
            status: 'warning',
            message: '当前记录不是文本，暂不支持摘要生成。',
            outputTarget: resolveTaskOutputTarget(input.taskType),
            updatedFields: [],
            nextAction: 'select_record',
            latencyMs: Date.now() - startedAt,
            finishedAt: Date.now()
          };
        }
        await ctx.storage.debugSummarizeForKnowledgeBase(recordId);
        notifyRecordsChanged();
        return {
          ...base,
          status: 'success',
          message: '已生成摘要并写回记录。',
          outputTarget: resolveTaskOutputTarget(input.taskType),
          updatedFields: ['summary'],
          latencyMs: Date.now() - startedAt,
          finishedAt: Date.now()
        };
      }

      if (input.taskType === 'enrich_metadata') {
        const latest = ctx.storage.getRecord(recordId);
        const mergedTags = [...new Set([...(latest.tags ?? []), 'ai-reviewed'])];
        await ctx.storage.updateRecordMeta(recordId, { tags: mergedTags });
        notifyRecordsChanged();
        return {
          ...base,
          status: 'success',
          message: '已补齐标签与元数据标记。',
          outputTarget: resolveTaskOutputTarget(input.taskType),
          updatedFields: ['tags'],
          latencyMs: Date.now() - startedAt,
          finishedAt: Date.now()
        };
      }

      if (input.taskType === 'format_markdown') {
        return {
          ...base,
          status: 'success',
          message: '已准备 Markdown 整理链路，可进入 VaultKeeper 继续处理。',
          outputTarget: resolveTaskOutputTarget(input.taskType),
          updatedFields: [],
          actionHint: 'navigate_vaultkeeper',
          nextAction: 'open_settings',
          latencyMs: Date.now() - startedAt,
          finishedAt: Date.now()
        };
      }

      if (input.taskType === 'write_formal_doc') {
        return {
          ...base,
          status: 'success',
          message: '已准备正式写作链路，可进入 AI 对话继续生成文稿。',
          outputTarget: resolveTaskOutputTarget(input.taskType),
          updatedFields: [],
          actionHint: 'open_ai_chat',
          nextAction: 'open_ai_chat',
          latencyMs: Date.now() - startedAt,
          finishedAt: Date.now()
        };
      }

      if (input.taskType === 'open_vaultkeeper') {
        return {
          ...base,
          status: 'success',
          message: '已准备 VaultKeeper 处理链路。',
          outputTarget: resolveTaskOutputTarget(input.taskType),
          updatedFields: [],
          actionHint: 'navigate_vaultkeeper',
          nextAction: 'open_settings',
          latencyMs: Date.now() - startedAt,
          finishedAt: Date.now()
        };
      }

      return {
        ...base,
        status: 'error',
        message: `不支持的任务类型：${input.taskType}`,
        outputTarget: '当前记录',
        updatedFields: [],
        errorCode: 'UNSUPPORTED_TASK',
        latencyMs: Date.now() - startedAt,
        finishedAt: Date.now()
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务执行失败';
      logTelemetry('ai.task.failed', {
        taskId,
        taskType: input.taskType,
        provider: runtime.effectiveProvider,
        model: runtime.effectiveModel || runtime.configuredModel,
        strategy,
        error: message
      }, 'warn');
      return {
        ...base,
        status: 'error',
        message,
        outputTarget: '当前记录',
        updatedFields: [],
        errorCode: 'TASK_EXECUTION_FAILED',
        latencyMs: Date.now() - startedAt,
        finishedAt: Date.now()
      };
    } finally {
      const duration = Date.now() - startedAt;
      logTelemetry('ai.latency.bucket', {
        taskId,
        taskType: input.taskType,
        latencyBucket: duration < 500 ? '<500ms' : duration < 1500 ? '500ms-1.5s' : duration < 5000 ? '1.5s-5s' : duration < 15000 ? '5s-15s' : '>=15s'
      });
    }
  };
}
