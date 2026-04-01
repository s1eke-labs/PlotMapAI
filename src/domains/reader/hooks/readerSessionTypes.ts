import type { ReaderLocator } from '../utils/readerLayout';

export type PageTarget = 'start' | 'end';
export type ReaderMode = 'scroll' | 'paged' | 'summary';
export type RestoreStatus = 'hydrating' | 'restoring' | 'ready' | 'error';
export type ReaderLocatorBoundary = PageTarget;

export interface StoredReaderState {
  chapterIndex?: number;
  mode?: ReaderMode;
  chapterProgress?: number;
  scrollPosition?: number;
  lastContentMode?: 'scroll' | 'paged';
  locatorVersion?: 1;
  locator?: ReaderLocator;
}

export interface ReaderRestoreTarget {
  chapterIndex: number;
  mode: ReaderMode;
  locatorBoundary?: ReaderLocatorBoundary;
  chapterProgress?: number;
  scrollPosition?: number;
  locatorVersion?: 1;
  locator?: ReaderLocator;
}

export interface ReaderNavigationIntent {
  chapterIndex: number;
  pageTarget: PageTarget;
  locator?: ReaderLocator;
  locatorBoundary?: ReaderLocatorBoundary;
}

export interface ReaderSessionState {
  novelId: number;
  mode: ReaderMode;
  chapterIndex: number;
  chapterProgress?: number;
  scrollPosition?: number;
  locatorVersion?: 1;
  locator?: ReaderLocator;
  restoreStatus: RestoreStatus;
  lastContentMode: 'scroll' | 'paged';
  pendingRestoreTarget: ReaderRestoreTarget | null;
  hasUserInteracted: boolean;
}

export type ReaderSessionSnapshot = ReaderSessionState;
