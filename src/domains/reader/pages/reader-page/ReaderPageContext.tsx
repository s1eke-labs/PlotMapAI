import type { ReactNode } from 'react';
import type { ChapterContent } from '../../api/readerApi';
import type { ScrollModeAnchor } from '../../hooks/useScrollModeChapters';
import type { PageTarget, StoredReaderState } from '../../hooks/useReaderStatePersistence';
import type { ReaderLocator } from '../../utils/readerLayout';

import { createContext, useContext, useMemo, useRef } from 'react';

import { useReaderStatePersistence } from '../../hooks/useReaderStatePersistence';

export interface ReaderPageContextValue {
  novelId: number;
  hasHydratedReaderState: boolean;
  setHasHydratedReaderState: React.Dispatch<React.SetStateAction<boolean>>;
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
  getCurrentAnchorRef: React.MutableRefObject<() => ScrollModeAnchor | null>;
  handleScrollModeScrollRef: React.MutableRefObject<() => void>;
  readingAnchorHandlerRef: React.MutableRefObject<(anchor: ScrollModeAnchor) => void>;
  getCurrentOriginalLocatorRef: React.MutableRefObject<() => ReaderLocator | null>;
  getCurrentPagedLocatorRef: React.MutableRefObject<() => ReaderLocator | null>;
  resolveScrollLocatorOffsetRef: React.MutableRefObject<
    (locator: ReaderLocator) => number | null
  >;
}

const ReaderPageContext = createContext<ReaderPageContextValue | undefined>(undefined);

interface ReaderPageContextProviderProps {
  children: ReactNode;
  value: ReaderPageContextValue;
}

interface ReaderPageProviderProps {
  children: ReactNode;
  novelId: number;
}

export function ReaderPageContextProvider({
  children,
  value,
}: ReaderPageContextProviderProps) {
  return (
    <ReaderPageContext.Provider value={value}>
      {children}
    </ReaderPageContext.Provider>
  );
}

export function ReaderPageProvider({
  children,
  novelId,
}: ReaderPageProviderProps) {
  const readerStatePersistence = useReaderStatePersistence(novelId);
  const contentRef = useRef<HTMLDivElement>(null);
  const pagedViewportRef = useRef<HTMLDivElement>(null);
  const pageTargetRef = useRef<PageTarget | null>(null);
  const wheelDeltaRef = useRef(0);
  const pageTurnLockedRef = useRef(false);
  const chapterCacheRef = useRef<Map<number, ChapterContent>>(new Map());
  const scrollChapterElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollChapterBodyElementsBridgeRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const getCurrentAnchorRef = useRef<() => ScrollModeAnchor | null>(() => null);
  const handleScrollModeScrollRef = useRef<() => void>(() => {});
  const readingAnchorHandlerRef = useRef<(anchor: ScrollModeAnchor) => void>(() => {});
  const getCurrentOriginalLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const getCurrentPagedLocatorRef = useRef<() => ReaderLocator | null>(() => null);
  const resolveScrollLocatorOffsetRef = useRef<
    (locator: ReaderLocator) => number | null
      >(() => null);

  const value = useMemo<ReaderPageContextValue>(() => ({
    novelId,
    hasHydratedReaderState: readerStatePersistence.hasHydratedReaderState,
    setHasHydratedReaderState: readerStatePersistence.setHasHydratedReaderState,
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
    getCurrentAnchorRef,
    handleScrollModeScrollRef,
    readingAnchorHandlerRef,
    getCurrentOriginalLocatorRef,
    getCurrentPagedLocatorRef,
    resolveScrollLocatorOffsetRef,
  }), [
    novelId,
    readerStatePersistence.hasHydratedReaderState,
    readerStatePersistence.hasUserInteractedRef,
    readerStatePersistence.latestReaderStateRef,
    readerStatePersistence.loadPersistedReaderState,
    readerStatePersistence.markUserInteracted,
    readerStatePersistence.persistReaderState,
    readerStatePersistence.setHasHydratedReaderState,
  ]);

  return (
    <ReaderPageContextProvider value={value}>
      {children}
    </ReaderPageContextProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReaderPageContext(): ReaderPageContextValue {
  const context = useContext(ReaderPageContext);
  if (!context) {
    throw new Error('useReaderPageContext must be used within a ReaderPageProvider');
  }

  return context;
}
