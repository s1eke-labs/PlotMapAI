import type { LayoutCursor } from '@chenglou/pretext';

export interface ReaderLocator {
  chapterIndex: number;
  chapterKey?: string;
  blockIndex: number;
  blockKey?: string;
  anchorId?: string;
  imageKey?: string;
  kind: 'heading' | 'text' | 'image';
  lineIndex?: number;
  startCursor?: LayoutCursor;
  endCursor?: LayoutCursor;
  edge?: 'start' | 'end';
  pageIndex?: number;
  textQuote?: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
  blockTextHash?: string;
  contentVersion?: number;
  importFormatVersion?: number;
  contentHash?: string;
}

export interface ScrollModeAnchor {
  chapterIndex: number;
  chapterProgress: number;
}
