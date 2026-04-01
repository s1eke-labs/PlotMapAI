import { beforeEach, describe, expect, it, vi } from 'vitest';

const findVisibleBlockRangeMock = vi.hoisted(() => vi.fn());
const findLocatorForLayoutOffsetMock = vi.hoisted(() => vi.fn());
const findPageIndexForLocatorMock = vi.hoisted(() => vi.fn());
const getOffsetForLocatorMock = vi.hoisted(() => vi.fn());
const getPageStartLocatorMock = vi.hoisted(() => vi.fn());
const getPageIndexFromProgressMock = vi.hoisted(() => vi.fn());
const resolvePagedTargetPageMock = vi.hoisted(() => vi.fn());

vi.mock('../../../utils/readerLayout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/readerLayout')>();
  return {
    ...actual,
    findVisibleBlockRange: findVisibleBlockRangeMock,
    findLocatorForLayoutOffset: findLocatorForLayoutOffsetMock,
    findPageIndexForLocator: findPageIndexForLocatorMock,
    getOffsetForLocator: getOffsetForLocatorMock,
    getPageStartLocator: getPageStartLocatorMock,
  };
});

vi.mock('../../../utils/readerPosition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/readerPosition')>();
  return {
    ...actual,
    getPageIndexFromProgress: getPageIndexFromProgressMock,
    resolvePagedTargetPage: resolvePagedTargetPageMock,
  };
});

import {
  calculateVisibleScrollBlockRanges,
  resolveCurrentPagedLocator,
  resolveCurrentScrollLocator,
  resolveCurrentScrollLocatorOffset,
  resolvePagedViewportState,
} from '../useReaderPageViewport';

const chapter = {
  index: 0,
  title: 'Chapter 1',
  content: 'content',
  wordCount: 100,
  totalChapters: 1,
  hasPrev: false,
  hasNext: false,
};

describe('useReaderPageViewport helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findLocatorForLayoutOffsetMock.mockReturnValue({
      chapterIndex: 0,
      blockIndex: 0,
      kind: 'text',
    });
    getPageStartLocatorMock.mockReturnValue({
      chapterIndex: 0,
      blockIndex: 0,
      kind: 'text',
      edge: 'start',
    });
    getOffsetForLocatorMock.mockReturnValue(84);
    findVisibleBlockRangeMock.mockReturnValue({
      startIndex: 2,
      endIndex: 4,
    });
    findPageIndexForLocatorMock.mockReturnValue(null);
    resolvePagedTargetPageMock.mockReturnValue(1);
    getPageIndexFromProgressMock.mockReturnValue(2);
  });

  it('resolves the current scroll locator from the visible chapter body', () => {
    const contentElement = document.createElement('div');
    Object.defineProperty(contentElement, 'scrollTop', {
      configurable: true,
      value: 60,
    });
    Object.defineProperty(contentElement, 'clientHeight', {
      configurable: true,
      value: 200,
    });

    const bodyElement = document.createElement('div');
    Object.defineProperty(bodyElement, 'offsetTop', {
      configurable: true,
      value: 40,
    });

    const locator = resolveCurrentScrollLocator({
      chapterIndex: 0,
      contentElement,
      isPagedMode: false,
      scrollLayouts: new Map([[0, { chapterIndex: 0 }]]),
      scrollChapterBodyElements: new Map([[0, bodyElement]]),
      scrollReaderChapters: [{ index: 0, chapter }],
      viewMode: 'original',
    });

    expect(locator).toEqual({
      chapterIndex: 0,
      blockIndex: 0,
      kind: 'text',
    });
    expect(findLocatorForLayoutOffsetMock).toHaveBeenCalled();
  });

  it('resolves the current paged locator and restore target page', () => {
    const currentPagedLayout = {
      chapterIndex: 0,
      pageSlices: [{ id: 'page-1' }, { id: 'page-2' }, { id: 'page-3' }],
    };

    expect(resolveCurrentPagedLocator({
      currentPagedLayout,
      isPagedMode: true,
      pageIndex: 0,
      viewMode: 'original',
    })).toEqual({
      chapterIndex: 0,
      blockIndex: 0,
      kind: 'text',
      edge: 'start',
    });

    expect(resolvePagedViewportState({
      chapterIndex: 0,
      currentPagedLayout,
      pageIndex: 0,
      pendingRestoreTarget: {
        chapterIndex: 0,
        viewMode: 'original',
        isTwoColumn: true,
        chapterProgress: 1,
      },
      pendingPageTarget: 'end',
    })).toEqual({
      pageCount: 3,
      targetPage: 2,
    });
  });

  it('calculates visible scroll block ranges and locator offsets for registered bodies', () => {
    const contentElement = document.createElement('div');
    Object.defineProperty(contentElement, 'clientHeight', {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(contentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 400, 300),
    });

    const bodyElement = document.createElement('div');
    Object.defineProperty(bodyElement, 'offsetTop', {
      configurable: true,
      value: 120,
    });
    Object.defineProperty(bodyElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 120, 400, 200),
    });

    const ranges = calculateVisibleScrollBlockRanges({
      contentElement,
      isPagedMode: false,
      renderableScrollLayouts: [
        {
          chapter,
          index: 0,
          layout: { chapterIndex: 0 },
        },
      ],
      scrollChapterBodyElements: new Map([[0, bodyElement]]),
      scrollViewportHeight: 300,
      scrollViewportTop: 0,
      viewMode: 'original',
    });

    expect(ranges.get(0)).toEqual({
      startIndex: 2,
      endIndex: 4,
    });
    expect(resolveCurrentScrollLocatorOffset({
      locator: {
        chapterIndex: 0,
        blockIndex: 0,
        kind: 'text',
      },
      scrollChapterBodyElements: new Map([[0, bodyElement]]),
      scrollLayouts: new Map([[0, { chapterIndex: 0 }]]),
    })).toBe(204);
  });
});
