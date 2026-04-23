import { useState } from 'react';
import type { MouseEvent } from 'react';
import { hasSystemSuggestionTag, stripSystemSuggestionTags } from '../../../../shared/classificationSuggestion';
import { buildRecordTitle } from '../../../naming';
import type { DashboardRecordActions, DashboardRecordItem } from './dashboard.types';
import { isFavoriteRecord } from './favoriteTag';
import { getUseCaseCardGlowStyle } from './useCasePalette';
import { getRecordContentBadge } from '../modern/ModernRecordCardParts';

/**
 * Shared state and derived values used by all four ModernRecordCard* components.
 *
 * Each card component may define its own `busy` type union and `run` wrapper,
 * so those are intentionally NOT extracted here to avoid unsafe type widening.
 */
export function useRecordCardState(
  item: DashboardRecordItem,
  selected: boolean,
  onSelect: (recordId: string, additive: boolean) => void,
  actions: DashboardRecordActions
) {
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(item.displayName ?? '');

  // --- derived values (identical across all four card components) ---
  const favorite = isFavoriteRecord(item);
  const cardGlowStyle = !selected && !isEditing ? getUseCaseCardGlowStyle(item.useCase) : undefined;
  const isSystemSuggested = hasSystemSuggestionTag(item.tags);
  const visibleTags = stripSystemSuggestionTags(item.tags);
  const title = buildRecordTitle(item);
  const contentBadge = getRecordContentBadge(item.type, item.contentSubtype);

  // --- onCardClick (identical across all four card components) ---
  const onCardClick = (event: MouseEvent<HTMLElement>) => {
    void actions.onTouchRecord(item.id);
    onSelect(item.id, event.metaKey || event.ctrlKey);
  };

  return {
    hovered,
    setHovered,
    isEditing,
    setIsEditing,
    editDisplayName,
    setEditDisplayName,
    favorite,
    cardGlowStyle,
    isSystemSuggested,
    visibleTags,
    title,
    contentBadge,
    onCardClick
  };
}
