import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import { parseTxtDocument } from './txt';
import { purifyChapter, purifyChapters, purifyTitles } from './purify';
import type {
  ParseTxtPayload,
  PurifyChapterPayload,
  PurifyChaptersPayload,
  PurifyTitlesPayload,
  TextProcessingProgress,
} from './workerTypes';
import type { ParsedTextDocument, PurifiedChapter, PurifiedTitle } from './types';

const runParseTxtWorkerTask = createWorkerTaskRunner<ParseTxtPayload, ParsedTextDocument, TextProcessingProgress>({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  task: 'parse-txt',
  fallback: ({ file, tocRules }, options) => parseTxtDocument(file, tocRules, options),
});

const runPurifyTitlesWorkerTask = createWorkerTaskRunner<PurifyTitlesPayload, PurifiedTitle[], TextProcessingProgress>({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  task: 'purify-titles',
  fallback: ({ titles, rules, bookTitle }) => purifyTitles(titles, rules, bookTitle),
});

const runPurifyChapterWorkerTask = createWorkerTaskRunner<PurifyChapterPayload, PurifiedChapter, TextProcessingProgress>({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  task: 'purify-chapter',
  fallback: ({ chapter, rules, bookTitle }) => purifyChapter(chapter, rules, bookTitle),
});

const runPurifyChaptersWorkerTask = createWorkerTaskRunner<PurifyChaptersPayload, PurifiedChapter[], TextProcessingProgress>({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  task: 'purify-chapters',
  fallback: ({ chapters, rules, bookTitle }) => purifyChapters(chapters, rules, bookTitle),
});

export function runParseTxtTask(
  payload: ParseTxtPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<ParsedTextDocument> {
  return runParseTxtWorkerTask(payload, options);
}

export function runPurifyTitlesTask(
  payload: PurifyTitlesPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<PurifiedTitle[]> {
  return runPurifyTitlesWorkerTask(payload, options);
}

export function runPurifyChapterTask(
  payload: PurifyChapterPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<PurifiedChapter> {
  return runPurifyChapterWorkerTask(payload, options);
}

export function runPurifyChaptersTask(
  payload: PurifyChaptersPayload,
  options: WorkerTaskOptions<TextProcessingProgress> = {},
): Promise<PurifiedChapter[]> {
  return runPurifyChaptersWorkerTask(payload, options);
}
