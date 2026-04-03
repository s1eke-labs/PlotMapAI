import type { Transaction } from 'dexie';

export type MigrationScope = 'db-schema' | 'storage-key' | 'cleanup';

export interface MigrationRetireWhen {
  date?: string;
  condition: string;
}

export interface MigrationMetadata {
  version: number;
  scope: MigrationScope;
  description: string;
  retireWhen: MigrationRetireWhen;
}

export interface DbSchemaMigration extends MigrationMetadata {
  scope: 'db-schema';
  stores: Record<string, string>;
  upgrade?: (transaction: Transaction) => Promise<void>;
}

export interface StorageKeyMigration extends MigrationMetadata {
  scope: 'storage-key';
  run: () => Promise<void>;
}

export interface CleanupMigration extends MigrationMetadata {
  scope: 'cleanup';
  run: () => Promise<void>;
}

export interface MigrationLedger {
  completedVersions: {
    storageKey: number[];
    cleanup: number[];
  };
  updatedAt: string;
}
