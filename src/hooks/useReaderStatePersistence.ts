import { useState, useCallback, useRef } from 'react';

export type PageTarget = 'start' | 'end';

export type StoredReaderState = {
  chapterIndex?: number;
  viewMode?: 'original' | 'summary';
  isTwoColumn?: boolean;
};

function readStoredReaderState(novelId: number): StoredReaderState | null {
  if (!novelId) return null;

  try {
    const raw = localStorage.getItem(`reader-state:${novelId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredReaderState;
    return {
      chapterIndex: typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined,
      viewMode: parsed.viewMode === 'summary' || parsed.viewMode === 'original' ? parsed.viewMode : undefined,
      isTwoColumn: typeof parsed.isTwoColumn === 'boolean' ? parsed.isTwoColumn : undefined,
    };
  } catch {
    return null;
  }
}

function writeStoredReaderState(novelId: number, state: StoredReaderState) {
  if (!novelId) return;

  localStorage.setItem(`reader-state:${novelId}`, JSON.stringify(state));
}

export function useReaderStatePersistence(novelId: number) {
  const initialStoredState = readStoredReaderState(novelId);

  const [hasHydratedReaderState, setHasHydratedReaderState] = useState(false);

  const latestReaderStateRef = useRef<StoredReaderState>({
    chapterIndex: initialStoredState?.chapterIndex ?? 0,
    viewMode: initialStoredState?.viewMode ?? 'original',
    isTwoColumn: initialStoredState?.isTwoColumn ?? false,
  });
  const hasUserInteractedRef = useRef(false);

  const persistReaderState = useCallback((nextState: StoredReaderState) => {
    const mergedState: StoredReaderState = {
      chapterIndex: nextState.chapterIndex ?? latestReaderStateRef.current.chapterIndex ?? 0,
      viewMode: nextState.viewMode ?? latestReaderStateRef.current.viewMode ?? 'original',
      isTwoColumn: nextState.isTwoColumn ?? latestReaderStateRef.current.isTwoColumn ?? false,
    };

    latestReaderStateRef.current = mergedState;
    writeStoredReaderState(novelId, mergedState);
  }, [novelId]);

  const markUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, []);

  return {
    hasHydratedReaderState,
    setHasHydratedReaderState,
    latestReaderStateRef,
    hasUserInteractedRef,
    markUserInteracted,
    persistReaderState,
    initialStoredState,
  };
}
