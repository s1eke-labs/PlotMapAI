import type { ChapterRecord, NovelRecord } from './db/library';

import Dexie, { type Transaction } from 'dexie';

import { ANALYSIS_DB_SCHEMA, type AnalysisTables } from './db/analysis';
import { LIBRARY_DB_SCHEMA, type LibraryTables } from './db/library';
import { READER_DB_SCHEMA, type ReaderTables } from './db/reader';
import { SETTINGS_DB_SCHEMA, type SettingsTables } from './db/settings';

export const PLOTMAPAI_DB_NAME = 'PlotMapAI';

const CURRENT_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

interface PlotMapAIDatabase
  extends Dexie, LibraryTables, SettingsTables, AnalysisTables, ReaderTables {}

const db = new Dexie(PLOTMAPAI_DB_NAME) as PlotMapAIDatabase;

interface LegacyNovelRecord extends Omit<NovelRecord, 'chapterCount'> {
  chapterCount?: number;
}

function buildChapterCountMap(chapters: ChapterRecord[]): Map<number, number> {
  return chapters.reduce<Map<number, number>>((counts, chapter) => {
    counts.set(chapter.novelId, (counts.get(chapter.novelId) ?? 0) + 1);
    return counts;
  }, new Map());
}

async function backfillNovelChapterCounts(transaction: Transaction): Promise<void> {
  const chapters = await transaction.table<ChapterRecord, 'id'>('chapters').toArray();
  const chapterCounts = buildChapterCountMap(chapters);

  await transaction
    .table<LegacyNovelRecord, 'id'>('novels')
    .toCollection()
    .modify((novel: LegacyNovelRecord) => {
      const legacyNovel = novel;
      legacyNovel.chapterCount = chapterCounts.get(legacyNovel.id) ?? 0;
    });
}

db.version(1).stores(CURRENT_SCHEMA);
db.version(2)
  .stores(CURRENT_SCHEMA)
  .upgrade(backfillNovelChapterCounts);

function isLegacyDatabaseVersionError(error: unknown): boolean {
  return error instanceof Dexie.DexieError && error.name === Dexie.errnames.Version;
}

async function clearLegacyDatabase(): Promise<void> {
  db.close();
  await db.delete();
}

export async function prepareDatabase(): Promise<void> {
  if (db.isOpen()) {
    return;
  }

  try {
    await db.open();
  } catch (error) {
    if (!isLegacyDatabaseVersionError(error)) {
      throw error;
    }

    await clearLegacyDatabase();
    await db.open();
  }
}

export { db };
