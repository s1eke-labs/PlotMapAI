import type { ChapterContent } from '../../api/readerApi';
import type { ReaderPageTurnMode } from '../../constants/pageTurnMode';
import type { AnimationPlaybackControls, PanInfo, Variants } from 'motion/react';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { cn } from '@shared/utils/cn';

import { getPageTurnAnimation, type PageTurnDirection } from '../../animations/pageTurnAnimations';
import { getPagedPageCount, getPagedScrollLeft } from '../../hooks/usePagedReaderLayout';
import {
  clampDragOffset,
  getPagedDragLayerOffsets,
  shouldCommitPageTurnDrag,
} from '../../utils/pagedDrag';
import ReaderChapterSection from './ReaderChapterSection';

const DRAG_START_THRESHOLD_PX = 8;

interface PagedReaderContentProps {
  chapter: ChapterContent;
  novelId: number;
  pageIndex: number;
  pageCount: number;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pagedContentRef: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
  pageBgClassName?: string;
  fitsTwoColumns: boolean;
  twoColumnWidth: number | undefined;
  twoColumnGap: number;
  pageTurnMode: ReaderPageTurnMode;
  pageTurnDirection: PageTurnDirection;
  pageTurnToken: number;
  previousChapterPreview?: ChapterContent | null;
  nextChapterPreview?: ChapterContent | null;
  onRequestPrevPage?: () => void;
  onRequestNextPage?: () => void;
  disableAnimation?: boolean;
}

interface PagedContentBodyProps {
  chapter: ChapterContent;
  novelId: number;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  twoColumnGap: number;
  twoColumnWidth: number | undefined;
  fitsTwoColumns: boolean;
  pageOffset?: number;
}

interface LayoutMetrics {
  scrollWidth: number;
  viewportWidth: number;
}

interface PreviewMeasurements {
  previousScrollWidth: number;
  nextScrollWidth: number;
}

interface PagePreviewTarget {
  chapter: ChapterContent;
  pageOffset: number;
}

function getLastPageOffset(scrollWidth: number, viewportWidth: number, pageTurnStep: number): number {
  const pageCount = getPagedPageCount(scrollWidth, viewportWidth, pageTurnStep);
  return getPagedScrollLeft(
    pageCount - 1,
    pageTurnStep,
    Math.max(0, scrollWidth - viewportWidth),
  );
}

function PagedContentBody({
  chapter,
  novelId,
  contentRef,
  fontSize,
  lineSpacing,
  paragraphSpacing,
  twoColumnGap,
  twoColumnWidth,
  fitsTwoColumns,
  pageOffset = 0,
}: PagedContentBodyProps) {
  return (
    <div
      ref={contentRef}
      className="h-full font-serif text-justify tracking-wide opacity-90 selection:bg-accent/30 md:text-left"
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: String(lineSpacing),
        columnGap: fitsTwoColumns ? `${twoColumnGap}px` : '0px',
        columnWidth: twoColumnWidth ? `${twoColumnWidth}px` : undefined,
        columnFill: 'auto',
        columnRule: fitsTwoColumns ? '1px solid var(--border-color)' : undefined,
        transform: pageOffset > 0 ? `translateX(-${pageOffset}px)` : undefined,
      }}
    >
      <ReaderChapterSection
        title={chapter.title}
        content={chapter.content}
        novelId={novelId}
        paragraphSpacing={paragraphSpacing}
        headingClassName="text-xl sm:text-2xl font-bold text-center mb-8 mt-2 break-inside-avoid"
        headingStyle={{ lineHeight: '1.4' }}
        paragraphClassName="indent-8"
        mixedParagraphClassName="break-inside-avoid"
      />
    </div>
  );
}

