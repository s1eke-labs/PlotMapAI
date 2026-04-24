import type {
  PageSlice,
  ReaderLocator,
  ReaderPageItem,
  VirtualBlockMetrics,
} from '../layout/readerLayoutTypes';
import { scoreReaderTextQuoteMatch } from '@shared/text-processing';

export function areLayoutCursorsEquivalent(
  left: ReaderLocator['startCursor'],
  right: ReaderLocator['startCursor'],
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.segmentIndex === right.segmentIndex
    && left.graphemeIndex === right.graphemeIndex;
}

export function areLocatorsEquivalent(
  left: ReaderLocator | null | undefined,
  right: ReaderLocator | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.chapterIndex === right.chapterIndex
    && left.blockIndex === right.blockIndex
    && left.kind === right.kind
    && left.lineIndex === right.lineIndex
    && left.edge === right.edge
    && areLayoutCursorsEquivalent(left.startCursor, right.startCursor)
    && areLayoutCursorsEquivalent(left.endCursor, right.endCursor);
}

function isLocatorContentVersionCompatible(
  locator: ReaderLocator,
  candidate: {
    contentHash?: string;
    contentVersion?: number;
    importFormatVersion?: number;
  },
): boolean {
  if (locator.contentHash && candidate.contentHash) {
    return locator.contentHash === candidate.contentHash;
  }

  if (
    typeof locator.contentVersion === 'number'
    && typeof candidate.contentVersion === 'number'
    && locator.contentVersion !== candidate.contentVersion
  ) {
    return false;
  }

  if (
    typeof locator.importFormatVersion === 'number'
    && typeof candidate.importFormatVersion === 'number'
    && locator.importFormatVersion !== candidate.importFormatVersion
  ) {
    return false;
  }

  return true;
}

function scoreLocatorIdentityMatch(
  locator: ReaderLocator,
  candidate: {
    anchorId?: string;
    blockIndex: number;
    blockKey?: string;
    blockTextHash?: string;
    chapterIndex: number;
    chapterKey?: string;
    contentHash?: string;
    contentVersion?: number;
    imageKey?: string;
    importFormatVersion?: number;
    kind: 'heading' | 'text' | 'image' | 'blank';
    text?: string;
  },
): number | null {
  if (candidate.chapterIndex !== locator.chapterIndex) {
    return null;
  }

  if (locator.chapterKey && candidate.chapterKey && locator.chapterKey !== candidate.chapterKey) {
    return null;
  }

  if (locator.anchorId && candidate.anchorId === locator.anchorId) {
    return 1000;
  }

  if (locator.imageKey && candidate.imageKey === locator.imageKey) {
    return 950;
  }

  if (locator.blockKey && candidate.blockKey === locator.blockKey) {
    return 900;
  }

  if (locator.blockTextHash && candidate.blockTextHash === locator.blockTextHash) {
    return 800;
  }

  const quoteScore = scoreReaderTextQuoteMatch({
    candidateText: candidate.text,
    quote: locator.textQuote,
  });
  if (quoteScore !== null) {
    return 700 + quoteScore;
  }

  if (
    candidate.blockIndex === locator.blockIndex
    && candidate.kind === locator.kind
    && isLocatorContentVersionCompatible(locator, candidate)
  ) {
    return 100;
  }

  return null;
}

export function scoreLocatorMetricMatch(
  locator: ReaderLocator,
  metric: VirtualBlockMetrics,
): number | null {
  return scoreLocatorIdentityMatch(locator, {
    anchorId: metric.block.anchorId,
    blockIndex: metric.block.blockIndex,
    blockKey: metric.block.blockKey,
    blockTextHash: metric.block.blockTextHash,
    chapterIndex: metric.block.chapterIndex,
    chapterKey: metric.block.chapterKey,
    contentHash: metric.block.contentHash,
    contentVersion: metric.block.contentVersion,
    imageKey: metric.block.imageKey,
    importFormatVersion: metric.block.importFormatVersion,
    kind: metric.block.kind,
    text: metric.block.text,
  });
}

export function scoreLocatorPageItemMatch(
  locator: ReaderLocator,
  item: ReaderPageItem,
): number | null {
  if (item.kind === 'blank') {
    return null;
  }

  return scoreLocatorIdentityMatch(locator, {
    anchorId: item.anchorId,
    blockIndex: item.blockIndex,
    blockKey: item.blockKey,
    blockTextHash: item.kind === 'image' ? undefined : item.blockTextHash,
    chapterIndex: item.chapterIndex,
    chapterKey: item.chapterKey,
    contentHash: item.contentHash,
    contentVersion: item.contentVersion,
    imageKey: item.kind === 'image' ? item.imageKey : undefined,
    importFormatVersion: item.importFormatVersion,
    kind: item.kind,
    text: item.kind === 'image' ? undefined : item.text,
  });
}

export function pageContainsLocator(
  page: PageSlice | null | undefined,
  locator: ReaderLocator,
): boolean {
  if (!page) {
    return false;
  }

  for (const column of page.columns) {
    for (const item of column.items) {
      const identityScore = scoreLocatorPageItemMatch(locator, item);
      if (identityScore === null) {
        continue;
      }

      if (item.kind === 'image' && locator.kind === 'image') {
        return true;
      }

      if ((item.kind === 'heading' || item.kind === 'text') && locator.kind === item.kind) {
        const lineIndex = locator.lineIndex ?? 0;
        const startLineIndex = item.lineStartIndex;
        const endLineIndex = item.lineStartIndex + item.lines.length;
        if (lineIndex >= startLineIndex && lineIndex < endLineIndex) {
          return true;
        }
        if (identityScore >= 700) {
          return true;
        }
      }
    }
  }

  return false;
}

export function findFirstVisibleMetricIndex(
  metrics: VirtualBlockMetrics[],
  viewportStart: number,
): number {
  let low = 0;
  let high = metrics.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metric = metrics[mid];
    if (metric.top + metric.height > viewportStart) {
      result = mid;
      high = mid - 1;
      continue;
    }
    low = mid + 1;
  }

  return result;
}

export function findLastVisibleMetricIndex(
  metrics: VirtualBlockMetrics[],
  viewportEnd: number,
): number {
  let low = 0;
  let high = metrics.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metric = metrics[mid];
    if (metric.top < viewportEnd) {
      result = mid;
      low = mid + 1;
      continue;
    }
    high = mid - 1;
  }

  return result;
}

export function findNearestMeaningfulMetric(
  metrics: VirtualBlockMetrics[],
  blockIndex: number,
): VirtualBlockMetrics | null {
  for (let index = blockIndex; index >= 0; index -= 1) {
    const metric = metrics[index];
    if (metric && metric.block.kind !== 'blank') {
      return metric;
    }
  }

  for (let index = blockIndex + 1; index < metrics.length; index += 1) {
    const metric = metrics[index];
    if (metric.block.kind !== 'blank') {
      return metric;
    }
  }

  return null;
}

export function findBoundaryMetric(
  metrics: VirtualBlockMetrics[],
  edge: 'start' | 'end',
): VirtualBlockMetrics | null {
  if (edge === 'start') {
    for (const metric of metrics) {
      if (metric.block.kind !== 'blank') {
        return metric;
      }
    }
    return null;
  }

  for (let index = metrics.length - 1; index >= 0; index -= 1) {
    const metric = metrics[index];
    if (metric.block.kind !== 'blank') {
      return metric;
    }
  }

  return null;
}

export type ReaderLocatorPageItem = ReaderPageItem;
