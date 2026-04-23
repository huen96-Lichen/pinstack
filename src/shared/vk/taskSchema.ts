import type { VKTask, VKTaskStage, VKTaskStatus } from './types';

export const VK_STAGE_ORDER: VKTaskStage[] = [
  'created',
  'preflight',
  'extracting',
  'converting',
  'transcribing',
  'normalizing',
  'enhancing',
  'exporting',
  'wiki_ingesting',
  'done',
];

export const VK_RETRYABLE_STATES: VKTaskStatus[] = ['failed', 'cancelled'];
export const VK_CANCELLABLE_STATES: VKTaskStatus[] = ['waiting'];

export function canRetryTask(task: Pick<VKTask, 'status'>): boolean {
  return VK_RETRYABLE_STATES.includes(task.status);
}

export function canCancelTask(task: Pick<VKTask, 'status'>): boolean {
  return VK_CANCELLABLE_STATES.includes(task.status);
}

export function isTerminalStatus(status: VKTaskStatus): boolean {
  return status === 'success' || status === 'failed' || status === 'cancelled';
}