export default function PagedReaderContent({
  chapter,
  novelId,
  pageIndex,
  pageCount,
  pagedViewportRef,
  pagedContentRef,
  fontSize,
  lineSpacing,
  paragraphSpacing,
  readerTheme,
  textClassName,
  headerBgClassName,
  pageBgClassName,
  fitsTwoColumns,
  twoColumnWidth,
  twoColumnGap,
  pageTurnMode,
  pageTurnDirection,
  pageTurnToken,
  previousChapterPreview = null,
  nextChapterPreview = null,
  onRequestPrevPage,
  onRequestNextPage,
  disableAnimation = false,
}: PagedReaderContentProps) {
  const [layoutMetrics, setLayoutMetrics] = useState<LayoutMetrics>({
    scrollWidth: 0,
    viewportWidth: 0,
  });
  const [previewMeasurements, setPreviewMeasurements] = useState<PreviewMeasurements>({
    previousScrollWidth: 0,
    nextScrollWidth: 0,
  });
  const [dragDirection, setDragDirection] = useState<PageTurnDirection | null>(null);

  const previousPreviewContentRef = useRef<HTMLDivElement | null>(null);
  const nextPreviewContentRef = useRef<HTMLDivElement | null>(null);
  const dragAnimationRef = useRef<AnimationPlaybackControls | null>(null);
  const suppressNextClickRef = useRef(false);

  const dragOffset = useMotionValue(0);
  const currentLayerX = useTransform(dragOffset, (offset) => {
    if (!dragDirection || (pageTurnMode !== 'cover' && pageTurnMode !== 'slide')) {
      return 0;
    }

    return getPagedDragLayerOffsets(
      pageTurnMode,
      dragDirection,
      offset,
      layoutMetrics.viewportWidth,
    ).currentX;
  });
  const previewLayerX = useTransform(dragOffset, (offset) => {
    if (!dragDirection || (pageTurnMode !== 'cover' && pageTurnMode !== 'slide')) {
      return 0;
    }

    return getPagedDragLayerOffsets(
      pageTurnMode,
      dragDirection,
      offset,
      layoutMetrics.viewportWidth,
    ).previewX;
  });

  const stopDragAnimation = useCallback(() => {
    dragAnimationRef.current?.stop();
    dragAnimationRef.current = null;
  }, []);

  const resetDragState = useCallback(() => {
    stopDragAnimation();
    dragOffset.set(0);
    setDragDirection(null);
  }, [dragOffset, stopDragAnimation]);

  useEffect(() => {
    const viewport = pagedViewportRef.current;
    const content = pagedContentRef.current;
    if (!viewport || !content) {
      return;
    }

    const measureLayout = () => {
      const nextMetrics = {
        scrollWidth: content.scrollWidth,
        viewportWidth: viewport.clientWidth,
      };
      setLayoutMetrics((previous) => (
        previous.scrollWidth === nextMetrics.scrollWidth
        && previous.viewportWidth === nextMetrics.viewportWidth
      )
        ? previous
        : nextMetrics);
    };

    const frameId = requestAnimationFrame(measureLayout);
    const observer = new ResizeObserver(measureLayout);
    observer.observe(viewport);
    observer.observe(content);
    content.addEventListener('load', measureLayout, true);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      content.removeEventListener('load', measureLayout, true);
    };
  }, [
    chapter.index,
    fitsTwoColumns,
    fontSize,
    lineSpacing,
    pagedContentRef,
    pagedViewportRef,
    paragraphSpacing,
    twoColumnGap,
    twoColumnWidth,
  ]);

  useEffect(() => {
    const previousContent = previousPreviewContentRef.current;
    const nextContent = nextPreviewContentRef.current;

    const updatePreviewMeasurements = () => {
      setPreviewMeasurements((previous) => {
        const nextState = {
          previousScrollWidth: previousContent?.scrollWidth ?? 0,
          nextScrollWidth: nextContent?.scrollWidth ?? 0,
        };

        return previous.previousScrollWidth === nextState.previousScrollWidth
          && previous.nextScrollWidth === nextState.nextScrollWidth
          ? previous
          : nextState;
      });
    };

    const frameId = requestAnimationFrame(updatePreviewMeasurements);
    const observer = new ResizeObserver(updatePreviewMeasurements);
    if (previousContent) {
      observer.observe(previousContent);
      previousContent.addEventListener('load', updatePreviewMeasurements, true);
    }
    if (nextContent) {
      observer.observe(nextContent);
      nextContent.addEventListener('load', updatePreviewMeasurements, true);
    }

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      if (previousContent) {
        previousContent.removeEventListener('load', updatePreviewMeasurements, true);
      }
      if (nextContent) {
        nextContent.removeEventListener('load', updatePreviewMeasurements, true);
      }
    };
  }, [
    fitsTwoColumns,
    fontSize,
    lineSpacing,
    nextChapterPreview?.index,
    paragraphSpacing,
    previousChapterPreview?.index,
    twoColumnGap,
    twoColumnWidth,
  ]);

  useEffect(() => {
    return () => {
      stopDragAnimation();
    };
  }, [stopDragAnimation]);

  const pageTurnStep = layoutMetrics.viewportWidth
    ? layoutMetrics.viewportWidth + (fitsTwoColumns ? twoColumnGap : 0)
    : 0;
  const currentMaxScrollLeft = Math.max(0, layoutMetrics.scrollWidth - layoutMetrics.viewportWidth);
  const visiblePageOffset = getPagedScrollLeft(pageIndex, pageTurnStep, currentMaxScrollLeft);

  const previousPreviewTarget = useMemo<PagePreviewTarget | null>(() => {
    if (!pageTurnStep || !layoutMetrics.viewportWidth) {
      return null;
    }

    if (pageIndex > 0) {
      return {
        chapter,
        pageOffset: getPagedScrollLeft(pageIndex - 1, pageTurnStep, currentMaxScrollLeft),
      };
    }

    if (!previousChapterPreview || previewMeasurements.previousScrollWidth <= 0) {
      return null;
    }

    return {
      chapter: previousChapterPreview,
      pageOffset: getLastPageOffset(
        previewMeasurements.previousScrollWidth,
        layoutMetrics.viewportWidth,
        pageTurnStep,
      ),
    };
  }, [
    chapter,
    currentMaxScrollLeft,
    layoutMetrics.viewportWidth,
    pageIndex,
    pageTurnStep,
    previewMeasurements.previousScrollWidth,
    previousChapterPreview,
  ]);

  const nextPreviewTarget = useMemo<PagePreviewTarget | null>(() => {
    if (!pageTurnStep || !layoutMetrics.viewportWidth) {
      return null;
    }

    if (pageIndex < pageCount - 1) {
      return {
        chapter,
        pageOffset: getPagedScrollLeft(pageIndex + 1, pageTurnStep, currentMaxScrollLeft),
      };
    }

    if (!nextChapterPreview || previewMeasurements.nextScrollWidth <= 0) {
      return null;
    }

    return {
      chapter: nextChapterPreview,
      pageOffset: 0,
    };
  }, [
    chapter,
    currentMaxScrollLeft,
    layoutMetrics.viewportWidth,
    nextChapterPreview,
    pageCount,
    pageIndex,
    pageTurnStep,
    previewMeasurements.nextScrollWidth,
  ]);

  const canDragPrev = previousPreviewTarget !== null && typeof onRequestPrevPage === 'function';
  const canDragNext = nextPreviewTarget !== null && typeof onRequestNextPage === 'function';
  const isDragEnabled = !disableAnimation
    && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
    && layoutMetrics.viewportWidth > 0
    && (canDragPrev || canDragNext);
  const dragLayerOffsets = dragDirection && (pageTurnMode === 'cover' || pageTurnMode === 'slide')
    ? getPagedDragLayerOffsets(pageTurnMode, dragDirection, 0, layoutMetrics.viewportWidth)
    : null;
  const activePreviewTarget = dragDirection === 'prev'
    ? previousPreviewTarget
    : dragDirection === 'next'
      ? nextPreviewTarget
      : null;

  const handlePanStart = useCallback(() => {
    if (!isDragEnabled) {
      return;
    }

    stopDragAnimation();
  }, [isDragEnabled, stopDragAnimation]);

  const handlePan = useCallback((_event: PointerEvent, info: PanInfo) => {
    if (!isDragEnabled) {
      return;
    }

    const nextOffset = clampDragOffset(
      info.offset.x,
      layoutMetrics.viewportWidth,
      canDragPrev,
      canDragNext,
    );

    if (Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      dragOffset.set(0);
      setDragDirection(null);
      return;
    }

    const nextDirection = nextOffset > 0 ? 'prev' : 'next';
    dragOffset.set(nextOffset);
    setDragDirection(previous => previous === nextDirection ? previous : nextDirection);
    suppressNextClickRef.current = true;
  }, [canDragNext, canDragPrev, dragOffset, isDragEnabled, layoutMetrics.viewportWidth]);

  const handlePanEnd = useCallback((_event: PointerEvent, info: PanInfo) => {
    if (!isDragEnabled) {
      return;
    }

    const nextOffset = clampDragOffset(
      info.offset.x,
      layoutMetrics.viewportWidth,
      canDragPrev,
      canDragNext,
    );
    const nextDirection = nextOffset > 0 ? 'prev' : nextOffset < 0 ? 'next' : null;

    if (!nextDirection || Math.abs(nextOffset) < DRAG_START_THRESHOLD_PX) {
      suppressNextClickRef.current = false;
      resetDragState();
      return;
    }

    const shouldCommit = shouldCommitPageTurnDrag(
      nextOffset,
      info.velocity.x,
      layoutMetrics.viewportWidth,
    );
    const targetOffset = shouldCommit
      ? nextDirection === 'next'
        ? -layoutMetrics.viewportWidth
        : layoutMetrics.viewportWidth
      : 0;
    const animation = getPageTurnAnimation(pageTurnMode);

    dragAnimationRef.current = animate(dragOffset, targetOffset, {
      ...animation.transition,
      onComplete: () => {
        dragAnimationRef.current = null;
        if (shouldCommit) {
          if (nextDirection === 'next') {
            onRequestNextPage?.();
          } else {
            onRequestPrevPage?.();
          }
        } else {
          suppressNextClickRef.current = false;
        }
        dragOffset.set(0);
        setDragDirection(null);
      },
    });
  }, [
    canDragNext,
    canDragPrev,
    dragOffset,
    isDragEnabled,
    layoutMetrics.viewportWidth,
    onRequestNextPage,
    onRequestPrevPage,
    pageTurnMode,
    resetDragState,
  ]);

  const handleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressNextClickRef.current = false;
  }, []);

  const animationMode = disableAnimation || pageTurnMode === 'scroll' || pageTurnToken === 0
    ? 'none'
    : pageTurnMode;
  const pageTurnAnimation = getPageTurnAnimation(animationMode);
  const variants: Variants = {
    enter: (custom: PageTurnDirection) => pageTurnAnimation.initial({ direction: custom }) as never,
    center: (custom: PageTurnDirection) => pageTurnAnimation.animate({ direction: custom }) as never,
    exit: (custom: PageTurnDirection) => pageTurnAnimation.exit({ direction: custom }) as never,
  };

  return (
    <div className={cn('mx-auto flex h-full w-full max-w-[1400px] flex-col px-4 sm:px-8 md:px-12', textClassName)}>
      <div className={cn('mb-4 flex shrink-0 items-center justify-between gap-4 border-b border-border-color/20 py-3', headerBgClassName)}>
        <h1 className={cn('truncate text-sm font-medium transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
          {chapter.title}
        </h1>
        {pageCount > 1 ? (
          <div className="whitespace-nowrap text-xs font-medium text-text-secondary">{pageIndex + 1} / {pageCount}</div>
        ) : null}
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={pagedViewportRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden opacity-0"
        >
          <PagedContentBody
            chapter={chapter}
            novelId={novelId}
            contentRef={pagedContentRef}
            fontSize={fontSize}
            lineSpacing={lineSpacing}
            paragraphSpacing={paragraphSpacing}
            twoColumnGap={twoColumnGap}
            twoColumnWidth={twoColumnWidth}
            fitsTwoColumns={fitsTwoColumns}
          />
        </div>

        {previousChapterPreview ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-0">
            <PagedContentBody
              chapter={previousChapterPreview}
              novelId={novelId}
              contentRef={previousPreviewContentRef}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              paragraphSpacing={paragraphSpacing}
              twoColumnGap={twoColumnGap}
              twoColumnWidth={twoColumnWidth}
              fitsTwoColumns={fitsTwoColumns}
            />
          </div>
        ) : null}

        {nextChapterPreview ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-0">
            <PagedContentBody
              chapter={nextChapterPreview}
              novelId={novelId}
              contentRef={nextPreviewContentRef}
              fontSize={fontSize}
              lineSpacing={lineSpacing}
              paragraphSpacing={paragraphSpacing}
              twoColumnGap={twoColumnGap}
              twoColumnWidth={twoColumnWidth}
              fitsTwoColumns={fitsTwoColumns}
            />
          </div>
        ) : null}

        <motion.div
          data-testid="paged-reader-interactive"
          className="relative h-full overflow-hidden"
          style={isDragEnabled ? { touchAction: 'pan-y' } : undefined}
          onClickCapture={handleClickCapture}
          onPan={handlePan}
          onPanEnd={handlePanEnd}
          onPanStart={handlePanStart}
        >
          {dragDirection && activePreviewTarget ? (
            <>
              <motion.div
                className={cn(
                  'absolute inset-0 overflow-hidden',
                  pageBgClassName ?? headerBgClassName,
                  dragLayerOffsets?.isPreviewOnTop ? 'z-0' : 'z-10',
                )}
                style={{ x: currentLayerX }}
              >
                <PagedContentBody
                  chapter={chapter}
                  novelId={novelId}
                  fontSize={fontSize}
                  lineSpacing={lineSpacing}
                  paragraphSpacing={paragraphSpacing}
                  twoColumnGap={twoColumnGap}
                  twoColumnWidth={twoColumnWidth}
                  fitsTwoColumns={fitsTwoColumns}
                  pageOffset={visiblePageOffset}
                />
              </motion.div>

              <motion.div
                className={cn(
                  'absolute inset-0 overflow-hidden',
                  pageBgClassName ?? headerBgClassName,
                  dragLayerOffsets?.isPreviewOnTop ? 'z-10' : 'z-0',
                )}
                style={{ x: previewLayerX }}
              >
                <PagedContentBody
                  chapter={activePreviewTarget.chapter}
                  novelId={novelId}
                  fontSize={fontSize}
                  lineSpacing={lineSpacing}
                  paragraphSpacing={paragraphSpacing}
                  twoColumnGap={twoColumnGap}
                  twoColumnWidth={twoColumnWidth}
                  fitsTwoColumns={fitsTwoColumns}
                  pageOffset={activePreviewTarget.pageOffset}
                />
              </motion.div>
            </>
          ) : (
            <AnimatePresence custom={pageTurnDirection} initial={false} mode="sync">
              <motion.div
                key={`${chapter.index}:${pageIndex}`}
                className={cn('absolute inset-0 overflow-hidden', pageBgClassName ?? headerBgClassName)}
                custom={pageTurnDirection}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={pageTurnAnimation.transition}
              >
                <PagedContentBody
                  chapter={chapter}
                  novelId={novelId}
                  fontSize={fontSize}
                  lineSpacing={lineSpacing}
                  paragraphSpacing={paragraphSpacing}
                  twoColumnGap={twoColumnGap}
                  twoColumnWidth={twoColumnWidth}
                  fitsTwoColumns={fitsTwoColumns}
                  pageOffset={visiblePageOffset}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </div>
    </div>
  );
}
