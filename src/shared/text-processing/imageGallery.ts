export interface ChapterImageGalleryEntry {
  blockIndex: number;
  chapterIndex: number;
  imageKey: string;
  order: number;
}

interface ChapterImageGallerySource {
  content: string;
  index: number;
  title: string;
}

interface ChapterTextSegment {
  type: 'image' | 'text';
  value: string;
}

const IMAGE_PATTERN = /\[IMG:([^\]]+)\]/g;

function parseParagraphSegments(text: string): ChapterTextSegment[] {
  const segments: ChapterTextSegment[] = [];
  let lastIndex = 0;

  IMAGE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMAGE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'image',
      value: match[1],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(lastIndex),
    });
  }

  return segments.length > 0
    ? segments
    : [{ type: 'text', value: text }];
}

export function buildChapterImageGalleryEntries(chapter: ChapterImageGallerySource): ChapterImageGalleryEntry[] {
  const lines = chapter.content.split('\n');
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  const skipLineIndex = firstNonEmptyIndex !== -1 && lines[firstNonEmptyIndex].trim() === chapter.title.trim()
    ? firstNonEmptyIndex
    : -1;

  let nextBlockIndex = 1;
  let nextOrder = 0;
  const entries: ChapterImageGalleryEntry[] = [];

  const hasLaterNonEmptyLine = (startIndex: number): boolean => {
    for (let index = startIndex; index < lines.length; index += 1) {
      if (index === skipLineIndex) {
        continue;
      }
      if (lines[index]?.trim()) {
        return true;
      }
    }

    return false;
  };

  lines.forEach((line, paragraphIndex) => {
    if (paragraphIndex === skipLineIndex) {
      return;
    }

    if (!line.trim()) {
      const previousLine = paragraphIndex > 0 ? lines[paragraphIndex - 1] : '';
      if (!previousLine?.trim() || !hasLaterNonEmptyLine(paragraphIndex + 1)) {
        return;
      }

      nextBlockIndex += 1;
      return;
    }

    const segments = parseParagraphSegments(line)
      .filter((segment) => segment.type === 'image' || segment.value.trim().length > 0);
    if (segments.length === 0) {
      return;
    }

    segments.forEach((segment) => {
      if (segment.type === 'image') {
        entries.push({
          blockIndex: nextBlockIndex,
          chapterIndex: chapter.index,
          imageKey: segment.value,
          order: nextOrder,
        });
        nextOrder += 1;
      }

      nextBlockIndex += 1;
    });
  });

  return entries;
}

export function sortChapterImageGalleryEntries(
  entries: ChapterImageGalleryEntry[],
): ChapterImageGalleryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.chapterIndex !== right.chapterIndex) {
      return left.chapterIndex - right.chapterIndex;
    }

    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.blockIndex - right.blockIndex;
  });
}
