import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReaderRestoreFlow } from '../useReaderRestoreFlow';
import type { ScrollModeAnchor } from '../useScrollModeChapters';
import type { ReaderRestoreTarget, StoredReaderState } from '../useReaderStatePersistence';
import {
  getReaderSessionSnapshot,
  resetReaderSessionStoreForTests,
} from '../sessionStore';
import {
  ReaderPageContextProvider,
  type ReaderPageContextValue,
} from '../../pages/reader-page/ReaderPageContext';

function makeContainer({
  scrollTop = 0,
  scrollHeight = 1000,
  clientHeight = 500,
}: {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
} = {}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  return element;
}

function createStoredState(overrides: StoredReaderState = {}): StoredReaderState {
  return {
    chapterIndex: 5,
    viewMode: 'original',
    isTwoColumn: false,
    chapterProgress: 0.4,
    ...overrides,
  };
}

function createRestoreTarget(overrides: Partial<ReaderRestoreTarget> = {}): ReaderRestoreTarget {
  return {
    chapterIndex: 5,
    viewMode: 'original',
    isTwoColumn: false,
    chapterProgress: 0.4,
    ...overrides,
  };
}

function createReaderPageContextValue(
  overrides: Partial<ReaderPageContextValue> = {},
): ReaderPageContextValue {
  return {
    novelId: 1,
    latestReaderStateRef: { current: createStoredState() },
    hasUserInteractedRef: { current: false },
    markUserInteracted: vi.fn(),
    persistReaderState: vi.fn(),
    loadPersistedReaderState: vi.fn(async () => createStoredState()),
    contentRef: { current: makeContainer() },
    pagedViewportRef: { current: null },
    pageTargetRef: { current: null },
    wheelDeltaRef: { current: 0 },
    pageTurnLockedRef: { current: false },
    chapterCacheRef: { current: new Map() },
    scrollChapterElementsBridgeRef: { current: new Map() },
    scrollChapterBodyElementsBridgeRef: { current: new Map() },
    getCurrentAnchorRef: { current: () => null },
    handleScrollModeScrollRef: { current: vi.fn() },
    readingAnchorHandlerRef: { current: vi.fn() },
    getCurrentOriginalLocatorRef: { current: () => null },
    getCurrentPagedLocatorRef: { current: () => null },
    resolveScrollLocatorOffsetRef: { current: () => null },
    ...overrides,
  };
}

