import { detectChapters, splitByChapters } from './chapterDetection';
import { detectAndConvert } from './encoding';
import { computeHash } from './hash';
import type { ChapterDetectionRule, ParsedTextDocument } from './types';

export interface TxtParseProgress {
  progress: number;
  stage: 'hashing' | 'decoding' | 'chapters' | 'finalizing';
}

function emitProgress(
  onProgress: ((progress: TxtParseProgress) => void) | undefined,
  progress: TxtParseProgress,
): void {
  onProgress?.(progress);
}

export async function parseTxtDocument(
  file: File,
  tocRules: ChapterDetectionRule[],
  options: {
    onProgress?: (progress: TxtParseProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ParsedTextDocument> {
  const { onProgress, signal } = options;
  signal?.throwIfAborted?.();

  emitProgress(onProgress, { progress: 8, stage: 'hashing' });
  const rawBytes = await file.arrayBuffer();
  const fileHashPromise = computeHash(rawBytes);

  signal?.throwIfAborted?.();
  emitProgress(onProgress, { progress: 30, stage: 'decoding' });
  const { text: rawText, encoding } = detectAndConvert(rawBytes);

  signal?.throwIfAborted?.();
  emitProgress(onProgress, { progress: 60, stage: 'chapters' });
  const chaptersInfo = detectChapters(rawText, tocRules);
  const chapters = splitByChapters(rawText, chaptersInfo);
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.content.length, 0);

  signal?.throwIfAborted?.();
  emitProgress(onProgress, { progress: 90, stage: 'finalizing' });
  let title = file.name;
  if (title.toLowerCase().endsWith('.txt')) {
    title = title.slice(0, -4);
  }

  const fileHash = await fileHashPromise;

  emitProgress(onProgress, { progress: 100, stage: 'finalizing' });
  return {
    title,
    chapters,
    encoding,
    fileHash,
    rawText,
    totalWords,
  };
}
