import type { RecordItem } from '../shared/types';

const EMOJIS = ['📸', '🧷', '📝', '✨', '🎯', '📎', '🌟', '💡', '🎈', '🫧'];

function hashToIndex(seed: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % size;
}

function formatTime(value: number): string {
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatImageTimeLabel(value: number): string {
  const date = new Date(value);
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}-${hh}-${mm}-${ss}`;
}

function resolveCaptureKind(record: RecordItem): string {
  if (record.source === 'recording' || record.type === 'video') {
    return '桌面录屏';
  }

  if (record.source === 'screenshot') {
    return '系统截图';
  }

  if (record.useCase === 'flow' || record.category === 'flow') {
    return '操作流程中转';
  }

  return record.type === 'image' ? '图片复制' : '文本复制';
}

function sanitizeRecordTitle(value: string): string {
  const withoutDecorators = value
    .replace(/\s*[-–—]\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u, '')
    .replace(/\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]+$/u, '')
    .trim();

  // Remove capture/source noise tokens that often get appended by automation.
  const withoutNoiseTokens = withoutDecorators
    .replace(
      /(?:^|[\s_\-—–|/·•，,。.;:：()（）[\]【】《》<>])(?:截图|screenshot|screen\s*shot|pinstack)(?=$|[\s_\-—–|/·•，,。.;:：()（）[\]【】《》<>])/gi,
      ' '
    )
    .replace(/[_\-\s]{2,}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s_\-—–|/·•，,。.;:：]+|[\s_\-—–|/·•，,。.;:：]+$/g, '')
    .trim();

  return withoutNoiseTokens || withoutDecorators;
}

export function buildRecordTitle(record: RecordItem): string {
  if (record.displayName?.trim()) {
    return sanitizeRecordTitle(record.displayName.trim());
  }

  return resolveCaptureKind(record);
}

export function buildRecordName(record: RecordItem): string {
  if (record.displayName?.trim()) {
    return record.displayName.trim();
  }

  const emoji = EMOJIS[hashToIndex(record.id, EMOJIS.length)];
  return `${resolveCaptureKind(record)}-${emoji}`;
}

export function buildPanelName(seedTime: number = Date.now()): string {
  const seed = `panel-${seedTime}`;
  const emoji = EMOJIS[hashToIndex(seed, EMOJIS.length)];
  return `${formatTime(seedTime)}-控制面板-${emoji}`;
}
