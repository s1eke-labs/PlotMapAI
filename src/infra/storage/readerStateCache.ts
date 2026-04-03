import type { StoredReaderState } from '@shared/contracts/reader';

import {
  buildStoredReaderState,
  clampChapterProgress,
  sanitizeLocator,
} from '@shared/utils/readerStoredState';

import { CACHE_KEYS, storage } from './index';

const READER_BOOTSTRAP_SNAPSHOT_VERSION = 1 as const;

export interface ReaderBootstrapSnapshot {
  version: typeof READER_BOOTSTRAP_SNAPSHOT_VERSION;
  state: StoredReaderState;
}

function parseStoredReaderBootstrapState(raw: unknown): StoredReaderState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  if (
    typeof parsed.chapterIndex !== 'number'
    || (parsed.mode !== 'scroll' && parsed.mode !== 'paged' && parsed.mode !== 'summary')
    || (parsed.lastContentMode !== 'scroll' && parsed.lastContentMode !== 'paged')
  ) {
    return null;
  }

  if (
    parsed.chapterProgress !== undefined
    && (typeof parsed.chapterProgress !== 'number' || Number.isNaN(parsed.chapterProgress))
  ) {
    return null;
  }

  if (parsed.mode !== 'summary' && parsed.chapterProgress !== undefined) {
    return null;
  }

  const locator = parsed.locator === undefined
    ? undefined
    : sanitizeLocator(parsed.locator);
  if (parsed.locator !== undefined && !locator) {
    return null;
  }

  return buildStoredReaderState({
    chapterIndex: parsed.chapterIndex,
    mode: parsed.mode,
    chapterProgress: clampChapterProgress(parsed.chapterProgress),
    lastContentMode: parsed.lastContentMode,
    locator,
  });
}

function parseReaderBootstrapSnapshot(raw: unknown): ReaderBootstrapSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  if (parsed.version !== READER_BOOTSTRAP_SNAPSHOT_VERSION) {
    return null;
  }

  const state = parseStoredReaderBootstrapState(parsed.state);
  if (!state) {
    return null;
  }

  return {
    version: READER_BOOTSTRAP_SNAPSHOT_VERSION,
    state,
  };
}

export function readReaderBootstrapSnapshot(
  novelId: number,
): ReaderBootstrapSnapshot | null {
  if (!novelId) {
    return null;
  }

  return parseReaderBootstrapSnapshot(
    storage.cache.getJson<unknown>(CACHE_KEYS.readerBootstrap(novelId)),
  );
}

export function writeReaderBootstrapSnapshot(
  novelId: number,
  state: StoredReaderState,
): void {
  if (!novelId) {
    return;
  }

  storage.cache.set(CACHE_KEYS.readerBootstrap(novelId), {
    version: READER_BOOTSTRAP_SNAPSHOT_VERSION,
    state: buildStoredReaderState(state),
  } satisfies ReaderBootstrapSnapshot);
}

export function clearReaderBootstrapSnapshot(novelId: number): void {
  if (!novelId) {
    return;
  }

  storage.cache.remove(CACHE_KEYS.readerBootstrap(novelId));
}
