import type { DashboardRecordTab, DashboardSizePreset, RecordItem, RecordUseCase } from '../../../../shared/types';
import { normalizeText } from './dashboardUtils';

const SIZE_PRESET_ORDER: DashboardSizePreset[] = ['small', 'medium', 'large'];

export function getNextSizePreset(current: DashboardSizePreset): DashboardSizePreset {
  const currentIndex = SIZE_PRESET_ORDER.indexOf(current);
  if (currentIndex < 0) {
    return 'small';
  }

  return SIZE_PRESET_ORDER[(currentIndex + 1) % SIZE_PRESET_ORDER.length];
}

export function getSizePresetLabel(preset: DashboardSizePreset): 'S' | 'M' | 'L' {
  if (preset === 'small') {
    return 'S';
  }
  if (preset === 'medium') {
    return 'M';
  }
  return 'L';
}

export function getRecordUseCase(item: RecordItem): RecordUseCase {
  if (item.useCase) {
    return item.useCase;
  }

  if (item.category === 'flow') {
    return 'flow';
  }

  return 'unclassified';
}

function computeRecordRank(item: RecordItem, query: string): number | null {
  if (!query) {
    return 5;
  }

  const displayName = normalizeText(item.displayName);
  if (displayName && displayName === query) {
    return 1;
  }

  const content = normalizeText(`${item.previewText ?? ''}\n${item.ocrText ?? ''}\n${item.path}\n${item.id}`);
  if (content.startsWith(query)) {
    return 2;
  }

  if (content.includes(query)) {
    return 3;
  }

  if (item.tags.some((tag) => normalizeText(tag).includes(query))) {
    return 4;
  }

  return null;
}

export function filterDashboardRecords(
  records: RecordItem[],
  activeTab: DashboardRecordTab,
  keyword: string
): RecordItem[] {
  const query = normalizeText(keyword);

  return records
    .map((item) => {
      if (activeTab !== 'all' && getRecordUseCase(item) !== activeTab) {
        return null;
      }

      const rank = computeRecordRank(item, query);
      if (rank === null) {
        return null;
      }

      return {
        item,
        rank
      };
    })
    .filter((entry): entry is { item: RecordItem; rank: number } => entry !== null)
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      if (b.item.createdAt !== a.item.createdAt) {
        return b.item.createdAt - a.item.createdAt;
      }
      return a.item.id.localeCompare(b.item.id);
    })
    .map((entry) => entry.item);
}
