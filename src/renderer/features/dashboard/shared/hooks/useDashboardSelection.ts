import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { RecordItem, RecordUseCase } from '../../../../../shared/types';

export type DashboardSelectionState = {
  selectedIds: string[];
  bulkBusy: 'delete' | 'pin' | 'meta' | 'flow' | null;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  onSelectRecord: (recordId: string, additive: boolean) => void;
  onClearSelection: () => void;
  onBulkCreateFlow: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onBulkPin: () => Promise<void>;
  onBulkSetUseCase: (useCase: RecordUseCase) => Promise<void>;
  onBulkAddTags: (tags: string[]) => Promise<void>;
  onBulkRemoveTags: (tags: string[]) => Promise<void>;
};

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function useDashboardSelection(records: RecordItem[]): DashboardSelectionState {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<'delete' | 'pin' | 'meta' | 'flow' | null>(null);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => records.some((item) => item.id === id)));
  }, [records]);

  const onSelectRecord = useCallback((recordId: string, additive: boolean) => {
    setSelectedIds((prev) => {
      if (!additive) {
        return [recordId];
      }

      if (prev.includes(recordId)) {
        return prev.filter((id) => id !== recordId);
      }

      return [...prev, recordId];
    });
  }, []);

  const onClearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const onBulkCreateFlow = useCallback(async () => {
    if (selectedIds.length < 2) {
      return;
    }

    setBulkBusy('flow');
    try {
      const created = await window.pinStack.records.flow.create(selectedIds);
      setSelectedIds([created.id]);
    } finally {
      setBulkBusy(null);
    }
  }, [selectedIds]);

  const onBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) {
      return;
    }

    setBulkBusy('delete');
    try {
      const result = await window.pinStack.records.bulkDelete(selectedIds);
      if (result.failed.length > 0) {
        window.alert(`批量删除完成，失败 ${result.failed.length} 条。`);
      }
      setSelectedIds([]);
    } finally {
      setBulkBusy(null);
    }
  }, [selectedIds]);

  const onBulkPin = useCallback(async () => {
    if (selectedIds.length === 0) {
      return;
    }

    setBulkBusy('pin');
    try {
      const result = await window.pinStack.pin.bulkCreateFromRecords(selectedIds);
      if (result.failed.length > 0) {
        window.alert(`批量 Pin 完成，失败 ${result.failed.length} 条。`);
      }
    } finally {
      setBulkBusy(null);
    }
  }, [selectedIds]);

  const onBulkSetUseCase = useCallback(
    async (useCase: RecordUseCase) => {
      if (selectedIds.length === 0) {
        return;
      }

      setBulkBusy('meta');
      try {
        const result = await window.pinStack.records.meta.bulkUpdate(selectedIds, { useCase });
        if (result.failed.length > 0) {
          window.alert(`批量设置分类完成，失败 ${result.failed.length} 条。`);
        }
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds]
  );

  const onBulkAddTags = useCallback(
    async (tags: string[]) => {
      const normalizedIncoming = normalizeTags(tags);
      if (selectedIds.length === 0 || normalizedIncoming.length === 0) {
        return;
      }

      const selectedRecordMap = new Map(records.map((item) => [item.id, item] as const));
      setBulkBusy('meta');
      try {
        await Promise.all(
          selectedIds.map(async (recordId) => {
            const record = selectedRecordMap.get(recordId);
            if (!record) {
              return;
            }
            const mergedTags = normalizeTags([...record.tags, ...normalizedIncoming]);
            await window.pinStack.records.meta.update(recordId, { tags: mergedTags });
          })
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [records, selectedIds]
  );

  const onBulkRemoveTags = useCallback(
    async (tags: string[]) => {
      const normalizedIncoming = normalizeTags(tags);
      if (selectedIds.length === 0 || normalizedIncoming.length === 0) {
        return;
      }

      const selectedRecordMap = new Map(records.map((item) => [item.id, item] as const));
      setBulkBusy('meta');
      try {
        await Promise.all(
          selectedIds.map(async (recordId) => {
            const record = selectedRecordMap.get(recordId);
            if (!record) {
              return;
            }
            const nextTags = record.tags.filter((tag) => !normalizedIncoming.includes(tag));
            await window.pinStack.records.meta.update(recordId, { tags: nextTags });
          })
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [records, selectedIds]
  );

  return {
    selectedIds,
    bulkBusy,
    setSelectedIds,
    onSelectRecord,
    onClearSelection,
    onBulkCreateFlow,
    onBulkDelete,
    onBulkPin,
    onBulkSetUseCase,
    onBulkAddTags,
    onBulkRemoveTags
  };
}
