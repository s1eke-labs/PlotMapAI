import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  ensureReaderPreferencesHydrated,
  getReaderPreferencesSnapshot,
  hasConfiguredReaderPageTurnMode,
} from '@domains/reader-shell';
import {
  flushPersistence,
  getStoredReaderStateSnapshot,
  hydrateSession,
  markUserInteracted,
  persistStoredReaderState,
  readInitialStoredReaderState,
  setSessionNovelId,
  useReaderSessionSelector,
} from './readerSessionStore';
import type { StoredReaderState } from '@shared/contracts/reader';
import {
  buildStoredReaderState,
  clampChapterProgress,
  clampPageIndex,
  createDefaultStoredReaderState,
  mergeStoredReaderState,
} from './state';

interface PersistReaderStateOptions {
  flush?: boolean;
  persistRemote?: boolean;
}

export type { PageTarget, ReaderMode, ReaderNavigationIntent, ReaderRestoreTarget, StoredReaderState } from '@shared/contracts/reader';

function buildNovelScopedInitialState(
  initialStoredState: StoredReaderState | null,
): StoredReaderState {
  if (!initialStoredState) {
    return createDefaultStoredReaderState();
  }

  return buildStoredReaderState(initialStoredState);
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
  const canonical = useReaderSessionSelector((state) => state.canonical);
  const mode = useReaderSessionSelector((state) => state.mode);
  const lastContentMode = useReaderSessionSelector((state) => state.lastContentMode);
  const chapterProgress = useReaderSessionSelector((state) => state.chapterProgress);
  const locator = useReaderSessionSelector((state) => state.locator);
  const storedState = useMemo<StoredReaderState>(() => ({
    canonical,
    hints: {
      chapterProgress: clampChapterProgress(chapterProgress),
      pageIndex: clampPageIndex(locator?.pageIndex),
      contentMode: mode === 'summary' ? lastContentMode : mode,
    },
  }), [
    canonical,
    chapterProgress,
    lastContentMode,
    locator,
    mode,
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
      const mergedState = mergeStoredReaderState(
        latestReaderStateRef.current,
        nextState,
      );
      persistStoredReaderState(
        mergedState,
        {
          flush: options?.flush,
          persistRemote: options?.persistRemote,
        },
      );
      latestReaderStateRef.current = getStoredReaderStateSnapshot();
    },
    [canPersistForCurrentNovel, novelId],
  );

  const loadPersistedReaderState = useCallback(async (): Promise<StoredReaderState> => {
    await ensureReaderPreferencesHydrated();
    const preferences = getReaderPreferencesSnapshot();
    return hydrateSession(novelId, {
      hasConfiguredPageTurnMode: hasConfiguredReaderPageTurnMode(),
      pageTurnMode: preferences.pageTurnMode,
    });
  }, [novelId]);

  const flushReaderState = useCallback(async (): Promise<void> => {
    await flushPersistence();
  }, []);

  const handleMarkUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
    markUserInteracted();
  }, []);

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
