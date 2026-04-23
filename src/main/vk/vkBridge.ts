import { shell } from 'electron';
import type { AppSettings } from '../../shared/types';
import type { VKRuntimeStatus, VKTask, VKTaskCreateInput, VKTaskListResponse } from '../../shared/vk/types';
import type { WikiSettings, WikiStatus, WikiQueryInput, WikiQueryResult, WikiLintResult } from '../../shared/vk/wikiTypes';
import { VKRuntimeManager } from './vkRuntimeManager';
import { VKTaskManager, type WikiIngestSuccessPayload, type WikiKnowledgeSyncResult } from './vkTaskManager';
import { getVKPaths } from './vkPaths';
import { runWikiQuery, runWikiLint } from './vkWikiProcessor';

interface VKBridgeOptions {
  getSettings: () => AppSettings;
  onWikiIngestSuccess?: (payload: WikiIngestSuccessPayload) => Promise<WikiKnowledgeSyncResult>;
}

export class VKBridge {
  private readonly runtimeManager: VKRuntimeManager;
  private readonly taskManager: VKTaskManager;
  private wikiLintTimer: ReturnType<typeof setInterval> | null = null;

  public constructor(options: VKBridgeOptions) {
    this.runtimeManager = new VKRuntimeManager();
    this.taskManager = new VKTaskManager({
      getSettings: options.getSettings,
      onWikiIngestSuccess: options.onWikiIngestSuccess,
    });
  }

  public async init(): Promise<void> {
    await this.taskManager.init();
    this.startWikiLintScheduler();
  }

  /** 设置更新后重建 Wiki 自动 lint 调度器 */
  public refreshWikiSchedulers(): void {
    this.startWikiLintScheduler();
  }

  /** 启动 Wiki 自动 lint 调度器 */
  private startWikiLintScheduler(): void {
    this.stopWikiLintScheduler();
    const wikiSettings = this.getWikiSettings();
    if (!wikiSettings?.autoLint) return;

    const intervalMs = (wikiSettings.autoLintIntervalHours || 24) * 60 * 60 * 1000;
    this.wikiLintTimer = setInterval(() => {
      void this.runScheduledWikiLint();
    }, intervalMs);

    // 首次延迟 1 分钟执行（避免启动时与其他初始化竞争）
    setTimeout(() => {
      void this.runScheduledWikiLint();
    }, 60 * 1000);
  }

  private stopWikiLintScheduler(): void {
    if (this.wikiLintTimer) {
      clearInterval(this.wikiLintTimer);
      this.wikiLintTimer = null;
    }
  }

  private async runScheduledWikiLint(): Promise<void> {
    const wikiSettings = this.getWikiSettings();
    if (!wikiSettings?.autoLint) {
      this.stopWikiLintScheduler();
      return;
    }
    try {
      await this.wikiLint();
    } catch {
      // 自动 lint 失败静默处理，不影响其他功能
    }
  }

  public async getRuntimeStatus(): Promise<VKRuntimeStatus> {
    const dependencies = await this.runtimeManager.checkDependencies();
    return {
      service: this.taskManager.runningId ? 'running' : 'idle',
      queueLength: this.taskManager.queueLength,
      runningTaskId: this.taskManager.runningId ?? undefined,
      dependencies,
    };
  }

  public async createTask(input: VKTaskCreateInput): Promise<VKTask> {
    return this.taskManager.createTask(input);
  }

  public listTasks(): VKTaskListResponse {
    return this.taskManager.listTasks();
  }

  public getTask(id: string): VKTask | null {
    return this.taskManager.getTask(id);
  }

  public async retryTask(id: string): Promise<VKTask> {
    return this.taskManager.retryTask(id);
  }

  public async cancelTask(id: string): Promise<VKTask> {
    return this.taskManager.cancelTask(id);
  }

  public async openOutput(id: string): Promise<boolean> {
    const task = this.taskManager.getTask(id);
    if (!task?.outputPath) {
      throw new Error(`Task ${id} has no output yet`);
    }
    const result = await shell.openPath(task.outputPath);
    if (result) {
      throw new Error(result);
    }
    return true;
  }

  public async openLog(id: string): Promise<boolean> {
    const logPath = await this.taskManager.openLog(id);
    const result = await shell.openPath(logPath);
    if (result) {
      throw new Error(result);
    }
    return true;
  }

  // ── WikiAgent API ──────────────────────────────────────────────

  /** 获取 Wiki 配置 */
  public getWikiSettings(): WikiSettings | null {
    const settings = this.taskManager.getSettings();
    const vk = settings.vaultkeeper as Record<string, unknown> | undefined;
    if (!vk || !vk.wiki) {
      return null;
    }
    const wiki = vk.wiki as WikiSettings;
    return wiki.enabled ? wiki : null;
  }

  /** 检测 WikiAgent Python 依赖是否可用 */
  private async checkWikiPythonAvailable(): Promise<boolean> {
    try {
      const { execFile } = await import('node:child_process');
      const result = await new Promise<boolean>((resolve) => {
        execFile('python3', ['-c', 'import openai'], (error) => {
          resolve(!error);
        });
      });
      return result;
    } catch {
      return false;
    }
  }

