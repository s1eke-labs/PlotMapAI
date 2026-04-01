import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useReaderLifecycleController } from '../useReaderLifecycleController';
import type { ReaderHydrateDataResult, ReaderLoadActiveChapterResult } from '../useReaderChapterData';
import type { ReaderRestoreTarget, StoredReaderState } from '../useReaderStatePersistence';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createStoredState(overrides: StoredReaderState = {}): StoredReaderState {
  return {
    chapterIndex: 1,
    viewMode: 'original',
    isTwoColumn: false,
    ...overrides,
  };
}

function createRestoreTarget(overrides: Partial<ReaderRestoreTarget> = {}): ReaderRestoreTarget {
  return {
    chapterIndex: 1,
    viewMode: 'original',
    isTwoColumn: false,
    chapterProgress: 0.4,
    ...overrides,
  };
}

function createChapter(index: number) {
  return {
    index,
    title: `Chapter ${index + 1}`,
    wordCount: 100,
  };
}

function createChapterContent(index: number) {
  return {
    ...createChapter(index),
    content: `content-${index}`,
    totalChapters: 10,
    hasPrev: index > 0,
    hasNext: index < 9,
  };
}

function createProps(overrides: Partial<Parameters<typeof useReaderLifecycleController>[0]> = {}) {
  const hydrateReaderData = vi.fn<() => Promise<ReaderHydrateDataResult>>(async () => ({
    hasChapters: true,
    initialRestoreTarget: null,
    resolvedState: createStoredState(),
    storedState: createStoredState(),
  }));
  const loadActiveChapter = vi.fn<() => Promise<ReaderLoadActiveChapterResult>>(async () => ({
    navigationRestoreTarget: null,
  }));
  const resetReaderContent = vi.fn();
  const clearPendingRestoreTarget = vi.fn();
  const setPendingRestoreTarget = vi.fn();
  const startRestoreMaskForTarget = vi.fn();
  const stopRestoreMask = vi.fn();

  return {
    novelId: 1,
    chapterIndex: 1,
    viewMode: 'original' as const,
    isTwoColumn: false,
    isPagedMode: false,
    currentPagedLayoutChapterIndex: null,
    chapterData: {
      chapters: [createChapter(1)],
      currentChapter: null,
      loadingMessage: null,
      readerError: null,
      hydrateReaderData,
      loadActiveChapter,
      resetReaderContent,
    },
    restoreFlow: {
      pendingRestoreTarget: null,
      clearPendingRestoreTarget,
      setPendingRestoreTarget,
      startRestoreMaskForTarget,
      stopRestoreMask,
    },
    ...overrides,
  };
}

