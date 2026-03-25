import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import type { ParsedBook } from '../services/bookParser';
import type { BookImportProgress } from '../services/progress';
import { parseEpubCore } from '../services/epub/core';

const runParseEpubWorkerTask = createWorkerTaskRunner<File, ParsedBook, BookImportProgress>({
  createWorker: () => new Worker(new URL('./epub.worker.ts', import.meta.url), { type: 'module' }),
  task: 'parse-epub',
  fallback: (file, options) => parseEpubCore(file, options),
});

export function runParseEpubTask(
  file: File,
  options: WorkerTaskOptions<BookImportProgress> = {},
): Promise<ParsedBook> {
  return runParseEpubWorkerTask(file, options);
}
