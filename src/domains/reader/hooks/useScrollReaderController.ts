import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Chapter, ChapterContent } from '../api/readerApi';
import type { ReaderRestoreTarget } from './useReaderStatePersistence';
import type { ScrollModeAnchor } from './useScrollModeChapters';
import { useReaderRenderCache } from './useReaderRenderCache';
import { useScrollModeChapters } from './useScrollModeChapters';
import {
  calculateVisibleScrollBlockRanges,
  resolveCurrentScrollLocator,
  resolveCurrentScrollLocatorOffset,
} from '../pages/reader-page/useReaderPageViewport';
import {
  canSkipReaderRestore,
  clampProgress,
  SCROLL_READING_ANCHOR_RATIO,
} from '../utils/readerPosition';
import { useReaderContext } from '../pages/reader-page/ReaderContext';

interface ScrollReaderControllerPreferences {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface UseScrollReaderControllerParams {
  enabled: boolean;
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  contentVersion: number;
  fetchChapterContent: (
    index: number,
    options?: {
      signal?: AbortSignal;
      onProgress?: (message: string) => void;
    },
  ) => Promise<ChapterContent>;
  preloadAdjacent: (index: number, prune?: boolean) => void;
  preferences: ScrollReaderControllerPreferences;
  pendingRestoreTarget: ReaderRestoreTarget | null;
  pendingRestoreTargetRef: React.MutableRefObject<ReaderRestoreTarget | null>;
  clearPendingRestoreTarget: () => void;
  stopRestoreMask: () => void;
}

type ScrollReaderRenderCache = ReturnType<typeof useReaderRenderCache>;
type ScrollReaderLayout =
  ScrollReaderRenderCache['scrollLayouts'] extends Map<number, infer Layout>
    ? Layout
    : never;
type VisibleScrollBlockRangeByChapter = ReturnType<
  typeof calculateVisibleScrollBlockRanges
>;
type VisibleScrollBlockRange =
  VisibleScrollBlockRangeByChapter extends Map<number, infer Range>
    ? Range
    : never;

const EMPTY_PAGED_CHAPTERS: ChapterContent[] = [];
const EMPTY_SCROLL_READER_CHAPTERS: Array<{ index: number; chapter: ChapterContent }> = [];

function areVisibleScrollBlockRangesEqual(
  previousRanges: ReadonlyMap<number, VisibleScrollBlockRange>,
  nextRanges: ReadonlyMap<number, VisibleScrollBlockRange>,
): boolean {
  if (previousRanges.size !== nextRanges.size) {
    return false;
  }

  for (const [chapterIndex, nextRange] of nextRanges) {
    const previousRange = previousRanges.get(chapterIndex);
    if (
      !previousRange
      || previousRange.startIndex !== nextRange.startIndex
      || previousRange.endIndex !== nextRange.endIndex
    ) {
      return false;
    }
  }

  return true;
}

export interface UseScrollReaderControllerResult {
  handleContentScroll: () => void;
  handleScrollChapterBodyElement: (
    index: number,
    element: HTMLDivElement | null,
  ) => void;
  handleScrollChapterElement: (index: number, element: HTMLDivElement | null) => void;
  renderableScrollLayouts: Array<{
    chapter: ChapterContent;
    index: number;
    layout: ScrollReaderLayout;
  }>;
  syncViewportState: (options?: { force?: boolean }) => void;
  visibleScrollBlockRangeByChapter: Map<number, VisibleScrollBlockRange>;
}

function buildScrollWindow(
  chapterIndex: number,
  totalChapters: number,
): number[] {
  const nextWindow: number[] = [];
  for (let index = chapterIndex - 2; index <= chapterIndex + 2; index += 1) {
    if (index >= 0 && index < totalChapters) {
      nextWindow.push(index);
    }
  }

  return nextWindow;
}

export function useScrollReaderController({
  enabled,
  chapters,
  currentChapter,
  contentVersion,
  fetchChapterContent,
  preloadAdjacent,
  preferences,
  pendingRestoreTarget,
  pendingRestoreTargetRef,
  clearPendingRestoreTarget,
  stopRestoreMask,
}: UseScrollReaderControllerParams): UseScrollReaderControllerResult {
  const {
    chapterIndex,
    novelId,
    contentRef,
    chapterCacheRef,
    scrollChapterElementsBridgeRef,
    scrollChapterBodyElementsBridgeRef,
    chapterChangeSourceRef,
    setChapterIndex,
    persistReaderState,
    restoreSettledHandlerRef,
    isScrollSyncSuppressedRef,
    suppressScrollSyncTemporarilyRef,
    getCurrentAnchorRef,
    getCurrentOriginalLocatorRef,
    resolveScrollLocatorOffsetRef,
  } = useReaderContext();
  const navigationSourceRef = chapterChangeSourceRef;
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
  const [visibleScrollBlockRangeByChapter, setVisibleScrollBlockRangeByChapter] =
    useState<Map<number, VisibleScrollBlockRange>>(new Map());
  const scrollAnchorSnapshotRef = useRef<{
    chapterIndex: number | null;
    chapterOffsetTop: number | null;
    firstRenderableChapterIndex: number | null;
    scrollTop: number;
  }>({
    chapterIndex: null,
    chapterOffsetTop: null,
    firstRenderableChapterIndex: null,
    scrollTop: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setScrollModeChapters((previousWindow) => (
        previousWindow.length === 0 ? previousWindow : []
      ));
      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        previousRanges.size === 0 ? previousRanges : new Map()
      ));
      scrollAnchorSnapshotRef.current = {
        chapterIndex: null,
        chapterOffsetTop: null,
        firstRenderableChapterIndex: null,
        scrollTop: 0,
      };
      scrollChapterElementsBridgeRef.current.clear();
      scrollChapterBodyElementsBridgeRef.current.clear();
    }
  }, [enabled, scrollChapterBodyElementsBridgeRef, scrollChapterElementsBridgeRef]);

  useEffect(() => {
    if (!enabled || !currentChapter || currentChapter.index !== chapterIndex) {
      return;
    }

    const nextWindow = buildScrollWindow(chapterIndex, chapters.length);
    setScrollModeChapters((previousWindow) => (
      previousWindow.length === nextWindow.length
      && previousWindow.every((index, position) => index === nextWindow[position])
        ? previousWindow
        : nextWindow
    ));

    nextWindow.forEach((windowIndex) => {
      if (!chapterCacheRef.current.has(windowIndex)) {
        fetchChapterContent(windowIndex)
          .then((chapter) => {
            chapterCacheRef.current.set(windowIndex, chapter);
          })
          .catch(() => {});
      }
    });
  }, [
    chapterCacheRef,
    chapterIndex,
    chapters.length,
    currentChapter,
    enabled,
    fetchChapterContent,
  ]);

  const handleReadingAnchorChange = useCallback((anchor: ScrollModeAnchor) => {
    if (!enabled) return;
    if (isScrollSyncSuppressedRef.current) return;
    if (pendingRestoreTargetRef.current) return;
    if (
      navigationSourceRef.current === 'navigation'
      || navigationSourceRef.current === 'restore'
    ) {
      return;
    }

    const locator = getCurrentOriginalLocatorRef.current();
    persistReaderState({
      chapterIndex: anchor.chapterIndex,
      mode: 'scroll',
      chapterProgress: clampProgress(anchor.chapterProgress),
      locatorVersion: locator ? 1 : undefined,
      locator: locator ?? undefined,
    });

    if (anchor.chapterIndex === chapterIndex) {
      return;
    }

    navigationSourceRef.current = 'scroll';
    setChapterIndex(anchor.chapterIndex);
  }, [
    chapterIndex,
    enabled,
    getCurrentOriginalLocatorRef,
    navigationSourceRef,
    pendingRestoreTargetRef,
    persistReaderState,
    setChapterIndex,
    isScrollSyncSuppressedRef,
  ]);

  const fetchScrollChapterContent = useCallback((index: number) => {
    return fetchChapterContent(index);
  }, [fetchChapterContent]);

  const scrollMode = useScrollModeChapters(
    contentRef,
    enabled,
    chapters,
    fetchScrollChapterContent,
    preloadAdjacent,
    scrollModeChapters,
    setScrollModeChapters,
    contentVersion,
    handleReadingAnchorChange,
  );
  const {
    getCurrentAnchor,
    handleScroll,
    scrollChapterElementsRef,
    scrollViewportTop,
    syncViewportState,
  } = scrollMode;

  useEffect(() => {
    getCurrentAnchorRef.current = getCurrentAnchor;
    return () => {
      getCurrentAnchorRef.current = () => null;
    };
  }, [getCurrentAnchor, getCurrentAnchorRef]);

  const scrollReaderChapterCacheVersion = contentVersion;
  const scrollReaderChapters = useMemo(() => {
    if (!enabled) {
      return EMPTY_SCROLL_READER_CHAPTERS;
    }

    // Recompute against the mutable chapter cache when chapter hydration advances.
    if (scrollReaderChapterCacheVersion < 0) {
      return EMPTY_SCROLL_READER_CHAPTERS;
    }

    return scrollModeChapters
      .map((index) => {
        const chapter = chapterCacheRef.current.get(index);
        return chapter ? { index, chapter } : null;
      })
      .filter((item): item is { index: number; chapter: ChapterContent } => Boolean(item));
  }, [chapterCacheRef, enabled, scrollModeChapters, scrollReaderChapterCacheVersion]);

  const renderCache = useReaderRenderCache({
    chapters,
    currentChapter: enabled ? currentChapter : null,
    contentRef,
    fetchChapterContent,
    fontSize: preferences.fontSize,
    isPagedMode: false,
    lineSpacing: preferences.lineSpacing,
    novelId,
    pagedChapters: EMPTY_PAGED_CHAPTERS,
    pagedViewportElement: null,
    paragraphSpacing: preferences.paragraphSpacing,
    scrollChapters: enabled ? scrollReaderChapters : EMPTY_SCROLL_READER_CHAPTERS,
    viewMode: 'original',
  });

  const renderableScrollLayouts = useMemo(
    () => scrollReaderChapters.flatMap((renderableScrollChapter) => {
      const layout = renderCache.scrollLayouts.get(renderableScrollChapter.index);
      return layout ? [{ ...renderableScrollChapter, layout }] : [];
    }),
    [renderCache.scrollLayouts, scrollReaderChapters],
  );

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const container = contentRef.current;
    const activeChapterElement = scrollChapterElementsBridgeRef.current.get(chapterIndex) ?? null;
    const nextChapterOffsetTop = activeChapterElement?.offsetTop ?? null;
    const nextFirstRenderableChapterIndex = renderableScrollLayouts[0]?.index ?? null;
    const nextScrollTop = container?.scrollTop ?? 0;
    const previousSnapshot = scrollAnchorSnapshotRef.current;

    if (
      container
      && previousSnapshot.chapterIndex === chapterIndex
      && previousSnapshot.chapterOffsetTop !== null
      && previousSnapshot.firstRenderableChapterIndex !== null
      && nextChapterOffsetTop !== null
      && nextFirstRenderableChapterIndex !== null
      && nextFirstRenderableChapterIndex < previousSnapshot.firstRenderableChapterIndex
    ) {
      const chapterOffsetDelta = nextChapterOffsetTop - previousSnapshot.chapterOffsetTop;
      if (chapterOffsetDelta > 0.5) {
        const scrollTopDelta = nextScrollTop - previousSnapshot.scrollTop;
        const uncompensatedOffsetDelta = chapterOffsetDelta - scrollTopDelta;

        if (Math.abs(uncompensatedOffsetDelta) > 0.5) {
          suppressScrollSyncTemporarilyRef.current();
          container.scrollTop += uncompensatedOffsetDelta;
          syncViewportState({ force: true });
        }
      }
    }

    scrollAnchorSnapshotRef.current = {
      chapterIndex,
      chapterOffsetTop: nextChapterOffsetTop,
      firstRenderableChapterIndex: nextFirstRenderableChapterIndex,
      scrollTop: container?.scrollTop ?? nextScrollTop,
    };
  }, [
    chapterIndex,
    contentRef,
    enabled,
    renderableScrollLayouts,
    scrollChapterElementsBridgeRef,
    suppressScrollSyncTemporarilyRef,
    syncViewportState,
  ]);

  const getCurrentScrollLocator = useCallback(() => {
    return resolveCurrentScrollLocator({
      chapterIndex,
      contentElement: contentRef.current,
      isPagedMode: false,
      scrollLayouts: renderCache.scrollLayouts,
      scrollChapterBodyElements: scrollChapterBodyElementsBridgeRef.current,
      scrollReaderChapters,
      viewMode: 'original',
    });
  }, [
    chapterIndex,
    contentRef,
    renderCache.scrollLayouts,
    scrollChapterBodyElementsBridgeRef,
    scrollReaderChapters,
  ]);

  const resolveScrollLocatorOffset = useCallback(
    (locator: Parameters<typeof resolveCurrentScrollLocatorOffset>[0]['locator']) => {
      return resolveCurrentScrollLocatorOffset({
        locator,
        scrollChapterBodyElements: scrollChapterBodyElementsBridgeRef.current,
        scrollLayouts: renderCache.scrollLayouts,
      });
    },
    [renderCache.scrollLayouts, scrollChapterBodyElementsBridgeRef],
  );

  useEffect(() => {
    getCurrentOriginalLocatorRef.current = getCurrentScrollLocator;
    resolveScrollLocatorOffsetRef.current = resolveScrollLocatorOffset;
    return () => {
      getCurrentOriginalLocatorRef.current = () => null;
      resolveScrollLocatorOffsetRef.current = () => null;
    };
  }, [
    getCurrentOriginalLocatorRef,
    getCurrentScrollLocator,
    resolveScrollLocatorOffset,
    resolveScrollLocatorOffsetRef,
  ]);

  useLayoutEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (!enabled) {
        setVisibleScrollBlockRangeByChapter((previousRanges) => (
          previousRanges.size === 0 ? previousRanges : new Map()
        ));
        return;
      }

      const viewportElement = contentRef.current;
      const nextRanges = calculateVisibleScrollBlockRanges({
        contentElement: viewportElement,
        isPagedMode: false,
        renderableScrollLayouts,
        scrollChapterBodyElements: scrollChapterBodyElementsBridgeRef.current,
        scrollViewportHeight: renderCache.viewportMetrics.scrollViewportHeight,
        scrollViewportTop,
        viewMode: 'original',
      });

      setVisibleScrollBlockRangeByChapter((previousRanges) => (
        areVisibleScrollBlockRangesEqual(previousRanges, nextRanges)
          ? previousRanges
          : nextRanges
      ));
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    contentRef,
    enabled,
    renderCache.viewportMetrics.scrollViewportHeight,
    renderableScrollLayouts,
    scrollChapterBodyElementsBridgeRef,
    scrollViewportTop,
  ]);

  useEffect(() => {
    if (!enabled || currentChapter?.index !== chapterIndex) {
      return;
    }

    const pendingTarget = pendingRestoreTarget ?? pendingRestoreTargetRef.current;
    if (!pendingTarget || pendingTarget.mode !== 'scroll') {
      return;
    }

    if (canSkipReaderRestore(pendingTarget)) {
      navigationSourceRef.current = null;
      clearPendingRestoreTarget();
      stopRestoreMask();
      restoreSettledHandlerRef.current('skipped');
      return;
    }

    let frameId = 0;
    let cancelled = false;

    const restoreScrollPosition = () => {
      if (cancelled) {
        return;
      }

      const container = contentRef.current;
      const targetElement = scrollChapterElementsBridgeRef.current.get(pendingTarget.chapterIndex);

      if (!container || !targetElement) {
        frameId = requestAnimationFrame(restoreScrollPosition);
        return;
      }

      navigationSourceRef.current = 'restore';
      suppressScrollSyncTemporarilyRef.current();
      if (pendingTarget.locator) {
        const nextScrollTop = resolveScrollLocatorOffsetRef.current(pendingTarget.locator);
        if (nextScrollTop === null) {
          navigationSourceRef.current = null;
          frameId = requestAnimationFrame(restoreScrollPosition);
          return;
        }

        container.scrollTop = Math.max(
          0,
          Math.round(nextScrollTop - container.clientHeight * SCROLL_READING_ANCHOR_RATIO),
        );
      } else if (typeof pendingTarget.chapterProgress === 'number') {
        container.scrollTop = Math.round(
          targetElement.offsetTop
            + targetElement.offsetHeight * clampProgress(pendingTarget.chapterProgress),
        );
      } else if (typeof pendingTarget.scrollPosition === 'number') {
        container.scrollTop = pendingTarget.scrollPosition;
      }

      navigationSourceRef.current = null;
      clearPendingRestoreTarget();
      stopRestoreMask();
      restoreSettledHandlerRef.current('completed');
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
    enabled,
    navigationSourceRef,
    pendingRestoreTarget,
    pendingRestoreTargetRef,
    resolveScrollLocatorOffsetRef,
    restoreSettledHandlerRef,
    scrollChapterElementsBridgeRef,
    stopRestoreMask,
    suppressScrollSyncTemporarilyRef,
  ]);

  const handleScrollChapterElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterElementsRef.current.set(index, element);
        scrollChapterElementsBridgeRef.current.set(index, element);
        return;
      }

      scrollChapterElementsRef.current.delete(index);
      scrollChapterElementsBridgeRef.current.delete(index);
    },
    [scrollChapterElementsBridgeRef, scrollChapterElementsRef],
  );

  const handleScrollChapterBodyElement = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      if (element) {
        scrollChapterBodyElementsBridgeRef.current.set(index, element);
        return;
      }

      scrollChapterBodyElementsBridgeRef.current.delete(index);
    },
    [scrollChapterBodyElementsBridgeRef],
  );

  const handleContentScroll = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (isScrollSyncSuppressedRef.current) {
      syncViewportState({ force: true });
      return;
    }

    handleScroll();
  }, [enabled, handleScroll, isScrollSyncSuppressedRef, syncViewportState]);

  return {
    handleContentScroll,
    handleScrollChapterBodyElement,
    handleScrollChapterElement,
    renderableScrollLayouts,
    syncViewportState,
    visibleScrollBlockRangeByChapter,
  };
}
