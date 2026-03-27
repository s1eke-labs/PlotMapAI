import { useCallback, useEffect, useRef } from 'react';
import type { Chapter, ChapterContent } from '../api/readerApi';
import type { PageTarget, StoredReaderState } from './useReaderStatePersistence';

type ChapterChangeSource = 'navigation' | 'scroll' | 'restore' | null;
type NavigationIntent =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'chapter'; targetIndex: number; pageTarget: PageTarget };

interface PageNavigationOptions {
  allowChapterTransition?: boolean;
  queueDuringTransition?: boolean;
}

export function useReaderNavigation(
  chapterIndex: number,
  setChapterIndex: (idx: number) => void,
  currentChapter: ChapterContent | null,
  isPagedMode: boolean,
  pageIndex: number,
  setPageIndex: React.Dispatch<React.SetStateAction<number>>,
  pageCount: number,
  persistReaderState: (s: StoredReaderState) => void,
  pageTargetRef: React.MutableRefObject<PageTarget>,
  chapters: Chapter[],
  scrollModeChapters: number[],
  hasUserInteractedRef: React.MutableRefObject<boolean>,
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>,
  isChapterNavigationReady: boolean,
  beforeChapterChange?: () => void,
): {
  goToChapter: (targetIndex: number, pageTarget?: PageTarget) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  toolbarHasPrev: boolean;
  toolbarHasNext: boolean;
} {
  const transitionTargetChapterIndexRef = useRef<number | null>(null);
  const queuedIntentRef = useRef<NavigationIntent | null>(null);
  const lastChapterIndexRef = useRef(chapterIndex);

  const clearPendingNavigation = useCallback(() => {
    transitionTargetChapterIndexRef.current = null;
    queuedIntentRef.current = null;
  }, []);

  const queueIntent = useCallback((intent: NavigationIntent) => {
    queuedIntentRef.current = intent;
  }, []);

  const startChapterNavigation = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return;
    }

    beforeChapterChange?.();
    hasUserInteractedRef.current = true;
    chapterChangeSourceRef.current = 'navigation';
    pageTargetRef.current = pageTarget;
    if (isPagedMode) {
      transitionTargetChapterIndexRef.current = targetIndex;
    }
    setChapterIndex(targetIndex);
    persistReaderState({
      chapterIndex: targetIndex,
      chapterProgress: pageTarget === 'end' ? 1 : 0,
    });
  }, [
    beforeChapterChange,
    chapterChangeSourceRef,
    chapters.length,
    hasUserInteractedRef,
    isPagedMode,
    pageTargetRef,
    persistReaderState,
    setChapterIndex,
  ]);

  const goToChapter = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (isPagedMode && transitionTargetChapterIndexRef.current !== null) {
      queueIntent({ type: 'chapter', targetIndex, pageTarget });
      return;
    }

    startChapterNavigation(targetIndex, pageTarget);
  }, [isPagedMode, queueIntent, startChapterNavigation]);

  const performNextPageNavigation = useCallback((options: PageNavigationOptions = {}) => {
    if (!currentChapter) return;
    const { allowChapterTransition = true, queueDuringTransition = true } = options;

    if (isPagedMode) {
      if (transitionTargetChapterIndexRef.current !== null) {
        if (queueDuringTransition) {
          queueIntent({ type: 'next' });
        }
        return;
      }

      if (!isChapterNavigationReady || currentChapter.index !== chapterIndex) {
        return;
      }
    }

    if (pageIndex < pageCount - 1) {
      setPageIndex((prev) => prev + 1);
      return;
    }

    if (allowChapterTransition && currentChapter.hasNext) {
      startChapterNavigation(chapterIndex + 1, 'start');
    }
  }, [
    chapterIndex,
    currentChapter,
    isChapterNavigationReady,
    isPagedMode,
    pageCount,
    pageIndex,
    queueIntent,
    setPageIndex,
    startChapterNavigation,
  ]);

  const goToNextPage = useCallback(() => {
    performNextPageNavigation();
  }, [performNextPageNavigation]);

  const performPrevPageNavigation = useCallback((options: PageNavigationOptions = {}) => {
    if (!currentChapter) return;
    const { allowChapterTransition = true, queueDuringTransition = true } = options;

    if (isPagedMode) {
      if (transitionTargetChapterIndexRef.current !== null) {
        if (queueDuringTransition) {
          queueIntent({ type: 'prev' });
        }
        return;
      }

      if (!isChapterNavigationReady || currentChapter.index !== chapterIndex) {
        return;
      }
    }

    if (pageIndex > 0) {
      setPageIndex((prev) => prev - 1);
      return;
    }

    if (allowChapterTransition && currentChapter.hasPrev) {
      startChapterNavigation(chapterIndex - 1, 'end');
    }
  }, [
    chapterIndex,
    currentChapter,
    isChapterNavigationReady,
    isPagedMode,
    pageIndex,
    queueIntent,
    setPageIndex,
    startChapterNavigation,
  ]);

  const goToPrevPage = useCallback(() => {
    performPrevPageNavigation();
  }, [performPrevPageNavigation]);

  const handleNext = useCallback(() => {
    if (isPagedMode) {
      goToNextPage();
      return;
    }

    if (chapterIndex < chapters.length - 1) {
      goToChapter(chapterIndex + 1, 'start');
    }
  }, [chapterIndex, chapters.length, goToChapter, goToNextPage, isPagedMode]);

  const handlePrev = useCallback(() => {
    if (isPagedMode) {
      goToPrevPage();
      return;
    }

    if (chapterIndex > 0) {
      goToChapter(chapterIndex - 1, 'start');
    }
  }, [chapterIndex, goToChapter, goToPrevPage, isPagedMode]);

  useEffect(() => {
    if (!isPagedMode) {
      clearPendingNavigation();
      return;
    }

    const chapterChanged = lastChapterIndexRef.current !== chapterIndex;
    lastChapterIndexRef.current = chapterIndex;

    if (!chapterChanged) {
      return;
    }

    const changeSource = chapterChangeSourceRef.current;
    if ((changeSource === 'scroll' || changeSource === 'restore')
      && transitionTargetChapterIndexRef.current !== null) {
      clearPendingNavigation();
    }
  }, [chapterChangeSourceRef, chapterIndex, clearPendingNavigation, isPagedMode]);

  useEffect(() => {
    if (!isPagedMode) {
      return;
    }

    const transitionTarget = transitionTargetChapterIndexRef.current;
    if (transitionTarget === null) {
      return;
    }

    if (!isChapterNavigationReady || chapterIndex !== transitionTarget) {
      return;
    }

    const queuedIntent = queuedIntentRef.current;
    transitionTargetChapterIndexRef.current = null;
    queuedIntentRef.current = null;

    if (!queuedIntent) {
      return;
    }

    if (queuedIntent.type === 'chapter') {
      if (queuedIntent.targetIndex === chapterIndex) {
        return;
      }
      startChapterNavigation(queuedIntent.targetIndex, queuedIntent.pageTarget);
      return;
    }

    if (queuedIntent.type === 'next') {
      performNextPageNavigation({ allowChapterTransition: false, queueDuringTransition: false });
      return;
    }

    performPrevPageNavigation({ allowChapterTransition: false, queueDuringTransition: false });
  }, [
    chapterIndex,
    isChapterNavigationReady,
    isPagedMode,
    performNextPageNavigation,
    performPrevPageNavigation,
    startChapterNavigation,
  ]);

  const toolbarHasPrev = isPagedMode
    ? pageIndex > 0 || Boolean(currentChapter?.hasPrev)
    : scrollModeChapters.length > 0
      ? chapterIndex > 0
      : chapterIndex > 0;
  const toolbarHasNext = isPagedMode
    ? pageIndex < pageCount - 1 || Boolean(currentChapter?.hasNext)
    : scrollModeChapters.length > 0
      ? chapterIndex < chapters.length - 1
      : chapterIndex < chapters.length - 1;

  return {
    goToChapter,
    goToNextPage,
    goToPrevPage,
    handleNext,
    handlePrev,
    toolbarHasPrev,
    toolbarHasNext,
  };
}
