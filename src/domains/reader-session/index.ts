export type {
  PageTarget,
  ReaderLifecycleEvent,
  ReaderLifecycleEventType,
  ReaderMode,
  ReaderNavigationIntent,
  ReaderPersistenceFailure,
  ReaderPersistenceStatus,
  ReaderRestoreMeasuredError,
  ReaderRestoreMetric,
  ReaderRestoreReason,
  ReaderRestoreResult,
  ReaderRestoreResultStatus,
  ReaderRestoreTarget,
  ReaderSessionCommands,
  ReaderSessionSnapshot as ReaderSessionStoreSnapshot,
  ReaderSessionState,
  RestoreStatus,
  StoredReaderState,
} from '@shared/contracts/reader';
export type {
  PersistedReaderProgressSnapshot,
  ReaderProgressCaptureQuality,
  ReaderProgressMode,
  ReaderProgressPosition,
  ReaderProgressProjection,
  ReaderProgressRestoreReason,
  ReaderProgressRestoreRequest,
  ReaderProgressRestoreResult,
  ReaderProgressRestoreStatus,
  ReaderProgressSnapshot,
} from './progress-core/contracts';
export type {
  ReaderSessionSnapshot,
  UseReaderSessionResult,
} from './hooks/useReaderSession';
export {
  buildStoredReaderState,
  clampChapterProgress,
  clampPageIndex,
  createDefaultStoredReaderState,
  getStoredChapterIndex,
  mergeStoredReaderState,
  sanitizeCanonicalPosition,
  sanitizeStoredReaderState,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from '@shared/utils/readerStoredState';
export {
  deleteReaderProgressSnapshot,
  readReaderProgressSnapshot,
  replaceReaderProgressSnapshot,
} from './progress-core/repository';
export {
  deleteLegacyReadingProgress,
} from './persistence/repository';
export {
  dispatchReaderLifecycleEvent,
  flushPersistence,
  resetReaderSessionStoreForTests,
  useReaderSessionSelector,
} from './store/readerSessionStore';
export { flushReaderStateWithCapture } from './persistence/flushReaderState';
export {
  useReaderRestoreController,
  useReaderRestoreController as useReaderRestoreFlow,
  type UseReaderRestoreControllerResult,
  type UseReaderRestoreControllerResult as UseReaderRestoreFlowResult,
} from './restore/useReaderRestoreController';
export { useReaderSession } from './hooks/useReaderSession';
export { useReaderStatePersistence } from './hooks/useReaderStatePersistence';

