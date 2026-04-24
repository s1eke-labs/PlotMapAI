import type { PreparedTextWithSegments } from '@chenglou/pretext';
import type { RichInline } from '@shared/contracts';
import type { ReaderMeasuredLine, ReaderTypographyMetrics } from '../layout/readerLayoutTypes';
import type { ReaderTextPrepareOptions } from '../layout/readerTextPolicy';

import {
  layoutWithLines,
  prepareWithSegments,
} from '@chenglou/pretext';

import { getApproximateMaxCharsPerLine } from '../layout/readerLayoutShared';
import {
  DEFAULT_READER_TEXT_PREPARE_OPTIONS,
  normalizeReaderTextPrepareOptions,
  serializeReaderTextPrepareOptions,
  toPretextPrepareOptions,
} from '../layout/readerTextPolicy';
import {
  getRichTextLayoutCacheSizeForTests,
  layoutRichTextWithPretext,
  resetRichTextLayoutCacheForTests,
} from '../typography/richTextLayout';
import {
  createReaderContentMeasuredTokenValues,
  READER_CONTENT_MEASURED_TOKEN_NAMES,
} from '@shared/reader-rendering';

const MAX_PRETEXT_CACHE_SIZE = 256;
const PRETEXT_CACHE = new Map<string, PreparedTextWithSegments | null>();

interface PreparedTextBlock {
  font: string;
  prepared: PreparedTextWithSegments | null;
  prepareOptions: ReaderTextPrepareOptions;
  text: string;
}

let browserTextMeasureRoot: HTMLDivElement | null = null;

export interface ReaderRichTextLayoutResult {
  lines: ReaderMeasuredLine[];
  richLineFragments: RichInline[][];
}

export interface ReaderTextLayoutEngine {
  layoutLines: (params: {
    font: string;
    fontSizePx: number;
    lineHeightPx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
    text: string;
  }) => ReaderMeasuredLine[];
  layoutRichLines?: (params: {
    font: string;
    fontSizePx: number;
    inlines: RichInline[];
    lineHeightPx: number;
    maxWidth: number;
    prepareOptions?: ReaderTextPrepareOptions;
  }) => ReaderRichTextLayoutResult | null;
}

export type {
  ReaderTextPrepareOptions,
  ReaderTextWhiteSpace,
  ReaderTextWordBreak,
} from '../layout/readerTextPolicy';

function getPreparedTextFromCache(key: string): PreparedTextWithSegments | null | undefined {
  const prepared = PRETEXT_CACHE.get(key);
  if (prepared === undefined) {
    return undefined;
  }

  PRETEXT_CACHE.delete(key);
  PRETEXT_CACHE.set(key, prepared);
  return prepared;
}

function setPreparedTextInCache(key: string, prepared: PreparedTextWithSegments | null): void {
  if (PRETEXT_CACHE.has(key)) {
    PRETEXT_CACHE.delete(key);
  }

  PRETEXT_CACHE.set(key, prepared);
  while (PRETEXT_CACHE.size > MAX_PRETEXT_CACHE_SIZE) {
    const oldestKey = PRETEXT_CACHE.keys().next().value;
    if (!oldestKey) {
      return;
    }
    PRETEXT_CACHE.delete(oldestKey);
  }
}

function createPreparedTextBlock(
  text: string,
  font: string,
  prepareOptions?: ReaderTextPrepareOptions,
): PreparedTextBlock {
  const normalizedOptions = normalizeReaderTextPrepareOptions(prepareOptions);
  const key = `${font}\u0000${serializeReaderTextPrepareOptions(normalizedOptions)}\u0000${text}`;
  let prepared = getPreparedTextFromCache(key);
  if (prepared === undefined) {
    prepared = prepareText(text, font, normalizedOptions);
    setPreparedTextInCache(key, prepared);
  }

  return {
    font,
    prepared,
    prepareOptions: normalizedOptions,
    text,
  };
}

