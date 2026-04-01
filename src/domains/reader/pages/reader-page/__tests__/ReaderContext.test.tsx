import type { ReactNode } from 'react';
import type { StoredReaderState } from '../../../hooks/useReaderStatePersistence';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readerApiMock = vi.hoisted(() => ({
  getProgress: vi.fn(),
  saveProgress: vi.fn(async () => ({ message: 'saved' })),
}));

const readerStatePersistenceMock = vi.hoisted(() => ({
  latestReaderStateRef: { current: {} satisfies StoredReaderState },
  hasUserInteractedRef: { current: false },
  markUserInteracted: vi.fn(),
  persistReaderState: vi.fn(),
  flushReaderState: vi.fn(async () => undefined),
  loadPersistedReaderState: vi.fn(async (): Promise<StoredReaderState> => ({})),
  initialStoredState: null,
}));

vi.mock('../../../api/readerApi', () => ({
  readerApi: readerApiMock,
}));

vi.mock('../../../hooks/useReaderStatePersistence', () => ({
  useReaderStatePersistence: vi.fn(() => readerStatePersistenceMock),
}));

import { resetReaderSessionStoreForTests } from '../../../hooks/sessionStore';
import { ReaderProvider, useReaderContext } from '../ReaderContext';

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReaderProvider novelId={1}>
        {children}
      </ReaderProvider>
    );
  };
}

describe('ReaderProvider', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
    vi.clearAllMocks();
    readerStatePersistenceMock.latestReaderStateRef.current = {};
    readerStatePersistenceMock.hasUserInteractedRef.current = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives view mode and paged mode from the shared session state', () => {
    const { result } = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mode).toBe('scroll');
    expect(result.current.viewMode).toBe('original');
    expect(result.current.isPagedMode).toBe(false);

    act(() => {
      result.current.setMode('paged');
    });

    expect(result.current.mode).toBe('paged');
    expect(result.current.viewMode).toBe('original');
    expect(result.current.isPagedMode).toBe(true);

    act(() => {
      result.current.setMode('summary');
    });

    expect(result.current.mode).toBe('summary');
    expect(result.current.viewMode).toBe('summary');
    expect(result.current.isPagedMode).toBe(false);
  });

  it('updates chapter index through the shared setter without scheduling remote persistence', () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(),
    });

    expect(result.current.chapterIndex).toBe(0);

    act(() => {
      result.current.setChapterIndex((currentChapterIndex) => currentChapterIndex + 2);
      result.current.setMode('paged');
      vi.runAllTimers();
    });

    expect(result.current.chapterIndex).toBe(2);
    expect(result.current.mode).toBe('paged');
    expect(readerApiMock.saveProgress).not.toHaveBeenCalled();
  });

  it('keeps orchestration refs stable across rerenders', () => {
    const { result } = renderHook(() => useReaderContext(), {
      wrapper: createWrapper(),
    });

    const {
      chapterChangeSourceRef,
      pagedStateRef,
      restoreSettledHandlerRef,
      suppressScrollSyncTemporarilyRef,
    } = result.current;

    act(() => {
      result.current.chapterChangeSourceRef.current = 'navigation';
      result.current.pagedStateRef.current = { pageCount: 4, pageIndex: 2 };
      result.current.restoreSettledHandlerRef.current('completed');
      result.current.suppressScrollSyncTemporarilyRef.current();
      result.current.setMode('summary');
    });

    expect(result.current.chapterChangeSourceRef).toBe(chapterChangeSourceRef);
    expect(result.current.chapterChangeSourceRef.current).toBe('navigation');
    expect(result.current.pagedStateRef).toBe(pagedStateRef);
    expect(result.current.pagedStateRef.current).toEqual({ pageCount: 4, pageIndex: 2 });
    expect(result.current.restoreSettledHandlerRef).toBe(restoreSettledHandlerRef);
    expect(result.current.suppressScrollSyncTemporarilyRef).toBe(suppressScrollSyncTemporarilyRef);
  });
});
