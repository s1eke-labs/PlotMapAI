import type { ReaderLocator } from '../utils/readerLayout';

import {
  applyHydratedAppTheme,
  ensureAppThemeHydrated,
  flushAppThemePersistence,
  resetAppThemeStoreForTests,
  setAppThemeNovelId,
} from '@app/stores/appThemeStore';
import { mergeReaderStateCacheSnapshot, readReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';
import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { readerApi, type ReadingProgress } from '../api/readerApi';
import type { ReaderPageTurnMode } from '../constants/pageTurnMode';
import { isPagedPageTurnMode } from '../constants/pageTurnMode';
import {
  applyHydratedReaderPreferences,
  ensureReaderPreferencesHydrated,
  flushReaderPreferencesPersistence,
  getReaderPreferencesSnapshot,
  hasConfiguredReaderPageTurnMode,
  resetReaderPreferencesStoreForTests,
  setReaderPreferencesNovelId,
} from './readerPreferencesStore';
import { hasRestorableReaderPosition } from '../utils/readerPosition';
import type {
  ReaderMode,
  ReaderSessionSnapshot,
  ReaderSessionState,
  RestoreStatus,
  StoredReaderState,
} from './readerSessionTypes';

interface ReaderSessionInternalState extends ReaderSessionState {}

export interface ReaderSessionActions {
  hydrateSession: (novelId: number) => Promise<StoredReaderState>;
  setMode: (mode: ReaderMode, options?: SessionUpdateOptions) => void;
  setChapterIndex: (chapterIndex: number, options?: SessionUpdateOptions) => void;
  setReadingPosition: (state: StoredReaderState, options?: SessionUpdateOptions) => void;
  beginRestore: (state: StoredReaderState | null | undefined) => void;
  completeRestore: () => void;
  failRestore: () => void;
  flushPersistence: () => Promise<void>;
}

interface SessionUpdateOptions {
  flush?: boolean;
  persistRemote?: boolean;
  markUserInteracted?: boolean;
}

interface LocalReaderSessionSnapshot extends StoredReaderState {
  readerTheme?: string;
  pageTurnMode?: ReaderPageTurnMode;
  appTheme?: 'light' | 'dark';
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
}

type ReaderSessionStore = StoreApi<ReaderSessionInternalState>;

const READER_STATE_SYNC_DELAY_MS = 400;

let syncTimerId: number | null = null;
let syncQueue: Promise<void> = Promise.resolve();
let lastSyncedRemoteSnapshot = '';
let storeEpoch = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function setLastSyncedRemoteSnapshot(snapshot: string): void {
  lastSyncedRemoteSnapshot = snapshot;
}

function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function sanitizeLocator(raw: unknown): ReaderLocator | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const parsed = raw as Record<string, unknown>;
  if (
    typeof parsed.chapterIndex !== 'number'
    || typeof parsed.blockIndex !== 'number'
    || (parsed.kind !== 'heading' && parsed.kind !== 'text' && parsed.kind !== 'image')
  ) {
    return undefined;
  }

  const startCursor = parsed.startCursor && typeof parsed.startCursor === 'object'
    ? parsed.startCursor as Record<string, unknown>
    : null;
  const endCursor = parsed.endCursor && typeof parsed.endCursor === 'object'
    ? parsed.endCursor as Record<string, unknown>
    : null;

  return {
    blockIndex: parsed.blockIndex,
    chapterIndex: parsed.chapterIndex,
    edge: parsed.edge === 'start' || parsed.edge === 'end' ? parsed.edge : undefined,
    endCursor: endCursor
      && typeof endCursor.segmentIndex === 'number'
      && typeof endCursor.graphemeIndex === 'number'
      ? {
        graphemeIndex: endCursor.graphemeIndex,
        segmentIndex: endCursor.segmentIndex,
      }
      : undefined,
    kind: parsed.kind,
    lineIndex: typeof parsed.lineIndex === 'number' ? parsed.lineIndex : undefined,
    startCursor: startCursor
      && typeof startCursor.segmentIndex === 'number'
      && typeof startCursor.graphemeIndex === 'number'
      ? {
        graphemeIndex: startCursor.graphemeIndex,
        segmentIndex: startCursor.segmentIndex,
      }
      : undefined,
  };
}

