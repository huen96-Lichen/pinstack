import type {
  VkApiResponse,
  VkBatchImportPreviewRequest,
  VkBatchImportRequest,
  VkClipHtmlRequest,
  VkCreateJobRequest,
  VkExportBatchRequest,
  VkExportRequest,
  VkExportResult,
  VkJob,
  VkJobWorkspace,
  VkQualityRequest,
  VkRetryRequest,
  VkSmartClipRequest,
  VkSuggestRequest,
  VkToolsInfo,
} from '../../shared/vaultkeeper';

export class VaultKeeperClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`VaultKeeper API error: ${response.status} ${response.statusText} (${url})`);
    }

    const json = await response.json() as VkApiResponse<T>;

    if (!json.success) {
      throw new Error(`VaultKeeper API returned failure: ${json.message ?? 'unknown error'}`);
    }

    return json.data;
  }

  async createJob(params: VkCreateJobRequest): Promise<VkApiResponse<VkJob>> {
    const data = await this.request<VkJob>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async getJob(jobId: string): Promise<VkApiResponse<VkJob>> {
    const data = await this.request<VkJob>(`/api/jobs/${encodeURIComponent(jobId)}`);
    return { success: true, data };
  }

  async getJobWorkspace(jobId: string): Promise<VkApiResponse<{ jobId: string; workspace: VkJobWorkspace }>> {
    const data = await this.request<{ jobId: string; workspace: VkJobWorkspace }>(
      `/api/jobs/${encodeURIComponent(jobId)}/workspace`,
    );
    return { success: true, data };
  }

  async exportFile(params: VkExportRequest): Promise<VkApiResponse<VkExportResult>> {
    const data = await this.request<VkExportResult>('/api/export', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async exportBatch(params: VkExportBatchRequest): Promise<VkApiResponse<{
    total: number;
    succeeded: number;
    failed: number;
    results: VkExportResult[];
  }>> {
    const data = await this.request<{
      total: number;
      succeeded: number;
      failed: number;
      results: VkExportResult[];
    }>('/api/export/batch', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async getTools(): Promise<VkApiResponse<VkToolsInfo>> {
    const data = await this.request<VkToolsInfo>('/api/tools');
    return { success: true, data };
  }

  async batchImport(params: VkBatchImportRequest): Promise<VkApiResponse<unknown>> {
    const data = await this.request<unknown>('/api/batch-import', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async batchImportPreview(params: VkBatchImportPreviewRequest): Promise<VkApiResponse<unknown>> {
    const data = await this.request<unknown>('/api/batch-import/preview', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async smartClip(params: VkSmartClipRequest): Promise<VkApiResponse<unknown>> {
    const data = await this.request<unknown>('/api/smart-clip', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async clipHtml(params: VkClipHtmlRequest): Promise<VkApiResponse<unknown>> {
    const data = await this.request<unknown>('/api/clip-html', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async suggest(params: VkSuggestRequest): Promise<VkApiResponse<unknown>> {
    const data = await this.request<unknown>('/api/suggest', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async qualityCheck(params: VkQualityRequest): Promise<VkApiResponse<unknown>> {
    const data = await this.request<unknown>('/api/quality', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { success: true, data };
  }

  async getOcrEngines(): Promise<VkApiResponse<{ available: string[]; recommended: string }>> {
    const data = await this.request<{ available: string[]; recommended: string }>('/api/ocr/engines');
    return { success: true, data };
  }

  async retryJob(jobId: string, params?: VkRetryRequest): Promise<VkApiResponse<unknown>> {
    const data = await this.request<unknown>(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      body: JSON.stringify(params ?? {}),
    });
    return { success: true, data };
  }

  async healthCheck(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const url = `${this.baseUrl}/api/health`;
      const response = await fetch(url);
      const json = await response.json();
      return json as { ok: boolean; version?: string; error?: string };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
