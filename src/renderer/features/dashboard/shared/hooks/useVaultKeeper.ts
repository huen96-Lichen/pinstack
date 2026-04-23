import { useState, useCallback, useEffect } from 'react';
import type { VkRuntimeStatus, VkJob, VkCreateJobRequest, VkSendRecordRequest, VkApiResponse } from '../../../../../shared/vaultkeeper';

export function useVaultKeeper() {
  const [status, setStatus] = useState<VkRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await window.pinStack.vaultkeeper.getStatus();
      setStatus(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const s = await window.pinStack.vaultkeeper.start();
      setStatus(s);
    } catch (error) {
      console.error('[useVaultKeeper] start failed', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setLoading(true);
    try {
      const s = await window.pinStack.vaultkeeper.stop();
      setStatus(s);
    } catch (error) {
      console.error('[useVaultKeeper] stop failed', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createJob = useCallback(async (params: VkCreateJobRequest): Promise<VkApiResponse<VkJob>> => {
    return window.pinStack.vaultkeeper.createJob(params);
  }, []);

  const getJob = useCallback(async (jobId: string): Promise<VkApiResponse<VkJob>> => {
    return window.pinStack.vaultkeeper.getJob(jobId);
  }, []);

  const sendRecord = useCallback(async (request: VkSendRecordRequest): Promise<VkApiResponse<VkJob>> => {
    return window.pinStack.vaultkeeper.sendRecord(request);
  }, []);

  const getTools = useCallback(async () => {
    try {
      return await window.pinStack.vaultkeeper.getTools();
    } catch {
      return null;
    }
  }, []);

  return { status, loading, refresh, start, stop, createJob, getJob, sendRecord, getTools };
}
