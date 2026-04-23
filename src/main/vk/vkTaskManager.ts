import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSettings } from '../../shared/types';
import type {
  VKDraftDocument,
  VKOutputMode,
  VKProcessedDocument,
  VKTask,
  VKTaskCreateInput,
  VKTaskExecutionResult,
  VKTaskInput,
  VKTaskListResponse,
  VKTaskStage,
  VKTaskStatus,
} from '../../shared/vk/types';
import { canCancelTask, canRetryTask } from '../../shared/vk/taskSchema';
import { ensureVKDirs, getVKPaths, resolveVKOutputDir } from './vkPaths';
import { buildVKFileName, resolveNameConflict } from './vkNaming';
import { inferInitialStage, runMetadataProcessor, runNormalizeProcessor, runSourceProcessor } from './vkProcessors';
import { runWikiIngestProcessor } from './vkWikiProcessor';
import type { WikiSettings } from '../../shared/vk/wikiTypes';

export interface WikiIngestSuccessPayload {
  taskId: string;
  outputPath: string;
  wikiDir: string;
  wikiRawDir: string;
}

export interface WikiKnowledgeSyncResult {
  scannedDirs: number;
  totalFiles: number;
  newFiles: number;
  modifiedFiles: number;
  unchangedFiles: number;
  skippedFiles: number;
}

interface VKTaskManagerOptions {
  getSettings: () => AppSettings;
  onWikiIngestSuccess?: (payload: WikiIngestSuccessPayload) => Promise<WikiKnowledgeSyncResult>;
}

export class VKTaskManager {
  private readonly _getSettings: () => AppSettings;
  private readonly onWikiIngestSuccess?: (payload: WikiIngestSuccessPayload) => Promise<WikiKnowledgeSyncResult>;
  private readonly tasks = new Map<string, VKTask>();
  private queue: string[] = [];
  private runningTaskId: string | null = null;
  private initialized = false;

  public constructor(options: VKTaskManagerOptions) {
    this._getSettings = options.getSettings;
    this.onWikiIngestSuccess = options.onWikiIngestSuccess;
  }

  public get runningId(): string | null {
    return this.runningTaskId;
  }

  public get queueLength(): number {
    return this.queue.length;
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    await ensureVKDirs(this._getSettings());

    const tasksFile = await this.getTasksFilePath();
    try {
      const raw = await fs.readFile(tasksFile, 'utf8');
      const parsed = JSON.parse(raw) as VKTask[];
      for (const task of parsed) {
        this.tasks.set(task.id, task);
      }
    } catch {
      // ignore cold start
    }

    this.queue = Array.from(this.tasks.values())
      .filter((task) => task.status === 'waiting')
      .sort((a, b) => a.input.createdAt.localeCompare(b.input.createdAt))
      .map((task) => task.id);
  }

  public async createTask(input: VKTaskCreateInput): Promise<VKTask> {
    await this.init();
    const now = new Date().toISOString();
    const taskId = randomUUID();
    const taskInput: VKTaskInput = {
      id: randomUUID(),
      sourceType: input.sourceType,
      sourcePath: input.sourcePath,
      sourceUrl: input.sourceUrl,
      sourceRecordId: input.sourceRecordId,
      options: input.options,
      createdAt: now,
    };

    const task: VKTask = {
      id: taskId,
      type: input.type,
      input: taskInput,
      status: 'waiting',
      stage: 'created',
      progress: 0,
      logs: [],
    };

    this.tasks.set(task.id, task);
    this.queue.push(task.id);
    await this.appendLog(task.id, `[created] sourceType=${task.input.sourceType}`);
    await this.persist();
    void this.runNext();
    return task;
  }

  public listTasks(): VKTaskListResponse {
    const tasks = Array.from(this.tasks.values()).sort((a, b) => b.input.createdAt.localeCompare(a.input.createdAt));
    return { tasks, total: tasks.length };
  }

  public getTask(taskId: string): VKTask | null {
    return this.tasks.get(taskId) ?? null;
  }

  public async retryTask(taskId: string): Promise<VKTask> {
    const task = this.mustGetTask(taskId);
    if (!canRetryTask(task)) {
      throw new Error(`Task ${taskId} is not retryable`);
    }

    task.status = 'waiting';
    task.stage = 'created';
    task.progress = 0;
    task.errorMessage = undefined;
    task.startedAt = undefined;
    task.finishedAt = undefined;
    this.queue.push(taskId);
    await this.appendLog(taskId, '[retry] task re-queued');
    await this.persist();
    void this.runNext();
    return task;
  }

  public async cancelTask(taskId: string): Promise<VKTask> {
    const task = this.mustGetTask(taskId);
    if (!canCancelTask(task)) {
      throw new Error(`Task ${taskId} cannot be cancelled in status=${task.status}`);
    }

    task.status = 'cancelled';
    task.stage = 'done';
    task.progress = 100;
    task.finishedAt = new Date().toISOString();
    this.queue = this.queue.filter((id) => id !== taskId);
    await this.appendLog(taskId, '[cancelled] removed from waiting queue');
    await this.persist();
    return task;
  }

