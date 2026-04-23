import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SERVICE_PREFIX = 'com.pinstack.ai';

function buildServiceName(provider: string): string {
  return `${SERVICE_PREFIX}.${provider.toLowerCase()}`;
}

async function runSecurity(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync('security', args, {
    timeout: 8000,
    maxBuffer: 1024 * 1024
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('could not be found') || message.includes('The specified item could not be found');
}

export async function loadCloudApiKey(provider: string): Promise<string | null> {
  const service = buildServiceName(provider);
  try {
    const { stdout } = await runSecurity(['find-generic-password', '-s', service, '-a', 'apiKey', '-w']);
    const value = stdout.trim();
    return value ? value : null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveCloudApiKey(provider: string, apiKey: string): Promise<void> {
  const service = buildServiceName(provider);
  const value = apiKey.trim();
  if (!value) {
    await deleteCloudApiKey(provider);
    return;
  }

  await runSecurity([
    'add-generic-password',
    '-U',
    '-s',
    service,
    '-a',
    'apiKey',
    '-w',
    value
  ]);
}

export async function deleteCloudApiKey(provider: string): Promise<void> {
  const service = buildServiceName(provider);
  try {
    await runSecurity(['delete-generic-password', '-s', service, '-a', 'apiKey']);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}
