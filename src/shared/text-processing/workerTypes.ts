import type { ChapterDetectionRule, ParsedTextDocument, PurifiedChapter, PurifiedTitle, PurifyRule } from './types';

export interface TextProcessingProgress {
  progress: number;
  stage: string;
}

export interface ParseTxtPayload {
  file: File;
  tocRules: ChapterDetectionRule[];
}

export interface PurifyTitlesPayload {
  titles: PurifiedTitle[];
  rules: PurifyRule[];
  bookTitle: string;
}

export interface PurifyChapterPayload {
  chapter: PurifiedChapter;
  rules: PurifyRule[];
  bookTitle: string;
}

export interface PurifyChaptersPayload {
  chapters: PurifiedChapter[];
  rules: PurifyRule[];
  bookTitle: string;
}

export type TextProcessingTaskPayloadMap = {
  'parse-txt': ParseTxtPayload;
  'purify-chapter': PurifyChapterPayload;
  'purify-chapters': PurifyChaptersPayload;
  'purify-titles': PurifyTitlesPayload;
};

export type TextProcessingTaskResultMap = {
  'parse-txt': ParsedTextDocument;
  'purify-chapter': PurifiedChapter;
  'purify-chapters': PurifiedChapter[];
  'purify-titles': PurifiedTitle[];
};