function sanitizeStoredReaderState(raw: unknown): StoredReaderState | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Record<string, unknown>;
  const mode = parsed.mode === 'scroll' || parsed.mode === 'paged' || parsed.mode === 'summary'
    ? parsed.mode
    : undefined;

  return {
    chapterIndex: typeof parsed.chapterIndex === 'number' ? parsed.chapterIndex : undefined,
    mode,
    viewMode: parsed.viewMode === 'summary' || parsed.viewMode === 'original'
      ? parsed.viewMode
      : undefined,
    isTwoColumn: typeof parsed.isTwoColumn === 'boolean' ? parsed.isTwoColumn : undefined,
    chapterProgress: clampChapterProgress(typeof parsed.chapterProgress === 'number' ? parsed.chapterProgress : undefined),
    scrollPosition: typeof parsed.scrollPosition === 'number' && Number.isFinite(parsed.scrollPosition)
      ? parsed.scrollPosition
      : undefined,
    lastContentMode: parsed.lastContentMode === 'paged' || parsed.lastContentMode === 'scroll'
      ? parsed.lastContentMode
      : undefined,
    locatorVersion: parsed.locatorVersion === 1 ? 1 : undefined,
    locator: sanitizeLocator(parsed.locator),
  };
}

function readLocalSessionState(novelId: number): LocalReaderSessionSnapshot | null {
  if (!isBrowser() || !novelId) {
    return null;
  }

  const parsed = readReaderStateCacheSnapshot(novelId);
  if (!parsed) {
    return null;
  }

  return {
    ...sanitizeStoredReaderState(parsed),
    readerTheme: typeof parsed.readerTheme === 'string' ? parsed.readerTheme : undefined,
    pageTurnMode:
      parsed.pageTurnMode === 'scroll'
      || parsed.pageTurnMode === 'cover'
      || parsed.pageTurnMode === 'slide'
      || parsed.pageTurnMode === 'none'
        ? parsed.pageTurnMode
        : undefined,
    appTheme: parsed.appTheme === 'light' || parsed.appTheme === 'dark' ? parsed.appTheme : undefined,
    fontSize: typeof parsed.fontSize === 'number' && Number.isFinite(parsed.fontSize) ? parsed.fontSize : undefined,
    lineSpacing: typeof parsed.lineSpacing === 'number' && Number.isFinite(parsed.lineSpacing) ? parsed.lineSpacing : undefined,
    paragraphSpacing: typeof parsed.paragraphSpacing === 'number' && Number.isFinite(parsed.paragraphSpacing)
      ? parsed.paragraphSpacing
      : undefined,
  };
}

function resolveModeFromStoredState(state: StoredReaderState | null | undefined): ReaderMode {
  if (state?.mode === 'scroll' || state?.mode === 'paged' || state?.mode === 'summary') {
    return state.mode;
  }
  if (state?.viewMode === 'summary') return 'summary';
  return state?.isTwoColumn ? 'paged' : 'scroll';
}

function shouldMaskRestore(state: StoredReaderState | null | undefined): boolean {
  return hasRestorableReaderPosition(state);
}

function deriveViewState(mode: ReaderMode): Pick<ReaderSessionInternalState, 'mode' | 'viewMode' | 'isTwoColumn'> {
  return {
    mode,
    viewMode: mode === 'summary' ? 'summary' : 'original',
    isTwoColumn: mode === 'paged',
  };
}

function toStoredReaderState(state: ReaderSessionInternalState): StoredReaderState {
  return {
    chapterIndex: state.chapterIndex,
    mode: state.mode,
    viewMode: state.viewMode,
    isTwoColumn: state.isTwoColumn,
    chapterProgress: clampChapterProgress(state.chapterProgress),
    scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : undefined,
    lastContentMode: state.lastContentMode,
    locatorVersion: state.locator ? 1 : undefined,
    locator: state.locator,
  };
}

