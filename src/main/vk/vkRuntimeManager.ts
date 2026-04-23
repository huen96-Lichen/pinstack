import { spawn } from 'node:child_process';
import type { VKRuntimeDependency } from '../../shared/vk/types';

function execOutput(cmd: string, args: string[], timeoutMs = 2500): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        child.kill('SIGKILL');
        resolve({ ok: false, output: 'timeout' });
      }
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      output += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      output += d.toString('utf8');
    });
    child.on('error', (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, output: error.message });
    });
    child.on('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}

function installHintFor(name: string): string {
  const map: Record<string, string> = {
    python3: 'brew install python',
    ffmpeg: 'brew install ffmpeg',
    pandoc: 'brew install pandoc',
    markitdown: 'python3 -m pip install "markitdown[all]"',
    trafilatura: 'python3 -m pip install trafilatura',
    whisper: 'python3 -m pip install openai-whisper',
    whisperx: 'python3 -m pip install whisperx',
    'markdownlint-cli2': 'npm install -g markdownlint-cli2',
    textlint: 'npm install -g textlint',
    'wikiagent (openai)': 'python3 -m pip install openai pyyaml',
  };
  return map[name] ?? '';
}

function compatHintFor(name: string): string | undefined {
  if (name === 'whisperx') {
    return '若安装失败，请使用 Python 3.12/3.13 虚拟环境再安装 whisperx';
  }
  return undefined;
}

async function checkCommand(name: string, versionArgs: string[] = ['--version']): Promise<VKRuntimeDependency> {
  const now = new Date().toISOString();
  const installCommand = installHintFor(name);
  const whichResult = await execOutput('which', [name]);
  if (!whichResult.ok || !whichResult.output) {
    const compatHint = compatHintFor(name);
    return {
      key: name,
      available: false,
      lastCheckedAt: now,
      hint: compatHint ? `未找到 ${name}。${compatHint}` : `未找到 ${name}，请先安装并加入 PATH`,
      installCommand,
    };
  }

  const versionResult = await execOutput(name, versionArgs);
  return {
    key: name,
    available: true,
    path: whichResult.output.split('\n')[0],
    version: versionResult.output.split('\n')[0] || 'unknown',
    lastCheckedAt: now,
    hint: versionResult.ok ? '可用' : '已找到，但版本探测失败',
    installCommand,
  };
}

export class VKRuntimeManager {
  public async checkDependencies(): Promise<VKRuntimeDependency[]> {
    const checks: Array<Promise<VKRuntimeDependency>> = [
      checkCommand('python3', ['--version']),
      checkCommand('ffmpeg', ['-version']),
      checkCommand('pandoc', ['--version']),
      checkCommand('markitdown', ['--version']),
      checkCommand('trafilatura', ['--version']),
      checkCommand('whisper', ['--help']),
      checkCommand('whisperx', ['--help']),
      checkCommand('markdownlint-cli2', ['--version']),
      checkCommand('textlint', ['--version']),
      checkWikiAgentDeps(),
    ];
    return Promise.all(checks);
  }
}

/** 检测 WikiAgent 所需的 Python 依赖（openai 包） */
async function checkWikiAgentDeps(): Promise<VKRuntimeDependency> {
  const now = new Date().toISOString();
  const key = 'wikiagent (openai)';
  const installCommand = installHintFor(key);

  // 先检查 python3 是否可用
  const pythonCheck = await execOutput('which', ['python3']);
  if (!pythonCheck.ok) {
    return {
      key,
      available: false,
      lastCheckedAt: now,
      hint: '需要 python3 才能运行 WikiAgent',
      installCommand,
    };
  }

  // 检查 openai 包是否已安装
  const result = await execOutput('python3', ['-c', 'import openai; print(openai.__version__)']);
  if (!result.ok) {
    return {
      key,
      available: false,
      lastCheckedAt: now,
      hint: 'WikiAgent 需要 openai Python 包',
      installCommand,
    };
  }

  return {
    key,
    available: true,
    path: pythonCheck.output.split('\n')[0],
    version: `openai ${result.output}`,
    lastCheckedAt: now,
    hint: '可用',
    installCommand,
  };
}
