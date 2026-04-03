import type { AnalysisProviderId } from '@shared/contracts';
import type { StorageKeyMigration } from './types';

import {
  APP_SETTING_KEYS,
  SECURE_KEYS,
  storage,
} from '@infra/storage';
import { DEFAULT_ANALYSIS_PROVIDER_ID, isAnalysisProviderId } from '@shared/contracts';

const LEGACY_AI_CONFIG_CACHE_KEY = 'plotmapai_ai_config';
const LEGACY_AI_API_KEY = 'plotmapai_encrypted_api_key';

interface StoredAiConfigRecord {
  providerId: AnalysisProviderId;
  apiBaseUrl: string;
  modelName: string;
  contextSize: number;
}

function sanitizeAiConfigRecord(raw: unknown): StoredAiConfigRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const parsed = raw as Record<string, unknown>;
  if (
    typeof parsed.apiBaseUrl !== 'string'
    || typeof parsed.modelName !== 'string'
    || typeof parsed.contextSize !== 'number'
  ) {
    return null;
  }

  return {
    providerId: isAnalysisProviderId(parsed.providerId)
      ? parsed.providerId
      : DEFAULT_ANALYSIS_PROVIDER_ID,
    apiBaseUrl: parsed.apiBaseUrl,
    modelName: parsed.modelName,
    contextSize: parsed.contextSize,
  };
}

async function migrateLegacyAiConfigStorage(): Promise<void> {
  const rawConfig = storage.cache.getString(LEGACY_AI_CONFIG_CACHE_KEY);
  if (rawConfig) {
    try {
      const parsed = sanitizeAiConfigRecord(JSON.parse(rawConfig) as unknown);
      if (parsed) {
        await storage.primary.settings.set(APP_SETTING_KEYS.aiConfig, parsed);
      }
    } catch {
      // Malformed legacy payloads are ignored and cleared below.
    }
  }

  storage.cache.remove(LEGACY_AI_CONFIG_CACHE_KEY);

  const legacyApiKey = await storage.secure.get(LEGACY_AI_API_KEY);
  if (legacyApiKey !== null) {
    await storage.secure.set(SECURE_KEYS.aiApiKey, legacyApiKey);
  }
  await storage.secure.remove(LEGACY_AI_API_KEY);
}

export const STORAGE_KEY_MIGRATIONS: readonly StorageKeyMigration[] = [{
  version: 1,
  scope: 'storage-key',
  description: 'Move legacy AI config cache keys into canonical primary and secure storage keys.',
  retireWhen: {
    condition: 'Remove after all supported clients have migrated legacy AI settings keys.',
  },
  run: migrateLegacyAiConfigStorage,
}] as const;
