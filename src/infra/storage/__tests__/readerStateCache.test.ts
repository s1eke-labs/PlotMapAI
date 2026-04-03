import { beforeEach, describe, expect, it } from 'vitest';

import { CACHE_KEYS, storage } from '@infra/storage';

import {
  clearReaderBootstrapSnapshot,
  readReaderBootstrapSnapshot,
  writeReaderBootstrapSnapshot,
} from '../readerStateCache';

describe('readerStateCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a typed reader bootstrap snapshot', () => {
    writeReaderBootstrapSnapshot(7, {
      chapterIndex: 3,
      mode: 'summary',
      chapterProgress: 0.4,
      lastContentMode: 'paged',
    });

    expect(readReaderBootstrapSnapshot(7)).toEqual({
      version: 1,
      state: {
        chapterIndex: 3,
        mode: 'summary',
        chapterProgress: 0.4,
        lastContentMode: 'paged',
        locator: undefined,
      },
    });
  });

  it('treats an old mixed reader-state snapshot as invalid', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(7), {
      chapterIndex: 3,
      mode: 'summary',
      readerTheme: 'night',
    });

    expect(readReaderBootstrapSnapshot(7)).toBeNull();
  });

  it('treats a snapshot with an invalid state schema as invalid', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(7), {
      version: 1,
      state: {
        chapterIndex: '3',
        mode: 'summary',
      },
    });

    expect(readReaderBootstrapSnapshot(7)).toBeNull();
  });

  it('clears the typed bootstrap snapshot', () => {
    writeReaderBootstrapSnapshot(7, { chapterIndex: 2, mode: 'scroll' });
    clearReaderBootstrapSnapshot(7);

    expect(readReaderBootstrapSnapshot(7)).toBeNull();
  });
});
