import type { ChapterDetectionRule, DetectedChapter, SplitChapter } from './types';

function splitTextFixed(text: string, chunkSize: number): SplitChapter[] {
  if (!text) {
    return [];
  }

  const chunks: SplitChapter[] = [];
  let remaining = text;
  let chunkIndex = 1;

  while (remaining) {
    if (remaining.length <= chunkSize) {
      chunks.push({ title: `第${chunkIndex}部分`, content: remaining.trim() });
      break;
    }

    let cutPosition = chunkSize;
    let newlinePosition = remaining.lastIndexOf('\n\n', chunkSize);
    if (newlinePosition > chunkSize * 0.5) {
      cutPosition = newlinePosition + 2;
    } else {
      newlinePosition = remaining.lastIndexOf('\n', chunkSize);
      if (newlinePosition > chunkSize * 0.5) {
        cutPosition = newlinePosition + 1;
      }
    }

    chunks.push({ title: `第${chunkIndex}部分`, content: remaining.slice(0, cutPosition).trim() });
    remaining = remaining.slice(cutPosition);
    chunkIndex += 1;
  }

  return chunks;
}

export function detectChapters(
  text: string,
  rules: ChapterDetectionRule[],
): DetectedChapter[] {
  if (!text || !rules || rules.length === 0) {
    return [];
  }

  const lines = text.split('\n');
  const compiledRules: RegExp[] = [];
  for (const rule of rules) {
    if (!rule.rule) {
      continue;
    }
    try {
      compiledRules.push(new RegExp(rule.rule, 'm'));
    } catch {
      continue;
    }
  }

  if (compiledRules.length === 0) {
    return [];
  }

  const chapterPositions: Array<[number, string]> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const stripped = lines[index].trim();
    if (!stripped) {
      continue;
    }

    for (const pattern of compiledRules) {
      if (pattern.test(lines[index])) {
        chapterPositions.push([index, stripped]);
        break;
      }
    }
  }

  if (chapterPositions.length === 0) {
    return [];
  }

  const chapters: DetectedChapter[] = [];

  if (chapterPositions[0][0] > 0) {
    const prefaceText = lines.slice(0, chapterPositions[0][0]).join('\n').trim();
    if (prefaceText) {
      chapters.push({
        title: '前言',
        start: 0,
        end: chapterPositions[0][0],
      });
    }
  }

  for (let index = 0; index < chapterPositions.length; index += 1) {
    const [lineIndex, title] = chapterPositions[index];
    const end = index + 1 < chapterPositions.length ? chapterPositions[index + 1][0] : lines.length;
    chapters.push({ title, start: lineIndex, end });
  }

  return chapters;
}

export function splitByChapters(
  text: string,
  chapters: DetectedChapter[],
  maxChunkSize: number = 50000,
): SplitChapter[] {
  const lines = text.split('\n');

  if (!chapters || chapters.length === 0) {
    return splitTextFixed(text, maxChunkSize);
  }

  const result: SplitChapter[] = [];
  for (const chapter of chapters) {
    const content = lines.slice(chapter.start, chapter.end).join('\n').trim();
    if (content.length <= maxChunkSize) {
      result.push({ title: chapter.title, content });
      continue;
    }

    const subChunks = splitTextFixed(content, maxChunkSize);
    for (let index = 0; index < subChunks.length; index += 1) {
      const suffix = subChunks.length > 1 ? ` (${index + 1})` : '';
      result.push({
        title: `${chapter.title}${suffix}`,
        content: subChunks[index].content,
      });
    }
  }

  return result;
}
