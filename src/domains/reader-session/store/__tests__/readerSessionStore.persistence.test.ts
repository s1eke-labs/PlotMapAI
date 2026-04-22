import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as debug from '@shared/debug';
import { db } from '@infra/db';

import {
  flushPersistence,
  getReaderSessionSnapshot,
  hydrateSession,
  persistStoredReaderState,
  resetReaderSessionStoreForTests,
} from '../readerSessionStore';
import * as repository from '../../progress-core/repository';

function createStoredCanonical(chapterIndex: number) {
  return {
    canonical: {
      chapterIndex,
      edge: 'start' as const,
    },
  };
}

describe('readerSessionStore persistence', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('enters error state and throws when DB hydration read fails', async () => {
    vi.spyOn(repository, 'readReaderProgressSnapshot').mockRejectedValueOnce(new Error('db read failed'));

    await expect(hydrateSession(1, { pageTurnMode: 'scroll' })).rejects.toThrow('db read failed');

    const snapshot = getReaderSessionSnapshot();
    expect(snapshot.restoreStatus).toBe('error');
    expect(snapshot.persistenceStatus).toBe('degraded');
    expect(snapshot.lastPersistenceFailure).not.toBeNull();
    expect(snapshot.chapterIndex).toBe(0);
  });

  it('returns default state when DB has no durable record', async () => {
    vi.spyOn(repository, 'readReaderProgressSnapshot').mockResolvedValueOnce(null);

    const hydratedState = await hydrateSession(7, { pageTurnMode: 'scroll' });

    expect(hydratedState).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: undefined,
    });
    expect(getReaderSessionSnapshot().chapterIndex).toBe(0);
  });

  it('hydrates the session from durable Dexie progress', async () => {
    vi.spyOn(repository, 'readReaderProgressSnapshot').mockResolvedValueOnce({
      novelId: 9,
      revision: 5,
      snapshot: {
        mode: 'paged',
        activeChapterIndex: 2,
        position: {
          type: 'locator',
          locator: {
            chapterIndex: 2,
            blockIndex: 3,
            kind: 'text',
            pageIndex: 7,
          },
        },
        projections: {
          paged: {
            pageIndex: 7,
          },
          scroll: {
            chapterProgress: 0.65,
          },
        },
        captureQuality: 'precise',
      },
      updatedAt: '2026-04-12T00:00:00.000Z',
    });

    const hydratedState = await hydrateSession(9, { pageTurnMode: 'scroll' });

    expect(hydratedState).toEqual({
      canonical: {
        chapterIndex: 2,
        blockIndex: 3,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.65,
        contentMode: 'paged',
        pageIndex: 7,
        viewMode: 'original',
      },
    });
    expect(getReaderSessionSnapshot()).toMatchObject({
      chapterIndex: 2,
      lastContentMode: 'paged',
      mode: 'paged',
    });
  });

  it('marks persistence degraded when DB write fails without rolling back UI state', async () => {
    vi.spyOn(repository, 'readReaderProgressSnapshot').mockResolvedValueOnce(null);
    const replaceSpy = vi
      .spyOn(repository, 'replaceReaderProgressSnapshot')
      .mockRejectedValueOnce(new Error('db write failed'));
    const reportErrorSpy = vi.spyOn(debug, 'reportAppError');

    await hydrateSession(3, { pageTurnMode: 'scroll' });

    persistStoredReaderState(createStoredCanonical(2), {
      flush: true,
      persistRemote: true,
    });
    await flushPersistence();

    const snapshot = getReaderSessionSnapshot();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(snapshot.chapterIndex).toBe(2);
    expect(snapshot.persistenceStatus).toBe('degraded');
    expect(snapshot.lastPersistenceFailure).not.toBeNull();
    expect(reportErrorSpy).toHaveBeenCalled();
  });

  it('recovers persistence health after a later successful DB write', async () => {
    vi.spyOn(repository, 'readReaderProgressSnapshot').mockResolvedValueOnce(null);
    const originalReplaceReadingProgress = repository.replaceReaderProgressSnapshot;
    const replaceSpy = vi
      .spyOn(repository, 'replaceReaderProgressSnapshot')
      .mockRejectedValueOnce(new Error('first write failed'))
      .mockImplementationOnce(originalReplaceReadingProgress);

    await hydrateSession(5, { pageTurnMode: 'scroll' });

    persistStoredReaderState(createStoredCanonical(1), {
      flush: true,
      persistRemote: true,
    });
    await flushPersistence();

    expect(getReaderSessionSnapshot().persistenceStatus).toBe('degraded');

    persistStoredReaderState(createStoredCanonical(6), {
      flush: true,
      persistRemote: true,
    });
    await flushPersistence();

    const snapshot = getReaderSessionSnapshot();
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    expect(snapshot.persistenceStatus).toBe('healthy');
    expect(snapshot.lastPersistenceFailure).toBeNull();
    await expect(repository.readReaderProgressSnapshot(5)).resolves.toEqual({
      novelId: 5,
      revision: 1,
      snapshot: {
        mode: 'scroll',
        activeChapterIndex: 6,
        position: {
          type: 'chapter-edge',
          chapterIndex: 6,
          edge: 'start',
        },
        projections: undefined,
        captureQuality: 'approximate',
      },
      updatedAt: expect.any(String),
    });
  });
});