function prepareText(
  text: string,
  font: string,
  prepareOptions: ReaderTextPrepareOptions,
): PreparedTextWithSegments | null {
  try {
    return prepareWithSegments(text, font, toPretextPrepareOptions(prepareOptions));
  } catch {
    return null;
  }
}

function createFallbackMeasuredLine(params: {
  fontSizePx: number;
  index: number;
  maxWidth: number;
  startOffset: number;
  text: string;
}): ReaderMeasuredLine {
  return {
    end: {
      graphemeIndex: params.startOffset + params.text.length,
      segmentIndex: 0,
    },
    lineIndex: params.index,
    start: {
      graphemeIndex: params.startOffset,
      segmentIndex: 0,
    },
    text: params.text,
    width: Math.min(params.maxWidth, params.text.length * params.fontSizePx * 0.55),
  };
}

function fallbackLayoutLines(
  text: string,
  maxWidth: number,
  fontSizePx: number,
  prepareOptions?: ReaderTextPrepareOptions,
): ReaderMeasuredLine[] {
  if (!text) {
    return [];
  }

  const maxCharsPerLine = getApproximateMaxCharsPerLine(maxWidth, fontSizePx);
  const normalizedOptions = normalizeReaderTextPrepareOptions(prepareOptions);
  const lines: ReaderMeasuredLine[] = [];

  const appendWrappedText = (chunkText: string, startOffset: number) => {
    if (chunkText.length === 0) {
      lines.push(createFallbackMeasuredLine({
        fontSizePx,
        index: lines.length,
        maxWidth,
        startOffset,
        text: '',
      }));
      return;
    }

    let cursor = 0;
    while (cursor < chunkText.length) {
      const chunk = chunkText.slice(cursor, cursor + maxCharsPerLine);
      lines.push(createFallbackMeasuredLine({
        fontSizePx,
        index: lines.length,
        maxWidth,
        startOffset: startOffset + cursor,
        text: chunk,
      }));
      cursor += maxCharsPerLine;
    }
  };

  if (normalizedOptions.whiteSpace === 'pre-wrap') {
    let offset = 0;
    for (const lineText of text.split('\n')) {
      appendWrappedText(lineText, offset);
      offset += lineText.length + 1;
    }
    return lines;
  }

  appendWrappedText(text, 0);
  return lines;
}

function measurePreparedTextBlock(params: {
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  text: string;
}): ReaderMeasuredLine[] {
  if (params.maxWidth <= 0) {
    return [];
  }

  const prepareOptions = params.prepareOptions ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS;
  const prepared = createPreparedTextBlock(params.text, params.font, prepareOptions);
  if (prepared.prepared) {
    try {
      return layoutWithLines(prepared.prepared, params.maxWidth, params.lineHeightPx)
        .lines.map((line, index) => ({
          ...line,
          lineIndex: index,
        }));
    } catch {
      return fallbackLayoutLines(
        params.text,
        params.maxWidth,
        params.fontSizePx,
        prepareOptions,
      );
    }
  }

  return fallbackLayoutLines(params.text, params.maxWidth, params.fontSizePx, prepareOptions);
}

function getBrowserTextMeasureRoot(): HTMLDivElement | null {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return null;
  }

  if (browserTextMeasureRoot && document.body.contains(browserTextMeasureRoot)) {
    return browserTextMeasureRoot;
  }

  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  root.style.position = 'absolute';
  root.style.inset = '0 auto auto -99999px';
  root.style.visibility = 'hidden';
  root.style.pointerEvents = 'none';
  root.style.zIndex = '-1';
  root.style.contain = 'layout style';
  document.body.appendChild(root);
  browserTextMeasureRoot = root;
  return root;
}

function writeMeasuredTextContent(target: HTMLElement, text: string): void {
  target.replaceChildren();

  const lines = text.split('\n');
  lines.forEach((line, index) => {
    target.append(document.createTextNode(line));
    if (index < lines.length - 1) {
      target.append(document.createElement('br'));
    }
  });
}

