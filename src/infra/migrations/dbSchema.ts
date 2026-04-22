import type { DbSchemaMigration } from './types';

import Dexie from 'dexie';

import { ANALYSIS_DB_SCHEMA } from '@infra/db/analysis';
import { LIBRARY_DB_SCHEMA } from '@infra/db/library';
import { READER_DB_SCHEMA } from '@infra/db/reader';
import { SETTINGS_DB_SCHEMA } from '@infra/db/settings';

const DB_SCHEMA_V5 = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  readingProgress: '++id, novelId',
  readerRenderCache: READER_DB_SCHEMA.readerRenderCache,
} as const;

const DB_SCHEMA_V6 = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  readingProgress: READER_DB_SCHEMA.readingProgress,
  readerRenderCache: READER_DB_SCHEMA.readerRenderCache,
} as const;

const CURRENT_DB_SCHEMA = {
  ...LIBRARY_DB_SCHEMA,
  ...SETTINGS_DB_SCHEMA,
  ...ANALYSIS_DB_SCHEMA,
  ...READER_DB_SCHEMA,
} as const;

export const DB_SCHEMA_MIGRATIONS: readonly DbSchemaMigration[] = [{
  version: 5,
  scope: 'db-schema',
  description: 'Structured chapter content baseline before reader progress V2 reset.',
  retireWhen: {
    condition: 'Superseded by reader progress V2 schema reset.',
  },
  stores: DB_SCHEMA_V5,
}, {
  version: 6,
  scope: 'db-schema',
  description: 'Reader progress V2 baseline with single-record durable sessions and cleared legacy reader progress.',
  retireWhen: {
    condition: 'Superseded by reader progress core baseline.',
  },
  stores: DB_SCHEMA_V6,
  upgrade: async (transaction) => {
    await transaction.table('readingProgress').clear();
  },
}, {
  version: 7,
  scope: 'db-schema',
  description: 'Reader progress core baseline with dedicated readerProgress storage and cleared legacy progress snapshots.',
  retireWhen: {
    condition: 'Current supported schema baseline.',
  },
  stores: CURRENT_DB_SCHEMA,
  upgrade: async (transaction) => {
    await transaction.table('readingProgress').clear();
    await transaction.table('readerProgress').clear();
  },
}] as const;

export const CURRENT_DB_SCHEMA_VERSION = DB_SCHEMA_MIGRATIONS.at(-1)?.version ?? 1;

export function toNativeDatabaseVersion(version: number): number {
  return Math.round(version * 10);
}

export function registerDbSchemaMigrations(database: Dexie): void {
  for (const migration of DB_SCHEMA_MIGRATIONS) {
    const version = database.version(migration.version).stores(migration.stores);
    if (migration.upgrade) {
      version.upgrade(migration.upgrade);
    }
  }
}
