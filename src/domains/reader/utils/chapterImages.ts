const IMG_PATTERN = /\[IMG:([^\]]+)\]/g;

export interface ChapterTextSegment {
  type: 'text' | 'image';
  value: string;
}

export function parseParagraphSegments(text: string): ChapterTextSegment[] {
  const segments: ChapterTextSegment[] = [];
  let lastIndex = 0;

  IMG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    segments.push({ type: 'image', value: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

export function extractImageKeysFromText(text: string): string[] {
  const imageKeys = new Set<string>();

  IMG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_PATTERN.exec(text)) !== null) {
    imageKeys.add(match[1]);
  }

  return Array.from(imageKeys);
}
