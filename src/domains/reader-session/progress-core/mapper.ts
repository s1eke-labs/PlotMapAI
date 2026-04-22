import type {
  ReaderLocatorRecord,
  ReaderProgressPositionRecord,
  ReaderProgressProjectionRecord,
  ReaderProgressRecord,
} from '@infra/db/reader';
import type { ReaderLocator } from '@shared/contracts/reader';

import type {
  PersistedReaderProgressSnapshot,
  ReaderProgressPosition,
  ReaderProgressProjection,
  ReaderProgressSnapshot,
} from './contracts';

function clampChapterProgress(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function normalizePageIndex(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.floor(value));
}

function toReaderLocatorRecord(locator: ReaderLocator): ReaderLocatorRecord {
  return {
    chapterIndex: locator.chapterIndex,
    blockIndex: locator.blockIndex,
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
    pageIndex: normalizePageIndex(locator.pageIndex),
  };
}

function toReaderLocator(locator: ReaderLocatorRecord): ReaderLocator {
  return {
    chapterIndex: locator.chapterIndex,
    blockIndex: locator.blockIndex,
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
    pageIndex: normalizePageIndex(locator.pageIndex),
  };
}

export function toReaderProgressPositionRecord(
  position: ReaderProgressPosition,
): ReaderProgressPositionRecord {
  if (position.type === 'locator') {
    return {
      type: 'locator',
      locator: toReaderLocatorRecord(position.locator),
    };
  }

  return {
    type: 'chapter-edge',
    chapterIndex: position.chapterIndex,
    edge: position.edge,
  };
}

export function toReaderProgressPosition(
  record: ReaderProgressPositionRecord | undefined,
): ReaderProgressPosition | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  if (record.type === 'locator') {
    if (!record.locator || typeof record.locator !== 'object') {
      return null;
    }

    return {
      type: 'locator',
      locator: toReaderLocator(record.locator),
    };
  }

  if (
    record.type !== 'chapter-edge'
    || typeof record.chapterIndex !== 'number'
    || (record.edge !== 'start' && record.edge !== 'end')
  ) {
    return null;
  }

  return {
    type: 'chapter-edge',
    chapterIndex: record.chapterIndex,
    edge: record.edge,
  };
}

export function toReaderProgressProjectionRecord(
  projection: ReaderProgressProjection | undefined,
): ReaderProgressProjectionRecord | undefined {
  const scrollChapterProgress = clampChapterProgress(projection?.scroll?.chapterProgress);
  const pagedPageIndex = normalizePageIndex(projection?.paged?.pageIndex);

  if (scrollChapterProgress === undefined && pagedPageIndex === undefined) {
    return undefined;
  }

  return {
    pagedPageIndex,
    scrollChapterProgress,
  };
}

export function toReaderProgressProjection(
  record: ReaderProgressProjectionRecord | undefined,
): ReaderProgressProjection | undefined {
  const scrollChapterProgress = clampChapterProgress(record?.scrollChapterProgress);
  const pagedPageIndex = normalizePageIndex(record?.pagedPageIndex);

  if (scrollChapterProgress === undefined && pagedPageIndex === undefined) {
    return undefined;
  }

  return {
    paged: pagedPageIndex === undefined
      ? undefined
      : { pageIndex: pagedPageIndex },
    scroll: scrollChapterProgress === undefined
      ? undefined
      : { chapterProgress: scrollChapterProgress },
  };
}

function isValidCaptureQuality(value: unknown): value is ReaderProgressSnapshot['captureQuality'] {
  return value === 'precise' || value === 'approximate';
}

function isValidMode(value: unknown): value is ReaderProgressSnapshot['mode'] {
  return value === 'scroll' || value === 'paged';
}

export function toReaderProgressRecord(params: {
  novelId: number;
  revision: number;
  snapshot: ReaderProgressSnapshot;
  updatedAt: string;
}): ReaderProgressRecord {
  return {
    novelId: params.novelId,
    mode: params.snapshot.mode,
    activeChapterIndex: params.snapshot.activeChapterIndex,
    position: toReaderProgressPositionRecord(params.snapshot.position),
    projections: toReaderProgressProjectionRecord(params.snapshot.projections),
    captureQuality: params.snapshot.captureQuality,
    revision: params.revision,
    updatedAt: params.updatedAt,
  };
}

export function toPersistedReaderProgressSnapshot(
  record: ReaderProgressRecord,
): PersistedReaderProgressSnapshot | null {
  if (!isValidMode(record.mode) || !isValidCaptureQuality(record.captureQuality)) {
    return null;
  }

  if (
    typeof record.novelId !== 'number'
    || typeof record.activeChapterIndex !== 'number'
    || typeof record.updatedAt !== 'string'
  ) {
    return null;
  }

  const position = toReaderProgressPosition(record.position);
  if (!position) {
    return null;
  }

  return {
    novelId: record.novelId,
    revision: typeof record.revision === 'number' ? record.revision : 0,
    snapshot: {
      mode: record.mode,
      activeChapterIndex: record.activeChapterIndex,
      position,
      projections: toReaderProgressProjection(record.projections),
      captureQuality: record.captureQuality,
    },
    updatedAt: record.updatedAt,
  };
}
