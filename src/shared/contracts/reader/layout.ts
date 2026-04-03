import type { LayoutCursor } from '@chenglou/pretext';

export interface ReaderLocator {
  chapterIndex: number;
  blockIndex: number;
  kind: 'heading' | 'text' | 'image';
  lineIndex?: number;
  startCursor?: LayoutCursor;
  endCursor?: LayoutCursor;
  edge?: 'start' | 'end';
}

export interface ScrollModeAnchor {
  chapterIndex: number;
  chapterProgress: number;
}
