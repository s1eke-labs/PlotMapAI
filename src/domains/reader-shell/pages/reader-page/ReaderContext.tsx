/* eslint-disable react-refresh/only-export-components */

import type { ReactNode } from 'react';
import type {
  ReaderLayoutQueriesValue,
  ReaderNavigationRuntimeValue,
  ReaderPersistenceRuntimeValue,
  ReaderViewportContextValue,
} from '@shared/contracts/reader';

import { useEffect, useMemo } from 'react';

import {
  ReaderLayoutQueriesContextProvider,
  ReaderNavigationRuntimeContextProvider,
  ReaderPersistenceRuntimeContextProvider,
  ReaderRuntimeProvider,
  ReaderViewportContextProvider,
  useReaderLayoutQueries,
  useReaderNavigationRuntime,
  useReaderPersistenceRuntime,
  useReaderViewportContext,
} from '@shared/reader-runtime';
import {
  flushReaderPreferencesPersistence,
} from '../../hooks/readerPreferencesStore';
import { flushPersistence } from '@domains/reader-session';

interface ReaderProviderProps {
  children: ReactNode;
  novelId: number;
}

export interface ReaderContextValue extends
  ReaderViewportContextValue,
  ReaderNavigationRuntimeValue,
  ReaderLayoutQueriesValue,
  ReaderPersistenceRuntimeValue {}

interface ReaderContextProviderProps {
  children: ReactNode;
  value: ReaderContextValue;
}

function ReaderPersistenceBoundary({ children }: ReaderProviderProps) {
  const persistence = useReaderPersistenceRuntime();

  useEffect(() => {
    const flushReaderPersistence = async (): Promise<void> => {
      persistence.runBeforeFlush();
      await Promise.all([
        flushPersistence(),
        flushReaderPreferencesPersistence(),
      ]).catch(() => undefined);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushReaderPersistence().catch(() => undefined);
      }
    };

    const handlePageHide = () => {
      flushReaderPersistence().catch(() => undefined);
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushReaderPersistence().catch(() => undefined);
    };
  }, [persistence]);

  return children;
}

export function ReaderContextProvider({
  children,
  value,
}: ReaderContextProviderProps) {
  const viewportValue = useMemo<ReaderViewportContextValue>(() => ({
    contentRef: value.contentRef,
    pagedViewportRef: value.pagedViewportRef,
  }), [value.contentRef, value.pagedViewportRef]);

  const navigationValue = useMemo<ReaderNavigationRuntimeValue>(() => ({
    getChapterChangeSource: value.getChapterChangeSource,
    getPagedState: value.getPagedState,
    getPendingPageTarget: value.getPendingPageTarget,
    setChapterChangeSource: value.setChapterChangeSource,
    setPagedState: value.setPagedState,
    setPendingPageTarget: value.setPendingPageTarget,
  }), [
    value.getChapterChangeSource,
    value.getPagedState,
    value.getPendingPageTarget,
    value.setChapterChangeSource,
    value.setPagedState,
    value.setPendingPageTarget,
  ]);

  const layoutQueriesValue = useMemo<ReaderLayoutQueriesValue>(() => ({
    clearScrollChapterBodyElements: value.clearScrollChapterBodyElements,
    clearScrollChapterElements: value.clearScrollChapterElements,
    getCurrentAnchor: value.getCurrentAnchor,
    getCurrentOriginalLocator: value.getCurrentOriginalLocator,
    getCurrentPagedLocator: value.getCurrentPagedLocator,
    getScrollChapterBodyElement: value.getScrollChapterBodyElement,
    getScrollChapterElement: value.getScrollChapterElement,
    hasScrollChapterBodyElement: value.hasScrollChapterBodyElement,
    registerCurrentAnchorResolver: value.registerCurrentAnchorResolver,
    registerCurrentOriginalLocatorResolver: value.registerCurrentOriginalLocatorResolver,
    registerCurrentPagedLocatorResolver: value.registerCurrentPagedLocatorResolver,
    registerScrollChapterBodyElement: value.registerScrollChapterBodyElement,
    registerScrollChapterElement: value.registerScrollChapterElement,
    registerScrollLocatorOffsetResolver: value.registerScrollLocatorOffsetResolver,
    resolveScrollLocatorOffset: value.resolveScrollLocatorOffset,
  }), [
    value.clearScrollChapterBodyElements,
    value.clearScrollChapterElements,
    value.getCurrentAnchor,
    value.getCurrentOriginalLocator,
    value.getCurrentPagedLocator,
    value.getScrollChapterBodyElement,
    value.getScrollChapterElement,
    value.hasScrollChapterBodyElement,
    value.registerCurrentAnchorResolver,
    value.registerCurrentOriginalLocatorResolver,
    value.registerCurrentPagedLocatorResolver,
    value.registerScrollChapterBodyElement,
    value.registerScrollChapterElement,
    value.registerScrollLocatorOffsetResolver,
    value.resolveScrollLocatorOffset,
  ]);

  const persistenceValue = useMemo<ReaderPersistenceRuntimeValue>(() => ({
    isScrollSyncSuppressed: value.isScrollSyncSuppressed,
    notifyRestoreSettled: value.notifyRestoreSettled,
    registerBeforeFlush: value.registerBeforeFlush,
    registerRestoreSettledHandler: value.registerRestoreSettledHandler,
    runBeforeFlush: value.runBeforeFlush,
    suppressScrollSyncTemporarily: value.suppressScrollSyncTemporarily,
  }), [
    value.isScrollSyncSuppressed,
    value.notifyRestoreSettled,
    value.registerBeforeFlush,
    value.registerRestoreSettledHandler,
    value.runBeforeFlush,
    value.suppressScrollSyncTemporarily,
  ]);

  return (
    <ReaderViewportContextProvider value={viewportValue}>
      <ReaderNavigationRuntimeContextProvider value={navigationValue}>
        <ReaderLayoutQueriesContextProvider value={layoutQueriesValue}>
          <ReaderPersistenceRuntimeContextProvider value={persistenceValue}>
            {children}
          </ReaderPersistenceRuntimeContextProvider>
        </ReaderLayoutQueriesContextProvider>
      </ReaderNavigationRuntimeContextProvider>
    </ReaderViewportContextProvider>
  );
}

export function useReaderContext(): ReaderContextValue {
  const viewport = useReaderViewportContext();
  const navigation = useReaderNavigationRuntime();
  const layoutQueries = useReaderLayoutQueries();
  const persistence = useReaderPersistenceRuntime();

  return {
    ...viewport,
    ...navigation,
    ...layoutQueries,
    ...persistence,
  };
}

export function ReaderProvider({
  children,
  novelId,
}: ReaderProviderProps) {
  return (
    <ReaderRuntimeProvider key={novelId}>
      <ReaderPersistenceBoundary novelId={novelId}>
        {children}
      </ReaderPersistenceBoundary>
    </ReaderRuntimeProvider>
  );
}