  public async appendLog(taskId: string, message: string): Promise<void> {
    const task = this.mustGetTask(taskId);
    const line = `${new Date().toISOString()} ${message}`;
    task.logs.push(line);
    const logPath = await this.getTaskLogPath(taskId);
    task.logPath = logPath;
    await fs.appendFile(logPath, `${line}\n`, 'utf8');
  }

  public async openLog(taskId: string): Promise<string> {
    const task = this.mustGetTask(taskId);
    if (!task.logPath) {
      task.logPath = await this.getTaskLogPath(taskId);
      await fs.writeFile(task.logPath, '', 'utf8');
      await this.persist();
    }
    return task.logPath;
  }

  public async runNext(): Promise<void> {
    if (this.runningTaskId || this.queue.length === 0) {
      return;
    }

    const nextTaskId = this.queue.shift();
    if (!nextTaskId) {
      return;
    }

    const task = this.mustGetTask(nextTaskId);
    this.runningTaskId = task.id;
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    task.stage = 'preflight';
    task.progress = 3;
    await this.appendLog(task.id, '[preflight] task started');
    await this.persist();

    try {
      task.stage = inferInitialStage(task.input);
      task.progress = 15;
      await this.appendLog(task.id, `[${task.stage}] invoking source processor`);
      const sourceResult = await runSourceProcessor({
        taskId: task.id,
        input: task.input,
      });
      this.collectProcessorLogs(task.id, sourceResult);
      this.ensureProcessorSuccess(sourceResult, task.stage, task.id);

      const draft = this.pickDraft(task.id, sourceResult);

      task.stage = 'normalizing';
      task.progress = 45;
      await this.appendLog(task.id, '[normalizing] invoking normalize processor');
      const normalizedResult = await runNormalizeProcessor(draft, task.input.options as Record<string, unknown> | undefined);
      this.collectProcessorLogs(task.id, normalizedResult);
      this.ensureProcessorSuccess(normalizedResult, 'normalizing', task.id);

      const processed = this.pickProcessed(task.id, normalizedResult, draft);

      task.stage = 'enhancing';
      task.progress = 70;
      await this.appendLog(task.id, '[enhancing] invoking metadata processor');
      const metadataResult = await runMetadataProcessor(processed, task.input.options as Record<string, unknown> | undefined);
      this.collectProcessorLogs(task.id, metadataResult);
      this.ensureProcessorSuccess(metadataResult, 'enhancing', task.id);
      const enriched = this.pickProcessed(task.id, metadataResult, processed);

      task.stage = 'exporting';
      task.progress = 88;
      const outputPath = await this.writeOutput(task, enriched);
      task.outputPath = outputPath;
      await this.appendLog(task.id, `[exporting] written to ${outputPath}`);

      // ── 阶段四：Wiki Ingest（可选，失败不阻塞） ──
      const wikiSettings = this.getWikiSettings();
      const perTaskWikiIngest = task.input.options?.wikiIngest as boolean | undefined;
      const shouldWikiIngest = perTaskWikiIngest === true
        ? Boolean(wikiSettings)
        : Boolean(wikiSettings?.enabled);
      if (shouldWikiIngest && wikiSettings) {
        task.stage = 'wiki_ingesting';
        task.progress = 92;
        await this.appendLog(task.id, '[wiki_ingesting] starting WikiAgent ingest');
        await this.persist();

        try {
          const vkPaths = getVKPaths(this.getSettings());
          const wikiResult = await runWikiIngestProcessor(
            outputPath,
            enriched,
            task.input.sourceUrl,
            task.input.sourceType,
            vkPaths.wiki,
            vkPaths.wikiRaw,
            {
              baseUrl: wikiSettings.baseUrl,
              apiKey: wikiSettings.apiKey,
              model: wikiSettings.model,
            },
          );

          for (const line of wikiResult.logs ?? []) {
            if (line?.trim()) {
              await this.appendLog(task.id, line.trim());
            }
          }

          if (!wikiResult.ok) {
            // wiki_ingest 失败不阻塞任务，仅记录警告
            await this.appendLog(
              task.id,
              `[wiki_ingesting] WARN: ${wikiResult.error}. Document exported but not indexed in wiki.`,
            );
          } else {
            await this.appendLog(task.id, '[wiki_ingesting] completed successfully');
            if (this.onWikiIngestSuccess) {
              try {
                await this.appendLog(task.id, '[knowledge_sync] syncing wiki pages into knowledge3...');
                const sync = await this.onWikiIngestSuccess({
                  taskId: task.id,
                  outputPath,
                  wikiDir: vkPaths.wiki,
                  wikiRawDir: vkPaths.wikiRaw,
                });
                await this.appendLog(
                  task.id,
                  `[knowledge_sync] done: dirs=${sync.scannedDirs}, files=${sync.totalFiles}, new=${sync.newFiles}, modified=${sync.modifiedFiles}, unchanged=${sync.unchangedFiles}, skipped=${sync.skippedFiles}`,
                );
              } catch (syncError) {
                const msg = syncError instanceof Error ? syncError.message : String(syncError);
                await this.appendLog(task.id, `[knowledge_sync] WARN: ${msg}`);
              }
            }
          }
        } catch (wikiError) {
          // WikiAgent 异常不阻塞 VK 任务
          const msg = wikiError instanceof Error ? wikiError.message : String(wikiError);
          await this.appendLog(task.id, `[wiki_ingesting] ERROR: ${msg}. Skipping wiki ingest.`);
        }
      }

      task.stage = 'done';
      task.progress = 100;
      task.status = 'success';
      task.finishedAt = new Date().toISOString();
      await this.appendLog(task.id, '[done] task completed');
      await this.persist();
    } catch (error) {
      task.status = 'failed';
      task.progress = Math.max(task.progress, 95);
      task.errorMessage = error instanceof Error ? error.message : String(error);
      task.finishedAt = new Date().toISOString();
      await this.appendLog(task.id, `[failed] ${task.errorMessage}`);
      await this.persist();
    } finally {
      this.runningTaskId = null;
      void this.runNext();
    }
  }

