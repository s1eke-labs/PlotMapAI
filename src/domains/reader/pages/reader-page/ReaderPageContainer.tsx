import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appPaths } from '@app/router/paths';
import { useChapterAnalysis } from '@domains/analysis';

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
import { useReaderLifecycleController } from '../../hooks/useReaderLifecycleController';
import { useReaderMobileBack } from '../../hooks/useReaderMobileBack';
import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
} from '../../hooks/sessionStore';
import type { ChapterChangeSource } from '../../hooks/navigationTypes';

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
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pendingPagedPageTarget, setPendingPagedPageTarget] = useState<PageTarget | null>(null);
  const [scrollModeChapters, setScrollModeChapters] = useState<number[]>([]);
  const onChapterContentResolvedRef = useRef<(chapterIndex: number) => void>(() => {});
  const restoreSettledHandlerRef = useRef<(result: 'completed' | 'skipped' | 'failed') => void>(
    () => {},
  );
  const chapterChangeSourceRef = useRef<ChapterChangeSource>(null);
  const suppressScrollSyncTemporarilyRef = useRef<() => void>(() => {});
  const handleChapterContentResolved = useCallback((resolvedChapterIndex: number) => {
    onChapterContentResolvedRef.current(resolvedChapterIndex);
  }, []);
  const handleChapterDataSuppressScrollSync = useCallback(() => {
    suppressScrollSyncTemporarilyRef.current();
  }, []);

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback(() => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const viewMode = useReaderSessionSelector((state) => state.viewMode);
  const isTwoColumn = useReaderSessionSelector((state) => state.isTwoColumn);
  const analysis = useChapterAnalysis(novelId, viewMode === 'summary' ? chapterIndex : -1);
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

  const chapterData = useReaderChapterData({
    isPagedMode,
    setCurrentChapterWindow: setScrollModeChapters,
    setChapterIndex,
    setViewMode,
    setIsTwoColumn,
    setPageIndex,
    setPageCount,
    chapterChangeSourceRef,
    suppressScrollSyncTemporarily: handleChapterDataSuppressScrollSync,
    onChapterContentResolved: handleChapterContentResolved,
  });

  const restoreFlow = useReaderRestoreFlow({
    chapterIndex,
    setChapterIndex,
    chapterChangeSourceRef,
    viewMode,
    setViewMode,
    isTwoColumn,
    setIsTwoColumn,
    isPagedMode,
    pageIndex,
    pageCount,
    currentChapter: chapterData.currentChapter,
    summaryRestoreSignal: analysis.chapterAnalysis,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
    onRestoreSettled: (result) => {
      restoreSettledHandlerRef.current(result);
    },
  });

  useEffect(() => {
    suppressScrollSyncTemporarilyRef.current = restoreFlow.suppressScrollSyncTemporarily;
  }, [restoreFlow.suppressScrollSyncTemporarily]);

  const viewport = useReaderPageViewport({
    chapterData,
    chapterIndex,
    chapters: chapterData.chapters,
    currentChapter: chapterData.currentChapter,
    isPagedMode,
    pageIndex,
    pageCount,
    pendingRestoreTargetRef: restoreFlow.pendingRestoreTargetRef,
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
    clearPendingRestoreTarget: restoreFlow.clearPendingRestoreTarget,
    onChapterContentResolvedRef,
    viewMode,
  });

  const lifecycle = useReaderLifecycleController({
    novelId,
    chapterIndex,
    viewMode,
    isTwoColumn,
    isPagedMode,
    currentPagedLayoutChapterIndex: viewport.currentPagedLayout?.chapterIndex ?? null,
    chapterData,
    restoreFlow,
  });

  useEffect(() => {
    restoreSettledHandlerRef.current = lifecycle.handleRestoreSettled;
    return () => {
      restoreSettledHandlerRef.current = () => {};
    };
  }, [lifecycle.handleRestoreSettled]);

  const navigation = useReaderNavigation(
    chapterIndex,
    setChapterIndex,
    chapterData.currentChapter,
    isPagedMode,
    pageIndex,
    setPageIndex,
    pageCount,
    persistReaderState,
    pageTargetRef,
    setPendingPagedPageTarget,
    chapterData.chapters,
    scrollModeChapters,
    hasUserInteractedRef,
    chapterChangeSourceRef,
    lifecycle.isChapterNavigationReady,
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
    chapterData.currentChapter,
    lifecycle.lifecycleStatus === 'hydrating'
      || lifecycle.lifecycleStatus === 'loading-chapters'
      || lifecycle.lifecycleStatus === 'loading-chapter',
    isContentInteractionLocked,
    dismissBlockedInteraction,
    wheelDeltaRef,
    pageTurnLockedRef,
  );

  const handleSetPageTurnMode = useCallback((nextMode: ReaderPageTurnMode) => {
    if (nextMode === preferences.pageTurnMode) {
      return;
    }

    const nextIsPagedMode = isPagedPageTurnMode(nextMode);

    preferences.setPageTurnMode(nextMode);

    if (viewMode !== 'original') {
      return;
    }

    if (isTwoColumn !== nextIsPagedMode) {
      restoreFlow.handleSetIsTwoColumn(nextIsPagedMode);
    }
  }, [isTwoColumn, preferences, restoreFlow, viewMode]);

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

  const { renderableChapter, showLoadingOverlay } = lifecycle;

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
    disableAnimation: lifecycle.isRestoringPosition,
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

  const toolbarProps = chapterData.currentChapter && !showLoadingOverlay ? {
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
      readerError={lifecycle.readerError}
      sidebarProps={{
        chapters: chapterData.chapters,
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
        isRestoringPosition: lifecycle.isRestoringPosition,
        loadingLabel: lifecycle.loadingLabel,
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