export function measureTextHeightWithBrowserLayout(params: {
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  text: string;
  whiteSpace?: 'normal' | 'pre-wrap';
  wordBreak?: 'normal' | 'keep-all';
}): number | null {
  const root = getBrowserTextMeasureRoot();
  if (!root || params.maxWidth <= 0 || params.text.length === 0) {
    return null;
  }

  const prepareOptions = normalizeReaderTextPrepareOptions({
    ...params.prepareOptions,
    whiteSpace: params.whiteSpace ?? params.prepareOptions?.whiteSpace,
    wordBreak: params.wordBreak ?? params.prepareOptions?.wordBreak,
  });
  const probe = document.createElement('div');
  probe.style.boxSizing = 'border-box';
  probe.style.display = 'block';
  probe.style.font = params.font;
  probe.style.fontSize = `${params.fontSizePx}px`;
  probe.style.lineHeight = `${params.lineHeightPx}px`;
  probe.style.maxWidth = `${params.maxWidth}px`;
  probe.style.width = `${params.maxWidth}px`;
  probe.style.letterSpacing = `${prepareOptions.letterSpacingPx}px`;
  probe.style.margin = '0';
  probe.style.padding = '0';
  probe.style.whiteSpace = prepareOptions.whiteSpace;
  probe.style.overflowWrap = 'break-word';
  probe.style.wordBreak = prepareOptions.wordBreak;

  writeMeasuredTextContent(probe, params.text);
  root.appendChild(probe);
  const height = Math.ceil(probe.getBoundingClientRect().height);
  probe.remove();

  return height > 0 ? height : null;
}

export const browserReaderTextLayoutEngine: ReaderTextLayoutEngine = {
  layoutLines(params) {
    return measurePreparedTextBlock(params);
  },
  layoutRichLines(params) {
    return layoutRichTextWithPretext({
      baseFont: params.font,
      baseFontSizePx: params.fontSizePx,
      inlines: params.inlines,
      lineHeightPx: params.lineHeightPx,
      maxWidth: params.maxWidth,
      prepareOptions: params.prepareOptions,
    });
  },
};

function resolveReaderFontFamily(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return 'sans-serif';
  }

  const fontFamily = window.getComputedStyle(document.body).fontFamily.trim();
  return fontFamily || 'sans-serif';
}

export function createReaderTypographyMetrics(
  fontSize: number,
  lineSpacing: number,
  paragraphSpacing: number,
  viewportWidth: number,
): ReaderTypographyMetrics {
  const fontFamily = resolveReaderFontFamily();
  const measuredTokens = createReaderContentMeasuredTokenValues({
    fontSize,
    lineSpacing,
    paragraphSpacing,
    viewportWidth,
  });
  const bodyFontSize = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.fontSize];
  const bodyLineHeightPx = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.lineHeight];
  const headingFontSize = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.headingFontSize];
  const headingLineHeightPx = measuredTokens[
    READER_CONTENT_MEASURED_TOKEN_NAMES.headingLineHeight
  ];
  const paragraphGap = measuredTokens[READER_CONTENT_MEASURED_TOKEN_NAMES.paragraphGap];

  return {
    bodyFont: `400 ${bodyFontSize}px ${fontFamily}`,
    bodyFontSize,
    bodyLineHeightPx,
    headingFont: `700 ${headingFontSize}px ${fontFamily}`,
    headingFontSize,
    headingLineHeightPx,
    paragraphSpacing: paragraphGap,
  };
}

export function getReaderLayoutPretextCacheSizeForTests(): number {
  return PRETEXT_CACHE.size + getRichTextLayoutCacheSizeForTests();
}

export function resetReaderLayoutPretextCacheForTests(): void {
  PRETEXT_CACHE.clear();
  resetRichTextLayoutCacheForTests();
  browserTextMeasureRoot?.remove();
  browserTextMeasureRoot = null;
}
