import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { mergeReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';
import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

const DEFAULT_PAGE_TURN_MODE: ReaderPageTurnMode = 'scroll';
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_SPACING = 1.8;
const DEFAULT_PARAGRAPH_SPACING = 16;
const PREFERENCE_PERSIST_DELAY_MS = 80;

export interface ReaderPreferencesState {
  readerTheme: string;
  pageTurnMode: ReaderPageTurnMode;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface ReaderPreferencesStoreState extends ReaderPreferencesState {
  activeNovelId: number;
}

type ReaderPreferencesStore = StoreApi<ReaderPreferencesStoreState>;

let settingsHydrationPromise: Promise<void> | null = null;
let settingsHydrated = false;
let settingsPersistQueue: Promise<void> = Promise.resolve();
let settingsPersistTimerId: number | null = null;
let preferenceRevision = 0;
let preferenceStoreEpoch = 0;
let hasConfiguredPageTurnModePreference =
  storage.cache.getString(CACHE_KEYS.readerPageTurnMode) !== null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStringCache(key: string): string | null {
  return storage.cache.getString(key);
}

function readNumberCache(key: string, fallback: number): number {
  const saved = readStringCache(key);
  const numeric = saved ? Number(saved) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readReaderTheme(): string {
  return readStringCache(CACHE_KEYS.readerTheme) || 'auto';
}

function isReaderPageTurnMode(value: unknown): value is ReaderPageTurnMode {
  return value === 'scroll' || value === 'cover' || value === 'slide' || value === 'none';
}

function readReaderPageTurnMode(): ReaderPageTurnMode {
  const saved = readStringCache(CACHE_KEYS.readerPageTurnMode);
  return isReaderPageTurnMode(saved) ? saved : DEFAULT_PAGE_TURN_MODE;
}

function readCachedReaderPreferences(): ReaderPreferencesState {
  return {
    readerTheme: readReaderTheme(),
    pageTurnMode: readReaderPageTurnMode(),
    fontSize: readNumberCache(CACHE_KEYS.readerFontSize, DEFAULT_FONT_SIZE),
    lineSpacing: readNumberCache(CACHE_KEYS.readerLineSpacing, DEFAULT_LINE_SPACING),
    paragraphSpacing: readNumberCache(CACHE_KEYS.readerParagraphSpacing, DEFAULT_PARAGRAPH_SPACING),
  };
}

function createInitialReaderPreferencesState(): ReaderPreferencesStoreState {
  return {
    activeNovelId: 0,
    ...readCachedReaderPreferences(),
  };
}

export function createReaderPreferencesStore(): ReaderPreferencesStore {
  return createStore<ReaderPreferencesStoreState>()(
    subscribeWithSelector(() => createInitialReaderPreferencesState()),
  );
}

export const readerPreferencesStore = createReaderPreferencesStore();

function writeReaderPreferencesCache(state: ReaderPreferencesStoreState): void {
  if (!isBrowser()) {
    return;
  }

  storage.cache.set(CACHE_KEYS.readerTheme, state.readerTheme);
  storage.cache.set(CACHE_KEYS.readerPageTurnMode, state.pageTurnMode);
  storage.cache.set(CACHE_KEYS.readerFontSize, String(state.fontSize));
  storage.cache.set(CACHE_KEYS.readerLineSpacing, String(state.lineSpacing));
  storage.cache.set(CACHE_KEYS.readerParagraphSpacing, String(state.paragraphSpacing));

  if (state.activeNovelId) {
    mergeReaderStateCacheSnapshot(state.activeNovelId, {
      readerTheme: state.readerTheme,
      pageTurnMode: state.pageTurnMode,
      fontSize: state.fontSize,
      lineSpacing: state.lineSpacing,
      paragraphSpacing: state.paragraphSpacing,
    });
  }
}

function setReaderPreferencesStoreState(
  partial: Partial<ReaderPreferencesStoreState>,
  options: { writeCache?: boolean } = {},
): void {
  const currentState = readerPreferencesStore.getState();
  const nextState: ReaderPreferencesStoreState = { ...currentState };
  const nextStateRecord = nextState as Record<
    keyof ReaderPreferencesStoreState,
    ReaderPreferencesStoreState[keyof ReaderPreferencesStoreState]
  >;

  for (const [key, value] of Object.entries(partial) as Array<
    [
      keyof ReaderPreferencesStoreState,
      ReaderPreferencesStoreState[keyof ReaderPreferencesStoreState],
    ]
  >) {
    if (value !== undefined) {
      nextStateRecord[key] = value;
    }
  }

  readerPreferencesStore.setState(nextState);
  if (options.writeCache !== false) {
    writeReaderPreferencesCache(nextState);
  }
}

async function persistReaderPreferences(
  preferences: ReaderPreferencesState,
): Promise<void> {
  await Promise.all([
    storage.primary.settings.set(APP_SETTING_KEYS.readerTheme, preferences.readerTheme),
    storage.primary.settings.set(APP_SETTING_KEYS.readerPageTurnMode, preferences.pageTurnMode),
    storage.primary.settings.set(APP_SETTING_KEYS.readerFontSize, preferences.fontSize),
    storage.primary.settings.set(APP_SETTING_KEYS.readerLineSpacing, preferences.lineSpacing),
    storage.primary.settings.set(
      APP_SETTING_KEYS.readerParagraphSpacing,
      preferences.paragraphSpacing,
    ),
  ]);
}

async function loadPrimaryPreferenceState(): Promise<ReaderPreferencesState> {
  const cached = readCachedReaderPreferences();

  try {
    const [
      readerTheme,
      pageTurnMode,
      fontSize,
      lineSpacing,
      paragraphSpacing,
    ] = await Promise.all([
      storage.primary.settings.get<string>(APP_SETTING_KEYS.readerTheme),
      storage.primary.settings.get<ReaderPageTurnMode>(APP_SETTING_KEYS.readerPageTurnMode),
      storage.primary.settings.get<number>(APP_SETTING_KEYS.readerFontSize),
      storage.primary.settings.get<number>(APP_SETTING_KEYS.readerLineSpacing),
      storage.primary.settings.get<number>(APP_SETTING_KEYS.readerParagraphSpacing),
    ]);

    hasConfiguredPageTurnModePreference =
      pageTurnMode !== null || readStringCache(CACHE_KEYS.readerPageTurnMode) !== null;

    const resolved: ReaderPreferencesState = {
      readerTheme: typeof readerTheme === 'string' ? readerTheme : cached.readerTheme,
      pageTurnMode: isReaderPageTurnMode(pageTurnMode) ? pageTurnMode : cached.pageTurnMode,
      fontSize: typeof fontSize === 'number' && Number.isFinite(fontSize) ? fontSize : cached.fontSize,
      lineSpacing: typeof lineSpacing === 'number' && Number.isFinite(lineSpacing) ? lineSpacing : cached.lineSpacing,
      paragraphSpacing: typeof paragraphSpacing === 'number' && Number.isFinite(paragraphSpacing)
        ? paragraphSpacing
        : cached.paragraphSpacing,
    };

    if (
      readerTheme === null
      || pageTurnMode === null
      || fontSize === null
      || lineSpacing === null
      || paragraphSpacing === null
    ) {
      await persistReaderPreferences(resolved).catch(() => undefined);
    }

    return resolved;
  } catch {
    hasConfiguredPageTurnModePreference = readStringCache(CACHE_KEYS.readerPageTurnMode) !== null;
    return cached;
  }
}

function getReaderPreferencesSnapshotState(): ReaderPreferencesState {
  const state = readerPreferencesStore.getState();
  return {
    readerTheme: state.readerTheme,
    pageTurnMode: state.pageTurnMode,
    fontSize: state.fontSize,
    lineSpacing: state.lineSpacing,
    paragraphSpacing: state.paragraphSpacing,
  };
}

function scheduleReaderPreferencesPersistence(): void {
  if (!isBrowser()) {
    return;
  }

  if (settingsPersistTimerId !== null) {
    window.clearTimeout(settingsPersistTimerId);
  }

  settingsPersistTimerId = window.setTimeout(() => {
    settingsPersistTimerId = null;
    const snapshot = getReaderPreferencesSnapshotState();
    const revisionAtSchedule = preferenceRevision;
    const epochAtSchedule = preferenceStoreEpoch;
    settingsPersistQueue = settingsPersistQueue
      .then(async () => {
        if (epochAtSchedule !== preferenceStoreEpoch) {
          return;
        }
        if (revisionAtSchedule !== preferenceRevision) {
          return;
        }

        await persistReaderPreferences(snapshot);
      })
      .catch(() => undefined);
  }, PREFERENCE_PERSIST_DELAY_MS);
}

export async function flushReaderPreferencesPersistence(): Promise<void> {
  if (settingsPersistTimerId !== null && isBrowser()) {
    window.clearTimeout(settingsPersistTimerId);
    settingsPersistTimerId = null;
    const snapshot = getReaderPreferencesSnapshotState();
    const epochAtFlush = preferenceStoreEpoch;
    settingsPersistQueue = settingsPersistQueue
      .then(async () => {
        if (epochAtFlush !== preferenceStoreEpoch) {
          return;
        }
        await persistReaderPreferences(snapshot);
      })
      .catch(() => undefined);
  }

  await settingsPersistQueue;
}

export async function ensureReaderPreferencesHydrated(): Promise<void> {
  if (!isBrowser() || settingsHydrated) {
    return;
  }

  if (settingsHydrationPromise) {
    return settingsHydrationPromise;
  }

  const epochAtStart = preferenceStoreEpoch;
  const revisionAtStart = preferenceRevision;
  const hydrationPromise = (async () => {
    const preferences = await loadPrimaryPreferenceState();
    if (epochAtStart !== preferenceStoreEpoch) {
      return;
    }
    if (revisionAtStart === preferenceRevision) {
      setReaderPreferencesStoreState(preferences);
    }
    settingsHydrated = true;
  })().catch(() => {
    if (epochAtStart === preferenceStoreEpoch) {
      settingsHydrated = true;
    }
  });

  const trackedPromise = hydrationPromise.finally(() => {
    if (settingsHydrationPromise === trackedPromise) {
      settingsHydrationPromise = null;
    }
  });
  settingsHydrationPromise = trackedPromise;

  return trackedPromise;
}

export function setReaderTheme(theme: string): void {
  preferenceRevision += 1;
  setReaderPreferencesStoreState({ readerTheme: theme });
  scheduleReaderPreferencesPersistence();
}

export function setReaderPageTurnMode(mode: ReaderPageTurnMode): void {
  preferenceRevision += 1;
  hasConfiguredPageTurnModePreference = true;
  setReaderPreferencesStoreState({ pageTurnMode: mode });
  scheduleReaderPreferencesPersistence();
}

export function setTypography(nextState: {
  fontSize?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
}): void {
  const currentState = readerPreferencesStore.getState();
  preferenceRevision += 1;
  setReaderPreferencesStoreState({
    fontSize: nextState.fontSize ?? currentState.fontSize,
    lineSpacing: nextState.lineSpacing ?? currentState.lineSpacing,
    paragraphSpacing: nextState.paragraphSpacing ?? currentState.paragraphSpacing,
  });
  scheduleReaderPreferencesPersistence();
}

export function setReaderPreferencesNovelId(novelId: number): void {
  if (readerPreferencesStore.getState().activeNovelId === novelId) {
    return;
  }

  setReaderPreferencesStoreState({ activeNovelId: novelId }, { writeCache: false });
}

export function applyHydratedReaderPreferences(
  nextState: Partial<ReaderPreferencesState>,
  options: { persistPrimary?: boolean; markPageTurnModeConfigured?: boolean } = {},
): void {
  if (options.markPageTurnModeConfigured && nextState.pageTurnMode) {
    hasConfiguredPageTurnModePreference = true;
  }

  setReaderPreferencesStoreState(nextState);

  if (!options.persistPrimary) {
    return;
  }

  const snapshot = getReaderPreferencesSnapshotState();
  const epochAtSchedule = preferenceStoreEpoch;
  settingsPersistQueue = settingsPersistQueue
    .then(async () => {
      if (epochAtSchedule !== preferenceStoreEpoch) {
        return;
      }
      await persistReaderPreferences(snapshot);
    })
    .catch(() => undefined);
}

export function hasConfiguredReaderPageTurnMode(): boolean {
  return hasConfiguredPageTurnModePreference;
}

export function getReaderPreferencesSnapshot(): ReaderPreferencesState {
  return getReaderPreferencesSnapshotState();
}

export function useReaderPreferencesSelector<T>(
  selector: (state: ReaderPreferencesStoreState) => T,
): T {
  return useStore(readerPreferencesStore, selector);
}

export function resetReaderPreferencesStoreForTests(): void {
  preferenceStoreEpoch += 1;
  if (settingsPersistTimerId !== null && isBrowser()) {
    window.clearTimeout(settingsPersistTimerId);
    settingsPersistTimerId = null;
  }

  settingsHydrationPromise = null;
  settingsHydrated = false;
  settingsPersistQueue = Promise.resolve();
  preferenceRevision = 0;
  hasConfiguredPageTurnModePreference = readStringCache(CACHE_KEYS.readerPageTurnMode) !== null;

  readerPreferencesStore.setState(createInitialReaderPreferencesState());
}
