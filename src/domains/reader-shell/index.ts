export { ReaderProvider } from './pages/reader-page/ReaderContext';
export { default as ReaderPageContainer } from './pages/reader-page/ReaderPageContainer';
export type {
  ReaderAnalysisBridgeController,
  ReaderAnalysisBridgeState,
} from './reader-analysis-bridge';
export type { UseReaderPreferencesResult } from './hooks/useReaderPreferences';
export { useReaderPreferences } from './hooks/useReaderPreferences';
export {
  ensureReaderPreferencesHydrated,
  flushReaderPreferencesPersistence,
  getReaderPreferencesSnapshot,
  hasConfiguredReaderPageTurnMode,
  resetReaderPreferencesStoreForTests,
  setReaderPreferencesNovelId,
} from './hooks/readerPreferencesStore';
