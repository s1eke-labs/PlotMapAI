import type { ReaderPageTurnMode } from '../../constants/pageTurnMode';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReaderViewportContext } from '@shared/reader-runtime';
import { resolveContentModeFromPageTurnMode } from '@shared/utils/readerMode';

import { useReaderChapterData } from '@domains/reader-content';
import { useContentClick, useReaderInput, useReaderMobileBack, useSidebarDrag } from '@domains/reader-interaction';
import { useReaderLayoutController } from '@domains/reader-layout-engine';
import { useReaderPageImageOverlay } from '@domains/reader-media';
import { useReaderRestoreController, useReaderSession } from '@domains/reader-session';

import { useReaderPreferences } from '../../hooks/useReaderPreferences';
import { useReaderAnalysisBridge } from '../../reader-analysis-bridge';
import ReaderPageLayout from './ReaderPageLayout';

interface ReaderPageContainerProps {
  analysisController: import('../../reader-analysis-bridge').ReaderAnalysisBridgeController;
  novelId: number;
  novelDetailHref: string;
}

export default function ReaderPageContainer({
  analysisController,
  novelId,
  novelDetailHref,
}: ReaderPageContainerProps) {
  const { t } = useTranslation();
  const { contentRef } = useReaderViewportContext();
  const pageTurnLockedRef = useRef(false);
  const wheelDeltaRef = useRef(0);
  const session = useReaderSession(novelId);
  const { snapshot: sessionSnapshot, commands: sessionCommands } = session;
  const {
    chapterIndex,
    isPagedMode,
    mode,
    viewMode,
  } = sessionSnapshot;
  const [chapterContentVersion, setChapterContentVersion] = useState(0);
  const handleChapterContentResolved = useCallback(() => {
    setChapterContentVersion((previousVersion) => previousVersion + 1);
  }, []);
  const resetInteractionState = useCallback(() => {
    wheelDeltaRef.current = 0;
    pageTurnLockedRef.current = false;
  }, []);

  const preferences = useReaderPreferences();
  const sidebar = useSidebarDrag();
  const closeSidebar = useCallback(() => {
    sidebar.setIsSidebarOpen(false);
  }, [sidebar]);
  const analysis = useReaderAnalysisBridge({
    controller: analysisController,
    novelId,
    chapterIndex,
    viewMode,
  });
  const { handleMobileBack } = useReaderMobileBack({
    fallbackHref: novelDetailHref,
    isSidebarOpen: sidebar.isSidebarOpen,
    closeSidebar,
  });

  const chapterData = useReaderChapterData({
    novelId,
    sessionSnapshot,
    sessionCommands,
    onChapterContentResolved: handleChapterContentResolved,
    resetInteractionState,
  });

  const restoreFlow = useReaderRestoreController({
    sessionSnapshot,
    sessionCommands,
    currentChapter: chapterData.currentChapter,
    summaryRestoreSignal: analysis.summaryRestoreSignal,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
  });
  const layoutController = useReaderLayoutController({
    analysis,
    chapterContentVersion,
    chapterData,
    novelId,
    preferences,
    restoreFlow,
    session,
  });
  const { lifecycle, navigation, restore, viewport } = layoutController;

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
    resetInteractionState();
  }, [
    closeSidebar,
    isChromeVisible,
    resetInteractionState,
    setIsChromeVisible,
    sidebar.isSidebarOpen,
  ]);

  const imageOverlay = useReaderPageImageOverlay({
    dismissBlockedInteraction,
    isEnabled: viewMode === 'original',
    novelId,
  });
  const isContentInteractionLocked =
    isChromeVisible || sidebar.isSidebarOpen || imageOverlay.isImageViewerOpen;
  const viewportContent = viewport.buildContentProps({
    imageHandlers: {
      onImageActivate: imageOverlay.handleImageActivate,
      onRegisterImageElement: imageOverlay.handleRegisterImageElement,
    },
    interactionLocked: isContentInteractionLocked,
  });

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

    preferences.setPageTurnMode(nextMode);

    if (mode === 'summary') {
      return;
    }

    const nextContentMode = resolveContentModeFromPageTurnMode(nextMode);
    if (mode !== nextContentMode) {
      restore.handleSetContentMode(nextContentMode);
    }
  }, [mode, preferences, restore]);

  const handleViewportClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (sidebar.isSidebarOpen) {
      dismissBlockedInteraction();
      return;
    }

    handleContentClick(event);
  }, [dismissBlockedInteraction, handleContentClick, sidebar.isSidebarOpen]);

  const handleSelectChapter = useCallback((index: number) => {
    navigation.goToChapter(index, 'start');
    sidebar.setIsSidebarOpen(false);
  }, [navigation, sidebar]);

  const toolbarProps = chapterData.currentChapter && !lifecycle.showLoadingOverlay ? {
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
      backHref={novelDetailHref}
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
        exitHref: novelDetailHref,
        viewMode,
        onMobileBack: handleMobileBack,
        onToggleSidebar: sidebar.toggleSidebar,
        onSetViewMode: restore.handleSetViewMode,
      }}
      viewportProps={{
        contentRef,
        isPagedMode,
        interactionLocked: isContentInteractionLocked,
        viewMode,
        renderableChapter: viewport.renderableChapter,
        showLoadingOverlay: lifecycle.showLoadingOverlay,
        isRestoringPosition: lifecycle.isRestoringPosition,
        loadingLabel: lifecycle.loadingLabel,
        onBlockedInteraction: dismissBlockedInteraction,
        onContentClick: handleViewportClick,
        onContentScroll: viewport.handleViewportScroll,
        emptyHref: novelDetailHref,
        emptyLabel: t('reader.noChapters'),
        goBackLabel: t('reader.goBack'),
        pagedContentProps: viewportContent.pagedContentProps,
        scrollContentProps: viewportContent.scrollContentProps,
        summaryContentProps: viewportContent.summaryContentProps,
      }}
    />
  );
}
