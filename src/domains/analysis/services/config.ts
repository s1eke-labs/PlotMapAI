import { MIN_CONTEXT_SIZE } from './constants';
import { AnalysisConfigError } from './errors';
import type { RuntimeAnalysisConfig } from './types';
import {
  DEFAULT_ANALYSIS_PROVIDER_ID,
  isAnalysisProviderId,
} from '../providers';
import { cleanText, coerceContextSize } from './text';

export interface RuntimeAnalysisConfigInput {
  providerId?: unknown;
  apiBaseUrl?: unknown;
  apiKey?: unknown;
  modelName?: unknown;
  contextSize?: unknown;
  providerConfig?: unknown;
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`;
}

export function normalizeBaseUrl(value: unknown): string {
  const url = cleanText(value, 512);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    throw new AnalysisConfigError('AI 接口地址必须以 http:// 或 https:// 开头。');
  }
  return url.replace(/\/+$/, '');
}

export function validateAnalysisConfig(config: RuntimeAnalysisConfig): void {
  if (!config) throw new AnalysisConfigError('请先在设置中完成 AI 接口配置。');
  if (!isAnalysisProviderId(config.providerId)) {
    throw new AnalysisConfigError('不支持的 AI Provider。');
  }

  if (!cleanText(config.providerConfig.apiBaseUrl)) throw new AnalysisConfigError('AI 接口地址不能为空。');
  if (!cleanText(config.providerConfig.apiKey)) throw new AnalysisConfigError('AI Token 未配置，请先在设置中保存。');
  if (!cleanText(config.providerConfig.modelName)) throw new AnalysisConfigError('AI 模型名称不能为空。');
  if (coerceContextSize(config.contextSize, MIN_CONTEXT_SIZE) < MIN_CONTEXT_SIZE) {
    throw new AnalysisConfigError(`上下文大小不能小于 ${MIN_CONTEXT_SIZE}。`);
  }
}

function resolveProviderId(value: unknown): typeof DEFAULT_ANALYSIS_PROVIDER_ID {
  if (value == null || value === '') {
    return DEFAULT_ANALYSIS_PROVIDER_ID;
  }

  if (!isAnalysisProviderId(value)) {
    throw new AnalysisConfigError('不支持的 AI Provider。');
  }

  return value;
}

function getProviderField(
  input: RuntimeAnalysisConfigInput,
  field: 'apiBaseUrl' | 'apiKey' | 'modelName',
): unknown {
  const nested = input.providerConfig;
  if (typeof nested === 'object' && nested !== null && field in nested) {
    return (nested as Record<string, unknown>)[field];
  }
  return input[field];
}

export function buildRuntimeAnalysisConfig(input: RuntimeAnalysisConfigInput | null | undefined): RuntimeAnalysisConfig {
  if (!input) throw new AnalysisConfigError('请先在设置中完成 AI 接口配置。');
  const config: RuntimeAnalysisConfig = {
    providerId: resolveProviderId(input.providerId),
    contextSize: Number(input.contextSize) || 0,
    providerConfig: {
      apiBaseUrl: normalizeBaseUrl(getProviderField(input, 'apiBaseUrl')),
      apiKey: cleanText(getProviderField(input, 'apiKey')),
      modelName: cleanText(getProviderField(input, 'modelName')),
    },
  };
  validateAnalysisConfig(config);
  return config;
}
