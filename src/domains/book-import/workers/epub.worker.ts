import { registerWorkerTaskHandlers } from '@infra/workers';
import { parseEpubCore } from '../services/epub/core';

registerWorkerTaskHandlers({
  'parse-epub': async (file, emitProgress, signal) => {
    return parseEpubCore(file as File, {
      signal,
      onProgress: emitProgress,
    });
  },
});
