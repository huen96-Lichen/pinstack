/**
 * WikiAgent 处理器 — VK 管线的 wiki_ingesting 阶段。
 *
 * 通过 Python 子进程调用 WikiAgent bridge.py，
 * 将 VK 输出的 Markdown 文档摄入到结构化知识库。
 *
 * 容错策略：wiki_ingesting 失败不阻塞 VK 任务，
 * 文档仍然成功导出到 library/，只是知识库未更新。
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { VKProcessedDocument, VKTaskExecutionResult } from '../../shared/vk/types';
import type { WikiBridgeInput, WikiBridgeResult, WikiLlmConfig } from '../../shared/vk/wikiTypes';

/** WikiAgent bridge.py 路径解析（与 VK Python 处理器路径模式一致） */
function getBridgeScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'wikiagent', 'bridge.py');
  }
  return path.resolve(process.cwd(), 'server', 'wikiagent', 'bridge.py');
}

function resolveWikiWorkspace(wikiDir: string, rawDir: string): {
  workspaceCwd: string;
  wikiPathForAgent: string;
  rawPathForAgent: string;
} {
  const absoluteWikiDir = path.resolve(wikiDir);
  const absoluteRawDir = path.resolve(rawDir);
  const workspaceCwd = path.dirname(absoluteWikiDir);
  return {
    workspaceCwd,
    wikiPathForAgent: path.relative(workspaceCwd, absoluteWikiDir) || '.',
    rawPathForAgent: path.relative(workspaceCwd, absoluteRawDir) || '.',
  };
}

/** 调用 WikiAgent bridge.py 子进程（通用） */
export function callWikiAgentBridge(
  input: WikiBridgeInput,
  wikiDir: string,
  rawDir: string,
  llmConfig: WikiLlmConfig,
  timeoutMs: number = 5 * 60 * 1000,
): Promise<WikiBridgeResult> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: WikiBridgeResult): void => {
      if (done) return;
      done = true;
      resolve(result);
    };

    const python = process.env.WIKIAGENT_PYTHON || 'python3';
    const bridgeScript = getBridgeScriptPath();
    const workspace = resolveWikiWorkspace(wikiDir, rawDir);

    const child = spawn(python, [bridgeScript], {
      cwd: workspace.workspaceCwd,
      env: {
        ...process.env,
        WIKIAGENT_BASE_URL: llmConfig.baseUrl,
        WIKIAGENT_API_KEY: llmConfig.apiKey,
        WIKIAGENT_MODEL: llmConfig.model,
        WIKIAGENT_WIKI_DIR: workspace.wikiPathForAgent,
        WIKIAGENT_RAW_DIR: workspace.rawPathForAgent,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeout: ReturnType<typeof setTimeout> | null = null;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout);
      finish({ ok: false, error: `Failed to spawn WikiAgent process: ${error.message}` });
    });

    // 发送指令到 stdin
    child.stdin?.write(JSON.stringify(input));
    child.stdin?.end();

    // 超时保护
    timeout = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: `WikiAgent bridge timeout (${Math.round(timeoutMs / 1000)}s)` });
    }, timeoutMs);

    child.on('close', (code) => {
      if (done) return;
      if (timeout) clearTimeout(timeout);
      if (code !== 0) {
        finish({
          ok: false,
          error: `WikiAgent exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ''}`,
        });
        return;
      }
      try {
        const result = JSON.parse(stdout || '{}') as WikiBridgeResult;
        finish(result);
      } catch {
        finish({
          ok: false,
          error: `Failed to parse WikiAgent output: ${(stdout || 'empty').slice(0, 500)}`,
        });
      }
    });
  });
}

/**
 * 执行 WikiAgent ingest 处理 — VK 管线的 wiki_ingesting 阶段。
 *
 * 流程：
 * 1. 将 VK 输出的 .md 文件复制到 wiki/raw/sources/
 * 2. 调用 WikiAgent bridge.py 执行 ingest
 * 3. 返回处理结果（失败不抛异常，由调用方决定是否降级）
 */
export async function runWikiIngestProcessor(
  outputPath: string,
  processed: VKProcessedDocument,
  sourceUrl: string | undefined,
  sourceType: string,
  wikiDir: string,
  rawDir: string,
  llmConfig: WikiLlmConfig,
): Promise<VKTaskExecutionResult> {
  const logs: string[] = [];

  try {
    // 1. 将 VK 输出复制到 wiki/raw/sources/
    if (!outputPath) {
      return { ok: false, stage: 'wiki_ingesting', error: 'No output file to ingest', logs };
    }

    const fileName = path.basename(outputPath);
    const rawDest = path.join(rawDir, 'sources', fileName);
    await fs.mkdir(path.dirname(rawDest), { recursive: true });
    await fs.copyFile(outputPath, rawDest);
    logs.push(`[wiki] Copied ${outputPath} to ${rawDest}`);

    // 2. 构建 ingest 指令
    const frontmatter = processed?.frontmatter || {};
    const input: WikiBridgeInput = {
      action: 'ingest',
      source_path: rawDest,
      source_title: (frontmatter.title as string) || fileName.replace(/\.md$/, ''),
      source_type: sourceType,
      source_url: sourceUrl,
    };

    // 3. 调用 WikiAgent Python 子进程
    logs.push('[wiki] Starting WikiAgent ingest...');
    const result = await callWikiAgentBridge(input, wikiDir, rawDir, llmConfig);

    if (!result.ok) {
      logs.push(`[wiki] Ingest failed: ${result.error}`);
      return {
        ok: false,
        stage: 'wiki_ingesting',
        error: result.error || 'WikiAgent ingest failed',
        logs,
      };
    }

    const summary = result.content?.slice(0, 300) || '(no summary)';
    logs.push(`[wiki] Ingest completed: ${summary}`);
    return { ok: true, stage: 'wiki_ingesting', logs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logs.push(`[wiki] Ingest error: ${message}`);
    return { ok: false, stage: 'wiki_ingesting', error: message, logs };
  }
}

/**
 * 执行 WikiAgent query — 基于知识库回答问题。
 */
export async function runWikiQuery(
  question: string,
  wikiDir: string,
  rawDir: string,
  llmConfig: WikiLlmConfig,
): Promise<WikiBridgeResult> {
  const input: WikiBridgeInput = { action: 'query', question };
  return callWikiAgentBridge(input, wikiDir, rawDir, llmConfig, 2 * 60 * 1000);
}

/**
 * 执行 WikiAgent lint — 健康检查知识库。
 */
export async function runWikiLint(
  wikiDir: string,
  rawDir: string,
  llmConfig: WikiLlmConfig,
): Promise<WikiBridgeResult> {
  const input: WikiBridgeInput = { action: 'lint' };
  return callWikiAgentBridge(input, wikiDir, rawDir, llmConfig, 3 * 60 * 1000);
}
