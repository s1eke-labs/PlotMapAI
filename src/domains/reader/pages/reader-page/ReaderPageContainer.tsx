import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appPaths } from '@app/router/paths';
import { useChapterAnalysis } from '@domains/analysis';
import type { AppError } from '@shared/errors';

import type { Chapter, ChapterContent } from '../../api/readerApi';
import type { PageTarget } from '../../hooks/useReaderStatePersistence';
import { isPagedPageTurnMode, type ReaderPageTurnMode } from '../../constants/pageTurnMode';
import ReaderPageLayout from './ReaderPageLayout';
import { useReaderPageContext } from './ReaderPageContext';
import { useReaderPageImageOverlay } from './useReaderPageImageOverlay';
import { useReaderPageViewport } from './useReaderPageViewport';
import { useReaderPreferences } from '../../hooks/useReaderPreferences';
import { useReaderRestoreFlow } from '../../hooks/useReaderRestoreFlow';
import { useSidebarDrag } from '../../hooks/useSidebarDrag';
import { useReaderNavigation } from '../../hooks/useReaderNavigation';
import { useReaderInput } from '../../hooks/useReaderInput';
import { useContentClick } from '../../hooks/useContentClick';
import { useReaderChapterData } from '../../hooks/useReaderChapterData';
import { useReaderMobileBack } from '../../hooks/useReaderMobileBack';
import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
} from '../../hooks/sessionStore';

