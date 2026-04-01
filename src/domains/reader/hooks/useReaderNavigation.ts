import { useCallback, useMemo } from 'react';

import type { Chapter, ChapterContent } from '../api/readerApi';
import type { UsePagedReaderControllerResult } from './usePagedReaderController';
import type { PageTarget } from './useReaderStatePersistence';
import { useReaderContext } from '../pages/reader-page/ReaderContext';

type NavigationDirection = 'next' | 'prev';

interface UseReaderNavigationParams {
  chapters: Chapter[];
  currentChapter: ChapterContent | null;
  pagedNavigation: Pick<
    UsePagedReaderControllerResult,
    | 'goToChapter'
    | 'goToNextPage'
    | 'goToPrevPage'
    | 'goToNextPageSilently'
    | 'goToPrevPageSilently'
    | 'handleNext'
    | 'handlePrev'
    | 'toolbarHasPrev'
    | 'toolbarHasNext'
    | 'pageTurnDirection'
    | 'pageTurnToken'
  >;
  beforeChapterChange?: () => void;
}

interface UseReaderNavigationResult {
  goToChapter: (targetIndex: number, pageTarget?: PageTarget) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToNextPageSilently: () => void;
  goToPrevPageSilently: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  toolbarHasPrev: boolean;
  toolbarHasNext: boolean;
  pageTurnDirection: NavigationDirection;
  pageTurnToken: number;
}

export function useReaderNavigation({
  chapters,
  currentChapter,
  pagedNavigation,
  beforeChapterChange,
}: UseReaderNavigationParams): UseReaderNavigationResult {
  const {
    chapterIndex,
    mode,
    hasUserInteractedRef,
    chapterChangeSourceRef,
    persistReaderState,
    pageTargetRef,
    setChapterIndex,
  } = useReaderContext();
  const userInteractedRef = hasUserInteractedRef;
  const navigationSourceRef = chapterChangeSourceRef;
  const pendingPageTargetRef = pageTargetRef;
  const commitChapterNavigation = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    if (targetIndex < 0 || targetIndex >= chapters.length) {
      return;
    }

    beforeChapterChange?.();
    userInteractedRef.current = true;
    navigationSourceRef.current = 'navigation';
    pendingPageTargetRef.current = pageTarget;
    setChapterIndex(targetIndex);
    persistReaderState(
      mode === 'summary'
        ? {
          chapterIndex: targetIndex,
          mode,
          chapterProgress: pageTarget === 'end' ? 1 : 0,
        }
        : {
          chapterIndex: targetIndex,
          mode,
        },
    );
  }, [
    beforeChapterChange,
    chapters.length,
    mode,
    navigationSourceRef,
    pendingPageTargetRef,
    persistReaderState,
    setChapterIndex,
    userInteractedRef,
  ]);

  const chapterNavigation = useMemo<UseReaderNavigationResult>(() => {
    const goToChapter = (targetIndex: number, pageTarget: PageTarget = 'start') => {
      commitChapterNavigation(targetIndex, pageTarget);
    };
    const goToNextPage = () => {
      if (chapterIndex < chapters.length - 1) {
        goToChapter(chapterIndex + 1, 'start');
      }
    };
    const goToPrevPage = () => {
      if (chapterIndex > 0) {
        goToChapter(chapterIndex - 1, 'start');
      }
    };

    return {
      goToChapter,
      goToNextPage,
      goToPrevPage,
      goToNextPageSilently: goToNextPage,
      goToPrevPageSilently: goToPrevPage,
      handleNext: goToNextPage,
      handlePrev: goToPrevPage,
      toolbarHasPrev: chapterIndex > 0,
      toolbarHasNext: chapterIndex < chapters.length - 1,
      pageTurnDirection: 'next',
      pageTurnToken: 0,
    };
  }, [chapterIndex, chapters.length, commitChapterNavigation]);

  if (mode === 'paged') {
    return pagedNavigation;
  }

  return {
    ...chapterNavigation,
    toolbarHasPrev: chapterNavigation.toolbarHasPrev || Boolean(currentChapter?.hasPrev),
    toolbarHasNext: chapterNavigation.toolbarHasNext || Boolean(currentChapter?.hasNext),
  };
}
