import type { DashboardRecordActions, DashboardRecordItem } from './dashboard.types';

export function getRewriteModeLabel(mode: 'optimize' | 'rewrite'): string {
  return mode === 'optimize' ? '优化内容' : '改写用途';
}

export async function promptForUseCase(currentUseCase: DashboardRecordItem['useCase']): Promise<DashboardRecordItem['useCase'] | null> {
  const raw = window.prompt('修改用途：prompt / output / fix / flow / reference / unclassified', currentUseCase);
  if (!raw) {
    return null;
  }

  const useCase = raw.trim().toLowerCase();
  if (!['prompt', 'output', 'fix', 'flow', 'reference', 'unclassified'].includes(useCase)) {
    window.alert('用途无效，请输入 prompt / output / fix / flow / reference / unclassified');
    return null;
  }

  return useCase as DashboardRecordItem['useCase'];
}

export async function resolveRewriteSourceText(item: DashboardRecordItem): Promise<string> {
  if (item.type === 'image') {
    return `${item.ocrText ?? ''}`.trim() || `${item.displayName ?? ''}`.trim() || `${item.previewText ?? ''}`.trim();
  }

  if (item.type === 'video') {
    return `${item.displayName ?? ''}`.trim() || `${item.previewText ?? ''}`.trim();
  }

  const content = await window.pinStack.records.getContent(item.id);
  if (content.type === 'text') {
    return content.text;
  }

  return `${item.previewText ?? ''}`.trim();
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await window.pinStack.capture.ignoreNextCopy();
  await navigator.clipboard.writeText(text);
}

export async function replaceRecordContentWithText(
  item: DashboardRecordItem,
  text: string,
  actions: DashboardRecordActions
): Promise<void> {
  if (item.type === 'image' || item.type === 'video') {
    const nextName = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?.slice(0, 80);
    if (!nextName) {
      throw new Error('改写结果为空，无法替换图片标题');
    }
    await actions.onRenameRecord(item.id, nextName);
    return;
  }

  await actions.onUpdateRecordText(item.id, text);
}
