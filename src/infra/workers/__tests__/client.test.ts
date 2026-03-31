import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerTaskRunner } from '../client';

interface TestProgress {
  progress: number;
}

class FakeWorker {
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  messages: unknown[] = [];

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: { kind: string; requestId: string; task?: string }) {
    this.messages.push(message);
    if (message.kind === 'run') {
      queueMicrotask(() => {
        this.emit('message', new MessageEvent('message', {
          data: {
            kind: 'progress',
            requestId: message.requestId,
            progress: { progress: 55 },
          },
        }));
        this.emit('message', new MessageEvent('message', {
          data: {
            kind: 'result',
            requestId: message.requestId,
            result: 'done',
          },
        }));
      });
    }
  }

  terminate() {
    this.listeners.clear();
  }

  emit(type: string, event: MessageEvent) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

const originalWorker = globalThis.Worker;

describe('createWorkerTaskRunner', () => {
  afterEach(() => {
    globalThis.Worker = originalWorker;
    vi.restoreAllMocks();
  });

  it('falls back to the sync runner when Worker is unavailable', async () => {
    // @ts-expect-error test override
    globalThis.Worker = undefined;
    const fallback = vi.fn().mockResolvedValue('fallback');
    const createWorker = vi.fn();
    const runTask = createWorkerTaskRunner<string, string, TestProgress>({
      createWorker,
      task: 'test-task',
      fallback,
    });

    await expect(runTask('payload')).resolves.toBe('fallback');
    expect(fallback).toHaveBeenCalledWith('payload', {});
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('streams progress updates and resolves worker results', async () => {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const worker = new FakeWorker();
    const onProgress = vi.fn();
    const runTask = createWorkerTaskRunner<string, string, TestProgress>({
      createWorker: () => worker as unknown as Worker,
      task: 'test-task',
      fallback: vi.fn(),
    });

    await expect(runTask('payload', { onProgress })).resolves.toBe('done');
    expect(onProgress).toHaveBeenCalledWith({ progress: 55 });
    expect(worker.messages).toHaveLength(1);
  });

  it('sends cancel messages and rejects with AbortError when aborted', async () => {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const worker = new FakeWorker();
    const controller = new AbortController();
    const runTask = createWorkerTaskRunner<string, string, TestProgress>({
      createWorker: () => worker as unknown as Worker,
      task: 'test-task',
      fallback: vi.fn(),
    });

    const promise = runTask('payload', { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.messages).toEqual([
      expect.objectContaining({ kind: 'run', task: 'test-task' }),
      expect.objectContaining({ kind: 'cancel' }),
    ]);
  });
});
