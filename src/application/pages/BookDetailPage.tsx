import type { ReactElement } from 'react';

import { useCallback, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { appPaths } from '@app/router/paths';
import { translateAppError } from '@shared/errors';

import {
  BookDetailScreen,
  useBookDetailAnalysisController,
  useBookDetailDeleteFlow,
  useBookDetailPageViewModel,
} from './book-detail';

export default function BookDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const novelId = Number(id);
  const viewModel = useBookDetailPageViewModel(novelId);

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-scroll-container="true"]');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      return;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [novelId]);

  const handleDeleted = useCallback((): void => {
    navigate(appPaths.bookshelf(), { replace: true });
  }, [navigate]);

  const analysisController = useBookDetailAnalysisController({
    job: viewModel.job,
    novelId,
    onStatusUpdated: viewModel.updateAnalysisStatus,
  });
  const deleteFlow = useBookDetailDeleteFlow({
    novelId,
    novelTitle: viewModel.novel?.title ?? '',
    onDeleted: handleDeleted,
  });

  if (viewModel.isLoading) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--app-header-height,0px)-2rem)] items-center justify-center px-6 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (viewModel.error || !viewModel.novel) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--app-header-height,0px)-2rem)] flex-col items-center justify-center p-8 text-center">
        <p className="mb-4 text-red-400">
          {viewModel.error
            ? translateAppError(viewModel.error, t, 'bookDetail.loadError')
            : t('bookDetail.notFound')}
        </p>
        <Link
          to={appPaths.bookshelf()}
          className="flex items-center gap-2 text-accent underline hover:text-accent-hover"
        >
          <ArrowLeft className="h-4 w-4" /> {t('common.actions.backToBookshelf')}
        </Link>
      </div>
    );
  }

  return (
    <BookDetailScreen
      analysisController={analysisController}
      deleteFlow={deleteFlow}
      viewModel={viewModel}
    />
  );
}
