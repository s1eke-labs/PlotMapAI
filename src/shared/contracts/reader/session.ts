import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { ReaderLocator } from './layout';

export type PageTarget = 'start' | 'end';
export type ReaderMode = 'scroll' | 'paged' | 'summary';
export type RestoreStatus = 'hydrating' | 'restoring' | 'ready' | 'error';
export type ReaderLocatorBoundary = PageTarget;
export type ChapterChangeSource = 'navigation' | 'scroll' | 'restore' | null;
export type ReaderRestoreMetric = 'scroll_px' | 'page_delta' | 'progress_delta';
export type ReaderRestoreReason =
  | 'restored'
  | 'no_target'
  | 'mode_mismatch'
  | 'container_missing'
  | 'layout_missing'
  | 'target_unresolvable'
  | 'validation_exceeded_tolerance'
  | 'execution_exception';
export type ReaderRestoreResultStatus = 'completed' | 'skipped' | 'failed';

export interface CanonicalPosition {
  chapterIndex: number;
  blockIndex?: number;
  kind?: ReaderLocator['kind'];
  lineIndex?: number;
  startCursor?: ReaderLocator['startCursor'];
  endCursor?: ReaderLocator['endCursor'];
  edge?: ReaderLocator['edge'];
}

export interface ReaderStateHints {
  chapterProgress?: number;
  pageIndex?: number;
  contentMode?: 'scroll' | 'paged';
}

export interface StoredReaderState {
  canonical?: CanonicalPosition;
  hints?: ReaderStateHints;
}

export interface ReaderRestoreTarget {
  chapterIndex: number;
  mode: ReaderMode;
  locatorBoundary?: ReaderLocatorBoundary;
  chapterProgress?: number;
  locator?: ReaderLocator;
}

export interface ReaderRestoreMeasuredError {
  metric: ReaderRestoreMetric;
  delta: number;
  tolerance: number;
  expected?: number;
  actual?: number;
}

export interface ReaderRestoreResult {
  status: ReaderRestoreResultStatus;
  reason: ReaderRestoreReason;
  measuredError?: ReaderRestoreMeasuredError;
  retryable: boolean;
  attempts: number;
  mode: ReaderMode;
  chapterIndex: number;
}

export interface ReaderNavigationIntent {
  chapterIndex: number;
  pageTarget: PageTarget;
  locator?: ReaderLocator;
  locatorBoundary?: ReaderLocatorBoundary;
}

export interface ReaderSessionState {
  novelId: number;
  canonical?: CanonicalPosition;
  mode: ReaderMode;
  chapterIndex: number;
  chapterProgress?: number;
  locator?: ReaderLocator;
  restoreStatus: RestoreStatus;
  lastRestoreResult: ReaderRestoreResult | null;
  lastContentMode: 'scroll' | 'paged';
  pendingRestoreTarget: ReaderRestoreTarget | null;
  hasUserInteracted: boolean;
}

export type ReaderSessionSnapshot = ReaderSessionState;

export interface ReaderSessionCommands {
  setChapterIndex: Dispatch<SetStateAction<number>>;
  setMode: Dispatch<SetStateAction<ReaderMode>>;
  latestReaderStateRef: MutableRefObject<StoredReaderState>;
  hasUserInteractedRef: MutableRefObject<boolean>;
  markUserInteracted: () => void;
  persistReaderState: (
    nextState: StoredReaderState,
    options?: { flush?: boolean; persistRemote?: boolean },
  ) => void;
  flushReaderState: () => Promise<void>;
  loadPersistedReaderState: () => Promise<StoredReaderState>;
}
