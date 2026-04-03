export type { ReaderImageDimensions } from '@domains/reader-media/utils/readerImageResourceCache';
export {
  acquireReaderImageResource,
  areReaderImageResourcesReady,
  clearReaderImageResourcesForNovel,
  peekReaderImageDimensions,
  peekReaderImageResource,
  preloadReaderImageResources,
  releaseReaderImageResource,
  resetReaderImageResourceCacheForTests,
} from '@domains/reader-media/utils/readerImageResourceCache';
