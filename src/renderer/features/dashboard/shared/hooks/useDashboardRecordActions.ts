import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { RecordMetaPatch } from '../../../../../shared/types';
import { buildFavoriteTags } from '../favoriteTag';

export function useDashboardRecordActions(setSelectedIds: Dispatch<SetStateAction<string[]>>) {
  const onCreateFavoriteTextRecord = useCallback(
    async (input: { title?: string; text: string; sourceApp?: string | null }) => {
      const text = input.text.trim();
      if (!text) {
        throw new Error('请输入正文内容');
      }
      const created = await window.pinStack.records.createText({
        text,
        sourceApp: input.sourceApp?.trim() || 'Manual Input',
        tags: ['favorite']
      });
      const title = input.title?.trim();
      if (!title) {
        return created;
      }
      const renamed = await window.pinStack.records.rename(created.id, title);
      setSelectedIds([renamed.id]);
      return renamed;
    },
    [setSelectedIds]
  );

  const onTouchRecord = useCallback(async (recordId: string) => {
    await window.pinStack.records.touch(recordId);
  }, []);

  const onCopyRecord = useCallback(async (recordId: string, mode: 'normal' | 'optimized' = 'normal') => {
    await window.pinStack.records.copy(recordId, {
      optimize: mode === 'optimized'
    });
  }, []);

  const onDeleteRecord = useCallback(async (recordId: string) => {
    await window.pinStack.records.delete(recordId);
    setSelectedIds((prev) => prev.filter((id) => id !== recordId));
  }, [setSelectedIds]);

  const onRepinRecord = useCallback(async (recordId: string) => {
    await window.pinStack.pin.createFromRecord(recordId);
  }, []);

  const onOcrRecord = useCallback(async (recordId: string) => {
    await window.pinStack.ocr.fromRecord(recordId);
  }, []);

  const onOpenRecord = useCallback(async (recordId: string) => {
    await window.pinStack.records.open(recordId);
  }, []);

  const onRenameRecord = useCallback(async (recordId: string, displayName: string) => {
    await window.pinStack.records.rename(recordId, displayName);
  }, []);

  const onUpdateRecordText = useCallback(async (recordId: string, text: string) => {
    await window.pinStack.records.updateText(recordId, text);
  }, []);

  const onUpdateRecordMeta = useCallback(async (recordId: string, patch: RecordMetaPatch) => {
    await window.pinStack.records.meta.update(recordId, patch);
  }, []);

  const onToggleFavoriteRecord = useCallback(async (recordId: string, favorite: boolean) => {
    const record = await window.pinStack.records.get(recordId);
    await window.pinStack.records.meta.update(recordId, {
      tags: buildFavoriteTags(record.tags, favorite)
    });
  }, []);

  const onSendToVaultKeeper = useCallback(async (recordId: string) => {
    return window.pinStack.vk.task.create({
      type: 'extract',
      sourceType: 'record',
      sourceRecordId: recordId,
      options: {
        outputMode: 'draft',
      },
    });
  }, []);

  return {
    onCreateFavoriteTextRecord,
    onTouchRecord,
    onCopyRecord,
    onDeleteRecord,
    onRepinRecord,
    onOcrRecord,
    onOpenRecord,
    onRenameRecord,
    onUpdateRecordText,
    onUpdateRecordMeta,
    onToggleFavoriteRecord,
    onSendToVaultKeeper
  };
}
