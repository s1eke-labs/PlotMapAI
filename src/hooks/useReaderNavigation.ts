import { useCallback } from 'react';
import type { Chapter, ChapterContent } from '../api/reader';
import type { PageTarget, StoredReaderState } from './useReaderStatePersistence';

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
) {
  const goToChapter = useCallback((targetIndex: number, pageTarget: PageTarget = 'start') => {
    hasUserInteractedRef.current = true;
    pageTargetRef.current = pageTarget;
    setChapterIndex(targetIndex);
    persistReaderState({ chapterIndex: targetIndex });
  }, [persistReaderState, pageTargetRef, setChapterIndex, hasUserInteractedRef]);

  const goToNextPage = useCallback(() => {
    if (!currentChapter) return;

    if (pageIndex < pageCount - 1) {
      setPageIndex((prev) => prev + 1);
      return;
    }

    if (currentChapter.hasNext) {
      goToChapter(chapterIndex + 1, 'start');
    }
  }, [chapterIndex, currentChapter, goToChapter, pageCount, pageIndex, setPageIndex]);

  const goToPrevPage = useCallback(() => {
    if (!currentChapter) return;

    if (pageIndex > 0) {
      setPageIndex((prev) => prev - 1);
      return;
    }

    if (currentChapter.hasPrev) {
      goToChapter(chapterIndex - 1, 'end');
    }
  }, [chapterIndex, currentChapter, goToChapter, pageIndex, setPageIndex]);

  const handleNext = useCallback(() => {
    if (isPagedMode) {
      goToNextPage();
      return;
    }

    if (currentChapter?.hasNext) {
      goToChapter(chapterIndex + 1, 'start');
    }
  }, [isPagedMode, goToNextPage, currentChapter, goToChapter, chapterIndex]);

  const handlePrev = useCallback(() => {
    if (isPagedMode) {
      goToPrevPage();
      return;
    }

    if (currentChapter?.hasPrev) {
      goToChapter(chapterIndex - 1, 'start');
    }
  }, [isPagedMode, goToPrevPage, currentChapter, goToChapter, chapterIndex]);

  const toolbarHasPrev = isPagedMode
    ? pageIndex > 0 || Boolean(currentChapter?.hasPrev)
    : scrollModeChapters.length > 0
      ? scrollModeChapters[0] > 0
      : Boolean(currentChapter?.hasPrev);
  const toolbarHasNext = isPagedMode
    ? pageIndex < pageCount - 1 || Boolean(currentChapter?.hasNext)
    : scrollModeChapters.length > 0
      ? scrollModeChapters[scrollModeChapters.length - 1] < chapters.length - 1
      : Boolean(currentChapter?.hasNext);

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
