import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  db,
  PLOTMAPAI_DB_NAME,
  prepareDatabase,
} from '@infra/db';
import {
  APP_SETTING_KEYS,
  SECURE_KEYS,
  storage,
} from '@infra/storage';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@shared/contracts';

import { DB_SCHEMA_MIGRATIONS } from '../dbSchema';
import {
  CLEANUP_MIGRATIONS,
  POST_DATABASE_MIGRATIONS,
  runPostDatabaseMigrations,
  STORAGE_KEY_MIGRATIONS,
} from '..';

const LEGACY_AI_CONFIG_CACHE_KEY = 'plotmapai_ai_config';
const LEGACY_AI_API_KEY = 'plotmapai_encrypted_api_key';
const LEGACY_THEME_CACHE_KEY = 'theme';
const LEGACY_READER_THEME_CACHE_KEY = 'readerTheme';

describe('runPostDatabaseMigrations', () => {
  beforeEach(async () => {
    db.close();
    localStorage.clear();
    storage.secure.resetForTesting();
    await Dexie.delete(PLOTMAPAI_DB_NAME);
    await prepareDatabase();
    await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
    await storage.primary.settings.remove(APP_SETTING_KEYS.migrationLedger);
    await storage.secure.remove(SECURE_KEYS.aiApiKey);
    await storage.secure.remove(LEGACY_AI_API_KEY);
  });

  it('migrates legacy storage keys once and records the ledger', async () => {
    localStorage.setItem(LEGACY_AI_CONFIG_CACHE_KEY, JSON.stringify({
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    }));
    await storage.secure.set(LEGACY_AI_API_KEY, 'sk-legacy-secret');

    await runPostDatabaseMigrations();

    await expect(storage.primary.settings.get(APP_SETTING_KEYS.aiConfig)).resolves.toEqual({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    });
    await expect(storage.secure.get(SECURE_KEYS.aiApiKey)).resolves.toBe('sk-legacy-secret');
    expect(localStorage.getItem(LEGACY_AI_CONFIG_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AI_API_KEY)).toBeNull();
    await expect(
      storage.primary.settings.get(APP_SETTING_KEYS.migrationLedger),
    ).resolves.toMatchObject({
      completedVersions: {
        storageKey: [1],
        cleanup: [1],
      },
    });
  });

  it('runs cleanup migrations only once', async () => {
    localStorage.setItem(LEGACY_THEME_CACHE_KEY, 'dark');
    localStorage.setItem(LEGACY_READER_THEME_CACHE_KEY, 'night');

    await runPostDatabaseMigrations();

    expect(localStorage.getItem(LEGACY_THEME_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_READER_THEME_CACHE_KEY)).toBeNull();

    localStorage.setItem(LEGACY_THEME_CACHE_KEY, 'dark');
    localStorage.setItem(LEGACY_READER_THEME_CACHE_KEY, 'night');

    await runPostDatabaseMigrations();

    expect(localStorage.getItem(LEGACY_THEME_CACHE_KEY)).toBe('dark');
    expect(localStorage.getItem(LEGACY_READER_THEME_CACHE_KEY)).toBe('night');
  });

  it('requires retire metadata for every registered migration', () => {
    for (const migration of [
      ...DB_SCHEMA_MIGRATIONS,
      ...STORAGE_KEY_MIGRATIONS,
      ...CLEANUP_MIGRATIONS,
      ...POST_DATABASE_MIGRATIONS,
    ]) {
      expect(migration.retireWhen.condition).toBeTruthy();
    }
  });
});
