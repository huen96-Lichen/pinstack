import type { RecordItem } from '../../../../shared/types';

export const FAVORITE_TAG = 'favorite';

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function isFavoriteRecord(record: Pick<RecordItem, 'tags'>): boolean {
  return record.tags.some((tag) => normalizeTag(tag) === FAVORITE_TAG);
}

export function buildFavoriteTags(tags: string[], favorite: boolean): string[] {
  const normalized = [...new Set(tags.map(normalizeTag).filter(Boolean))];
  const withoutFavorite = normalized.filter((tag) => tag !== FAVORITE_TAG);
  if (!favorite) {
    return withoutFavorite;
  }
  return [...withoutFavorite, FAVORITE_TAG];
}
