import type {
  CleanupMigration,
  MigrationLedger,
  StorageKeyMigration,
} from './types';

import {
  APP_SETTING_KEYS,
  storage,
} from '@infra/storage';

import { CLEANUP_MIGRATIONS } from './cleanup';
import { STORAGE_KEY_MIGRATIONS } from './storage';

function createEmptyLedger(): MigrationLedger {
  return {
    completedVersions: {
      storageKey: [],
      cleanup: [],
    },
    updatedAt: new Date(0).toISOString(),
  };
}

function isValidVersionList(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'number' && Number.isInteger(item) && item > 0);
}

function isMigrationLedger(value: unknown): value is MigrationLedger {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const parsed = value as Record<string, unknown>;
  if (typeof parsed.updatedAt !== 'string') {
    return false;
  }

  const { completedVersions } = parsed;
  if (!completedVersions || typeof completedVersions !== 'object') {
    return false;
  }

  const completed = completedVersions as Record<string, unknown>;
  return isValidVersionList(completed.storageKey)
    && isValidVersionList(completed.cleanup);
}

async function readMigrationLedger(): Promise<MigrationLedger> {
  const stored = await storage.primary.settings.get<MigrationLedger>(
    APP_SETTING_KEYS.migrationLedger,
  );
  return isMigrationLedger(stored) ? stored : createEmptyLedger();
}

async function writeMigrationLedger(ledger: MigrationLedger): Promise<void> {
  await storage.primary.settings.set(APP_SETTING_KEYS.migrationLedger, ledger);
}

async function markVersionCompleted(
  ledger: MigrationLedger,
  scope: 'storageKey' | 'cleanup',
  version: number,
): Promise<MigrationLedger> {
  if (ledger.completedVersions[scope].includes(version)) {
    return ledger;
  }

  const nextLedger: MigrationLedger = {
    completedVersions: {
      ...ledger.completedVersions,
      [scope]: [...ledger.completedVersions[scope], version].sort((left, right) => left - right),
    },
    updatedAt: new Date().toISOString(),
  };
  await writeMigrationLedger(nextLedger);
  return nextLedger;
}

async function runStorageKeyMigrations(ledger: MigrationLedger): Promise<MigrationLedger> {
  let nextLedger = ledger;

  for (const migration of STORAGE_KEY_MIGRATIONS) {
    if (nextLedger.completedVersions.storageKey.includes(migration.version)) {
      continue;
    }

    await migration.run();
    nextLedger = await markVersionCompleted(nextLedger, 'storageKey', migration.version);
  }

  return nextLedger;
}

async function runCleanupMigrations(ledger: MigrationLedger): Promise<MigrationLedger> {
  let nextLedger = ledger;

  for (const migration of CLEANUP_MIGRATIONS) {
    if (nextLedger.completedVersions.cleanup.includes(migration.version)) {
      continue;
    }

    await migration.run();
    nextLedger = await markVersionCompleted(nextLedger, 'cleanup', migration.version);
  }

  return nextLedger;
}

export async function runPostDatabaseMigrations(): Promise<void> {
  const ledger = await readMigrationLedger();
  const afterStorage = await runStorageKeyMigrations(ledger);
  await runCleanupMigrations(afterStorage);
}

export const POST_DATABASE_MIGRATIONS: ReadonlyArray<StorageKeyMigration | CleanupMigration> = [
  ...STORAGE_KEY_MIGRATIONS,
  ...CLEANUP_MIGRATIONS,
] as const;

export {
  CLEANUP_MIGRATIONS,
  STORAGE_KEY_MIGRATIONS,
};
export type {
  CleanupMigration,
  DbSchemaMigration,
  MigrationLedger,
  MigrationMetadata,
  MigrationRetireWhen,
  MigrationScope,
  StorageKeyMigration,
} from './types';