export default function ReaderPageContainer() {
  const { t } = useTranslation();
  const {
    novelId,
    contentRef,
    pageTargetRef,
    wheelDeltaRef,
    pageTurnLockedRef,
    hasUserInteractedRef,
    persistReaderState,
  } = useReaderPageContext();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<ChapterContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [readerError, setReaderError] = useState<AppError | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pendingPagedPageTarget, setPendingPagedPageTarget] = useState<PageTarget | null>(null);
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
  const onChapterContentResolvedRef = useRef<(chapterIndex: number) => void>(() => {});
  const handleChapterContentResolved = useCallback((resolvedChapterIndex: number) => {
    onChapterContentResolvedRef.current(resolvedChapterIndex);
  }, []);

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback(() => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const restoreStatus = useReaderSessionSelector((state) => state.restoreStatus);
  const viewMode = useReaderSessionSelector((state) => state.viewMode);
  const analysis = useChapterAnalysis(novelId, viewMode === 'summary' ? chapterIndex : -1);
  const isTwoColumn = isPagedPageTurnMode(preferences.pageTurnMode);
  const isPagedMode = isTwoColumn && viewMode === 'original';
  const { handleMobileBack } = useReaderMobileBack({
    isSidebarOpen: sidebar.isSidebarOpen,
    closeSidebar,
    novelId,
  });

  const setChapterIndex = useCallback((nextState: React.SetStateAction<number>) => {
    const current = getReaderSessionSnapshot().chapterIndex;
    const nextValue = typeof nextState === 'function'
      ? nextState(current)
      : nextState;
    setSessionChapterIndex(nextValue, { persistRemote: false });
  }, []);

  const setViewMode = useCallback((nextState: React.SetStateAction<'original' | 'summary'>) => {
    const currentViewMode = getReaderSessionSnapshot().viewMode;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentViewMode)
      : nextState;
    let nextMode: 'paged' | 'scroll' | 'summary' = 'summary';
    if (nextValue !== 'summary') {
      nextMode = isPagedPageTurnMode(preferences.pageTurnMode) ? 'paged' : 'scroll';
    }
    setSessionMode(nextMode, { persistRemote: false });
  }, [preferences.pageTurnMode]);

  const setIsTwoColumn = useCallback((nextState: React.SetStateAction<boolean>) => {
    const currentSnapshot = getReaderSessionSnapshot();
    const currentValue = currentSnapshot.isTwoColumn;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentValue)
      : nextState;
    if (currentSnapshot.viewMode === 'summary') {
      return;
    }
    setSessionMode(nextValue ? 'paged' : 'scroll', { persistRemote: false });
  }, []);

  const restoreFlow = useReaderRestoreFlow({
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
    summaryRestoreSignal: analysis.chapterAnalysis,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
  });

  const chapterData = useReaderChapterData({
    chapterIndex,
    viewMode,
    isPagedMode,
    isTwoColumn,
    chapters,
    setChapters,
    setCurrentChapter,
    setCurrentChapterWindow: setScrollModeChapters,
    setIsLoading,
    setChapterIndex,
    setViewMode,
    setIsTwoColumn,
    setPageIndex,
    setPageCount,
    setReaderError,
    chapterChangeSourceRef: restoreFlow.chapterChangeSourceRef,
    setPendingRestoreState: restoreFlow.setPendingRestoreState,
    clearPendingRestoreState: restoreFlow.clearPendingRestoreState,
    suppressScrollSyncTemporarily: restoreFlow.suppressScrollSyncTemporarily,
    startRestoreMaskForState: restoreFlow.startRestoreMaskForState,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    setLoadingMessage,
    onChapterContentResolved: handleChapterContentResolved,
  });

  const viewport = useReaderPageViewport({
    chapterData,
    chapterIndex,
    chapters,
    currentChapter,
    isLoading,
    isPagedMode,
    pageIndex,
    pageCount,
    pendingRestoreStateRef: restoreFlow.pendingRestoreStateRef,
    preferences: {
      fontSize: preferences.fontSize,
      lineSpacing: preferences.lineSpacing,
      paragraphSpacing: preferences.paragraphSpacing,
    },
    scrollModeChapters,
    setScrollModeChapters,
    setPageCount,
    setPageIndex,
    setPendingPagedPageTarget,
    stopRestoreMask: restoreFlow.stopRestoreMask,
    clearPendingRestoreState: restoreFlow.clearPendingRestoreState,
    onChapterContentResolvedRef,
    viewMode,
  });

  const isChapterNavigationReady = !isLoading
    && currentChapter?.index === chapterIndex
    && (!isPagedMode || viewport.currentPagedLayout?.chapterIndex === chapterIndex);

  const navigation = useReaderNavigation(
    chapterIndex,
    setChapterIndex,
    currentChapter,
    isPagedMode,
    pageIndex,
    setPageIndex,
    pageCount,
    persistReaderState,
    pageTargetRef,
    setPendingPagedPageTarget,
    chapters,
    scrollModeChapters,
    hasUserInteractedRef,
    restoreFlow.chapterChangeSourceRef,
    isChapterNavigationReady,
    restoreFlow.handleBeforeChapterChange,
  );

  const {
    isChromeVisible,
    setIsChromeVisible,
    handleContentClick,
  } = useContentClick(isPagedMode, navigation.handlePrev, navigation.handleNext);
  const dismissBlockedInteraction = useCallback(() => {
    if (sidebar.isSidebarOpen) {
      closeSidebar();
    }
    if (isChromeVisible) {
      setIsChromeVisible(false);
    }
    wheelDeltaRef.current = 0;
  }, [closeSidebar, isChromeVisible, setIsChromeVisible, sidebar.isSidebarOpen, wheelDeltaRef]);

  const imageOverlay = useReaderPageImageOverlay({
    dismissBlockedInteraction,
    isEnabled: viewMode === 'original',
  });
  const isContentInteractionLocked =
    isChromeVisible || sidebar.isSidebarOpen || imageOverlay.isImageViewerOpen;

  useReaderInput(
    contentRef,
    isPagedMode,
    navigation.goToNextPage,
    navigation.goToPrevPage,
    navigation.goToChapter,
    chapterIndex,
    currentChapter,
    isLoading,
    isContentInteractionLocked,
    dismissBlockedInteraction,
    wheelDeltaRef,
    pageTurnLockedRef,
  );

  const handleSetPageTurnMode = useCallback((nextMode: ReaderPageTurnMode) => {
    if (nextMode === preferences.pageTurnMode) {
      return;
    }

    const currentIsPagedMode = isPagedPageTurnMode(preferences.pageTurnMode);
    const nextIsPagedMode = isPagedPageTurnMode(nextMode);

    preferences.setPageTurnMode(nextMode);

    if (viewMode !== 'original') {
      return;
    }

    if (currentIsPagedMode !== nextIsPagedMode) {
      restoreFlow.handleSetIsTwoColumn(nextIsPagedMode);
    }
  }, [preferences, restoreFlow, viewMode]);

  const handleViewportClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (sidebar.isSidebarOpen) {
      dismissBlockedInteraction();
      return;
    }

    handleContentClick(event);
  }, [dismissBlockedInteraction, handleContentClick, sidebar.isSidebarOpen]);

  const handleViewportScroll = useCallback(() => {
    viewport.syncViewportState();
    restoreFlow.handleContentScroll();
  }, [restoreFlow, viewport]);

  const handleSelectChapter = useCallback((index: number) => {
    navigation.goToChapter(index, 'start');
    sidebar.setIsSidebarOpen(false);
  }, [navigation, sidebar]);

  const renderableChapter = !isLoading ? currentChapter : null;
  const showLoadingOverlay = isLoading
    || restoreStatus === 'restoring'
    || (isPagedMode && Boolean(renderableChapter) && viewport.currentPagedLayout === null);

  const pagedContentProps = renderableChapter && isPagedMode ? {
    chapter: renderableChapter,
    currentLayout: viewport.currentPagedLayout,
    novelId,
    onImageActivate: imageOverlay.handleImageActivate,
    onRegisterImageElement: imageOverlay.handleRegisterImageElement,
    pageIndex,
    pendingPageTarget: pendingPagedPageTarget,
    pagedViewportRef: viewport.handlePagedViewportRef,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
    headerBgClassName: preferences.headerBg,
    pageBgClassName: preferences.currentTheme.bg,
    pageTurnMode: preferences.pageTurnMode,
    pageTurnDirection: navigation.pageTurnDirection,
    pageTurnToken: navigation.pageTurnToken,
    previousChapterPreview: viewport.previousChapterPreview,
    previousLayout: viewport.previousPagedLayout,
    nextChapterPreview: viewport.nextChapterPreview,
    nextLayout: viewport.nextPagedLayout,
    onRequestPrevPage: navigation.goToPrevPageSilently,
    onRequestNextPage: navigation.goToNextPageSilently,
    disableAnimation: restoreFlow.isRestoringPosition,
    interactionLocked: isContentInteractionLocked,
  } : undefined;

  const scrollContentProps = renderableChapter && viewMode === 'original' && !isPagedMode ? {
    chapters: viewport.renderableScrollLayouts,
    novelId,
    onImageActivate: imageOverlay.handleImageActivate,
    onRegisterImageElement: imageOverlay.handleRegisterImageElement,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
    headerBgClassName: preferences.headerBg,
    onChapterElement: viewport.handleScrollChapterElement,
    onChapterBodyElement: viewport.handleScrollChapterBodyElement,
    visibleBlockRangeByChapter: viewport.visibleScrollBlockRangeByChapter,
  } : undefined;

  const summaryContentProps = renderableChapter && viewMode === 'summary' ? {
    chapter: renderableChapter,
    novelId,
    analysis: analysis.chapterAnalysis,
    job: analysis.analysisStatus?.job ?? null,
    isLoading: analysis.isChapterAnalysisLoading,
    isAnalyzingChapter: analysis.isAnalyzingChapter,
    onAnalyzeChapter: analysis.handleAnalyzeChapter,
    readerTheme: preferences.readerTheme,
    textClassName: preferences.currentTheme.text,
    headerBgClassName: preferences.headerBg,
  } : undefined;

  const toolbarProps = currentChapter && !showLoadingOverlay ? {
    sliders: {
      fontSize: preferences.fontSize,
      setFontSize: preferences.setFontSize,
      lineSpacing: preferences.lineSpacing,
      setLineSpacing: preferences.setLineSpacing,
      paragraphSpacing: preferences.paragraphSpacing,
      setParagraphSpacing: preferences.setParagraphSpacing,
    },
    pageTurnMode: preferences.pageTurnMode,
    setPageTurnMode: handleSetPageTurnMode,
    hasPrev: navigation.toolbarHasPrev,
    hasNext: navigation.toolbarHasNext,
    onPrev: navigation.handlePrev,
    onNext: navigation.handleNext,
    navigationMode: isPagedMode ? 'page' as const : 'chapter' as const,
    readerTheme: preferences.readerTheme,
    headerBgClassName: preferences.headerBg,
    textClassName: preferences.currentTheme.text,
    setReaderTheme: preferences.setReaderTheme,
    hidden: !isChromeVisible,
    isSidebarOpen: sidebar.isSidebarOpen,
    onToggleSidebar: sidebar.toggleSidebar,
    onCloseSidebar: closeSidebar,
  } : undefined;

  return (
    <ReaderPageLayout
      imageViewerProps={imageOverlay.imageViewerProps}
      pageBgClassName={preferences.currentTheme.bg}
      readerError={readerError}
      sidebarProps={{
        chapters,
        currentIndex: chapterIndex,
        contentTextColor: preferences.currentTheme.text,
        isSidebarOpen: sidebar.isSidebarOpen,
        sidebarBgClassName: preferences.currentTheme.sidebarBg,
        onClose: closeSidebar,
        onSelectChapter: handleSelectChapter,
      }}
      toolbarProps={toolbarProps}
      topBarProps={{
        readerTheme: preferences.readerTheme,
        headerBgClassName: preferences.headerBg,
        textClassName: preferences.currentTheme.text,
        isChromeVisible,
        isSidebarOpen: sidebar.isSidebarOpen,
        novelId,
        viewMode,
        onMobileBack: handleMobileBack,
        onToggleSidebar: sidebar.toggleSidebar,
        onSetViewMode: restoreFlow.handleSetViewMode,
      }}
      viewportProps={{
        contentRef,
        isPagedMode,
        interactionLocked: isContentInteractionLocked,
        viewMode,
        renderableChapter,
        showLoadingOverlay,
        isRestoringPosition: restoreFlow.isRestoringPosition,
        loadingLabel: restoreStatus === 'restoring' ? t('reader.restoringPosition') : loadingMessage,
        onBlockedInteraction: dismissBlockedInteraction,
        onContentClick: handleViewportClick,
        onContentScroll: handleViewportScroll,
        emptyHref: appPaths.novel(novelId),
        emptyLabel: t('reader.noChapters'),
        goBackLabel: t('reader.goBack'),
        pagedContentProps,
        scrollContentProps,
        summaryContentProps,
      }}
      novelId={novelId}
    />
  );
}