  /** 获取知识库状态 */
  public async getWikiStatus(): Promise<WikiStatus> {
    const settings = this.taskManager.getSettings();
    const wikiSettings = this.getWikiSettings();
    const vkPaths = getVKPaths(settings);

    if (!wikiSettings) {
      return {
        enabled: false,
        wikiDir: vkPaths.wiki,
        totalPages: 0,
        sourcesCount: 0,
        entitiesCount: 0,
        conceptsCount: 0,
        topicsCount: 0,
        lastUpdated: null,
        lastLintReport: null,
        pythonAvailable: false,
      };
    }

    // 统计各目录下的 .md 文件数
    const countFiles = async (dir: string): Promise<number> => {
      try {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(dir, { withFileTypes: true });
        return files.filter((f) => f.isFile() && f.name.endsWith('.md')).length;
      } catch {
        return 0;
      }
    };

    const [sourcesCount, entitiesCount, conceptsCount, topicsCount] = await Promise.all([
      countFiles(`${vkPaths.wiki}/sources`),
      countFiles(`${vkPaths.wiki}/entities`),
      countFiles(`${vkPaths.wiki}/concepts`),
      countFiles(`${vkPaths.wiki}/topics`),
    ]);

    // 读取 log.md 最后一条记录
    let lastUpdated: string | null = null;
    try {
      const { readFile } = await import('node:fs/promises');
      const logContent = await readFile(`${vkPaths.wiki}/log.md`, 'utf8');
      const matches = logContent.match(/\[(\d{4}-\d{2}-\d{2})\]/g);
      if (matches?.length) {
        lastUpdated = matches[matches.length - 1].replace(/[\[\]]/g, '');
      }
    } catch {
      // log.md 不存在
    }

    return {
      enabled: true,
      wikiDir: vkPaths.wiki,
      totalPages: sourcesCount + entitiesCount + conceptsCount + topicsCount,
      sourcesCount,
      entitiesCount,
      conceptsCount,
      topicsCount,
      lastUpdated,
      lastLintReport: null,
      pythonAvailable: await this.checkWikiPythonAvailable(),
    };
  }

  /** 基于知识库查询 */
  public async wikiQuery(input: WikiQueryInput): Promise<WikiQueryResult> {
    const wikiSettings = this.getWikiSettings();
    if (!wikiSettings) {
      throw new Error('知识库未启用。请在「知识库设置」中启用并保存配置。');
    }

    const settings = this.taskManager['getSettings']();
    const vkPaths = getVKPaths(settings);

    const result = await runWikiQuery(
      input.question,
      vkPaths.wiki,
      vkPaths.wikiRaw,
      {
        baseUrl: wikiSettings.baseUrl,
        apiKey: wikiSettings.apiKey,
        model: wikiSettings.model,
      },
    );

    if (!result.ok) {
      throw new Error(result.error || '知识库查询失败');
    }

    return {
      answer: result.content || '',
      pagesRead: 0, // TODO: 从 WikiAgent 结果中提取
      timestamp: new Date().toISOString(),
    };
  }

  /** 健康检查知识库 */
  public async wikiLint(): Promise<WikiLintResult> {
    const wikiSettings = this.getWikiSettings();
    if (!wikiSettings) {
      throw new Error('知识库未启用。');
    }

    const settings = this.taskManager['getSettings']();
    const vkPaths = getVKPaths(settings);

    const result = await runWikiLint(
      vkPaths.wiki,
      vkPaths.wikiRaw,
      {
        baseUrl: wikiSettings.baseUrl,
        apiKey: wikiSettings.apiKey,
        model: wikiSettings.model,
      },
    );

    if (!result.ok) {
      throw new Error(result.error || '知识库健康检查失败');
    }

    return {
      report: result.content || '',
      autoFixed: 0,
      needsReview: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /** 在系统文件管理器中打开知识库目录（优先检测 Obsidian vault） */
  public async openWikiDir(): Promise<boolean> {
    const settings = this.taskManager.getSettings();
    const vkPaths = getVKPaths(settings);
    const wikiDir = vkPaths.wiki;

    // 检测是否是 Obsidian vault（存在 .obsidian 目录）
    const { existsSync } = await import('node:fs');
    if (existsSync(`${wikiDir}/.obsidian`)) {
      // 使用 obsidian:// URI 打开 vault
      try {
        await shell.openExternal(`obsidian://open?vault=${encodeURIComponent(wikiDir)}`);
      } catch {
        // URI scheme 失败，回退到文件管理器
        const fallback = await shell.openPath(wikiDir);
        if (fallback) throw new Error(fallback);
      }
      return true;
    }

    const result = await shell.openPath(wikiDir);
    if (result) {
      throw new Error(result);
    }
    return true;
  }

  /** 打开 wiki/index.md */
  public async openWikiIndex(): Promise<boolean> {
    const settings = this.taskManager['getSettings']();
    const vkPaths = getVKPaths(settings);
    const indexPath = `${vkPaths.wiki}/index.md`;
    const result = await shell.openPath(indexPath);
    if (result) {
      throw new Error(result);
    }
    return true;
  }
}
