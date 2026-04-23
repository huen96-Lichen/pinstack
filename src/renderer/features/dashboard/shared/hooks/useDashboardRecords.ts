import { useCallback, useEffect, useState } from 'react';
import type { DashboardRecordItem } from '../dashboard.types';
import { inferRecordContentSubtype } from '../contentSubtype';

export function useDashboardRecords(): {
  records: DashboardRecordItem[];
  isLoading: boolean;
} {
  const [records, setRecords] = useState<DashboardRecordItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await window.pinStack.records.list();
      setRecords(
        list.map((item) => ({
          ...item,
          contentSubtype: inferRecordContentSubtype(item)
        }))
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (cancelled) {
        return;
      }
      await loadRecords();
    };

    void boot();

    const unsubscribe = window.pinStack.records.onChanged(() => {
      void loadRecords();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadRecords]);

  return {
    records,
    isLoading
  };
}
