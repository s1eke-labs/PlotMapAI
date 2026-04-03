import type { ComponentProps } from 'react';
import type { AppError } from '@shared/errors';
import type { ReaderImageViewerProps } from '@domains/reader-media';

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ReaderImageViewer } from '@domains/reader-media';
import { translateAppError } from '@shared/errors';
import { cn } from '@shared/utils/cn';
import ReaderSidebar from '../../components/reader/ReaderSidebar';
import ReaderToolbar from '../../components/ReaderToolbar';
import ReaderTopBar from '../../components/reader/ReaderTopBar';
import ReaderViewport from '../../components/reader/ReaderViewport';

interface ReaderPageLayoutProps {
  backHref: string;
  imageViewerProps: ReaderImageViewerProps;
  pageBgClassName: string;
  readerError: AppError | null;
  sidebarProps: ComponentProps<typeof ReaderSidebar>;
  toolbarProps?: ComponentProps<typeof ReaderToolbar>;
  topBarProps: ComponentProps<typeof ReaderTopBar>;
  viewportProps: ComponentProps<typeof ReaderViewport>;
}

export default function ReaderPageLayout({
  backHref,
  imageViewerProps,
  pageBgClassName,
  readerError,
  sidebarProps,
  toolbarProps,
  topBarProps,
  viewportProps,
}: ReaderPageLayoutProps) {
  const { t } = useTranslation();

  if (readerError) {
    return (
      <div className={cn('flex h-screen w-full items-center justify-center px-6 transition-colors duration-300', pageBgClassName)}>
        <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-card-bg/90 p-8 text-center shadow-xl">
          <p className="text-lg font-semibold text-text-primary">
            {translateAppError(readerError, t, 'reader.loadError')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              {t('common.actions.retry')}
            </button>
            <Link
              to={backHref}
              className="rounded-xl border border-border-color/30 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
            >
              {t('reader.goBack')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-screen w-full overflow-hidden transition-colors duration-300', pageBgClassName)}>
      <ReaderSidebar {...sidebarProps} />

      <main className="flex-1 flex flex-col min-w-0 relative text-text-primary">
        <ReaderTopBar {...topBarProps} />
        <ReaderViewport {...viewportProps} />
        {toolbarProps ? <ReaderToolbar {...toolbarProps} /> : null}
        <ReaderImageViewer {...imageViewerProps} />
      </main>
    </div>
  );
}
