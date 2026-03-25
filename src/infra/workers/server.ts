import type { WorkerTaskMessage, WorkerTaskResponse } from './protocol';

export type WorkerTaskHandler<Payload, Result, Progress> = (
  payload: Payload,
  emitProgress: (progress: Progress) => void,
  signal: AbortSignal,
) => Promise<Result> | Result;

type WorkerTaskHandlers = Record<string, WorkerTaskHandler<unknown, unknown, unknown>>;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function registerWorkerTaskHandlers(handlers: WorkerTaskHandlers): void {
  const workerContext = self as {
    onmessage: ((event: MessageEvent<WorkerTaskMessage<unknown>>) => void) | null;
    postMessage: (message: WorkerTaskResponse<unknown, unknown>) => void;
  };
  const controllers = new Map<string, AbortController>();

  workerContext.onmessage = (event: MessageEvent<WorkerTaskMessage<unknown>>) => {
    const message = event.data;
    if (message.kind === 'cancel') {
      controllers.get(message.requestId)?.abort();
      return;
    }

    const handler = handlers[message.task];
    if (!handler) {
      workerContext.postMessage({
        kind: 'error',
        requestId: message.requestId,
        error: {
          message: `Unknown worker task: ${message.task}`,
          name: 'WorkerTaskError',
        },
      } satisfies WorkerTaskResponse<unknown, unknown>);
      return;
    }

    const controller = new AbortController();
    controllers.set(message.requestId, controller);

    const emitProgress = (progress: unknown) => {
      if (controller.signal.aborted) {
        return;
      }
      workerContext.postMessage({
        kind: 'progress',
        requestId: message.requestId,
        progress,
      } satisfies WorkerTaskResponse<unknown, unknown>);
    };

    Promise.resolve(handler(message.payload, emitProgress, controller.signal))
      .then((result) => {
        controllers.delete(message.requestId);
        if (controller.signal.aborted) {
          workerContext.postMessage({
            kind: 'cancelled',
            requestId: message.requestId,
          } satisfies WorkerTaskResponse<unknown, unknown>);
          return;
        }
        workerContext.postMessage({
          kind: 'result',
          requestId: message.requestId,
          result,
        } satisfies WorkerTaskResponse<unknown, unknown>);
      })
      .catch((error: unknown) => {
        controllers.delete(message.requestId);
        if (controller.signal.aborted || isAbortError(error)) {
          workerContext.postMessage({
            kind: 'cancelled',
            requestId: message.requestId,
          } satisfies WorkerTaskResponse<unknown, unknown>);
          return;
        }
        const normalized = error instanceof Error ? error : new Error(String(error));
        workerContext.postMessage({
          kind: 'error',
          requestId: message.requestId,
          error: {
            message: normalized.message,
            name: normalized.name,
          },
        } satisfies WorkerTaskResponse<unknown, unknown>);
      });
  };
}
