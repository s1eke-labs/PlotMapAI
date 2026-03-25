import type { WorkerTaskOptions } from '@infra/workers';
import type { ParsedBook } from '../bookParser';
import type { BookImportProgress } from '../progress';
import { runParseEpubTask } from '../../workers/epubClient';

export { parseEpubCore } from './core';

export function parseEpub(
  file: File,
  options: WorkerTaskOptions<BookImportProgress> = {},
): Promise<ParsedBook> {
  return runParseEpubTask(file, options);
}
