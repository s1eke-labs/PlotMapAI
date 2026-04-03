import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('debug', () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.PlotMapAIDebug;
  });

  it('isDebugMode returns false when VITE_DEBUG is not set', async () => {
    vi.stubEnv('VITE_DEBUG', '');
    const mod = await import('@shared/debug');
    expect(mod.isDebugMode()).toBe(false);
  });

  it('isDebugMode returns true when VITE_DEBUG is "true"', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('@shared/debug');
    expect(mod.isDebugMode()).toBe(true);
  });

  it('debugLog is a no-op when not in debug mode', async () => {
    vi.stubEnv('VITE_DEBUG', '');
    const mod = await import('@shared/debug');
    mod.clearLogs();
    mod.debugLog('Test', 'should not log');
    expect(mod.getRecentLogs()).toHaveLength(0);
  });

  it('debugLog adds entries and notifies listeners when in debug mode', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('@shared/debug');
    mod.clearLogs();

    const listener = vi.fn();
    const unsub = mod.debugSubscribe(listener);

    mod.debugLog('TestCategory', 'hello', 'world');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      category: 'TestCategory',
      message: 'hello world',
    });

    const logs = mod.getRecentLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].category).toBe('TestCategory');

    unsub();
    mod.debugLog('TestCategory', 'after unsub');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clearLogs removes all entries', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('@shared/debug');
    mod.clearLogs();
    mod.debugLog('A', '1');
    mod.debugLog('B', '2');
    expect(mod.getRecentLogs().length).toBe(2);
    mod.clearLogs();
    expect(mod.getRecentLogs().length).toBe(0);
  });

  it('MAX_LOGS is exported and is a positive number', async () => {
    vi.stubEnv('VITE_DEBUG', '');
    const mod = await import('@shared/debug');
    expect(mod.MAX_LOGS).toBeGreaterThan(0);
  });

  it('debug feature flags default to disabled', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('@shared/debug');
    expect(mod.getDebugFeatureFlags()).toEqual({
      readerTelemetry: false,
    });
    expect(mod.isDebugFeatureEnabled('readerTelemetry')).toBe(false);
  });

  it('setDebugFeatureEnabled updates feature flags and notifies subscribers', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('@shared/debug');
    const listener = vi.fn();
    const unsubscribe = mod.debugFeatureSubscribe(listener);

    mod.setDebugFeatureEnabled('readerTelemetry', true);

    expect(mod.isDebugFeatureEnabled('readerTelemetry')).toBe(true);
    expect(listener).toHaveBeenCalledWith({
      readerTelemetry: true,
    });

    unsubscribe();
    mod.setDebugFeatureEnabled('readerTelemetry', false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('registerPwaDebugTools exposes window debug methods in debug mode', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('../pwaDebugTools');
    const cleanup = mod.registerPwaDebugTools();

    expect(window.PlotMapAIDebug).toBeDefined();
    expect(typeof window.PlotMapAIDebug?.showInstallPrompt).toBe('function');
    expect(typeof window.PlotMapAIDebug?.showUpdateToast).toBe('function');

    cleanup();

    expect(window.PlotMapAIDebug).toBeUndefined();
  });
});
