import { CACHE_KEYS, storage } from './index';

export interface ReaderStateCacheSnapshot {
  chapterIndex?: unknown;
  mode?: unknown;
  chapterProgress?: unknown;
  lastContentMode?: unknown;
  locator?: unknown;
  readerTheme?: unknown;
  pageTurnMode?: unknown;
  appTheme?: unknown;
  fontSize?: unknown;
  lineSpacing?: unknown;
  paragraphSpacing?: unknown;
}

export function readReaderStateCacheSnapshot(
  novelId: number,
): ReaderStateCacheSnapshot | null {
  if (!novelId) {
    return null;
  }

  return storage.cache.getJson<ReaderStateCacheSnapshot>(CACHE_KEYS.readerState(novelId));
}

export function mergeReaderStateCacheSnapshot(
  novelId: number,
  partial: Partial<ReaderStateCacheSnapshot>,
): void {
  if (!novelId) {
    return;
  }

  const current = readReaderStateCacheSnapshot(novelId) ?? {};
  storage.cache.set(CACHE_KEYS.readerState(novelId), {
    ...current,
    ...partial,
  });
}

export function replaceReaderStateCacheSnapshot(
  novelId: number,
  nextSnapshot: Partial<ReaderStateCacheSnapshot>,
): void {
  if (!novelId) {
    return;
  }

  storage.cache.set(CACHE_KEYS.readerState(novelId), nextSnapshot);
}
