import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testAiProviderConnection } from '../connection';
import type { RuntimeAnalysisConfig } from '../types';

const mockTestConnection = vi.fn();

vi.mock('../../providers', () => ({
  resolveAnalysisProviderAdapter: vi.fn(() => ({
    generateText: vi.fn(),
    testConnection: mockTestConnection,
  })),
}));

const CONFIG: RuntimeAnalysisConfig = {
  providerId: 'openai-compatible',
  contextSize: 32000,
  providerConfig: {
    apiBaseUrl: 'http://localhost:5000',
    apiKey: 'token',
    modelName: 'gpt-test',
  },
};

describe('testAiProviderConnection', () => {
  beforeEach(() => {
    mockTestConnection.mockReset();
  });

  it('delegates connection tests to the resolved provider adapter', async () => {
    mockTestConnection.mockResolvedValue(' 连接成功 ');

    await expect(testAiProviderConnection(CONFIG)).resolves.toEqual({
      message: 'AI 接口连接测试成功。',
      preview: '连接成功',
    });

    expect(mockTestConnection).toHaveBeenCalledWith(CONFIG.providerConfig);
  });
});
