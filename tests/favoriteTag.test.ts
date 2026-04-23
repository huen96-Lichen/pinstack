import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFavoriteTags, isFavoriteRecord } from '../src/renderer/features/dashboard/shared/favoriteTag';

test('isFavoriteRecord should detect favorite tag case-insensitively', () => {
  assert.equal(isFavoriteRecord({ tags: ['Prompt', 'Favorite'] }), true);
  assert.equal(isFavoriteRecord({ tags: ['prompt'] }), false);
});

test('buildFavoriteTags should add favorite once and remove it cleanly', () => {
  assert.deepEqual(buildFavoriteTags(['Prompt', 'favorite'], true), ['prompt', 'favorite']);
  assert.deepEqual(buildFavoriteTags(['prompt', 'favorite', 'fix'], false), ['prompt', 'fix']);
});
