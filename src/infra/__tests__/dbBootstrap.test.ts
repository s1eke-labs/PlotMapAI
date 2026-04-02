import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, PLOTMAPAI_DB_NAME, prepareDatabase } from '@infra/db';
import { ANALYSIS_DB_SCHEMA } from '@infra/db/analysis';
import { LIBRARY_DB_SCHEMA } from '@infra/db/library';
import { READER_DB_SCHEMA } from '@infra/db/reader';
import { SETTINGS_DB_SCHEMA } from '@infra/db/settings';

const BASELINE_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

function createLegacyDatabase(version: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PLOTMAPAI_DB_NAME, version);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('legacyStore')) {
        request.result.createObjectStore('legacyStore');
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

async function createVersionOneDatabaseWithLegacyNovel(): Promise<void> {
  const legacyDb = new Dexie(PLOTMAPAI_DB_NAME);
  legacyDb.version(1).stores(BASELINE_SCHEMA);
  await legacyDb.open();

  const novelId = await legacyDb.table('novels').add({
    author: '',
    coverPath: '',
    createdAt: '2026-04-01T00:00:00.000Z',
    description: '',
    fileHash: 'legacy-db-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'legacy-db.txt',
    tags: [],
    title: 'Legacy DB Novel',
    totalWords: 200,
  });
  await legacyDb.table('chapters').bulkAdd([
    {
      chapterIndex: 0,
      content: 'Chapter one',
      novelId,
      title: 'Chapter 1',
      wordCount: 11,
    },
    {
      chapterIndex: 1,
      content: 'Chapter two',
      novelId,
      title: 'Chapter 2',
      wordCount: 11,
    },
  ]);

  legacyDb.close();
}

describe('prepareDatabase', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    localStorage.clear();
  });

  it('opens the formal v2 baseline schema in a fresh environment', async () => {
    await prepareDatabase();

    expect(db.verno).toBe(2);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'analysisChunks',
      'analysisJobs',
      'analysisOverviews',
      'appSettings',
      'chapterAnalyses',
      'chapterImages',
      'chapters',
      'coverImages',
      'novelImageGalleryEntries',
      'novels',
      'purificationRules',
      'readerRenderCache',
      'readingProgress',
      'tocRules',
    ]);
  });

  it('deletes a legacy same-name database and recreates the v2 baseline', async () => {
    await createLegacyDatabase(9);

    await prepareDatabase();

    expect(db.verno).toBe(2);
    expect(db.tables.some((table) => table.name === 'legacyStore')).toBe(false);
    expect(db.tables.some((table) => table.name === 'novels')).toBe(true);
  });

  it('upgrades v1 novels by backfilling chapterCount from chapters', async () => {
    await createVersionOneDatabaseWithLegacyNovel();

    await prepareDatabase();

    const novel = await db.novels.get(1);

    expect(db.verno).toBe(2);
    expect(novel).toMatchObject({
      chapterCount: 2,
      title: 'Legacy DB Novel',
    });
  });
});
