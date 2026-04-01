import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  flushPersistence,
  hydrateSession,
  markUserInteracted,
  persistStoredReaderState,
  readInitialStoredReaderState,
  setSessionNovelId,
  useReaderSessionSelector,
  type StoredReaderState,
} from './sessionStore';

interface PersistReaderStateOptions {
  flush?: boolean;
}

export type { PageTarget, StoredReaderState } from './sessionStore';
export type { ReaderNavigationIntent, ReaderRestoreTarget } from './sessionStore';

function buildNovelScopedInitialState(
  initialStoredState: StoredReaderState | null,
): StoredReaderState {
  function resolveInitialMode(): StoredReaderState['mode'] {
    if (initialStoredState?.mode) return initialStoredState.mode;
    if (initialStoredState?.viewMode === 'summary') return 'summary';
    if (initialStoredState?.isTwoColumn) return 'paged';
    return 'scroll';
  }

  if (!initialStoredState) {
    return {
      chapterIndex: 0,
      mode: 'scroll',
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: undefined,
      scrollPosition: undefined,
      lastContentMode: 'scroll',
      locatorVersion: undefined,
      locator: undefined,
    };
  }

  return {
    chapterIndex: initialStoredState.chapterIndex ?? 0,
    mode: resolveInitialMode(),
    viewMode: initialStoredState.viewMode ?? (initialStoredState.mode === 'summary' ? 'summary' : 'original'),
    isTwoColumn: initialStoredState.isTwoColumn ?? (initialStoredState.mode === 'paged'),
    chapterProgress: initialStoredState.chapterProgress,
    scrollPosition: initialStoredState.scrollPosition,
    lastContentMode: initialStoredState.lastContentMode ?? (initialStoredState.mode === 'paged' ? 'paged' : 'scroll'),
    locatorVersion: initialStoredState.locator ? 1 : undefined,
    locator: initialStoredState.locator,
  };
}

export function useReaderStatePersistence(novelId: number): {
  latestReaderStateRef: React.MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: React.MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (nextState: StoredReaderState, options?: PersistReaderStateOptions) => void;
  flushReaderState: () => Promise<void>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
  initialStoredState: StoredReaderState | null;
} {
  const sessionNovelId = useReaderSessionSelector((state) => state.novelId);
  const hasUserInteracted = useReaderSessionSelector((state) => state.hasUserInteracted);
  const chapterIndex = useReaderSessionSelector((state) => state.chapterIndex);
  const mode = useReaderSessionSelector((state) => state.mode);
  const viewMode = useReaderSessionSelector((state) => state.viewMode);
  const isTwoColumn = useReaderSessionSelector((state) => state.isTwoColumn);
  const chapterProgress = useReaderSessionSelector((state) => state.chapterProgress);
  const scrollPosition = useReaderSessionSelector((state) => state.scrollPosition);
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const locatorVersion = useReaderSessionSelector((state) => state.locatorVersion);
  const locator = useReaderSessionSelector((state) => state.locator);
  const storedState = useMemo<StoredReaderState>(() => ({
    chapterIndex,
    mode,
    viewMode,
    isTwoColumn,
    chapterProgress,
    scrollPosition,
    lastContentMode,
    locatorVersion,
    locator,
  }), [
    chapterIndex,
    chapterProgress,
    isTwoColumn,
    lastContentMode,
    locator,
    locatorVersion,
    mode,
    scrollPosition,
    viewMode,
  ]);
  const snapshot = useMemo(() => ({
    novelId: sessionNovelId,
    hasUserInteracted,
    storedState,
  }), [hasUserInteracted, sessionNovelId, storedState]);

  const initialStoredState = useMemo(
    () => readInitialStoredReaderState(novelId),
    [novelId],
  );
  const novelScopedInitialState = useMemo(
    () => buildNovelScopedInitialState(initialStoredState),
    [initialStoredState],
  );
  const isSessionNovelAligned = !novelId || snapshot.novelId === novelId;
  const canPersistForCurrentNovel =
    !novelId || snapshot.novelId === novelId || snapshot.novelId === 0;
  const latestReaderStateRef = useRef<StoredReaderState>(
    isSessionNovelAligned ? snapshot.storedState : novelScopedInitialState,
  );
  const hasUserInteractedRef = useRef(snapshot.hasUserInteracted);

  useEffect(() => {
    if (!isSessionNovelAligned) {
      latestReaderStateRef.current = novelScopedInitialState;
      return;
    }

    latestReaderStateRef.current = snapshot.storedState;
  }, [isSessionNovelAligned, novelScopedInitialState, snapshot.storedState]);

  useEffect(() => {
    if (!isSessionNovelAligned) return;
    hasUserInteractedRef.current = snapshot.hasUserInteracted;
  }, [isSessionNovelAligned, snapshot.hasUserInteracted]);

  useEffect(() => {
    hasUserInteractedRef.current = false;
  }, [novelId]);

  const persistReaderState = useCallback(
    (nextState: StoredReaderState, options?: PersistReaderStateOptions) => {
      if (!canPersistForCurrentNovel) {
        return;
      }

      if (novelId) {
        setSessionNovelId(novelId);
      }
      let inferredMode: StoredReaderState['mode'] | undefined;
      if (nextState.viewMode === 'summary') {
        inferredMode = 'summary';
      } else if (nextState.isTwoColumn === true) {
        inferredMode = 'paged';
      } else if (
        nextState.viewMode === 'original' ||
        nextState.isTwoColumn === false
      ) {
        inferredMode = 'scroll';
      }
      const shouldRecomputeMode =
        inferredMode !== undefined && nextState.mode !== inferredMode;
      const mergedState: StoredReaderState = {
        ...latestReaderStateRef.current,
        ...nextState,
        ...(shouldRecomputeMode ? { mode: undefined } : {}),
      };
      latestReaderStateRef.current = mergedState;
      persistStoredReaderState(
        mergedState,
        { flush: options?.flush },
      );
    },
    [canPersistForCurrentNovel, novelId],
  );

  const loadPersistedReaderState = useCallback(async (): Promise<StoredReaderState> => {
    return hydrateSession(novelId);
  }, [novelId]);

  const flushReaderState = useCallback(async (): Promise<void> => {
    await flushPersistence();
  }, []);

  const handleMarkUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
    markUserInteracted();
  }, []);

  useEffect(() => {
    if (!novelId) return undefined;
    const handlePageHide = () => {
      flushReaderState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushReaderState();
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushReaderState();
    };
  }, [flushReaderState, novelId]);

  return {
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted: handleMarkUserInteracted,
    persistReaderState,
    flushReaderState,
    loadPersistedReaderState,
    initialStoredState,
  };
}
