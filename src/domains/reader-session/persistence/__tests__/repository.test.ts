import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';

import {
  deleteLegacyReadingProgress,
} from '../repository';

describe('legacy reading progress cleanup', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('removes only the targeted novel rows from the legacy table', async () => {
    await db.readingProgress.add({
      novelId: 1,
      canonical: {
        chapterIndex: 2,
        edge: 'start',
      },
      chapterProgress: 0.6,
      updatedAt: new Date().toISOString(),
    });
    await db.readingProgress.add({
      novelId: 2,
      canonical: {
        chapterIndex: 2,
        edge: 'start',
      },
      chapterProgress: 0.3,
      updatedAt: new Date().toISOString(),
    });

    await deleteLegacyReadingProgress(1);

    await expect(db.readingProgress.where('novelId').equals(1).count()).resolves.toBe(0);
    await expect(db.readingProgress.where('novelId').equals(2).count()).resolves.toBe(1);
  });

  it('uses the active transaction when clearing legacy rows', async () => {
    await db.readingProgress.add({
      novelId: 5,
      canonical: {
        chapterIndex: 1,
        edge: 'end',
      },
      updatedAt: new Date().toISOString(),
    });

    await db.transaction('rw', db.readingProgress, async () => {
      const transaction = Dexie.currentTransaction;
      if (!transaction) {
        throw new Error('Expected an active Dexie transaction in test.');
      }

      await deleteLegacyReadingProgress(5, transaction);
      await expect(db.readingProgress.where('novelId').equals(5).count()).resolves.toBe(0);
    });
  });
});