describe('useReaderRestoreFlow', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
  });

  it('reuses the shared restorable-position semantics for non-forced pending restore state', () => {
    const contextValue = createReaderPageContextValue();

    const { result } = renderHook(() => useReaderRestoreFlow({
      chapterIndex: 5,
      setChapterIndex: vi.fn(),
      viewMode: 'original',
      setViewMode: vi.fn(),
      isTwoColumn: false,
      setIsTwoColumn: vi.fn(),
      isPagedMode: false,
      pageIndex: 0,
      pageCount: 1,
      currentChapter: {
        index: 5,
        title: 'Chapter 6',
        content: 'content',
        wordCount: 100,
        totalChapters: 10,
        hasPrev: true,
        hasNext: true,
      },
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        ReaderPageContextProvider({ value: contextValue, children })
      ),
    });

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        chapterProgress: 0,
        locatorVersion: undefined,
        locator: undefined,
        scrollPosition: undefined,
      }));
    });

    expect(getReaderSessionSnapshot().pendingRestoreTarget).toBeNull();

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        chapterProgress: 0.4,
        locatorVersion: undefined,
        locator: undefined,
        scrollPosition: undefined,
      }));
    });

    expect(getReaderSessionSnapshot().pendingRestoreTarget).toMatchObject({
      chapterIndex: 5,
      chapterProgress: 0.4,
      viewMode: 'original',
      isTwoColumn: false,
    });
  });

  it('keeps forced chapter-start restore targets so navigation restore still runs', () => {
    const contextValue = createReaderPageContextValue();

    const { result } = renderHook(() => useReaderRestoreFlow({
      chapterIndex: 5,
      setChapterIndex: vi.fn(),
      viewMode: 'original',
      setViewMode: vi.fn(),
      isTwoColumn: false,
      setIsTwoColumn: vi.fn(),
      isPagedMode: false,
      pageIndex: 0,
      pageCount: 1,
      currentChapter: {
        index: 5,
        title: 'Chapter 6',
        content: 'content',
        wordCount: 100,
        totalChapters: 10,
        hasPrev: true,
        hasNext: true,
      },
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        ReaderPageContextProvider({ value: contextValue, children })
      ),
    });

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        chapterProgress: 0,
        locatorVersion: undefined,
        locator: undefined,
        scrollPosition: undefined,
      }), { force: true });
    });

    expect(getReaderSessionSnapshot().pendingRestoreTarget).toMatchObject({
      chapterIndex: 5,
      chapterProgress: 0,
      viewMode: 'original',
      isTwoColumn: false,
    });
  });

  it('restores the last original reading position when switching back from summary view', () => {
    const persistReaderState = vi.fn();
    const markUserInteracted = vi.fn();
    const setChapterIndex = vi.fn();
    const setViewMode = vi.fn();
    const setIsTwoColumn = vi.fn();
    const latestReaderStateRef = { current: createStoredState() };
    const contentRef = { current: makeContainer() };
    const getCurrentAnchorRef = {
      current: () => ({ chapterIndex: 5, chapterProgress: 0.4 } satisfies ScrollModeAnchor),
    };
    const contextValue = createReaderPageContextValue({
      contentRef,
      getCurrentAnchorRef,
      latestReaderStateRef,
      markUserInteracted,
      persistReaderState,
    });

    const { result, rerender } = renderHook((viewMode: 'original' | 'summary') => useReaderRestoreFlow({
      chapterIndex: 5,
      setChapterIndex,
      viewMode,
      setViewMode,
      isTwoColumn: false,
      setIsTwoColumn,
      isPagedMode: false,
      pageIndex: 0,
      pageCount: 1,
      currentChapter: {
        index: 5,
        title: 'Chapter 6',
        content: 'content',
        wordCount: 100,
        totalChapters: 10,
        hasPrev: true,
        hasNext: true,
      },
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
    }), {
      initialProps: 'original',
      wrapper: ({ children }: { children: ReactNode }) => (
        ReaderPageContextProvider({ value: contextValue, children })
      ),
    });

    act(() => {
      result.current.handleSetViewMode('summary');
    });

    contentRef.current = makeContainer({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 });

    rerender('summary');

    act(() => {
      result.current.handleSetViewMode('original');
    });

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject({
      chapterIndex: 5,
      viewMode: 'original',
      chapterProgress: 0.4,
    });
    expect(markUserInteracted).toHaveBeenCalledTimes(2);
    expect(setChapterIndex).toHaveBeenLastCalledWith(5);
    expect(setViewMode).toHaveBeenLastCalledWith('original');
  });

  it('reports restore settle results when forced restore targets are skipped or completed', async () => {
    const onRestoreSettled = vi.fn();
    const chapterElement = document.createElement('div');
    Object.defineProperty(chapterElement, 'offsetTop', {
      configurable: true,
      value: 120,
    });
    Object.defineProperty(chapterElement, 'offsetHeight', {
      configurable: true,
      value: 800,
    });
    const contextValue = createReaderPageContextValue({
      contentRef: { current: makeContainer() },
      scrollChapterElementsBridgeRef: {
        current: new Map([[5, chapterElement]]),
      },
    });

    const { result } = renderHook(() => useReaderRestoreFlow({
      chapterIndex: 5,
      setChapterIndex: vi.fn(),
      viewMode: 'original',
      setViewMode: vi.fn(),
      isTwoColumn: false,
      setIsTwoColumn: vi.fn(),
      isPagedMode: false,
      pageIndex: 0,
      pageCount: 1,
      currentChapter: {
        index: 5,
        title: 'Chapter 6',
        content: 'content',
        wordCount: 100,
        totalChapters: 10,
        hasPrev: true,
        hasNext: true,
      },
      summaryRestoreSignal: null,
      isChapterAnalysisLoading: false,
      onRestoreSettled,
    }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        ReaderPageContextProvider({ value: contextValue, children })
      ),
    });

    act(() => {
      result.current.setPendingRestoreTarget({
        chapterIndex: 5,
        viewMode: 'original',
        isTwoColumn: false,
      }, { force: true });
    });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(onRestoreSettled).toHaveBeenCalledWith('skipped');

    act(() => {
      result.current.setPendingRestoreTarget(createRestoreTarget({
        chapterProgress: 0.5,
      }), { force: true });
    });

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(onRestoreSettled).toHaveBeenCalledWith('completed');
  });
});
