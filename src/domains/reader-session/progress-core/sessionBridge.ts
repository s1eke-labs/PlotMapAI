import type {
  PageTarget,
  ReaderSessionState,
  StoredReaderState,
} from '@shared/contracts/reader';

import { resolveLastContentMode } from '@shared/utils/readerMode';
import {
  buildStoredReaderState,
  clampPageIndex,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from '@shared/utils/readerStoredState';

import type {
  PersistedReaderProgressSnapshot,
  ReaderProgressSnapshot,
} from './contracts';

function normalizeReaderProgressSnapshot(
  snapshot: ReaderProgressSnapshot,
): ReaderProgressSnapshot {
  return {
    mode: snapshot.mode,
    activeChapterIndex: snapshot.activeChapterIndex,
    position: snapshot.position.type === 'locator'
      ? {
        type: 'locator',
        locator: {
          chapterIndex: snapshot.position.locator.chapterIndex,
          blockIndex: snapshot.position.locator.blockIndex,
          kind: snapshot.position.locator.kind,
          lineIndex: snapshot.position.locator.lineIndex,
          startCursor: snapshot.position.locator.startCursor
            ? { ...snapshot.position.locator.startCursor }
            : undefined,
          endCursor: snapshot.position.locator.endCursor
            ? { ...snapshot.position.locator.endCursor }
            : undefined,
          edge: snapshot.position.locator.edge,
          pageIndex: clampPageIndex(snapshot.position.locator.pageIndex),
        },
      }
      : {
        type: 'chapter-edge',
        chapterIndex: snapshot.position.chapterIndex,
        edge: snapshot.position.edge,
      },
    projections: {
      paged: snapshot.projections?.paged?.pageIndex === undefined
        ? undefined
        : { pageIndex: clampPageIndex(snapshot.projections.paged.pageIndex) },
      scroll: typeof snapshot.projections?.scroll?.chapterProgress === 'number'
        ? { chapterProgress: snapshot.projections.scroll.chapterProgress }
        : undefined,
    },
    captureQuality: snapshot.captureQuality,
  };
}

export function createReaderProgressSnapshotFromSessionState(
  state: ReaderSessionState,
): ReaderProgressSnapshot {
  const mode = resolveLastContentMode(state.mode, state.lastContentMode);
  const locator = state.locator
    ?? toReaderLocatorFromCanonical(state.canonical, undefined);
  const chapterEdge: PageTarget = state.canonical?.edge === 'end' ? 'end' : 'start';
  const position = locator
    ? {
      type: 'locator' as const,
      locator,
    }
    : {
      type: 'chapter-edge' as const,
      chapterIndex: state.canonical?.chapterIndex ?? state.chapterIndex,
      edge: chapterEdge,
    };

  return normalizeReaderProgressSnapshot({
    mode,
    activeChapterIndex: state.chapterIndex,
    position,
    projections: {
      paged: clampPageIndex(state.locator?.pageIndex) === undefined
        ? undefined
        : { pageIndex: clampPageIndex(state.locator?.pageIndex) },
      scroll: typeof state.chapterProgress === 'number'
        ? { chapterProgress: state.chapterProgress }
        : undefined,
    },
    captureQuality: position.type === 'locator' ? 'precise' : 'approximate',
  });
}

export function toStoredReaderStateFromReaderProgressSnapshot(
  snapshot: ReaderProgressSnapshot,
): StoredReaderState {
  const canonical = snapshot.position.type === 'locator'
    ? toCanonicalPositionFromLocator(snapshot.position.locator)
    : {
      chapterIndex: snapshot.position.chapterIndex,
      edge: snapshot.position.edge,
    };
  const pageIndex = snapshot.projections?.paged?.pageIndex
    ?? (snapshot.position.type === 'locator'
      ? clampPageIndex(snapshot.position.locator.pageIndex)
      : undefined);

  return buildStoredReaderState({
    canonical,
    hints: {
      chapterProgress: snapshot.projections?.scroll?.chapterProgress,
      contentMode: snapshot.mode,
      pageIndex,
      viewMode: 'original',
    },
  });
}

export function toStoredReaderStateFromPersistedReaderProgress(
  progress: PersistedReaderProgressSnapshot,
): StoredReaderState {
  return toStoredReaderStateFromReaderProgressSnapshot(progress.snapshot);
}

export function getReaderProgressSnapshotFingerprint(
  state: ReaderSessionState | ReaderProgressSnapshot | PersistedReaderProgressSnapshot | null,
): string {
  if (!state) {
    return 'null';
  }

  let snapshot: ReaderProgressSnapshot;
  if ('snapshot' in state) {
    snapshot = state.snapshot;
  } else if ('mode' in state && 'activeChapterIndex' in state) {
    snapshot = state;
  } else {
    snapshot = createReaderProgressSnapshotFromSessionState(state);
  }

  return JSON.stringify(normalizeReaderProgressSnapshot(snapshot));
}
