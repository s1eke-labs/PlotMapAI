import { resolveAnalysisProviderAdapter } from '../providers';
import type { RuntimeAnalysisConfig } from './types';
import { cleanText } from './text';

export async function testAiProviderConnection(
  config: RuntimeAnalysisConfig,
): Promise<{ message: string; preview: string }> {
  const content = await resolveAnalysisProviderAdapter(config.providerId)
    .testConnection(config.providerConfig);
  return {
    message: 'AI 接口连接测试成功。',
    preview: cleanText(content, 80) || '连接成功',
  };
}
