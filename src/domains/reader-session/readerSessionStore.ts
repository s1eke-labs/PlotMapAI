import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ReaderPageTurnMode } from '@shared/contracts/reader/preferences';
import {
  createPersistedRuntime,
} from '@shared/stores/persistence/createPersistedRuntime';
import {
  resetReaderPreferenceStoreForTests,
} from '@shared/stores/readerPreferenceStore';
import {
  createRestoreTargetFromPersistedState,
  shouldKeepReaderRestoreMask,
} from '@shared/utils/readerPosition';
import {
  resolveContentModeFromPageTurnMode,
  resolveLastContentMode,
} from '@shared/utils/readerMode';
import type {
  ReaderMode,
  ReaderRestoreTarget,
  ReaderSessionSnapshot,
  ReaderSessionState,
  RestoreStatus,
  StoredReaderState,
} from '@shared/contracts/reader';
import {
  readReaderBootstrapSnapshot,
  writeReaderBootstrapSnapshot,
} from '@infra/storage/readerStateCache';
import {
  buildStoredReaderState,
  clampChapterProgress,
  clampPageIndex,
  createDefaultStoredReaderState,
  getStoredChapterIndex,
  mergeStoredReaderState,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from './state';
import {
  readReadingProgress,
  replaceReadingProgress,
  toReadingProgress,
  type ReadingProgress,
} from './repository';

interface ReaderSessionInternalState extends ReaderSessionState {}

export interface ReaderSessionActions {
  hydrateSession: (
    novelId: number,
    options?: ReaderSessionHydrationOptions,
  ) => Promise<StoredReaderState>;
  setMode: (mode: ReaderMode, options?: SessionUpdateOptions) => void;
  setChapterIndex: (chapterIndex: number, options?: SessionUpdateOptions) => void;
  setReadingPosition: (state: StoredReaderState, options?: SessionUpdateOptions) => void;
  beginRestore: (target: ReaderRestoreTarget | null | undefined) => void;
  completeRestore: () => void;
  failRestore: () => void;
  flushPersistence: () => Promise<void>;
}

interface SessionUpdateOptions {
  flush?: boolean;
  persistRemote?: boolean;
  markUserInteracted?: boolean;
}

export interface ReaderSessionHydrationOptions {
  hasConfiguredPageTurnMode?: boolean;
  pageTurnMode?: ReaderPageTurnMode;
}

type ReaderSessionStore = StoreApi<ReaderSessionInternalState>;

const READER_STATE_SYNC_DELAY_MS = 400;

let lastSyncedRemoteSnapshot = '';
let sessionHydrationEpoch = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function setLastSyncedRemoteSnapshot(snapshot: string): void {
  lastSyncedRemoteSnapshot = snapshot;
}

function readLocalSessionState(novelId: number): StoredReaderState | null {
  if (!isBrowser() || !novelId) {
    return null;
  }

  const snapshot = readReaderBootstrapSnapshot(novelId);
  if (!snapshot) {
    return null;
  }

  return buildStoredReaderState(snapshot.state);
}

function shouldMaskRestore(target: ReaderRestoreTarget | null | undefined): boolean {
  return shouldKeepReaderRestoreMask(target);
}

function toStoredReaderState(state: ReaderSessionInternalState): StoredReaderState {
  const canonical = state.canonical
    ?? toCanonicalPositionFromLocator(state.locator)
    ?? {
      chapterIndex: state.chapterIndex,
      edge: 'start' as const,
    };

  return buildStoredReaderState({
    canonical,
    hints: {
      chapterProgress: clampChapterProgress(state.chapterProgress),
      pageIndex: clampPageIndex(state.locator?.pageIndex),
      contentMode: state.mode === 'summary' ? state.lastContentMode : state.mode,
    },
  });
}

function getRemoteProgressSnapshot(progress: ReadingProgress | null): string {
  if (!progress) {
    return 'null';
  }

  return JSON.stringify({
    canonical: progress.canonical,
  });
}

function toRemoteProgress(state: ReaderSessionInternalState): ReadingProgress | null {
  return toReadingProgress(toStoredReaderState(state));
}

function createInitialReaderSessionState(): ReaderSessionInternalState {
  const initialStoredState = createDefaultStoredReaderState();
  const chapterIndex = getStoredChapterIndex(initialStoredState);
  const mode: ReaderMode = 'scroll';

  return {
    novelId: 0,
    canonical: initialStoredState.canonical,
    mode,
    chapterIndex,
    chapterProgress: initialStoredState.hints?.chapterProgress,
    locator: toReaderLocatorFromCanonical(
      initialStoredState.canonical,
      initialStoredState.hints?.pageIndex,
    ),
    restoreStatus: 'hydrating',
    lastContentMode: 'scroll',
    pendingRestoreTarget: null,
    hasUserInteracted: false,
  };
}

export function createReaderSessionStore(): ReaderSessionStore {
  return createStore<ReaderSessionInternalState>()(
    subscribeWithSelector(() => createInitialReaderSessionState()),
  );
}

export const readerSessionStore = createReaderSessionStore();

function writeReaderSessionCache(state: ReaderSessionInternalState): void {
  if (!isBrowser() || !state.novelId) {
    return;
  }

  writeReaderBootstrapSnapshot(state.novelId, toStoredReaderState(state));
}

async function persistRemoteReaderSession(state: ReaderSessionInternalState): Promise<void> {
  const { novelId } = state;
  if (!novelId) {
    return;
  }

  const progress = toRemoteProgress(state);
  if (!progress) {
    return;
  }

  const snapshot = getRemoteProgressSnapshot(progress);
  if (snapshot === lastSyncedRemoteSnapshot) {
    return;
  }

  await replaceReadingProgress(novelId, {
    canonical: progress.canonical,
  });
  setLastSyncedRemoteSnapshot(snapshot);
}

const readerSessionRuntime = createPersistedRuntime<ReaderSessionInternalState>({
  createInitialState: createInitialReaderSessionState,
  isEnabled: isBrowser,
  onReset: () => {
    sessionHydrationEpoch += 1;
    lastSyncedRemoteSnapshot = '';
    resetReaderPreferenceStoreForTests();
  },
  persist: persistRemoteReaderSession,
  persistDelayMs: READER_STATE_SYNC_DELAY_MS,
  store: readerSessionStore,
  writeCache: writeReaderSessionCache,
});

function updateStoredReaderState(
  nextState: StoredReaderState,
  options: SessionUpdateOptions = {},
): StoredReaderState {
  const currentState = readerSessionStore.getState();
  const merged = mergeStoredReaderState(toStoredReaderState(currentState), nextState);
  const nextCanonical = merged.canonical;
  const nextChapterIndex = getStoredChapterIndex(merged);
  const nextLocator = toReaderLocatorFromCanonical(nextCanonical, merged.hints?.pageIndex);
  const shouldPersistRemote = options.persistRemote ?? true;

  readerSessionRuntime.patch({
    canonical: nextCanonical,
    chapterIndex: nextChapterIndex,
    chapterProgress: clampChapterProgress(merged.hints?.chapterProgress),
    locator: nextLocator,
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  }, {
    bumpRevision: shouldPersistRemote,
    flush: options.flush,
    persist: shouldPersistRemote,
  });

  return merged;
}

export async function hydrateSession(
  novelId: number,
  options: ReaderSessionHydrationOptions = {},
): Promise<StoredReaderState> {
  await readerSessionRuntime.flush();
  sessionHydrationEpoch += 1;
  const epochAtStart = sessionHydrationEpoch;
  const localState = readLocalSessionState(novelId);
  const initialStoredState = createDefaultStoredReaderState();

  readerSessionRuntime.patch({
    novelId,
    restoreStatus: 'hydrating',
    pendingRestoreTarget: null,
    hasUserInteracted: false,
    canonical: initialStoredState.canonical,
    chapterIndex: getStoredChapterIndex(initialStoredState),
    chapterProgress: undefined,
    locator: toReaderLocatorFromCanonical(initialStoredState.canonical),
    mode: 'scroll',
    lastContentMode: 'scroll',
  }, { writeCache: false });

  let remoteState: StoredReaderState | null = null;
  try {
    remoteState = await readReadingProgress(novelId);
    if (remoteState) {
      setLastSyncedRemoteSnapshot(getRemoteProgressSnapshot(toReadingProgress(remoteState)));
    }
  } catch {
    remoteState = null;
  }

  if (epochAtStart !== sessionHydrationEpoch) {
    return buildStoredReaderState(remoteState ?? localState);
  }

  const baseState = buildStoredReaderState(remoteState ?? localState);
  const resolvedPageTurnMode = options.pageTurnMode ?? 'scroll';
  const mode = resolveContentModeFromPageTurnMode(resolvedPageTurnMode);
  const nextLastContentMode = resolveLastContentMode(
    mode,
    mode === 'paged' ? 'paged' : 'scroll',
  );
  const pendingRestoreTarget = createRestoreTargetFromPersistedState(baseState, mode);

  readerSessionRuntime.patch({
    novelId,
    canonical: baseState.canonical,
    mode,
    chapterIndex: getStoredChapterIndex(baseState),
    chapterProgress: clampChapterProgress(baseState.hints?.chapterProgress),
    locator: toReaderLocatorFromCanonical(baseState.canonical, baseState.hints?.pageIndex),
    lastContentMode: nextLastContentMode,
    pendingRestoreTarget,
    restoreStatus: shouldMaskRestore(pendingRestoreTarget) ? 'restoring' : 'ready',
  });

  return baseState;
}

export function setMode(mode: ReaderMode, options: SessionUpdateOptions = {}): void {
  const currentState = readerSessionStore.getState();
  readerSessionRuntime.patch({
    mode,
    lastContentMode: resolveLastContentMode(mode, currentState.lastContentMode),
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  }, {
    flush: options.flush,
    persist: false,
  });
}

export function setChapterIndex(chapterIndex: number, options: SessionUpdateOptions = {}): void {
  const currentState = readerSessionStore.getState();
  const shouldPersistRemote = options.persistRemote ?? false;

  readerSessionRuntime.patch({
    chapterIndex,
    chapterProgress:
      currentState.chapterIndex === chapterIndex ? currentState.chapterProgress : undefined,
    locator:
      currentState.locator?.chapterIndex === chapterIndex ? currentState.locator : undefined,
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  }, {
    bumpRevision: shouldPersistRemote,
    flush: options.flush,
    persist: shouldPersistRemote,
  });
}

export function setReadingPosition(
  nextState: StoredReaderState,
  options: SessionUpdateOptions = {},
): void {
  updateStoredReaderState(nextState, {
    persistRemote: options.persistRemote ?? true,
    markUserInteracted: options.markUserInteracted,
    flush: options.flush,
  });
}

export function setPendingRestoreTarget(nextTarget: ReaderRestoreTarget | null): void {
  readerSessionRuntime.patch({ pendingRestoreTarget: nextTarget }, { writeCache: false });
}

export function setRestoreStatus(restoreStatus: RestoreStatus): void {
  readerSessionRuntime.patch({ restoreStatus }, { writeCache: false });
}

export function setSessionNovelId(novelId: number): void {
  if (readerSessionStore.getState().novelId === novelId) {
    return;
  }

  readerSessionRuntime.patch({ novelId }, { writeCache: false });
}

export function beginRestore(nextTarget: ReaderRestoreTarget | null | undefined): void {
  readerSessionRuntime.patch({
    pendingRestoreTarget: nextTarget ?? null,
    restoreStatus: shouldMaskRestore(nextTarget) ? 'restoring' : 'ready',
  }, { writeCache: false });
}

export function completeRestore(): void {
  readerSessionRuntime.patch({
    pendingRestoreTarget: null,
    restoreStatus: 'ready',
  }, { writeCache: false });
}

export function failRestore(): void {
  readerSessionRuntime.patch({ restoreStatus: 'error' }, { writeCache: false });
}

export function markUserInteracted(): void {
  readerSessionRuntime.patch({ hasUserInteracted: true }, { writeCache: false });
}

export function getReaderSessionSnapshot(): ReaderSessionSnapshot {
  return readerSessionStore.getState();
}

export function getStoredReaderStateSnapshot(): StoredReaderState {
  return toStoredReaderState(readerSessionStore.getState());
}

export function readInitialStoredReaderState(novelId: number): StoredReaderState | null {
  const localState = readLocalSessionState(novelId);
  return localState ? buildStoredReaderState(localState) : null;
}

export function persistStoredReaderState(
  nextState: StoredReaderState,
  options?: { flush?: boolean; persistRemote?: boolean },
): void {
  updateStoredReaderState(nextState, {
    persistRemote: options?.persistRemote ?? true,
    flush: options?.flush,
  });
}

export async function flushPersistence(): Promise<void> {
  await readerSessionRuntime.flush();
}

export function useReaderSessionSelector<T>(
  selector: (state: ReaderSessionSnapshot) => T,
): T {
  return useStore(readerSessionStore, selector);
}

export function useReaderSessionActions(): ReaderSessionActions {
  return {
    hydrateSession,
    setMode,
    setChapterIndex,
    setReadingPosition,
    beginRestore,
    completeRestore,
    failRestore,
    flushPersistence,
  };
}

export function resetReaderSessionStoreForTests(): void {
  readerSessionRuntime.reset();
}
