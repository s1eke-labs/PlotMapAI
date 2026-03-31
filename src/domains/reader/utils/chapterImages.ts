import type { ChapterTextSegment } from '@shared/text-processing/chapterBlocks';

import { parseParagraphSegments } from '@shared/text-processing/chapterBlocks';

const IMG_PATTERN = /\[IMG:([^\]]+)\]/g;

export type { ChapterTextSegment };
export { parseParagraphSegments };

export function extractImageKeysFromText(text: string): string[] {
  const imageKeys = new Set<string>();

  IMG_PATTERN.lastIndex = 0;
  let match = IMG_PATTERN.exec(text);
  while (match !== null) {
    imageKeys.add(match[1]);
    match = IMG_PATTERN.exec(text);
  }

  return Array.from(imageKeys);
}
