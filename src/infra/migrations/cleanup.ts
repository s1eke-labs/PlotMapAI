import type { CleanupMigration } from './types';

import { storage } from '@infra/storage';

const LEGACY_THEME_CACHE_KEY = 'theme';
const LEGACY_READER_THEME_CACHE_KEY = 'readerTheme';
const LEGACY_READER_PAGE_TURN_MODE_CACHE_KEY = 'readerPageTurnMode';
const LEGACY_READER_FONT_SIZE_CACHE_KEY = 'readerFontSize';
const LEGACY_READER_LINE_SPACING_CACHE_KEY = 'readerLineSpacing';
const LEGACY_READER_PARAGRAPH_SPACING_CACHE_KEY = 'readerParagraphSpacing';

async function clearLegacyPreferenceKeys(): Promise<void> {
  storage.cache.remove(LEGACY_THEME_CACHE_KEY);
  storage.cache.remove(LEGACY_READER_THEME_CACHE_KEY);
  storage.cache.remove(LEGACY_READER_PAGE_TURN_MODE_CACHE_KEY);
  storage.cache.remove(LEGACY_READER_FONT_SIZE_CACHE_KEY);
  storage.cache.remove(LEGACY_READER_LINE_SPACING_CACHE_KEY);
  storage.cache.remove(LEGACY_READER_PARAGRAPH_SPACING_CACHE_KEY);
}

export const CLEANUP_MIGRATIONS: readonly CleanupMigration[] = [{
  version: 1,
  scope: 'cleanup',
  description: 'Remove legacy theme and split reader preference cache keys that are no longer read.',
  retireWhen: {
    condition: 'Remove after unified reader preferences have been available across supported clients.',
  },
  run: clearLegacyPreferenceKeys,
}] as const;
