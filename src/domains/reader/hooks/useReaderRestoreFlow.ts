import { useCallback, useEffect, useRef } from 'react';
import type { ChapterContent } from '../api/readerApi';
import type { ChapterChangeSource } from './navigationTypes';
import type { ScrollModeAnchor } from './useScrollModeChapters';
import type { ReaderRestoreTarget, StoredReaderState } from './useReaderStatePersistence';
import {
  beginRestore,
  completeRestore,
  getReaderSessionSnapshot,
  getStoredReaderStateSnapshot,
  setPendingRestoreTarget as setStorePendingRestoreTarget,
  useReaderSessionSelector,
} from './sessionStore';
import {
  canSkipReaderRestore,
  clampProgress,
  getContainerProgress,
  SCROLL_READING_ANCHOR_RATIO,
  shouldKeepReaderRestoreMask,
} from '../utils/readerPosition';
import { useReaderPageContext } from '../pages/reader-page/ReaderPageContext';

interface UseReaderRestoreFlowParams {
  chapterIndex: number;
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  viewMode: 'original' | 'summary';
  setViewMode: React.Dispatch<React.SetStateAction<'original' | 'summary'>>;
  isTwoColumn: boolean;
  setIsTwoColumn: React.Dispatch<React.SetStateAction<boolean>>;
  isPagedMode: boolean;
  pageIndex: number;
  pageCount: number;
  currentChapter: ChapterContent | null;
  isLoading: boolean;
  summaryRestoreSignal: unknown;
  isChapterAnalysisLoading: boolean;
}

