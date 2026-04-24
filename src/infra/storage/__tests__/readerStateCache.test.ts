import { beforeEach, describe, expect, it } from 'vitest';

import { CACHE_KEYS, storage } from '@infra/storage';

import {
  clearAllReaderBootstrapSnapshots,
  clearReaderBootstrapSnapshot,
} from '../readerStateCache';

describe('readerStateCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears the targeted bootstrap cache key', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(7), { version: 2, state: {} });
    storage.cache.set(CACHE_KEYS.readerBootstrap(8), { version: 2, state: {} });

    clearReaderBootstrapSnapshot(7);

    expect(storage.cache.getJson(CACHE_KEYS.readerBootstrap(7))).toBeNull();
    expect(storage.cache.getJson(CACHE_KEYS.readerBootstrap(8))).toEqual({
      version: 2,
      state: {},
    });
  });

  it('clears all retired bootstrap cache keys', () => {
    storage.cache.set(CACHE_KEYS.readerBootstrap(7), { version: 2, state: {} });
    storage.cache.set(CACHE_KEYS.readerBootstrap(8), { version: 3, progress: {} });
    storage.cache.set(CACHE_KEYS.readerTraceEnabled, true);

    clearAllReaderBootstrapSnapshots();

    expect(storage.cache.getJson(CACHE_KEYS.readerBootstrap(7))).toBeNull();
    expect(storage.cache.getJson(CACHE_KEYS.readerBootstrap(8))).toBeNull();
    expect(storage.cache.getJson(CACHE_KEYS.readerTraceEnabled)).toBe(true);
  });
});
