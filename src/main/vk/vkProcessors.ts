import { spawn } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';
import type {
  VKDraftDocument,
  VKProcessedDocument,
  VKSourceType,
  VKTaskExecutionResult,
  VKTaskInput,
  VKTaskStage,
} from '../../shared/vk/types';

export interface VKProcessorContext {
  taskId: string;
  input: VKTaskInput;
  draft?: VKDraftDocument;
  processed?: VKProcessedDocument;
}

type ProcessorName =
  | 'markitdown'
  | 'trafilatura'
  | 'whisper'
  | 'whisperx'
  | 'normalize'
  | 'metadata';

function getPythonAppPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server/python/app.py');
  }
  return path.resolve(process.cwd(), 'server/python/app.py');
}

function runPythonProcessor(name: ProcessorName, payload: Record<string, unknown>): Promise<VKTaskExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn('python3', [getPythonAppPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VK_PROCESSOR: name,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        stage: 'preflight',
        error: error.message,
        logs: [error.message],
      });
    });

    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout || '{}') as VKTaskExecutionResult;
        resolve({
          ...parsed,
          logs: [...(parsed.logs ?? []), ...(stderr ? [stderr.trim()] : [])].filter(Boolean),
        });
      } catch {
        resolve({
          ok: false,
          stage: 'preflight',
          error: `Invalid worker response: ${stdout || stderr || 'empty'}`,
          logs: [stderr || stdout],
        });
      }
    });

    child.stdin?.write(JSON.stringify({ processor: name, payload }));
    child.stdin?.end();
  });
}

function sourceStage(sourceType: VKSourceType): VKTaskStage {
  if (sourceType === 'audio' || sourceType === 'video') {
    return 'transcribing';
  }
  if (sourceType === 'url' || sourceType === 'image_url' || sourceType === 'record') {
    return 'extracting';
  }
  return 'converting';
}

export async function runSourceProcessor(ctx: VKProcessorContext): Promise<VKTaskExecutionResult> {
  const { input } = ctx;
  if (input.sourceType === 'url') {
    return runPythonProcessor('trafilatura', {
      taskId: ctx.taskId,
      sourceUrl: input.sourceUrl,
      options: input.options ?? {},
    });
  }

  if (input.sourceType === 'audio' || input.sourceType === 'video') {
    const enhanced = Boolean((input.options as Record<string, unknown> | undefined)?.enableWhisperX);
    return runPythonProcessor(enhanced ? 'whisperx' : 'whisper', {
      taskId: ctx.taskId,
      sourcePath: input.sourcePath,
      sourceType: input.sourceType,
      options: input.options ?? {},
    });
  }

  return runPythonProcessor('markitdown', {
    taskId: ctx.taskId,
    sourcePath: input.sourcePath,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    options: input.options ?? {},
  });
}

export async function runNormalizeProcessor(draft: VKDraftDocument, options?: Record<string, unknown>): Promise<VKTaskExecutionResult> {
  return runPythonProcessor('normalize', {
    draft,
    options: options ?? {},
  });
}

export async function runMetadataProcessor(processed: VKProcessedDocument, options?: Record<string, unknown>): Promise<VKTaskExecutionResult> {
  return runPythonProcessor('metadata', {
    processed,
    options: options ?? {},
  });
}

export function inferInitialStage(input: VKTaskInput): VKTaskStage {
  return sourceStage(input.sourceType);
}
