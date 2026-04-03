export { readerContentService, loadAndPurifyChapters } from './readerContentService';
export type { Chapter, ChapterContent } from '@shared/contracts/reader';
export { deleteReaderArtifacts } from './readerArtifactsService';
export { useReaderChapterData } from './hooks/useReaderChapterData';
export type {
  ReaderChapterCacheApi,
  ReaderHydrateDataResult,
  ReaderLoadActiveChapterParams,
  ReaderLoadActiveChapterResult,
  UseReaderChapterDataResult,
} from './hooks/useReaderChapterData';
