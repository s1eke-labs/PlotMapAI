import type { ReactNode } from 'react';
import type { ChapterContent } from '../../api/readerApi';
import type { ChapterChangeSource } from '../../hooks/navigationTypes';
import type { ScrollModeAnchor } from '../../hooks/useScrollModeChapters';
import type {
  PageTarget,
  ReaderMode,
  StoredReaderState,
} from '../../hooks/useReaderStatePersistence';
import type { ReaderLocator } from '../../utils/readerLayout';

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

import {
  getReaderSessionSnapshot,
  setChapterIndex as setSessionChapterIndex,
  setMode as setSessionMode,
  useReaderSessionSelector,
} from '../../hooks/sessionStore';
import { useReaderStatePersistence } from '../../hooks/useReaderStatePersistence';
import { getReaderViewMode, isPagedReaderMode } from '../../utils/readerMode';

type RestoreSettledResult = 'completed' | 'skipped' | 'failed';

export interface ReaderContextValue {
  novelId: number;
  chapterIndex: number;
  mode: ReaderMode;
  viewMode: 'original' | 'summary';
  isPagedMode: boolean;
  setChapterIndex: React.Dispatch<React.SetStateAction<number>>;
  setMode: React.Dispatch<React.SetStateAction<ReaderMode>>;
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (
    nextState: StoredReaderState,
    options?: { flush?: boolean },
  ) => void;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pageTargetRef: React.MutableRefObject<PageTarget | null>;
  wheelDeltaRef: React.MutableRefObject<number>;
  pageTurnLockedRef: React.MutableRefObject<boolean>;
  chapterCacheRef: React.MutableRefObject<Map<number, ChapterContent>>;
  scrollChapterElementsBridgeRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  scrollChapterBodyElementsBridgeRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  chapterChangeSourceRef: React.MutableRefObject<ChapterChangeSource>;
  pagedStateRef: React.MutableRefObject<{ pageCount: number; pageIndex: number }>;
  restoreSettledHandlerRef: React.MutableRefObject<(result: RestoreSettledResult) => void>;
  suppressScrollSyncTemporarilyRef: React.MutableRefObject<() => void>;
  getCurrentAnchorRef: React.MutableRefObject<() => ScrollModeAnchor | null>;
  handleScrollModeScrollRef: React.MutableRefObject<() => void>;
  readingAnchorHandlerRef: React.MutableRefObject<(anchor: ScrollModeAnchor) => void>;
  getCurrentOriginalLocatorRef: React.MutableRefObject<() => ReaderLocator | null>;
  getCurrentPagedLocatorRef: React.MutableRefObject<() => ReaderLocator | null>;
  resolveScrollLocatorOffsetRef: React.MutableRefObject<
    (locator: ReaderLocator) => number | null
  >;
}

const ReaderContext = createContext<ReaderContextValue | undefined>(undefined);

interface ReaderContextProviderProps {
  children: ReactNode;
  value: ReaderContextValue;
}

interface ReaderProviderProps {
  children: ReactNode;
  novelId: number;
}

export function ReaderContextProvider({
  children,
  value,
}: ReaderContextProviderProps) {
  return (
    <ReaderContext.Provider value={value}>
      {children}
    </ReaderContext.Provider>
  );
}

export function ReaderProvider({
  children,
  novelId,
}: ReaderProviderProps) {
  const readerStatePersistence = useReaderStatePersistence(novelId);
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const mode = useReaderSessionSelector((state) => state.mode);
  const viewMode = getReaderViewMode(mode);
  const isPagedMode = isPagedReaderMode(mode);
  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const pageTargetRef = useRef<PageTarget | null>(null);
  const wheelDeltaRef = useRef(0);
  const pageTurnLockedRef = useRef(false);
  const chapterCacheRef = useRef<Map<number, ChapterContent>>(new Map());
  const scrollChapterElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollChapterBodyElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const chapterChangeSourceRef = useRef<ChapterChangeSource>(null);
  const pagedStateRef = useRef({ pageCount: 1, pageIndex: 0 });
  const restoreSettledHandlerRef = useRef<(result: RestoreSettledResult) => void>(() => {});
  const suppressScrollSyncTemporarilyRef = useRef<() => void>(() => {});
  const getCurrentAnchorRef = useRef<() => ScrollModeAnchor | null>(() => null);
  const handleScrollModeScrollRef = useRef<() => void>(() => {});
  const readingAnchorHandlerRef = useRef<(anchor: ScrollModeAnchor) => void>(() => {});
  const getCurrentOriginalLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const getCurrentPagedLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const resolveScrollLocatorOffsetRef = useRef<
    (locator: ReaderLocator) => number | null
      >(() => null);

  const setChapterIndex = useCallback((nextState: React.SetStateAction<number>) => {
    const current = getReaderSessionSnapshot().chapterIndex;
    const nextValue = typeof nextState === 'function'
      ? nextState(current)
      : nextState;
    setSessionChapterIndex(nextValue, { persistRemote: false });
  }, []);

  const setMode = useCallback((nextState: React.SetStateAction<ReaderMode>) => {
    const currentMode = getReaderSessionSnapshot().mode;
    const nextValue = typeof nextState === 'function'
      ? nextState(currentMode)
      : nextState;
    setSessionMode(nextValue, { persistRemote: false });
  }, []);

  const value = useMemo<ReaderContextValue>(() => ({
    novelId,
    chapterIndex,
    mode,
    viewMode,
    isPagedMode,
    setChapterIndex,
    setMode,
    latestReaderStateRef: readerStatePersistence.latestReaderStateRef,
    hasUserInteractedRef: readerStatePersistence.hasUserInteractedRef,
    markUserInteracted: readerStatePersistence.markUserInteracted,
    persistReaderState: readerStatePersistence.persistReaderState,
    loadPersistedReaderState: readerStatePersistence.loadPersistedReaderState,
    contentRef,
    pagedViewportRef,
    pageTargetRef,
    wheelDeltaRef,
    pageTurnLockedRef,
    chapterCacheRef,
    scrollChapterElementsBridgeRef,
    scrollChapterBodyElementsBridgeRef,
    chapterChangeSourceRef,
    pagedStateRef,
    restoreSettledHandlerRef,
    suppressScrollSyncTemporarilyRef,
    getCurrentAnchorRef,
    handleScrollModeScrollRef,
    readingAnchorHandlerRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    resolveScrollLocatorOffsetRef,
  }), [
    chapterIndex,
    isPagedMode,
    mode,
    novelId,
    readerStatePersistence.hasUserInteractedRef,
    readerStatePersistence.latestReaderStateRef,
    readerStatePersistence.loadPersistedReaderState,
    readerStatePersistence.markUserInteracted,
    readerStatePersistence.persistReaderState,
    setChapterIndex,
    setMode,
    viewMode,
  ]);

  return (
    <ReaderContextProvider value={value}>
      {children}
    </ReaderContextProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReaderContext(): ReaderContextValue {
  const context = useContext(ReaderContext);
  if (!context) {
    throw new Error('useReaderContext must be used within a ReaderProvider');
  }

  return context;
}