  private pickDraft(taskId: string, result: VKTaskExecutionResult): VKDraftDocument {
    if (result.draft) {
      return result.draft;
    }
    throw new Error(`Task ${taskId} source processor returned no draft`);
  }

  private pickProcessed(taskId: string, result: VKTaskExecutionResult, fallback: VKDraftDocument | VKProcessedDocument): VKProcessedDocument {
    if (result.processed) {
      return result.processed;
    }
    if ('rawMarkdown' in fallback) {
      const raw = fallback as VKDraftDocument;
      return {
        id: raw.id,
        title: raw.title || 'Untitled',
        markdown: raw.rawMarkdown,
      };
    }
    return fallback as VKProcessedDocument;
  }

  private collectProcessorLogs(taskId: string, result: VKTaskExecutionResult): void {
    for (const line of result.logs ?? []) {
      if (line?.trim()) {
        void this.appendLog(taskId, `[worker] ${line.trim()}`);
      }
    }
  }

  private ensureProcessorSuccess(result: VKTaskExecutionResult, stage: VKTaskStage, taskId: string): void {
    if (result.ok) {
      return;
    }
    const detail = result.error || `processor failed at stage=${result.stage || stage}`;
    throw new Error(`Task ${taskId} failed at ${stage}: ${detail}`);
  }

  private async writeOutput(task: VKTask, processed: VKProcessedDocument): Promise<string> {
    const settings = this.getSettings();
    const outputMode = ((task.input.options as Record<string, unknown> | undefined)?.outputMode as VKOutputMode | undefined) ?? 'draft';
    const customDir = (task.input.options as Record<string, unknown> | undefined)?.customOutputDir as string | undefined;
    const outputDir = resolveVKOutputDir(settings, outputMode, customDir);
    await fs.mkdir(outputDir, { recursive: true });

    const named = buildVKFileName({
      sourceType: task.input.sourceType,
      title: processed.title,
    });
    const finalPath = await resolveNameConflict(outputDir, named);
    await fs.writeFile(finalPath, processed.markdown, 'utf8');
    return finalPath;
  }

  private async getTasksFilePath(): Promise<string> {
    const dirs = getVKPaths(this.getSettings());
    await fs.mkdir(dirs.cache, { recursive: true });
    return path.join(dirs.cache, 'tasks.json');
  }

  private async getTaskLogPath(taskId: string): Promise<string> {
    const dirs = getVKPaths(this.getSettings());
    await fs.mkdir(dirs.logs, { recursive: true });
    return path.join(dirs.logs, `${taskId}.log`);
  }

  private async persist(): Promise<void> {
    const tasksFile = await this.getTasksFilePath();
    const snapshot = Array.from(this.tasks.values());
    await fs.writeFile(tasksFile, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  private mustGetTask(taskId: string): VKTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    return task;
  }

  /** 获取当前 Settings（public，供 VKBridge 等外部模块使用） */
  public getSettings(): AppSettings {
    return this._getSettings();
  }

  /** 从 Settings 中提取 Wiki 配置（兼容旧版 Settings 无 wiki 字段的情况） */
  private getWikiSettings(): WikiSettings | null {
    const settings = this.getSettings();
    const vk = settings.vaultkeeper as Record<string, unknown> | undefined;
    if (!vk || !vk.wiki) {
      return null;
    }
    return vk.wiki as WikiSettings;
  }
}
