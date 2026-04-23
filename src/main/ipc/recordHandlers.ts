import { promises as fs } from 'node:fs';
import { clipboard, ipcMain, nativeImage, shell } from 'electron';
import type {
  RecordMetaBulkResult,
  RecordMetaPatch,
  RecordItem,
  SearchRecordsInput,
  OcrResult,
} from '../../shared/types';
import { AppError } from '../errors';
import type { StorageService } from '../storage';
import { optimizeTextForCopy } from '../copyOptimizer';
import type { IpcDependencies, WrapFn } from '../ipc';
import { createWrapFn } from '../ipc';

// ---------------------------------------------------------------------------
// Record handlers
// ---------------------------------------------------------------------------

function registerRecordHandlers(deps: IpcDependencies, wrap: WrapFn): void {
  wrap<{ limit?: number } | undefined, RecordItem[]>('records.list', async (args) => {
    return deps.storage.listRecords(args?.limit);
  });

  wrap<SearchRecordsInput | undefined, RecordItem[]>('records.search', async (args) => {
    return deps.storage.searchRecords(args ?? {});
  });

  wrap<{ limit?: number } | undefined, RecordItem[]>('records.recent', async (args) => {
    return deps.storage.listRecentRecords(args?.limit);
  });

  wrap<{ recordId: string }, RecordItem>('records.get', async (args) => {
    return deps.storage.getRecord(args.recordId);
  });

  wrap<{ recordId: string }, Awaited<ReturnType<StorageService['getRecordContent']>>>(
    'records.getContent',
    async (args) => {
      return deps.storage.getRecordContent(args.recordId);
    }
  );

  wrap<{ text: string; sourceApp?: string | null; tags?: string[] }, RecordItem>('records.createText', async (args) => {
    const text = args?.text?.trim() ?? '';
    if (!text) {
      throw new AppError('INVALID_ARGUMENT', 'Text record cannot be empty');
    }

    const record = await deps.storage.createTextRecord(text, {
      source: 'clipboard',
      sourceApp: args?.sourceApp?.trim() || 'Manual Input',
      tags: args?.tags
    });
    deps.onRecordsChanged();
    return record;
  });

  wrap<{ recordId: string; optimize?: boolean }, boolean>('records.copy', async (args) => {
    const record = deps.storage.getRecord(args.recordId);
    deps.watcher.ignoreNextCopy();

    if (record.type === 'text') {
      const content = await deps.storage.getRecordContent(record.id);
      if (content.type !== 'text') {
        throw new AppError('INTERNAL_ERROR', 'Record content type mismatch for text copy');
      }
      const nextText = args.optimize ? optimizeTextForCopy(content.text, record.useCase) : content.text;
      clipboard.writeText(nextText);
      await deps.storage.markRecordUsed(record.id);
      deps.onRecordsChanged();
      return true;
    }

    if (record.type === 'video') {
      clipboard.writeText(record.path);
      await deps.storage.markRecordUsed(record.id);
      deps.onRecordsChanged();
      return true;
    }

    try {
      await fs.access(record.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        throw new AppError('FILE_MISSING', 'Record file is missing', record.path);
      }
      throw error;
    }

    const image = nativeImage.createFromPath(record.path);
    if (image.isEmpty()) {
      throw new AppError('IMAGE_DECODE_FAILED', 'Failed to load image for clipboard copy', record.path);
    }

    clipboard.writeImage(image);
    await deps.storage.markRecordUsed(record.id);
    deps.onRecordsChanged();
    return true;
  });

  wrap<{ recordId: string }, RecordItem>('records.touch', async (args) => {
    const updated = await deps.storage.markRecordUsed(args.recordId);
    deps.onRecordsChanged();
    return updated;
  });

  ipcMain.on('records.startDrag', (event, args: { recordId: string }) => {
    try {
      const record = deps.storage.getRecord(args.recordId);
      const imageIcon = nativeImage.createFromPath(record.path);
      const icon = !imageIcon.isEmpty() ? imageIcon.resize({ width: 96, height: 96 }) : createFallbackDragIcon(record.type);

      event.sender.startDrag({
        file: record.path,
        icon
      });
    } catch (error) {
      console.error('[ipc:records.startDrag] failed', error);
      // Keep drag failure non-blocking for the rest of the UI.
    }
  });

  wrap<{ recordId: string }, boolean>('records.delete', async (args) => {
    await deps.storage.deleteRecord(args.recordId);
    deps.pinManager.closePin(args.recordId);
    deps.onRecordsChanged();
    return true;
  });

  wrap<{ recordId: string; displayName: string }, RecordItem>('records.rename', async (args) => {
    const updated = await deps.storage.renameRecord(args.recordId, args.displayName);
    deps.onRecordsChanged();
    return updated;
  });

  wrap<{ recordId: string; text: string }, RecordItem>('records.updateText', async (args) => {
    const updated = await deps.storage.updateTextRecord(args.recordId, args.text);
    deps.onRecordsChanged();
    return updated;
  });

  wrap<{ recordId: string; patch: RecordMetaPatch }, RecordItem>('records.meta.update', async (args) => {
    const updated = await deps.storage.updateRecordMeta(args.recordId, args.patch);
    deps.onRecordsChanged();
    return updated;
  });

  wrap<{ recordIds: string[]; patch: RecordMetaPatch }, RecordMetaBulkResult>(
    'records.meta.bulkUpdate',
    async (args) => {
      const result = await deps.storage.bulkUpdateRecordMeta(args.recordIds, args.patch);
      deps.onRecordsChanged();
      return result;
    }
  );

  wrap<{ recordIds: string[] }, { deleted: string[]; failed: Array<{ id: string; error: string }> }>(
    'records.bulkDelete',
    async (args) => {
      const deleted: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];

      for (const recordId of args.recordIds) {
        try {
          await deps.storage.deleteRecord(recordId);
          deps.pinManager.closePin(recordId);
          deleted.push(recordId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          failed.push({ id: recordId, error: message });
          console.error(`[records.bulkDelete] failed: ${recordId}`, error);
        }
      }

      deps.onRecordsChanged();
      return { deleted, failed };
    }
  );

  wrap<{ recordId: string }, boolean>('records.open', async (args) => {
    const record = deps.storage.getRecord(args.recordId);
    try {
      await fs.access(record.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        throw new AppError('FILE_MISSING', 'Record file is missing', record.path);
      }
      throw error;
    }
    const result = await shell.openPath(record.path);
    if (result) {
      throw new AppError('INTERNAL_ERROR', 'Failed to open record with default application', result);
    }
    return true;
  });

  wrap<{ recordIds: string[] }, RecordItem>('records.flow.create', async (args) => {
    const created = await deps.storage.createFlowRecord(args.recordIds);
    deps.onRecordsChanged();
    return created;
  });

  wrap<{ recordId: string }, OcrResult>('ocr.fromRecord', async (args) => {
    const record = deps.storage.getRecord(args.recordId);
    if (record.type !== 'image') {
      throw new AppError('INVALID_ARGUMENT', 'OCR only supports image record');
    }

    const text = await deps.ocrService.recognizeImage(record.path);
    await deps.storage.updateRecordOcrText(record.id, text);
    deps.onRecordsChanged();
    return {
      recordId: record.id,
      text
    };
  });

  // Debug / local model record handlers
  wrap<{ recordId: string }, RecordItem>('localModel.debug.rename', async (args) => {
    const updated = await deps.storage.debugRenameNoteWithLocalModel(args.recordId);
    deps.onRecordsChanged();
    return updated;
  });

  wrap<{ leftRecordId: string; rightRecordId: string }, RecordItem>('localModel.debug.dedupePair', async (args) => {
    const updated = await deps.storage.debugDedupePairWithLocalModel(args.leftRecordId, args.rightRecordId);
    deps.onRecordsChanged();
    return updated;
  });

  wrap<{ recordId: string }, RecordItem>('localModel.debug.summary', async (args) => {
    const updated = await deps.storage.debugSummarizeForKnowledgeBase(args.recordId);
    deps.onRecordsChanged();
    return updated;
  });

  wrap<{ recordId: string }, RecordItem>('localModel.debug.image', async (args) => {
    const updated = await deps.storage.debugUnderstandImageBasic(args.recordId);
    deps.onRecordsChanged();
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Creates a lightweight drag icon for text, image, or video content. */
function createFallbackDragIcon(kind: 'text' | 'image' | 'video') {
  const label = kind === 'image' ? 'IMG' : kind === 'video' ? 'VID' : 'TXT';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect x="4" y="4" width="88" height="88" rx="20" fill="rgba(20,20,24,0.75)"/><text x="48" y="54" text-anchor="middle" fill="#e2e8f0" font-size="24" font-family="Arial,Helvetica,sans-serif">${label}</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
}

export { registerRecordHandlers };
