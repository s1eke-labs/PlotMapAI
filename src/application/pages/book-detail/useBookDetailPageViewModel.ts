import type { TFunction } from 'i18next';
import type { AnalysisJobStatus, AnalysisStatusResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { loadBookDetailAnalysisStatus, loadBookDetailPageData } from '@application/use-cases/library';
import { reportAppError } from '@app/debug/service';
import { appPaths } from '@app/router/paths';
import { AppErrorCode, toAppError } from '@shared/errors';

import type { BookDetailPageViewModel, BookDetailParagraph } from './types';

function isValidNovelId(novelId: number): boolean {
  return Number.isFinite(novelId) && novelId > 0;
}

function buildIntroParagraphs(introText: string): BookDetailParagraph[] {
  let cursor = 0;

  return introText.split('\n').map((paragraph) => {
    const key = `${cursor}:${paragraph}`;
    cursor += paragraph.length + 1;

    return {
      key,
      paragraph,
    };
  });
}

function getBookDetailJobStatusLabel(
  job: AnalysisJobStatus | null,
  t: TFunction,
): string {
  const isJobRunning = job?.status === 'running' || job?.status === 'pausing';

  if (!job) {
    return t('bookDetail.analysisStatusIdle');
  }
  if (job.analysisComplete) {
    return t('bookDetail.analysisStatusCompleted');
  }
  if (job.currentStage === 'overview' && isJobRunning) {
    return t('bookDetail.analysisStatusGeneratingOverview');
  }

  switch (job.status) {
    case 'running':
      return t('bookDetail.analysisStatusRunning');
    case 'pausing':
      return t('bookDetail.analysisStatusPausing');
    case 'paused':
      return t('bookDetail.analysisStatusPaused');
    case 'failed':
      return t('bookDetail.analysisStatusFailed');
    case 'completed':
      return t('bookDetail.analysisStatusPending');
    default:
      return t('bookDetail.analysisStatusIdle');
  }
}

function createInvalidNovelError(): AppError {
  return toAppError('Invalid novel id', {
    code: AppErrorCode.NOVEL_NOT_FOUND,
    kind: 'not-found',
    source: 'library',
    userMessageKey: 'bookDetail.notFound',
  });
}

export function useBookDetailPageViewModel(novelId: number): BookDetailPageViewModel {
  const { t } = useTranslation();
  const [novel, setNovel] = useState<NovelView | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [analysisStatusError, setAnalysisStatusError] = useState<AppError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    if (!isValidNovelId(novelId)) {
      setNovel(null);
      setCoverUrl(null);
      setAnalysisStatus(null);
      setAnalysisStatusError(null);
      setError(createInvalidNovelError());
      setIsLoading(false);
      setIsAnalysisLoading(false);
      return;
    }

    setIsLoading(true);
    setIsAnalysisLoading(true);
    setError(null);

    try {
      const data = await loadBookDetailPageData(novelId);
      setNovel(data.novel);
      setCoverUrl(data.coverUrl);
      setAnalysisStatus(data.analysisStatus);
      setAnalysisStatusError(data.analysisStatusError);
      if (data.analysisStatusError) {
        reportAppError(data.analysisStatusError);
      }
    } catch (loadError) {
      const normalized = toAppError(loadError, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'library',
        userMessageKey: 'bookDetail.loadError',
      });
      reportAppError(normalized);
      setError(normalized);
      setNovel(null);
      setCoverUrl(null);
      setAnalysisStatus(null);
      setAnalysisStatusError(null);
    } finally {
      setIsLoading(false);
      setIsAnalysisLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshAnalysisStatus = useCallback(async (silent = false): Promise<void> => {
    if (!isValidNovelId(novelId)) {
      return;
    }

    if (!silent) {
      setIsAnalysisLoading(true);
    }

    const nextState = await loadBookDetailAnalysisStatus(novelId);
    if (nextState.analysisStatusError) {
      reportAppError(nextState.analysisStatusError);
      setAnalysisStatusError(nextState.analysisStatusError);
      if (!silent) {
        setIsAnalysisLoading(false);
      }
      return;
    }

    setAnalysisStatus(nextState.analysisStatus);
    setAnalysisStatusError(null);
    if (!silent) {
      setIsAnalysisLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    const status = analysisStatus?.job.status;
    if (!isValidNovelId(novelId) || (status !== 'running' && status !== 'pausing')) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshAnalysisStatus(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisStatus?.job.status, novelId, refreshAnalysisStatus]);

  const updateAnalysisStatus = useCallback((nextStatus: AnalysisStatusResponse | null): void => {
    setAnalysisStatus(nextStatus);
    setAnalysisStatusError(null);
    setIsAnalysisLoading(false);
  }, []);

  const job = analysisStatus?.job ?? null;
  const overview = analysisStatus?.overview ?? null;
  const isJobRunning = job?.status === 'running' || job?.status === 'pausing';
  const introText = overview?.bookIntro || novel?.description || '';
  const introParagraphs = useMemo(() => buildIntroParagraphs(introText), [introText]);
  const characterChartData = useMemo(
    () => (overview?.characterStats ?? []).slice(0, 5),
    [overview],
  );
  const jobStatusLabel = useMemo(
    () => getBookDetailJobStatusLabel(job, t),
    [job, t],
  );
  const pageHrefs = useMemo(() => ({
    bookshelf: appPaths.bookshelf(),
    characterGraph: appPaths.characterGraph(novelId),
    reader: appPaths.reader(novelId),
  }), [novelId]);

  return {
    analysisStatus,
    analysisStatusError,
    characterChartData,
    coverUrl,
    error,
    introParagraphs,
    introText,
    isAnalysisLoading,
    isJobRunning,
    isLoading,
    job,
    jobStatusLabel,
    novel,
    overview,
    pageHrefs,
    updateAnalysisStatus,
  };
}
