import { registerWorkerTaskHandlers } from '@infra/workers';
import { parseTxtDocument } from './txt';
import { purifyChapter, purifyTitles } from './purify';
import type { TextProcessingProgress } from './workerTypes';
import type {
  ParseTxtPayload,
  PurifyChapterPayload,
  PurifyChaptersPayload,
  PurifyTitlesPayload,
} from './workerTypes';

registerWorkerTaskHandlers({
  'parse-txt': async (payload, emitProgress, signal) => {
    const request = payload as ParseTxtPayload;
    return parseTxtDocument(
      request.file,
      request.tocRules,
      {
        signal,
        onProgress: (progress) => emitProgress(progress as TextProcessingProgress),
      },
    );
  },
  'purify-titles': async (payload, emitProgress, signal) => {
    const request = payload as PurifyTitlesPayload;
    signal.throwIfAborted();
    emitProgress({ progress: 25, stage: 'preparing' });
    const result = purifyTitles(request.titles, request.rules, request.bookTitle);
    signal.throwIfAborted();
    emitProgress({ progress: 100, stage: 'finalizing' });
    return result;
  },
  'purify-chapter': async (payload, emitProgress, signal) => {
    const request = payload as PurifyChapterPayload;
    signal.throwIfAborted();
    emitProgress({ progress: 20, stage: 'preparing' });
    const result = purifyChapter(request.chapter, request.rules, request.bookTitle);
    signal.throwIfAborted();
    emitProgress({ progress: 100, stage: 'finalizing' });
    return result;
  },
  'purify-chapters': async (payload, emitProgress, signal) => {
    const request = payload as PurifyChaptersPayload;
    signal.throwIfAborted();
    const total = Math.max(request.chapters.length, 1);
    const result = request.chapters.map((chapter, index) => {
      if (index === 0 || index === request.chapters.length - 1 || index % 10 === 0) {
        emitProgress({
          progress: Math.round((index / total) * 100),
          stage: 'purifying',
        });
      }
      return purifyChapter(chapter, request.rules, request.bookTitle);
    });
    signal.throwIfAborted();
    emitProgress({ progress: 100, stage: 'finalizing' });
    return result;
  },
});