function buildStoredReaderState(state: StoredReaderState | null | undefined): StoredReaderState {
  const mode = resolveModeFromStoredState(state);
  const viewState = deriveViewState(mode);
  return {
    chapterIndex: state?.chapterIndex ?? 0,
    mode,
    viewMode: viewState.viewMode,
    isTwoColumn: viewState.isTwoColumn,
    chapterProgress: clampChapterProgress(state?.chapterProgress),
    scrollPosition: typeof state?.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : undefined,
    lastContentMode: state?.lastContentMode ?? (mode === 'paged' ? 'paged' : 'scroll'),
    locatorVersion: state?.locator ? 1 : undefined,
    locator: state?.locator,
  };
}

function mergeStoredReaderState(
  baseState: StoredReaderState | null | undefined,
  overrideState: StoredReaderState | null | undefined,
): StoredReaderState {
  const prefersLegacyScrollPosition = overrideState?.chapterProgress === undefined
    && typeof overrideState?.scrollPosition === 'number'
    && Number.isFinite(overrideState.scrollPosition);
  const mode = overrideState?.mode
    ?? (overrideState?.viewMode || overrideState?.isTwoColumn !== undefined
      ? resolveModeFromStoredState(overrideState)
      : baseState?.mode ?? resolveModeFromStoredState(baseState));
  const shouldResetLocator = overrideState?.locator === undefined && (
    (typeof overrideState?.chapterIndex === 'number' && overrideState.chapterIndex !== baseState?.chapterIndex)
    || overrideState?.chapterProgress !== undefined
    || overrideState?.scrollPosition !== undefined
  );

  return buildStoredReaderState({
    chapterIndex: overrideState?.chapterIndex ?? baseState?.chapterIndex,
    mode,
    viewMode: overrideState?.viewMode ?? baseState?.viewMode,
    isTwoColumn: overrideState?.isTwoColumn ?? baseState?.isTwoColumn,
    chapterProgress: prefersLegacyScrollPosition
      ? undefined
      : overrideState?.chapterProgress ?? baseState?.chapterProgress,
    scrollPosition: overrideState?.scrollPosition ?? baseState?.scrollPosition,
    lastContentMode: overrideState?.lastContentMode ?? baseState?.lastContentMode,
    locatorVersion: shouldResetLocator
      ? undefined
      : overrideState?.locatorVersion ?? baseState?.locatorVersion,
    locator: shouldResetLocator ? undefined : overrideState?.locator ?? baseState?.locator,
  });
}

function getRemoteProgressSnapshot(progress: ReadingProgress): string {
  return JSON.stringify({
    chapterIndex: progress.chapterIndex,
    scrollPosition: progress.scrollPosition,
    viewMode: progress.viewMode,
    chapterProgress: clampChapterProgress(progress.chapterProgress) ?? 0,
    isTwoColumn: progress.isTwoColumn ?? false,
    locatorVersion: progress.locatorVersion === 1 ? 1 : undefined,
    locator: progress.locator ?? null,
  });
}

function toRemoteProgress(state: ReaderSessionInternalState): ReadingProgress {
  return {
    chapterIndex: state.chapterIndex,
    scrollPosition: typeof state.scrollPosition === 'number' && Number.isFinite(state.scrollPosition)
      ? state.scrollPosition
      : 0,
    viewMode: state.viewMode,
    chapterProgress: clampChapterProgress(state.chapterProgress) ?? 0,
    isTwoColumn: state.isTwoColumn,
    locatorVersion: state.locator ? 1 : undefined,
    locator: state.locator,
  };
}

function resolveLastContentMode(
  mode: ReaderMode,
  fallbackMode: 'scroll' | 'paged',
): 'scroll' | 'paged' {
  if (mode === 'summary') return fallbackMode;
  if (mode === 'paged') return 'paged';
  return 'scroll';
}

function resolveReaderModeFromView(
  currentViewMode: 'summary' | 'original',
  pageTurnMode: ReaderPageTurnMode,
): ReaderMode {
  if (currentViewMode === 'summary') return 'summary';
  if (isPagedPageTurnMode(pageTurnMode)) return 'paged';
  return 'scroll';
}

function inferLegacyPageTurnMode(state: StoredReaderState | null | undefined): ReaderPageTurnMode {
  return state?.isTwoColumn === true || state?.mode === 'paged' || state?.lastContentMode === 'paged'
    ? 'cover'
    : 'scroll';
}

