export interface WorkerTaskRunMessage<Payload> {
  kind: 'run';
  requestId: string;
  task: string;
  payload: Payload;
}

export interface WorkerTaskCancelMessage {
  kind: 'cancel';
  requestId: string;
}

export type WorkerTaskMessage<Payload> =
  | WorkerTaskRunMessage<Payload>
  | WorkerTaskCancelMessage;

export interface WorkerTaskProgressMessage<Progress> {
  kind: 'progress';
  requestId: string;
  progress: Progress;
}

export interface WorkerTaskResultMessage<Result> {
  kind: 'result';
  requestId: string;
  result: Result;
}

export interface WorkerTaskErrorMessage {
  kind: 'error';
  requestId: string;
  error: {
    message: string;
    name?: string;
  };
}

export interface WorkerTaskCancelledMessage {
  kind: 'cancelled';
  requestId: string;
}

export type WorkerTaskResponse<Progress, Result> =
  | WorkerTaskProgressMessage<Progress>
  | WorkerTaskResultMessage<Result>
  | WorkerTaskErrorMessage
  | WorkerTaskCancelledMessage;
