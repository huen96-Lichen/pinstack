/**
 * VK IPC Adapters — bridges between IPC layer and VK services.
 *
 * Extracted from index.ts initIpc() to reduce main-process entry size.
 */
import type { AppContext } from '../appContext';
import type { VKTaskCreateInput, VKTask } from '../../shared/vk/types';
import type {
  VkCreateJobRequest,
  VkSendRecordRequest,
  VkApiResponse,
  VkJob,
} from '../../shared/vaultkeeper';
import { AppError } from '../errors';

/**
 * Resolves a VKTaskCreateInput that references a PinStack record into
 * the appropriate source type (url / file / video) with content attached.
 */
export async function resolveVkTaskFromRecord(
  ctx: AppContext,
  input: VKTaskCreateInput,
): Promise<VKTask> {
  if (input.sourceType === 'record' && input.sourceRecordId) {
    const record = ctx.storage.getRecord(input.sourceRecordId);
    if (record.originalUrl) {
      return ctx.vkBridge.createTask({
        ...input,
        sourceType: 'url',
        sourceUrl: record.originalUrl,
        sourcePath: undefined,
      });
    }
    if ((record.type === 'image' || record.type === 'video') && record.path) {
      return ctx.vkBridge.createTask({
        ...input,
        sourceType: record.type === 'video' ? 'video' : 'file',
        sourcePath: record.path,
        sourceUrl: undefined,
      });
    }
    if (record.type === 'text') {
      const content = await ctx.storage.getRecordContent(record.id);
      const rawText = content.type === 'text' ? content.text : '';
      return ctx.vkBridge.createTask({
        ...input,
        sourceType: 'file',
        options: {
          ...(input.options ?? {}),
          rawText,
          sourceRecordId: record.id,
        },
      });
    }
  }
  return ctx.vkBridge.createTask(input);
}

/**
 * Sends a PinStack record to VaultKeeper for processing.
 * Resolves record content (URL / file path / text→HTML) into a VkCreateJobRequest.
 */
export async function sendRecordToVaultKeeper(
  ctx: AppContext,
  request: VkSendRecordRequest,
): Promise<VkApiResponse<VkJob>> {
  const record = ctx.storage.getRecord(request.recordId);
  if (!record) throw new AppError('RECORD_NOT_FOUND', `Record ${request.recordId} not found`);

  let params: VkCreateJobRequest = { ...request.options };

  if (record.originalUrl) {
    params.url = record.originalUrl;
  } else if (record.type === 'image' || record.type === 'video') {
    if (record.path) params.filePath = record.path;
  } else if (record.type === 'text') {
    const content = await ctx.storage.getRecordContent(record.id);
    if (content?.type === 'text' && content.text) {
      params.html = `<p>${content.text.replace(/\n/g, '</p>\n<p>')}</p>`;
    }
  }

  return ctx.vkProcessManager.getClient().createJob(params);
}
