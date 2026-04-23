export const SYSTEM_SUGGESTION_TAG = 'sys:suggested';

export function hasSystemSuggestionTag(tags: readonly string[]): boolean {
  return tags.some((tag) => tag.trim().toLowerCase() === SYSTEM_SUGGESTION_TAG);
}

export function stripSystemSuggestionTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => tag.trim().toLowerCase() !== SYSTEM_SUGGESTION_TAG);
}

