import type { AiRuntimeStatus, AppSettings } from '../../../../shared/types';

// ---------------------------------------------------------------------------
// formatShortcutLabel
// ---------------------------------------------------------------------------

export function formatShortcutLabel(value: string): string {
  if (!value.trim()) {
    return '未设置';
  }

  return value
    .replace(/CommandOrControl/gi, '⌘ / Ctrl')
    .replace(/Command/gi, '⌘')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Alt/gi, '⌥')
    .replace(/Shift/gi, '⇧')
    .replace(/\+/g, ' + ');
}

// ---------------------------------------------------------------------------
// AI runtime status labels
// ---------------------------------------------------------------------------

export function getAiConnectionLabel(status: AiRuntimeStatus | null): string {
  if (!status) {
    return '未检查';
  }
  if (status.connectionState === 'connected') {
    return '已连接';
  }
  if (status.connectionState === 'model_missing') {
    return '模型缺失';
  }
  if (status.connectionState === 'timeout') {
    return '超时';
  }
  if (status.connectionState === 'error') {
    return '错误';
  }
  return '不可用';
}

export function getAiResponseModeLabel(status: AiRuntimeStatus | null): string {
  if (!status) {
    return '未检查';
  }
  if (status.responseMode === 'live') {
    return '本地实时';
  }
  if (status.responseMode === 'degraded') {
    return '降级';
  }
  return '不可用';
}

// ---------------------------------------------------------------------------
// computeShowAiEntry
// ---------------------------------------------------------------------------

export function computeShowAiEntry(
  entryVisibility: AppSettings['aiHub']['entryVisibility'],
  aiEnabled: boolean
): boolean {
  return entryVisibility === 'always' || (entryVisibility === 'enabled_only' && aiEnabled);
}

// ---------------------------------------------------------------------------
// normalizeText
// ---------------------------------------------------------------------------

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// emitSettingsUpdated
// ---------------------------------------------------------------------------

export function emitSettingsUpdated(): void {
  window.dispatchEvent(new CustomEvent('pinstack-settings-updated'));
}

// ---------------------------------------------------------------------------
// DEFAULT_PERSONA_SLOTS
// ---------------------------------------------------------------------------

export const DEFAULT_PERSONA_SLOTS: AppSettings['aiHub']['personaSlots'] = [
  {
    id: 'persona_1',
    enabled: true,
    templateId: 'productivity-default',
    title: '默认效率助手',
    markdown: '# PinStack AI 助手\n你是整理助手，优先给出可执行、简洁、可回滚的建议。'
  },
  {
    id: 'persona_2',
    enabled: false,
    templateId: 'taxonomy-strict',
    title: '分类严格模式',
    markdown: '# 分类规则\n优先使用既有分类字典，不要发明新分类。'
  },
  {
    id: 'persona_3',
    enabled: false,
    templateId: 'naming-strict',
    title: '命名严格模式',
    markdown: '# 命名规则\n标题必须简短清晰，遵循命名模板，避免夸张措辞。'
  }
];
