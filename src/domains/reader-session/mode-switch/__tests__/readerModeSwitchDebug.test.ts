import { describe, expect, it } from 'vitest';

import type { ReaderLocator, StoredReaderState } from '@shared/contracts/reader';

import { captureStrictModeSwitchState } from '../readerModeSwitchDebug';

describe('captureStrictModeSwitchState', () => {
  it('captures paged locators without carrying stale scroll progress', () => {
    const pagedLocator: ReaderLocator = {
      chapterIndex: 2,
      blockIndex: 18,
      kind: 'text',
      lineIndex: 1,
      pageIndex: 4,
    };
    const latestReaderState: StoredReaderState = {
      canonical: {
        chapterIndex: 2,
        blockIndex: 8,
        kind: 'text',
        lineIndex: 0,
      },
      hints: {
        chapterProgress: 0.31,
        contentMode: 'scroll',
        viewMode: 'original',
      },
    };

    const result = captureStrictModeSwitchState({
      chapterIndex: 2,
      currentOriginalLocator: null,
      currentPagedLocator: pagedLocator,
      latestReaderState,
      mode: 'paged',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.state.canonical).toEqual({
      chapterIndex: 2,
      blockIndex: 18,
      kind: 'text',
      lineIndex: 1,
    });
    expect(result.state.hints).toMatchObject({
      contentMode: 'paged',
      pageIndex: 4,
      viewMode: 'original',
    });
    expect(result.state.hints?.chapterProgress).toBeUndefined();
  });
});
