import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_SETTING_KEYS,
  DEVICE_KEY_STORAGE_KEY,
  LEGACY_CACHE_KEYS,
  LEGACY_SECURE_KEYS,
  SECURE_KEYS,
  storage,
} from '@infra/storage';
import { DEFAULT_ANALYSIS_PROVIDER_ID } from '@domains/analysis';
import { AppErrorCode } from '@shared/errors';
import { aiConfigApi, resetDeviceKeyForTesting } from '../aiConfig';
import { db } from '@infra/db';

describe('aiConfigApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetDeviceKeyForTesting();
  });

  it('getAiProviderSettings returns empty config when not set', async () => {
    const settings = await aiConfigApi.getAiProviderSettings();
    expect(settings.providerId).toBe(DEFAULT_ANALYSIS_PROVIDER_ID);
    expect(settings.apiBaseUrl).toBe('');
    expect(settings.hasApiKey).toBe(false);
    expect(settings.maskedApiKey).toBe('');
  });

  it('updateAiProviderSettings saves config', async () => {
    const settings = await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    expect(settings.providerId).toBe(DEFAULT_ANALYSIS_PROVIDER_ID);
    expect(settings.apiBaseUrl).toBe('http://localhost:5000');
    expect(settings.hasApiKey).toBe(true);
    expect(settings.maskedApiKey).toContain('sk-t');
  });

  it('updateAiProviderSettings preserves existing key when keepExistingApiKey', async () => {
    await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-original1234',
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    const settings = await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:8080',
      keepExistingApiKey: true,
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    expect(settings.apiBaseUrl).toBe('http://localhost:8080');
    expect(settings.hasApiKey).toBe(true);
  });

  it('keeps the imported API key available within the current session even if the device key storage is cleared', async () => {
    await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-session-secret',
      modelName: 'gpt-4',
      contextSize: 32000,
    });

    localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);

    const settings = await aiConfigApi.getAiProviderSettings();
    expect(settings.hasApiKey).toBe(true);
    expect(settings.maskedApiKey).toContain('sk-s');
  });

  it('defaults providerId for legacy AI config records', async () => {
    await storage.primary.settings.set(APP_SETTING_KEYS.aiConfig, {
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    });
    await storage.secure.set(SECURE_KEYS.aiApiKey, 'sk-legacy-secret');

    const settings = await aiConfigApi.getAiProviderSettings();

    expect(settings.providerId).toBe(DEFAULT_ANALYSIS_PROVIDER_ID);
  });

  it('migrates legacy AI config from localStorage to primary and secure storage', async () => {
    localStorage.setItem(LEGACY_CACHE_KEYS.aiConfig, JSON.stringify({
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    }));
    await storage.secure.set(LEGACY_SECURE_KEYS.aiApiKey, 'sk-legacy-secret');

    const settings = await aiConfigApi.getAiProviderSettings();

    expect(settings.apiBaseUrl).toBe('http://legacy-host:5000');
    expect(settings.modelName).toBe('legacy-model');
    expect(settings.contextSize).toBe(64000);
    expect(settings.hasApiKey).toBe(true);
    expect(await storage.primary.settings.get(APP_SETTING_KEYS.aiConfig)).toEqual({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://legacy-host:5000',
      modelName: 'legacy-model',
      contextSize: 64000,
    });
    expect(await storage.secure.get(SECURE_KEYS.aiApiKey)).toBe('sk-legacy-secret');
    expect(localStorage.getItem(LEGACY_CACHE_KEYS.aiConfig)).toBeNull();
    expect(localStorage.getItem(LEGACY_SECURE_KEYS.aiApiKey)).toBeNull();
  });

  it('updateAiProviderSettings does not silently restore old values when fields are cleared', async () => {
    await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    await expect(aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: '',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    })).rejects.toThrow();
  });

  it('updateAiProviderSettings throws for invalid config', async () => {
    await expect(aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: '',
      apiKey: '',
      modelName: '',
      contextSize: 100,
    })).rejects.toThrow();
  });

  it('testAiProviderSettings does not silently use old values when fields are cleared', async () => {
    await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    });
    await expect(aiConfigApi.testAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: '',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    })).rejects.toThrow();
  });

  it('testAiProviderSettings reuses the saved token when the form keeps the token field empty', async () => {
    await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    });

    await expect(aiConfigApi.testAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: '',
      modelName: 'gpt-4',
      contextSize: 100,
      keepExistingApiKey: true,
    })).rejects.toMatchObject({
      code: AppErrorCode.AI_CONTEXT_SIZE_TOO_SMALL,
    });
  });

  it('testAiProviderSettings still reports a missing token when keepExistingApiKey is disabled', async () => {
    await aiConfigApi.updateAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
      contextSize: 32000,
    });

    await expect(aiConfigApi.testAiProviderSettings({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: '',
      modelName: 'gpt-4',
      contextSize: 32000,
      keepExistingApiKey: false,
    })).rejects.toMatchObject({
      code: AppErrorCode.AI_API_KEY_REQUIRED,
    });
  });

  describe('AI config export/import', () => {
    beforeEach(async () => {
      await aiConfigApi.updateAiProviderSettings({
        providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'sk-test-secret-key-12345',
        modelName: 'gpt-4',
        contextSize: 32000,
      });
    });

    it('exportAiConfig throws without config', async () => {
      await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
      await storage.secure.remove(SECURE_KEYS.aiApiKey);
      await expect(aiConfigApi.exportAiConfig('password')).rejects.toThrow('No AI config');
    });

    it('exportAiConfig throws with short password', async () => {
      await expect(aiConfigApi.exportAiConfig('ab')).rejects.toThrow('at least 4 characters');
    });

    it('exportAiConfig returns encrypted JSON string', async () => {
      const result = await aiConfigApi.exportAiConfig('testpassword');
      const parsed = JSON.parse(result) as { v: number; salt: string; iv: string; data: string };
      expect(parsed.v).toBe(1);
      expect(parsed.salt).toBeDefined();
      expect(parsed.iv).toBeDefined();
      expect(parsed.data).toBeDefined();
    });

    it('export and import round-trip works', async () => {
      const exported = await aiConfigApi.exportAiConfig('mypassword123');
      localStorage.clear();
      await storage.primary.settings.remove(APP_SETTING_KEYS.aiConfig);
      await storage.secure.remove(SECURE_KEYS.aiApiKey);
      resetDeviceKeyForTesting();

      const file = new File([exported], 'config.enc', { type: 'application/octet-stream' });
      await aiConfigApi.importAiConfig(file, 'mypassword123');

      const settings = await aiConfigApi.getAiProviderSettings();
      expect(settings.apiBaseUrl).toBe('http://localhost:5000');
      expect(settings.hasApiKey).toBe(true);
      expect(settings.maskedApiKey).toContain('sk-t');
      expect(settings.modelName).toBe('gpt-4');
      expect(settings.contextSize).toBe(32000);
      expect(settings.providerId).toBe(DEFAULT_ANALYSIS_PROVIDER_ID);
    });

    it('import fails with wrong password', async () => {
      const exported = await aiConfigApi.exportAiConfig('correctpassword');
      const file = new File([exported], 'config.enc', { type: 'application/octet-stream' });
      await expect(aiConfigApi.importAiConfig(file, 'wrongpassword')).rejects.toThrow('Decryption failed');
    });

    it('import fails with invalid file', async () => {
      const file = new File(['not json'], 'bad.enc', { type: 'application/octet-stream' });
      await expect(aiConfigApi.importAiConfig(file, 'password')).rejects.toThrow('Invalid config file');
    });

    it('import fails with invalid envelope structure', async () => {
      const file = new File([JSON.stringify({ v: 2, salt: 'x', iv: 'y', data: 'z' })], 'bad.enc', {
        type: 'application/octet-stream',
      });
      await expect(aiConfigApi.importAiConfig(file, 'password')).rejects.toThrow('Invalid config file structure');
    });

    it('import fails without password', async () => {
      const file = new File(['{}'], 'config.enc', { type: 'application/octet-stream' });
      await expect(aiConfigApi.importAiConfig(file, '')).rejects.toThrow('Password is required');
    });

    it('export produces different ciphertext each time', async () => {
      const first = await aiConfigApi.exportAiConfig('samepassword');
      const second = await aiConfigApi.exportAiConfig('samepassword');
      expect(first).not.toBe(second);
    });
  });
});
