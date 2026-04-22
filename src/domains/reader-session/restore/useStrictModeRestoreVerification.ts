import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type {
  ReaderLocator,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  RestoreSettledResult,
} from '@shared/contracts/reader';
import { verifyStrictModeRestoreCompletion } from '../mode-switch/readerModeSwitchDebug';
import type {
  ModeSwitchTransaction,
  StrictModeSwitchContentMode,
} from '../mode-switch/useReaderStrictModeSwitch';
import { setLastRestoreResult } from '../store/readerSessionStore';

interface StrictModeSwitchFailureParams {
  chapterIndex: number;
  message: string;
  restoreResult?: ReaderRestoreResult | null;
  sourceMode: StrictModeSwitchContentMode;
  stage: 'restore_target';
  targetMode: StrictModeSwitchContentMode;
}

interface UseStrictModeRestoreVerificationParams {
  completeStrictModeSwitchTransaction: () => boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  finalizeStrictModeSwitchFailure: (params: StrictModeSwitchFailureParams) => unknown;
  getCurrentOriginalLocator: () => ReaderLocator | null;
  getPagedState: () => { pageCount: number; pageIndex: number };
  getStrictModeSwitchTransaction: () => ModeSwitchTransaction | null;
  handleStrictModeRestoreSettled: (result: RestoreSettledResult) => boolean;
  resolvePagedLocatorPageIndex: (locator: ReaderRestoreTarget['locator']) => number | null;
  resolveScrollLocatorOffset: (
    locator: NonNullable<ReaderRestoreTarget['locator']>,
  ) => number | null;
}

export interface UseStrictModeRestoreVerificationResult {
  processStrictModeRestoreSettled: (result: RestoreSettledResult) => boolean;
}

function requestStrictModeVerificationFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => callback(Date.now()), 16);
}

function cancelStrictModeVerificationFrame(frameId: number): void {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }

  window.clearTimeout(frameId);
}

export function useStrictModeRestoreVerification(
  params: UseStrictModeRestoreVerificationParams,
): UseStrictModeRestoreVerificationResult {
  const {
    completeStrictModeSwitchTransaction,
    contentRef,
    finalizeStrictModeSwitchFailure,
    getCurrentOriginalLocator,
    getPagedState,
    getStrictModeSwitchTransaction,
    handleStrictModeRestoreSettled,
    resolvePagedLocatorPageIndex,
    resolveScrollLocatorOffset,
  } = params;
  const strictModeRestoreVerificationFrameRef = useRef<number | null>(null);

  const clearStrictModeRestoreVerificationFrame = useCallback(() => {
    if (strictModeRestoreVerificationFrameRef.current !== null) {
      cancelStrictModeVerificationFrame(strictModeRestoreVerificationFrameRef.current);
      strictModeRestoreVerificationFrameRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearStrictModeRestoreVerificationFrame();
  }, [clearStrictModeRestoreVerificationFrame]);

  const verifyStrictModeRestoreTarget = useCallback((strictTransaction: ModeSwitchTransaction) => {
    const pagedState = getPagedState();
    const verificationFailure = verifyStrictModeRestoreCompletion({
      chapterIndex: strictTransaction.chapterIndex,
      contentElement: contentRef.current,
      currentOriginalLocator: getCurrentOriginalLocator(),
      currentPageCount: pagedState.pageCount,
      currentPageIndex: pagedState.pageIndex,
      resolvePagedLocatorPageIndex,
      resolveScrollLocatorOffset,
      targetMode: strictTransaction.targetMode,
      targetRestoreTarget: strictTransaction.targetRestoreTarget,
    });

    if (verificationFailure) {
      const { restoreResult } = verificationFailure;
      const { measuredError } = restoreResult;
      if (
        strictTransaction.targetMode === 'paged'
        && restoreResult.reason === 'validation_exceeded_tolerance'
        && measuredError?.metric === 'page_delta'
      ) {
        return false;
      }

      clearStrictModeRestoreVerificationFrame();
      setLastRestoreResult(restoreResult);
      finalizeStrictModeSwitchFailure({
        chapterIndex: strictTransaction.chapterIndex,
        message: verificationFailure.message,
        restoreResult,
        sourceMode: strictTransaction.sourceMode,
        stage: 'restore_target',
        targetMode: strictTransaction.targetMode,
      });
      return true;
    }

    clearStrictModeRestoreVerificationFrame();
    completeStrictModeSwitchTransaction();
    return true;
  }, [
    clearStrictModeRestoreVerificationFrame,
    completeStrictModeSwitchTransaction,
    contentRef,
    finalizeStrictModeSwitchFailure,
    getCurrentOriginalLocator,
    getPagedState,
    resolvePagedLocatorPageIndex,
    resolveScrollLocatorOffset,
  ]);

  const scheduleStrictModeRestoreVerification = useCallback((
    strictTransaction: ModeSwitchTransaction,
  ) => {
    clearStrictModeRestoreVerificationFrame();
    strictModeRestoreVerificationFrameRef.current = requestStrictModeVerificationFrame(() => {
      strictModeRestoreVerificationFrameRef.current = null;
      const activeTransaction = getStrictModeSwitchTransaction();
      if (
        !activeTransaction?.strict
        || activeTransaction.stage !== 'restore_target'
        || activeTransaction.chapterIndex !== strictTransaction.chapterIndex
        || activeTransaction.targetMode !== strictTransaction.targetMode
      ) {
        return;
      }

      const verified = verifyStrictModeRestoreTarget(activeTransaction);
      if (!verified) {
        scheduleStrictModeRestoreVerification(activeTransaction);
      }
    });
  }, [
    clearStrictModeRestoreVerificationFrame,
    getStrictModeSwitchTransaction,
    verifyStrictModeRestoreTarget,
  ]);

  const processStrictModeRestoreSettled = useCallback((result: RestoreSettledResult): boolean => {
    const strictTransaction = getStrictModeSwitchTransaction();
    if (!strictTransaction?.strict || strictTransaction.stage !== 'restore_target') {
      return false;
    }

    if (result === 'completed') {
      if (strictTransaction.targetMode === 'scroll') {
        clearStrictModeRestoreVerificationFrame();
        completeStrictModeSwitchTransaction();
        return true;
      }

      scheduleStrictModeRestoreVerification(strictTransaction);
      return true;
    }

    return handleStrictModeRestoreSettled(result);
  }, [
    clearStrictModeRestoreVerificationFrame,
    completeStrictModeSwitchTransaction,
    getStrictModeSwitchTransaction,
    handleStrictModeRestoreSettled,
    scheduleStrictModeRestoreVerification,
  ]);

  return {
    processStrictModeRestoreSettled,
  };
}