function createInitialReaderSessionState(): ReaderSessionInternalState {
  const mode: ReaderMode = 'scroll';
  return {
    novelId: 0,
    ...deriveViewState(mode),
    chapterIndex: 0,
    chapterProgress: undefined,
    scrollPosition: undefined,
    locatorVersion: undefined,
    locator: undefined,
    restoreStatus: 'hydrating',
    lastContentMode: 'scroll',
    pendingRestoreState: null,
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

  mergeReaderStateCacheSnapshot(state.novelId, toStoredReaderState(state));
}

function setReaderSessionStoreState(
  partial: Partial<ReaderSessionInternalState>,
  options: { writeCache?: boolean } = {},
): void {
  const nextState = {
    ...readerSessionStore.getState(),
    ...partial,
  };

  readerSessionStore.setState(nextState);
  if (options.writeCache !== false) {
    writeReaderSessionCache(nextState);
  }
}

function enqueueRemotePersistence(
  progress: ReadingProgress,
  novelId = readerSessionStore.getState().novelId,
): Promise<void> {
  if (!novelId) return Promise.resolve();
  const snapshot = getRemoteProgressSnapshot(progress);
  if (snapshot === lastSyncedRemoteSnapshot) return syncQueue;

  syncQueue = syncQueue
    .then(async () => {
      if (snapshot === lastSyncedRemoteSnapshot) return;
      await readerApi.saveProgress(novelId, progress);
      setLastSyncedRemoteSnapshot(snapshot);
    })
    .catch(() => undefined);

  return syncQueue;
}

function scheduleRemotePersistence(): void {
  const state = readerSessionStore.getState();
  if (!isBrowser() || !state.novelId) return;
  if (syncTimerId !== null) {
    window.clearTimeout(syncTimerId);
  }

  syncTimerId = window.setTimeout(() => {
    syncTimerId = null;
    enqueueRemotePersistence(toRemoteProgress(readerSessionStore.getState()));
  }, READER_STATE_SYNC_DELAY_MS);
}

function updateStoredReaderState(
  nextState: StoredReaderState,
  options: SessionUpdateOptions = {},
): StoredReaderState {
  const currentState = readerSessionStore.getState();
  const merged = mergeStoredReaderState(toStoredReaderState(currentState), nextState);
  const mode = resolveModeFromStoredState(merged);
  const viewState = deriveViewState(mode);
  const nextLastContentMode = merged.lastContentMode
    ?? resolveLastContentMode(mode, currentState.lastContentMode);

  setReaderSessionStoreState({
    ...viewState,
    chapterIndex: merged.chapterIndex ?? 0,
    chapterProgress: clampChapterProgress(merged.chapterProgress),
    scrollPosition: typeof merged.scrollPosition === 'number' && Number.isFinite(merged.scrollPosition)
      ? merged.scrollPosition
      : undefined,
    locatorVersion: merged.locator ? 1 : undefined,
    locator: merged.locator,
    lastContentMode: resolveLastContentMode(mode, nextLastContentMode),
    hasUserInteracted: options.markUserInteracted ?? currentState.hasUserInteracted,
  });

  if (options.persistRemote) {
    if (options.flush) {
      enqueueRemotePersistence(toRemoteProgress(readerSessionStore.getState()));
    } else {
      scheduleRemotePersistence();
    }
  }

  return merged;
}

function buildHydratedPreferenceOverrides(
  localState: LocalReaderSessionSnapshot | null,
): Partial<ReturnType<typeof getReaderPreferencesSnapshot>> {
  return {
    readerTheme: typeof localState?.readerTheme === 'string' ? localState.readerTheme : undefined,
    pageTurnMode:
      localState?.pageTurnMode === 'scroll'
      || localState?.pageTurnMode === 'cover'
      || localState?.pageTurnMode === 'slide'
      || localState?.pageTurnMode === 'none'
        ? localState.pageTurnMode
        : undefined,
    fontSize: typeof localState?.fontSize === 'number' ? localState.fontSize : undefined,
    lineSpacing: typeof localState?.lineSpacing === 'number' ? localState.lineSpacing : undefined,
    paragraphSpacing: typeof localState?.paragraphSpacing === 'number'
      ? localState.paragraphSpacing
      : undefined,
  };
}

export async function hydrateSession(novelId: number): Promise<StoredReaderState> {
  storeEpoch += 1;
  const epochAtStart = storeEpoch;
  const localState = readLocalSessionState(novelId);
  const hadConfiguredPageTurnModePreference =
    hasConfiguredReaderPageTurnMode() || localState?.pageTurnMode !== undefined;

  setReaderPreferencesNovelId(novelId);
  setAppThemeNovelId(novelId);
  setReaderSessionStoreState({
    novelId,
    restoreStatus: 'hydrating',
    pendingRestoreState: null,
    hasUserInteracted: false,
    chapterIndex: 0,
    chapterProgress: undefined,
    scrollPosition: undefined,
    locatorVersion: undefined,
    locator: undefined,
    mode: 'scroll',
    viewMode: 'original',
    isTwoColumn: false,
    lastContentMode: 'scroll',
  }, { writeCache: false });

  await Promise.all([
    ensureReaderPreferencesHydrated(),
    ensureAppThemeHydrated(),
  ]);

  if (epochAtStart !== storeEpoch) {
    return buildStoredReaderState(localState);
  }

  const localPreferenceOverrides = buildHydratedPreferenceOverrides(localState);
  applyHydratedReaderPreferences(localPreferenceOverrides);
  applyHydratedAppTheme(localState?.appTheme);

  let remoteState: StoredReaderState | null = null;
  try {
    remoteState = sanitizeStoredReaderState(await readerApi.getProgress(novelId));
    if (remoteState) {
      const progress = buildStoredReaderState(remoteState);
      setLastSyncedRemoteSnapshot(getRemoteProgressSnapshot({
        chapterIndex: progress.chapterIndex ?? 0,
        scrollPosition: progress.scrollPosition ?? 0,
        viewMode: progress.viewMode ?? 'original',
        chapterProgress: progress.chapterProgress,
        isTwoColumn: progress.isTwoColumn,
        locatorVersion: progress.locatorVersion,
        locator: progress.locator,
      }));
    }
  } catch {
    remoteState = null;
  }

  if (epochAtStart !== storeEpoch) {
    return buildStoredReaderState(localState);
  }

  const preferences = getReaderPreferencesSnapshot();
  const mergedState = mergeStoredReaderState(remoteState, localState);
  const currentViewMode =
    mergedState.viewMode ?? (mergedState.mode === 'summary' ? 'summary' : 'original');
  const resolvedPageTurnMode = hadConfiguredPageTurnModePreference
    ? preferences.pageTurnMode
    : inferLegacyPageTurnMode(mergedState);
  const mode = resolveReaderModeFromView(currentViewMode, resolvedPageTurnMode);
  const nextLastContentMode = resolveLastContentMode(
    mode,
    isPagedPageTurnMode(resolvedPageTurnMode) ? 'paged' : 'scroll',
  );

  if (!hadConfiguredPageTurnModePreference) {
    applyHydratedReaderPreferences(
      { pageTurnMode: resolvedPageTurnMode },
      { markPageTurnModeConfigured: true, persistPrimary: true },
    );
  }

  setReaderSessionStoreState({
    novelId,
    ...deriveViewState(mode),
    chapterIndex: mergedState.chapterIndex ?? 0,
    chapterProgress: clampChapterProgress(mergedState.chapterProgress),
    scrollPosition: typeof mergedState.scrollPosition === 'number' && Number.isFinite(mergedState.scrollPosition)
      ? mergedState.scrollPosition
      : undefined,
    locatorVersion: mergedState.locator ? 1 : undefined,
    locator: mergedState.locator,
    lastContentMode: nextLastContentMode,
    pendingRestoreState: shouldMaskRestore(mergedState) ? mergedState : null,
    restoreStatus: shouldMaskRestore(mergedState) ? 'restoring' : 'ready',
  });

  return buildStoredReaderState({
    ...mergedState,
    mode,
    viewMode: currentViewMode,
    isTwoColumn: mode === 'paged',
    lastContentMode: nextLastContentMode,
  });
}

export function setMode(mode: ReaderMode, options: SessionUpdateOptions = {}): void {
  const currentState = readerSessionStore.getState();
  updateStoredReaderState(
    {
      chapterIndex: currentState.chapterIndex,
      chapterProgress: currentState.chapterProgress,
      scrollPosition: currentState.scrollPosition,
      mode,
      lastContentMode: resolveLastContentMode(mode, currentState.lastContentMode),
    },
    { persistRemote: true, markUserInteracted: options.markUserInteracted, flush: options.flush },
  );
}

export function setChapterIndex(chapterIndex: number, options: SessionUpdateOptions = {}): void {
  updateStoredReaderState(
    { chapterIndex },
    { persistRemote: true, markUserInteracted: options.markUserInteracted, flush: options.flush },
  );
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

export function setPendingRestoreState(nextState: StoredReaderState | null): void {
  setReaderSessionStoreState({ pendingRestoreState: nextState }, { writeCache: false });
}

export function setRestoreStatus(restoreStatus: RestoreStatus): void {
  setReaderSessionStoreState({ restoreStatus }, { writeCache: false });
}

export function setSessionNovelId(novelId: number): void {
  if (readerSessionStore.getState().novelId === novelId) {
    return;
  }

  setReaderPreferencesNovelId(novelId);
  setAppThemeNovelId(novelId);
  setReaderSessionStoreState({ novelId }, { writeCache: false });
}

export function beginRestore(nextState: StoredReaderState | null | undefined): void {
  setReaderSessionStoreState({
    pendingRestoreState: nextState ?? null,
    restoreStatus: shouldMaskRestore(nextState) ? 'restoring' : 'ready',
  }, { writeCache: false });
}

export function completeRestore(): void {
  setReaderSessionStoreState({
    pendingRestoreState: null,
    restoreStatus: 'ready',
  }, { writeCache: false });
}

export function failRestore(): void {
  setReaderSessionStoreState({ restoreStatus: 'error' }, { writeCache: false });
}

export function markUserInteracted(): void {
  setReaderSessionStoreState({ hasUserInteracted: true }, { writeCache: false });
}

export function setHasHydratedReaderState(hasHydratedReaderState: boolean): void {
  if (!hasHydratedReaderState) {
    setReaderSessionStoreState({ restoreStatus: 'hydrating' }, { writeCache: false });
    return;
  }

  const currentState = readerSessionStore.getState();
  setReaderSessionStoreState({
    restoreStatus: currentState.pendingRestoreState ? 'restoring' : 'ready',
  }, { writeCache: false });
}

export function getReaderSessionSnapshot(): ReaderSessionSnapshot {
  return readerSessionStore.getState();
}

export function getStoredReaderStateSnapshot(): StoredReaderState {
  return toStoredReaderState(readerSessionStore.getState());
}

export function readInitialStoredReaderState(novelId: number): StoredReaderState | null {
  const localState = readLocalSessionState(novelId);
  return localState ? sanitizeStoredReaderState(localState) : null;
}

export function persistStoredReaderState(
  nextState: StoredReaderState,
  options?: { flush?: boolean },
): void {
  updateStoredReaderState(nextState, {
    persistRemote: true,
    flush: options?.flush,
  });
}

export async function flushPersistence(): Promise<void> {
  const currentState = readerSessionStore.getState();
  const { novelId } = currentState;
  const progress = toRemoteProgress(currentState);

  await Promise.all([
    flushReaderPreferencesPersistence(),
    flushAppThemePersistence(),
  ]);

  if (syncTimerId !== null && isBrowser()) {
    window.clearTimeout(syncTimerId);
    syncTimerId = null;
  }

  await enqueueRemotePersistence(progress, novelId);
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
  storeEpoch += 1;
  if (syncTimerId !== null && isBrowser()) {
    window.clearTimeout(syncTimerId);
    syncTimerId = null;
  }

  lastSyncedRemoteSnapshot = '';
  syncQueue = Promise.resolve();
  resetReaderPreferencesStoreForTests();
  resetAppThemeStoreForTests();
  const initialState = createInitialReaderSessionState();
  readerSessionStore.setState(initialState);
}