interface UseReaderRestoreFlowResult {
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  isRestoringPosition: boolean;
  captureCurrentReaderPosition: (options?: { flush?: boolean }) => StoredReaderState;
  clearPendingRestoreTarget: () => void;
  handleBeforeChapterChange: () => void;
  handleContentScroll: () => void;
  handleSetIsTwoColumn: (twoColumn: boolean) => void;
  handleSetViewMode: (viewMode: 'original' | 'summary') => void;
  setPendingRestoreTarget: (
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => void;
  startRestoreMaskForTarget: (target: ReaderRestoreTarget | null | undefined) => void;
  stopRestoreMask: () => void;
  suppressScrollSyncTemporarily: () => void;
}

export function useReaderRestoreFlow({
  chapterIndex,
  setChapterIndex,
  viewMode,
  setViewMode,
  isTwoColumn,
  setIsTwoColumn,
  isPagedMode,
  pageIndex,
  pageCount,
  currentChapter,
  isLoading,
  summaryRestoreSignal,
  isChapterAnalysisLoading,
}: UseReaderRestoreFlowParams): UseReaderRestoreFlowResult {
  const {
    novelId,
    hasHydratedReaderState,
    latestReaderStateRef,
    markUserInteracted,
    persistReaderState,
    contentRef,
    scrollChapterElementsBridgeRef,
    getCurrentAnchorRef,
    handleScrollModeScrollRef,
    readingAnchorHandlerRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    resolveScrollLocatorOffsetRef,
  } = useReaderPageContext();
  const chapterChangeSourceRef = useRef<ChapterChangeSource>(null);
  const pendingRestoreTarget = useReaderSessionSelector((state) => state.pendingRestoreTarget);
  const restoreStatus = useReaderSessionSelector((state) => state.restoreStatus);
  const pendingRestoreTargetRef = useRef<ReaderRestoreTarget | null>(pendingRestoreTarget);
  const originalViewStateRef = useRef<ReaderRestoreTarget | null>(null);
  const summaryViewStateRef = useRef<ReaderRestoreTarget | null>(null);
  const summaryProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressScrollSyncRef = useRef(false);
  const scrollSyncReleaseFrameRef = useRef<number | null>(null);
  const getOriginalLocator = getCurrentOriginalLocatorRef;
  const getPagedLocator = getCurrentPagedLocatorRef;
  const resolveScrollLocatorOffset = resolveScrollLocatorOffsetRef;
  const anchorHandlerRef = readingAnchorHandlerRef;

  useEffect(() => {
    pendingRestoreTargetRef.current = pendingRestoreTarget;
  }, [pendingRestoreTarget]);

  const getPagedProgress = useCallback(() => {
    if (pageCount <= 1) return 0;
    return clampProgress(pageIndex / (pageCount - 1));
  }, [pageCount, pageIndex]);

  const toRestoreTarget = useCallback((state: StoredReaderState): ReaderRestoreTarget => {
    return {
      chapterIndex: state.chapterIndex ?? chapterIndex,
      viewMode: state.viewMode ?? viewMode,
      isTwoColumn: state.isTwoColumn ?? isTwoColumn,
      chapterProgress: typeof state.chapterProgress === 'number'
        ? clampProgress(state.chapterProgress)
        : undefined,
      scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
        ? state.scrollPosition
        : undefined,
      locatorVersion: state.locator ? 1 : undefined,
      locator: state.locator,
    };
  }, [chapterIndex, isTwoColumn, viewMode]);

  const setPendingRestoreTarget = useCallback(
    (nextTarget: ReaderRestoreTarget | null, options?: { force?: boolean }) => {
      if (!nextTarget) {
        setStorePendingRestoreTarget(null);
        return;
      }

      if (options?.force) {
        setStorePendingRestoreTarget(nextTarget);
        return;
      }

      setStorePendingRestoreTarget(
        shouldKeepReaderRestoreMask(nextTarget)
          ? nextTarget
          : null,
      );
    },
    [],
  );

  const clearPendingRestoreTarget = useCallback(() => {
    setStorePendingRestoreTarget(null);
  }, []);

  const startRestoreMaskForTarget = useCallback(
    (target: ReaderRestoreTarget | null | undefined) => {
      if (shouldKeepReaderRestoreMask(target)) {
        beginRestore(target);
        return;
      }
      completeRestore();
    },
    [],
  );

  const stopRestoreMask = useCallback(() => {
    completeRestore();
  }, []);

  const suppressScrollSyncTemporarily = useCallback(() => {
    suppressScrollSyncRef.current = true;

    if (scrollSyncReleaseFrameRef.current !== null) {
      cancelAnimationFrame(scrollSyncReleaseFrameRef.current);
      scrollSyncReleaseFrameRef.current = null;
    }

    const releaseAfterLayout = () => {
      scrollSyncReleaseFrameRef.current = requestAnimationFrame(() => {
        suppressScrollSyncRef.current = false;
        scrollSyncReleaseFrameRef.current = null;
      });
    };

    scrollSyncReleaseFrameRef.current = requestAnimationFrame(releaseAfterLayout);
  }, []);

  const rememberViewState = useCallback((target: ReaderRestoreTarget) => {
    if (target.viewMode === 'summary') {
      summaryViewStateRef.current = target;
      return;
    }

    originalViewStateRef.current = target;
  }, []);

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    if (isPagedMode || viewMode !== 'original') return;
    if (pendingRestoreTargetRef.current) return;
    if (suppressScrollSyncRef.current) return;
    if (chapterChangeSourceRef.current === 'navigation' || chapterChangeSourceRef.current === 'restore') return;
    const locator = getOriginalLocator.current();

    persistReaderState({
      chapterIndex: anchor.chapterIndex,
      chapterProgress: clampProgress(anchor.chapterProgress),
      locatorVersion: locator ? 1 : undefined,
      locator: locator ?? undefined,
    });

    if (anchor.chapterIndex === chapterIndex) return;
    chapterChangeSourceRef.current = 'scroll';
    setChapterIndex(anchor.chapterIndex);
  }, [
    chapterIndex,
    getOriginalLocator,
    isPagedMode,
    persistReaderState,
    setChapterIndex,
    viewMode,
  ]);

  useEffect(() => {
    anchorHandlerRef.current = handleReadingAnchorChange;
    return () => {
      anchorHandlerRef.current = () => {};
    };
  }, [anchorHandlerRef, handleReadingAnchorChange]);

  const captureCurrentReaderPosition = useCallback(
    (options?: { flush?: boolean }): StoredReaderState => {
      const storedReaderState = getStoredReaderStateSnapshot();
      const shouldPreferLatestReaderState =
        chapterChangeSourceRef.current === 'navigation' ||
        latestReaderStateRef.current.chapterIndex !== chapterIndex ||
        latestReaderStateRef.current.viewMode !== viewMode ||
        latestReaderStateRef.current.isTwoColumn !== isTwoColumn;
      const preferredReaderState = shouldPreferLatestReaderState
        ? latestReaderStateRef.current
        : storedReaderState;
      let nextState: StoredReaderState = {
        chapterIndex:
          preferredReaderState.chapterIndex ?? storedReaderState.chapterIndex ?? chapterIndex,
        viewMode,
        isTwoColumn,
      };

      if (isPagedMode) {
        nextState.chapterProgress = getPagedProgress();
        const locator = getPagedLocator.current();
        if (locator) {
          nextState.chapterIndex = locator.chapterIndex;
          nextState.locatorVersion = 1;
          nextState.locator = locator;
        }
      } else if (viewMode === 'summary') {
        nextState.chapterProgress = getContainerProgress(contentRef.current);
        nextState.locatorVersion = undefined;
        nextState.locator = undefined;
      } else {
        const anchor = shouldPreferLatestReaderState ? null : getCurrentAnchorRef.current();
        const locator = shouldPreferLatestReaderState ? null : getOriginalLocator.current();
        if (anchor) {
          nextState = {
            ...nextState,
            chapterIndex: anchor.chapterIndex,
            chapterProgress: clampProgress(anchor.chapterProgress),
            locatorVersion: locator ? 1 : undefined,
            locator: locator ?? undefined,
          };
        } else if (shouldPreferLatestReaderState) {
          nextState = {
            ...nextState,
            chapterIndex: preferredReaderState.chapterIndex ?? nextState.chapterIndex,
            chapterProgress:
              typeof preferredReaderState.chapterProgress === 'number'
                ? clampProgress(preferredReaderState.chapterProgress)
                : undefined,
            scrollPosition:
              typeof preferredReaderState.scrollPosition === 'number' &&
              Number.isFinite(preferredReaderState.scrollPosition)
                ? preferredReaderState.scrollPosition
                : undefined,
            locatorVersion: preferredReaderState.locator ? 1 : undefined,
            locator: preferredReaderState.locator,
          };
        } else if (typeof latestReaderStateRef.current.chapterProgress === 'number') {
          nextState.chapterProgress = latestReaderStateRef.current.chapterProgress;
          nextState.locatorVersion = latestReaderStateRef.current.locator ? 1 : undefined;
          nextState.locator = latestReaderStateRef.current.locator;
        }
      }

      rememberViewState(toRestoreTarget(nextState));
      persistReaderState(nextState, { flush: options?.flush });
      return {
        ...latestReaderStateRef.current,
        ...nextState,
      };
    },
    [
      chapterIndex,
      contentRef,
      getCurrentAnchorRef,
      getOriginalLocator,
      getPagedLocator,
      getPagedProgress,
      isPagedMode,
      isTwoColumn,
      latestReaderStateRef,
      persistReaderState,
      rememberViewState,
      toRestoreTarget,
      viewMode,
    ],
  );

  const handleSetIsTwoColumn = useCallback((twoColumn: boolean) => {
    if (twoColumn === isTwoColumn) return;

    const currentReaderState = captureCurrentReaderPosition();
    markUserInteracted();
    if (typeof currentReaderState.chapterIndex === 'number') {
      setChapterIndex(currentReaderState.chapterIndex);
    }
    setPendingRestoreTarget({
      ...toRestoreTarget(currentReaderState),
      isTwoColumn: twoColumn,
    }, { force: true });
    setIsTwoColumn(twoColumn);
    persistReaderState({
      ...currentReaderState,
      isTwoColumn: twoColumn,
    });
  }, [
    captureCurrentReaderPosition,
    isTwoColumn,
    markUserInteracted,
    persistReaderState,
    setChapterIndex,
    setIsTwoColumn,
    setPendingRestoreTarget,
    toRestoreTarget,
  ]);

  const handleSetViewMode = useCallback((nextViewMode: 'original' | 'summary') => {
    if (nextViewMode === viewMode) return;

    const currentReaderState = captureCurrentReaderPosition();
    const matchingSnapshot = nextViewMode === 'original'
      ? originalViewStateRef.current
      : summaryViewStateRef.current;
    const canReuseSnapshot = matchingSnapshot
      && matchingSnapshot.chapterIndex === currentReaderState.chapterIndex;
    const targetRestoreTarget: ReaderRestoreTarget = canReuseSnapshot
      ? {
        ...toRestoreTarget(currentReaderState),
        ...matchingSnapshot,
        viewMode: nextViewMode,
        isTwoColumn: currentReaderState.isTwoColumn ?? isTwoColumn,
      }
      : {
        ...toRestoreTarget(currentReaderState),
        viewMode: nextViewMode,
        chapterProgress: 0,
        scrollPosition: undefined,
      };

    markUserInteracted();
    setChapterIndex(targetRestoreTarget.chapterIndex);
    rememberViewState(targetRestoreTarget);
    setPendingRestoreTarget(targetRestoreTarget, { force: true });
    setViewMode(nextViewMode);
    persistReaderState(targetRestoreTarget);
  }, [
    captureCurrentReaderPosition,
    isTwoColumn,
    markUserInteracted,
    persistReaderState,
    rememberViewState,
    setChapterIndex,
    setPendingRestoreTarget,
    setViewMode,
    toRestoreTarget,
    viewMode,
  ]);

  useEffect(() => {
    if (isLoading || viewMode !== 'original' || isPagedMode || !currentChapter) return;

    const pendingTarget = pendingRestoreTargetRef.current;
    if (!pendingTarget) return;
    if (canSkipReaderRestore(pendingTarget)) {
      clearPendingRestoreTarget();
      stopRestoreMask();
      return;
    }

    let frameId = 0;
    let cancelled = false;

    const restoreScrollPosition = () => {
      if (cancelled) return;

      const container = contentRef.current;
      const targetIndex = pendingTarget.chapterIndex;
      const targetElement = scrollChapterElementsBridgeRef.current.get(targetIndex);

      if (!container || !targetElement) {
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      chapterChangeSourceRef.current = 'restore';
      suppressScrollSyncTemporarily();
      if (pendingTarget.locator) {
        const nextScrollTop = resolveScrollLocatorOffset.current(pendingTarget.locator);
        if (nextScrollTop === null) {
          chapterChangeSourceRef.current = null;
          frameId = requestAnimationFrame(restoreScrollPosition);
          return;
        }
        container.scrollTop = Math.max(
          0,
          Math.round(nextScrollTop - container.clientHeight * SCROLL_READING_ANCHOR_RATIO),
        );
      } else if (typeof pendingTarget.chapterProgress === 'number') {
        container.scrollTop = Math.round(
          targetElement.offsetTop +
            targetElement.offsetHeight * clampProgress(pendingTarget.chapterProgress),
        );
      } else if (typeof pendingTarget.scrollPosition === 'number') {
        container.scrollTop = pendingTarget.scrollPosition;
      }
      chapterChangeSourceRef.current = null;
      clearPendingRestoreTarget();
      stopRestoreMask();
    };

    frameId = requestAnimationFrame(restoreScrollPosition);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    contentRef,
    currentChapter,
    isLoading,
    isPagedMode,
    scrollChapterElementsBridgeRef,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
    resolveScrollLocatorOffset,
    viewMode,
  ]);

  useEffect(() => {
    if (isLoading || viewMode !== 'summary') return;

    const pendingTarget = pendingRestoreTargetRef.current;
    if (!pendingTarget || !contentRef.current) return;
    if (canSkipReaderRestore(pendingTarget)) {
      clearPendingRestoreTarget();
      stopRestoreMask();
      return;
    }

    const container = contentRef.current;
    const frameId = requestAnimationFrame(() => {
      chapterChangeSourceRef.current = 'restore';
      suppressScrollSyncTemporarily();
      if (typeof pendingTarget.chapterProgress === 'number') {
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll > 0) {
          container.scrollTop = Math.round(
            maxScroll * clampProgress(pendingTarget.chapterProgress),
          );
        }
      } else if (typeof pendingTarget.scrollPosition === 'number') {
        container.scrollTop = pendingTarget.scrollPosition;
      }
      chapterChangeSourceRef.current = null;
      clearPendingRestoreTarget();
      stopRestoreMask();
    });

    return () => cancelAnimationFrame(frameId);
  }, [
    chapterIndex,
    clearPendingRestoreTarget,
    contentRef,
    currentChapter,
    isChapterAnalysisLoading,
    isLoading,
    stopRestoreMask,
    summaryRestoreSignal,
    suppressScrollSyncTemporarily,
    viewMode,
  ]);

  useEffect(() => {
    if (!novelId || !hasHydratedReaderState) return;
    const sessionSnapshot = getReaderSessionSnapshot();
    persistReaderState({
      chapterIndex: sessionSnapshot.chapterIndex,
      viewMode: sessionSnapshot.viewMode,
      isTwoColumn: sessionSnapshot.isTwoColumn,
    });
  }, [hasHydratedReaderState, novelId, persistReaderState]);

  useEffect(() => {
    if (!isPagedMode || isLoading || pendingRestoreTargetRef.current) return;
    persistReaderState({
      chapterIndex,
      chapterProgress: getPagedProgress(),
    });
  }, [
    chapterIndex,
    getPagedProgress,
    isLoading,
    isPagedMode,
    pageIndex,
    pageCount,
    persistReaderState,
  ]);

  useEffect(() => {
    const handlePageHide = () => {
      captureCurrentReaderPosition({ flush: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        captureCurrentReaderPosition({ flush: true });
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [captureCurrentReaderPosition]);

  useEffect(() => {
    return () => {
      if (summaryProgressTimerRef.current) {
        clearTimeout(summaryProgressTimerRef.current);
      }
      if (scrollSyncReleaseFrameRef.current !== null) {
        cancelAnimationFrame(scrollSyncReleaseFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
      summaryProgressTimerRef.current = null;
    }
  }, [chapterIndex, isPagedMode, viewMode]);

  const handleBeforeChapterChange = useCallback(() => {
    clearPendingRestoreTarget();
    stopRestoreMask();
    suppressScrollSyncTemporarily();
  }, [clearPendingRestoreTarget, stopRestoreMask, suppressScrollSyncTemporarily]);

  const handleContentScroll = useCallback(() => {
    if (suppressScrollSyncRef.current) return;

    if (viewMode === 'original' && !isPagedMode) {
      handleScrollModeScrollRef.current();
      return;
    }

    if (isPagedMode || viewMode !== 'summary' || pendingRestoreTargetRef.current) return;

    if (summaryProgressTimerRef.current) {
      clearTimeout(summaryProgressTimerRef.current);
    }

    summaryProgressTimerRef.current = setTimeout(() => {
      persistReaderState({
        chapterIndex,
        chapterProgress: getContainerProgress(contentRef.current),
      });
    }, 150);
  }, [
    chapterIndex,
    contentRef,
    handleScrollModeScrollRef,
    isPagedMode,
    persistReaderState,
    viewMode,
  ]);

  return {
    chapterChangeSourceRef,
    pendingRestoreTargetRef,
    isRestoringPosition: restoreStatus === 'restoring',
    captureCurrentReaderPosition,
    clearPendingRestoreTarget,
    handleBeforeChapterChange,
    handleContentScroll,
    handleSetIsTwoColumn,
    handleSetViewMode,
    setPendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
  };
}