describe('useReaderLifecycleController', () => {
  it('drives hydration into restore and returns to ready when restore settles', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const loadDeferred = createDeferred<ReaderLoadActiveChapterResult>();
    const restoreTarget = createRestoreTarget({
      chapterIndex: 2,
      chapterProgress: 0.55,
    });
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(() => loadDeferred.promise);
    const setPendingRestoreTarget = vi.fn();
    const startRestoreMaskForTarget = vi.fn();

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
        restoreFlow: {
          pendingRestoreTarget: null,
          clearPendingRestoreTarget: vi.fn(),
          setPendingRestoreTarget,
          startRestoreMaskForTarget,
          stopRestoreMask: vi.fn(),
        },
      }),
    });

    expect(result.current.lifecycleStatus).toBe('hydrating');
    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('loading-chapters');
    });

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: restoreTarget,
        resolvedState: createStoredState({ chapterIndex: 2 }),
        storedState: createStoredState({ chapterIndex: 2 }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 2,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: null,
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
      restoreFlow: {
        pendingRestoreTarget: null,
        clearPendingRestoreTarget: vi.fn(),
        setPendingRestoreTarget,
        startRestoreMaskForTarget,
        stopRestoreMask: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(loadActiveChapter).toHaveBeenCalledWith({
        chapterIndex: 2,
        viewMode: 'original',
        isTwoColumn: false,
        isPagedMode: false,
      });
    });

    await act(async () => {
      loadDeferred.resolve({ navigationRestoreTarget: null });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 2,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: createChapterContent(2),
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
      restoreFlow: {
        pendingRestoreTarget: restoreTarget,
        clearPendingRestoreTarget: vi.fn(),
        setPendingRestoreTarget,
        startRestoreMaskForTarget,
        stopRestoreMask: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('restoring-position');
    });
    expect(setPendingRestoreTarget).toHaveBeenLastCalledWith(restoreTarget, { force: true });
    expect(startRestoreMaskForTarget).toHaveBeenLastCalledWith(restoreTarget);

    act(() => {
      result.current.handleRestoreSettled('completed');
    });

    expect(result.current.lifecycleStatus).toBe('ready');
  });

  it('uses hydrated load params even before session props catch up', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(async () => ({
      navigationRestoreTarget: null,
    }));

    const { rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        isTwoColumn: false,
        isPagedMode: false,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
    });

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: null,
        resolvedState: createStoredState({
          chapterIndex: 2,
          viewMode: 'original',
          isTwoColumn: true,
        }),
        storedState: createStoredState({
          chapterIndex: 2,
          viewMode: 'original',
          isTwoColumn: true,
        }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 0,
      isTwoColumn: false,
      isPagedMode: false,
      chapterData: {
        chapters: [createChapter(2)],
        currentChapter: null,
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(loadActiveChapter).toHaveBeenCalledWith({
        chapterIndex: 2,
        viewMode: 'original',
        isTwoColumn: true,
        isPagedMode: true,
      });
    });
  });

  it('goes straight to ready when the loaded chapter has no restore target', async () => {
    const hydrateDeferred = createDeferred<ReaderHydrateDataResult>();
    const loadDeferred = createDeferred<ReaderLoadActiveChapterResult>();
    const hydrateReaderData = vi.fn(() => hydrateDeferred.promise);
    const loadActiveChapter = vi.fn(() => loadDeferred.promise);

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: 'loading',
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('loading-chapters');
    });

    await act(async () => {
      hydrateDeferred.resolve({
        hasChapters: true,
        initialRestoreTarget: null,
        resolvedState: createStoredState({ chapterIndex: 3 }),
        storedState: createStoredState({ chapterIndex: 3 }),
      });
      await Promise.resolve();
    });

    rerender(createProps({
      chapterIndex: 3,
      chapterData: {
        chapters: [createChapter(3)],
        currentChapter: createChapterContent(3),
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
    }));

    await act(async () => {
      loadDeferred.resolve({ navigationRestoreTarget: null });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('ready');
    });
  });

  it('returns ready immediately when hydration finds no chapters', async () => {
    const hydrateReaderData = vi.fn(async () => ({
      hasChapters: false,
      initialRestoreTarget: null,
      resolvedState: null,
      storedState: createStoredState({ chapterIndex: 0 }),
    }));
    const loadActiveChapter = vi.fn(async () => ({
      navigationRestoreTarget: null,
    }));

    const { result } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: null,
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
    });

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('ready');
    });
    expect(loadActiveChapter).not.toHaveBeenCalled();
  });

  it('surfaces errors when the active chapter load fails', async () => {
    const hydrateReaderData = vi.fn(async () => ({
      hasChapters: true,
      initialRestoreTarget: null,
      resolvedState: createStoredState({ chapterIndex: 4 }),
      storedState: createStoredState({ chapterIndex: 4 }),
    }));
    const loadError = new Error('chapter load failed');
    const loadActiveChapter = vi.fn(async () => {
      throw loadError;
    });

    const { result, rerender } = renderHook(useReaderLifecycleController, {
      initialProps: createProps({
        chapterIndex: 0,
        chapterData: {
          chapters: [],
          currentChapter: null,
          loadingMessage: null,
          readerError: null,
          hydrateReaderData,
          loadActiveChapter,
          resetReaderContent: vi.fn(),
        },
      }),
    });

    rerender(createProps({
      chapterIndex: 4,
      chapterData: {
        chapters: [createChapter(4)],
        currentChapter: null,
        loadingMessage: null,
        readerError: null,
        hydrateReaderData,
        loadActiveChapter,
        resetReaderContent: vi.fn(),
      },
    }));

    await waitFor(() => {
      expect(result.current.lifecycleStatus).toBe('error');
    });
    expect(result.current.readerError).toBe(loadError);
  });
});
