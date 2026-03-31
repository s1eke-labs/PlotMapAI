import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { mergeReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';
import { useStore } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type AppTheme = 'light' | 'dark';

interface AppThemeStoreState {
  activeNovelId: number;
  theme: AppTheme;
}

type AppThemeStore = StoreApi<AppThemeStoreState>;

const APP_THEME_PERSIST_DELAY_MS = 80;

let themeHydrationPromise: Promise<void> | null = null;
let themeHydrated = false;
let themePersistQueue: Promise<void> = Promise.resolve();
let themePersistTimerId: number | null = null;
let themeRevision = 0;
let themeStoreEpoch = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readCachedAppTheme(): AppTheme {
  if (!isBrowser()) {
    return 'light';
  }

  const saved = storage.cache.getString(CACHE_KEYS.theme);
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyAppTheme(theme: AppTheme): void {
  if (!isBrowser()) {
    return;
  }

  const root = window.document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    return;
  }

  root.classList.remove('dark');
}

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light';
}

function createInitialAppThemeState(): AppThemeStoreState {
  return {
    activeNovelId: 0,
    theme: readCachedAppTheme(),
  };
}

export function createAppThemeStore(): AppThemeStore {
  return createStore<AppThemeStoreState>()(
    subscribeWithSelector(() => createInitialAppThemeState()),
  );
}

export const appThemeStore = createAppThemeStore();
applyAppTheme(appThemeStore.getState().theme);

function writeAppThemeCache(state: AppThemeStoreState): void {
  if (!isBrowser()) {
    return;
  }

  storage.cache.set(CACHE_KEYS.theme, state.theme);
  if (state.activeNovelId) {
    mergeReaderStateCacheSnapshot(state.activeNovelId, {
      appTheme: state.theme,
    });
  }
}

function setAppThemeStoreState(
  partial: Partial<AppThemeStoreState>,
  options: { writeCache?: boolean } = {},
): void {
  const nextState = {
    ...appThemeStore.getState(),
    ...partial,
  };

  appThemeStore.setState(nextState);
  applyAppTheme(nextState.theme);

  if (options.writeCache !== false) {
    writeAppThemeCache(nextState);
  }
}

async function persistAppTheme(theme: AppTheme): Promise<void> {
  await storage.primary.settings.set(APP_SETTING_KEYS.appTheme, theme);
}

async function loadPrimaryAppTheme(): Promise<AppTheme> {
  const cachedTheme = readCachedAppTheme();

  try {
    const storedTheme = await storage.primary.settings.get<AppTheme>(APP_SETTING_KEYS.appTheme);
    const resolvedTheme = isAppTheme(storedTheme)
      ? storedTheme
      : cachedTheme;

    if (storedTheme === null) {
      await persistAppTheme(resolvedTheme).catch(() => undefined);
    }

    return resolvedTheme;
  } catch {
    return cachedTheme;
  }
}

function scheduleAppThemePersistence(): void {
  if (!isBrowser()) {
    return;
  }

  if (themePersistTimerId !== null) {
    window.clearTimeout(themePersistTimerId);
  }

  themePersistTimerId = window.setTimeout(() => {
    themePersistTimerId = null;
    const snapshot = appThemeStore.getState().theme;
    const revisionAtSchedule = themeRevision;
    const epochAtSchedule = themeStoreEpoch;
    themePersistQueue = themePersistQueue
      .then(async () => {
        if (epochAtSchedule !== themeStoreEpoch) {
          return;
        }
        if (revisionAtSchedule !== themeRevision) {
          return;
        }

        await persistAppTheme(snapshot);
      })
      .catch(() => undefined);
  }, APP_THEME_PERSIST_DELAY_MS);
}

export async function flushAppThemePersistence(): Promise<void> {
  if (themePersistTimerId !== null && isBrowser()) {
    window.clearTimeout(themePersistTimerId);
    themePersistTimerId = null;
    const snapshot = appThemeStore.getState().theme;
    const epochAtFlush = themeStoreEpoch;
    themePersistQueue = themePersistQueue
      .then(async () => {
        if (epochAtFlush !== themeStoreEpoch) {
          return;
        }
        await persistAppTheme(snapshot);
      })
      .catch(() => undefined);
  }

  await themePersistQueue;
}

export async function ensureAppThemeHydrated(): Promise<void> {
  if (!isBrowser() || themeHydrated) {
    return;
  }

  if (themeHydrationPromise) {
    return themeHydrationPromise;
  }

  const epochAtStart = themeStoreEpoch;
  const revisionAtStart = themeRevision;
  const hydrationPromise = (async () => {
    const theme = await loadPrimaryAppTheme();
    if (epochAtStart !== themeStoreEpoch) {
      return;
    }
    if (revisionAtStart === themeRevision) {
      setAppThemeStoreState({ theme });
    }
    themeHydrated = true;
  })().catch(() => {
    if (epochAtStart === themeStoreEpoch) {
      themeHydrated = true;
    }
  });

  const trackedPromise = hydrationPromise.finally(() => {
    if (themeHydrationPromise === trackedPromise) {
      themeHydrationPromise = null;
    }
  });
  themeHydrationPromise = trackedPromise;

  return trackedPromise;
}

export function setAppTheme(theme: AppTheme): void {
  themeRevision += 1;
  setAppThemeStoreState({ theme });
  scheduleAppThemePersistence();
}

export function toggleAppTheme(): void {
  const currentTheme = appThemeStore.getState().theme;
  setAppTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function setAppThemeNovelId(novelId: number): void {
  if (appThemeStore.getState().activeNovelId === novelId) {
    return;
  }

  setAppThemeStoreState({ activeNovelId: novelId }, { writeCache: false });
}

export function applyHydratedAppTheme(theme: AppTheme | null | undefined): void {
  if (!theme) {
    return;
  }

  setAppThemeStoreState({ theme });
}

export function getAppThemeSnapshot(): AppThemeStoreState {
  return appThemeStore.getState();
}

export function useAppThemeSelector<T>(selector: (state: AppThemeStoreState) => T): T {
  return useStore(appThemeStore, selector);
}

export function resetAppThemeStoreForTests(): void {
  themeStoreEpoch += 1;
  if (themePersistTimerId !== null && isBrowser()) {
    window.clearTimeout(themePersistTimerId);
    themePersistTimerId = null;
  }

  themeHydrationPromise = null;
  themeHydrated = false;
  themePersistQueue = Promise.resolve();
  themeRevision = 0;

  const initialState = createInitialAppThemeState();
  appThemeStore.setState(initialState);
  applyAppTheme(initialState.theme);
}
