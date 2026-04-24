import type { RichBlock } from '@shared/contracts';
import type { ChapterContent } from '@shared/contracts/reader';

export interface ReaderTextQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
}

const CONTENT_HASH_SEPARATOR = '\u0000';
const TEXT_QUOTE_EXACT_LENGTH = 96;
const TEXT_QUOTE_CONTEXT_LENGTH = 64;

export function normalizeReaderAnchorText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function createStableHash(source: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  const uint32Mod = 0x1_0000_0000;

  const normalizeUint32 = (nextValue: number): number => {
    const normalized = nextValue % uint32Mod;
    return normalized >= 0 ? normalized : normalized + uint32Mod;
  };

  for (let index = 0; index < source.length; index += 1) {
    const valueCode = source.charCodeAt(index);
    hashA = normalizeUint32(Math.imul(hashA, 0x01000193) + valueCode);
    hashB = normalizeUint32(Math.imul(hashB, 0x27d4eb2d) + valueCode);
  }

  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

export function createReaderTextHash(value: string): string {
  return createStableHash(normalizeReaderAnchorText(value));
}

export function createReaderChapterContentHash(
  chapter: Pick<
    ChapterContent,
    'contentFormat' | 'contentVersion' | 'index' | 'plainText' | 'richBlocks' | 'title'
  >,
): string {
  return createStableHash([
    chapter.index,
    chapter.title,
    chapter.plainText,
    chapter.contentFormat,
    chapter.contentVersion,
    JSON.stringify(chapter.richBlocks),
  ].join(CONTENT_HASH_SEPARATOR));
}

export function createTxtChapterKey(params: {
  chapterIndex: number;
  content: string;
  title: string;
}): string {
  const contentPrefix = normalizeReaderAnchorText(params.content).slice(0, 256);
  return [
    'txt',
    params.chapterIndex,
    createReaderTextHash(params.title),
    createReaderTextHash(contentPrefix),
  ].join(':');
}

export function createEpubChapterKey(params: {
  chapterIndex: number;
  hrefBase: string;
  manifestId?: string;
}): string {
  const stableId = params.manifestId || String(params.chapterIndex);
  return `epub:${stableId}:${params.hrefBase}`;
}

export function createReaderBlockKey(params: {
  anchorId?: string;
  imageKey?: string;
  kind: 'heading' | 'text' | 'image' | 'blank';
  paragraphIndex: number;
  sourceBlockType?: RichBlock['type'];
  text?: string;
}): string | undefined {
  if (params.anchorId) {
    return `anchor:${params.anchorId}`;
  }

  if (params.imageKey) {
    return `image:${params.imageKey}`;
  }

  const normalizedText = normalizeReaderAnchorText(params.text ?? '');
  if (params.kind === 'heading') {
    return `heading:${createReaderTextHash(normalizedText)}`;
  }

  if (params.kind === 'text') {
    return `text:${params.paragraphIndex}:${createReaderTextHash(normalizedText)}`;
  }

  if (params.sourceBlockType) {
    return `${params.sourceBlockType}:${params.paragraphIndex}:${createReaderTextHash(normalizedText)}`;
  }

  return undefined;
}

export function createReaderTextQuote(
  text: string | undefined,
  startOffset = 0,
): ReaderTextQuote | undefined {
  const normalized = normalizeReaderAnchorText(text ?? '');
  if (!normalized) {
    return undefined;
  }

  const safeStart = Math.max(0, Math.min(startOffset, normalized.length - 1));
  const exact = normalized.slice(safeStart, safeStart + TEXT_QUOTE_EXACT_LENGTH)
    || normalized.slice(0, TEXT_QUOTE_EXACT_LENGTH);
  if (!exact) {
    return undefined;
  }

  return {
    exact,
    prefix: safeStart > 0
      ? normalized.slice(Math.max(0, safeStart - TEXT_QUOTE_CONTEXT_LENGTH), safeStart)
      : undefined,
    suffix: safeStart + exact.length < normalized.length
      ? normalized.slice(
        safeStart + exact.length,
        safeStart + exact.length + TEXT_QUOTE_CONTEXT_LENGTH,
      )
      : undefined,
  };
}

export function scoreReaderTextQuoteMatch(params: {
  candidateText: string | undefined;
  quote: ReaderTextQuote | undefined;
}): number | null {
  const { quote } = params;
  if (!quote?.exact) {
    return null;
  }

  const text = normalizeReaderAnchorText(params.candidateText ?? '');
  const exactIndex = text.indexOf(normalizeReaderAnchorText(quote.exact));
  if (exactIndex < 0) {
    return null;
  }

  let score = 10;
  if (quote.prefix) {
    const prefix = normalizeReaderAnchorText(quote.prefix);
    if (prefix && text.slice(0, exactIndex).endsWith(prefix)) {
      score += 5;
    }
  }
  if (quote.suffix) {
    const suffix = normalizeReaderAnchorText(quote.suffix);
    const suffixStart = exactIndex + normalizeReaderAnchorText(quote.exact).length;
    if (suffix && text.slice(suffixStart).startsWith(suffix)) {
      score += 5;
    }
  }

  return score;
}
