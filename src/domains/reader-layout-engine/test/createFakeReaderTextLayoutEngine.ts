import type {
  ReaderMeasuredLine,
  ReaderTextLayoutEngine,
} from '../utils/readerLayout';

interface CreateFakeReaderTextLayoutEngineOptions {
  maxCharsPerLine?: number;
}

export function createFakeReaderTextLayoutEngine(
  options: CreateFakeReaderTextLayoutEngineOptions = {},
): ReaderTextLayoutEngine {
  return {
    layoutLines({ fontSizePx, maxWidth, text }) {
      if (maxWidth <= 0 || !text) {
        return [];
      }

      const maxCharsPerLine = options.maxCharsPerLine
        ?? Math.max(1, Math.floor(maxWidth / Math.max(fontSizePx * 0.55, 1)));
      const lines: ReaderMeasuredLine[] = [];
      let cursor = 0;

      while (cursor < text.length) {
        const nextCursor = Math.min(cursor + maxCharsPerLine, text.length);
        const chunk = text.slice(cursor, nextCursor);
        lines.push({
          end: {
            graphemeIndex: nextCursor,
            segmentIndex: 0,
          },
          lineIndex: lines.length,
          start: {
            graphemeIndex: cursor,
            segmentIndex: 0,
          },
          text: chunk,
          width: Math.min(maxWidth, chunk.length * fontSizePx),
        });
        cursor = nextCursor;
      }

      return lines;
    },
  };
}
