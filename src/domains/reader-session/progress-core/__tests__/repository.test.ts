import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';

import {
  deleteReaderProgressSnapshot,
  readReaderProgressSnapshot,
  replaceReaderProgressSnapshot,
} from '../repository';

describe('reader progress core repository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('returns null when no snapshot exists', async () => {
    await expect(readReaderProgressSnapshot(7)).resolves.toBeNull();
  });

  it('writes and reads a precise locator snapshot', async () => {
    await replaceReaderProgressSnapshot(7, {
      mode: 'paged',
      activeChapterIndex: 3,
      position: {
        type: 'locator',
        locator: {
          chapterIndex: 3,
          blockIndex: 8,
          kind: 'text',
          lineIndex: 1,
          pageIndex: 5,
        },
      },
      projections: {
        paged: {
          pageIndex: 5,
        },
        scroll: {
          chapterProgress: 0.58,
        },
      },
      captureQuality: 'precise',
    });

    await expect(readReaderProgressSnapshot(7)).resolves.toMatchObject({
      novelId: 7,
      revision: 1,
      snapshot: {
        mode: 'paged',
        activeChapterIndex: 3,
        position: {
          type: 'locator',
          locator: {
            chapterIndex: 3,
            blockIndex: 8,
            kind: 'text',
            lineIndex: 1,
            pageIndex: 5,
          },
        },
        projections: {
          paged: {
            pageIndex: 5,
          },
          scroll: {
            chapterProgress: 0.58,
          },
        },
        captureQuality: 'precise',
      },
    });
  });

  it('normalizes approximate chapter-edge snapshots and increments revision', async () => {
    await replaceReaderProgressSnapshot(11, {
      mode: 'scroll',
      activeChapterIndex: 5,
      position: {
        type: 'chapter-edge',
        chapterIndex: 5,
        edge: 'start',
      },
      projections: {
        paged: {
          pageIndex: 4.9,
        },
        scroll: {
          chapterProgress: 1.4,
        },
      },
      captureQuality: 'approximate',
    });
    await replaceReaderProgressSnapshot(11, {
      mode: 'scroll',
      activeChapterIndex: 5,
      position: {
        type: 'chapter-edge',
        chapterIndex: 5,
        edge: 'end',
      },
      projections: {
        scroll: {
          chapterProgress: -1,
        },
      },
      captureQuality: 'approximate',
    });

    await expect(readReaderProgressSnapshot(11)).resolves.toEqual({
      novelId: 11,
      revision: 2,
      snapshot: {
        mode: 'scroll',
        activeChapterIndex: 5,
        position: {
          type: 'chapter-edge',
          chapterIndex: 5,
          edge: 'end',
        },
        projections: {
          scroll: {
            chapterProgress: 0,
          },
        },
        captureQuality: 'approximate',
      },
      updatedAt: expect.any(String),
    });
  });

  it('deletes snapshots by novel id', async () => {
    await replaceReaderProgressSnapshot(19, {
      mode: 'scroll',
      activeChapterIndex: 2,
      position: {
        type: 'chapter-edge',
        chapterIndex: 2,
        edge: 'start',
      },
      captureQuality: 'approximate',
    });

    await deleteReaderProgressSnapshot(19);

    await expect(readReaderProgressSnapshot(19)).resolves.toBeNull();
  });
});
