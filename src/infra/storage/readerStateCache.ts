import { CACHE_KEYS, storage } from './index';

export function clearReaderBootstrapSnapshot(novelId: number): void {
  if (!novelId) {
    return;
  }

  storage.cache.remove(CACHE_KEYS.readerBootstrap(novelId));
}

export function clearAllReaderBootstrapSnapshots(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(CACHE_KEYS.readerBootstrapPrefix)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    storage.cache.remove(key);
  });
}
