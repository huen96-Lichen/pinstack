// VaultKeeper IPC handlers
// Extracted from ipc.ts

import type {
  VkRuntimeStatus,
  VkCreateJobRequest,
  VkExportRequest,
  VkExportBatchRequest,
  VkExportResult,
  VkToolsInfo,
  VkBatchImportRequest,
  VkBatchImportPreviewRequest,
  VkSmartClipRequest,
  VkSuggestRequest,
  VkQualityRequest,
  VkRetryRequest,
  VkClipHtmlRequest,
  VkSendRecordRequest,
  VkApiResponse,
  VkJob,
} from '../../shared/vaultkeeper';
import type {
  VKRuntimeStatus as VKRuntimeStatusV1,
  VKTask,
  VKTaskCreateInput,
  VKTaskListResponse,
} from '../../shared/vk/types';
import type { WikiQueryInput, WikiQueryResult, WikiLintResult, WikiStatus } from '../../shared/vk/wikiTypes';
import type { IpcDependencies, WrapFn } from '../ipc';

function registerVaultKeeperHandlers(deps: IpcDependencies, wrap: WrapFn): void {
  // v1 unified task bridge
  wrap<undefined, VKRuntimeStatusV1>('vk.runtime.getStatus', async () => {
    return deps.vkRuntimeGetStatus();
  });

  wrap<VKTaskCreateInput, VKTask>('vk.task.create', async (args) => {
    return deps.vkTaskCreate(args);
  });

  wrap<undefined, VKTaskListResponse>('vk.task.list', async () => {
    return deps.vkTaskList();
  });

  wrap<{ id: string }, VKTask | null>('vk.task.get', async (args) => {
    return deps.vkTaskGet(args.id);
  });

  wrap<{ id: string }, VKTask>('vk.task.retry', async (args) => {
    return deps.vkTaskRetry(args.id);
  });

  wrap<{ id: string }, VKTask>('vk.task.cancel', async (args) => {
    return deps.vkTaskCancel(args.id);
  });

  wrap<{ id: string }, boolean>('vk.task.openOutput', async (args) => {
    return deps.vkTaskOpenOutput(args.id);
  });

  wrap<{ id: string }, boolean>('vk.task.openLog', async (args) => {
    return deps.vkTaskOpenLog(args.id);
  });

  // WikiAgent (knowledge base) channels
  wrap<undefined, WikiStatus>('wiki.getStatus', async () => {
    return deps.wikiGetStatus();
  });

  wrap<WikiQueryInput, WikiQueryResult>('wiki.query', async (args) => {
    return deps.wikiQuery(args);
  });

  wrap<undefined, WikiLintResult>('wiki.lint', async () => {
    return deps.wikiLint();
  });

  wrap<undefined, boolean>('wiki.openDir', async () => {
    return deps.wikiOpenDir();
  });

  wrap<undefined, boolean>('wiki.openIndex', async () => {
    return deps.wikiOpenIndex();
  });

  // legacy API (kept for compatibility)
  wrap<undefined, VkRuntimeStatus>('vk.status', async () => {
    return deps.getVaultKeeperStatus();
  });

  wrap<undefined, VkRuntimeStatus>('vk.start', async () => {
    return deps.startVaultKeeper();
  });

  wrap<undefined, VkRuntimeStatus>('vk.stop', async () => {
    return deps.stopVaultKeeper();
  });

  wrap<VkCreateJobRequest, VkApiResponse<VkJob>>('vk.job.create', async (args) => {
    return deps.vkCreateJob(args);
  });

  wrap<{ jobId: string }, VkApiResponse<VkJob>>('vk.job.get', async (args) => {
    return deps.vkGetJob(args.jobId);
  });

  wrap<VkExportRequest, VkApiResponse<VkExportResult>>('vk.export', async (args) => {
    return deps.vkExportFile(args);
  });

  wrap<VkExportBatchRequest, VkApiResponse<{total: number; succeeded: number; failed: number; results: VkExportResult[]}>>('vk.export.batch', async (args) => {
    return deps.vkExportBatch(args);
  });

  wrap<undefined, VkApiResponse<VkToolsInfo>>('vk.tools', async () => {
    return deps.vkGetTools();
  });

  wrap<VkBatchImportRequest, VkApiResponse<unknown>>('vk.batchImport', async (args) => {
    return deps.vkBatchImport(args);
  });

  wrap<VkBatchImportPreviewRequest, VkApiResponse<unknown>>('vk.batchImport.preview', async (args) => {
    return deps.vkBatchImportPreview(args);
  });

  wrap<VkSmartClipRequest, VkApiResponse<unknown>>('vk.smartClip', async (args) => {
    return deps.vkSmartClip(args);
  });

  wrap<VkClipHtmlRequest, VkApiResponse<unknown>>('vk.clipHtml', async (args) => {
    return deps.vkClipHtml(args);
  });

  wrap<VkSuggestRequest, VkApiResponse<unknown>>('vk.suggest', async (args) => {
    return deps.vkSuggest(args);
  });

  wrap<VkQualityRequest, VkApiResponse<unknown>>('vk.quality', async (args) => {
    return deps.vkQualityCheck(args);
  });

  wrap<{ jobId: string; params?: VkRetryRequest }, VkApiResponse<unknown>>('vk.retry', async (args) => {
    return deps.vkRetryJob(args.jobId, args.params);
  });

  wrap<VkSendRecordRequest, VkApiResponse<VkJob>>('vk.record.send', async (args) => {
    return deps.vkSendRecord(args);
  });
}

export { registerVaultKeeperHandlers };
