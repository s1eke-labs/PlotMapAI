import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Bot, Loader2, Pause, Play, RefreshCw, Trash2, Hash, FileText, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { analysisApi } from '../api/analysis';
import type { AnalysisStatusResponse } from '../api/analysis';
import { novelsApi } from '../api/novels';
import type { Novel } from '../api/novels';
import Modal from '../components/Modal';
import TxtCover from '../components/TxtCover';

export default function BookDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const novelId = Number(id);

  const [novel, setNovel] = useState<Novel | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [analysisAction, setAnalysisAction] = useState<'start' | 'pause' | 'resume' | 'restart' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const loadNovel = useCallback(async () => {
    if (!novelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await novelsApi.get(novelId);
      setNovel(data);
    } catch (err: any) {
      setError(err.message || t('bookDetail.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [novelId, t]);

  const loadAnalysisStatus = useCallback(async (silent = false) => {
    if (!novelId) return;
    if (!silent) setIsAnalysisLoading(true);
    try {
      const data = await analysisApi.getStatus(novelId);
      setAnalysisStatus(data);
    } catch (err: any) {
      setAnalysisMessage(err.message || t('bookDetail.analysisLoadError'));
      setAnalysisStatus(null);
    } finally {
      if (!silent) setIsAnalysisLoading(false);
    }
  }, [novelId, t]);

  useEffect(() => {
    loadNovel();
    loadAnalysisStatus();
  }, [loadAnalysisStatus, loadNovel]);

  useEffect(() => {
    const status = analysisStatus?.job.status;
    if (!novelId || (status !== 'running' && status !== 'pausing')) return;

    const timer = window.setInterval(() => {
      loadAnalysisStatus(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisStatus?.job.status, loadAnalysisStatus, novelId]);

  const job = analysisStatus?.job ?? null;
  const overview = analysisStatus?.overview ?? null;
  const topCharacters = useMemo(() => overview?.characterStats.slice(0, 5) ?? [], [overview]);
  const isJobRunning = job?.status === 'running' || job?.status === 'pausing';
  const displayDescription = novel?.description || overview?.bookIntro || '';
  const descriptionHint = !novel?.description && overview?.bookIntro ? t('bookDetail.descriptionHint') : null;
  const jobStatusLabel = !job
    ? t('bookDetail.analysisStatusIdle')
    : job.analysisComplete
      ? t('bookDetail.analysisStatusCompleted')
      : job.currentStage === 'overview' && isJobRunning
        ? t('bookDetail.analysisStatusGeneratingOverview')
        : job.status === 'running'
          ? t('bookDetail.analysisStatusRunning')
          : job.status === 'pausing'
            ? t('bookDetail.analysisStatusPausing')
            : job.status === 'paused'
              ? t('bookDetail.analysisStatusPaused')
              : job.status === 'failed'
                ? t('bookDetail.analysisStatusFailed')
                : job.status === 'completed'
                  ? t('bookDetail.analysisStatusPending')
                  : t('bookDetail.analysisStatusIdle');

  const handleDelete = async () => {
    if (!novel) return;
    setIsDeleting(true);
    try {
      await novelsApi.delete(novel.id);
      navigate('/', { replace: true });
    } catch (err: any) {
      alert(err.message || t('bookDetail.deleteFailed'));
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  const runAnalysisAction = async (action: 'start' | 'pause' | 'resume' | 'restart') => {
    if (!novelId) return;
    setAnalysisAction(action);
    setAnalysisMessage(null);
    try {
      const result = await (action === 'start'
        ? analysisApi.start(novelId)
        : action === 'pause'
          ? analysisApi.pause(novelId)
          : action === 'resume'
            ? analysisApi.resume(novelId)
            : analysisApi.restart(novelId));
      setAnalysisStatus(result);
      setAnalysisMessage(
        action === 'pause'
          ? t('bookDetail.analysisActionPauseRequested')
          : action === 'resume'
            ? t('bookDetail.analysisActionResumed')
            : action === 'restart'
              ? t('bookDetail.analysisActionRestarted')
              : t('bookDetail.analysisActionStarted')
      );
    } catch (err: any) {
      setAnalysisMessage(err.message || t('bookDetail.analysisActionFailed'));
    } finally {
      setAnalysisAction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !novel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-red-400 mb-4">{error || t('bookDetail.notFound')}</p>
        <Link to="/" className="text-accent hover:text-accent-hover underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('common.actions.backToBookshelf')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
      <Link to="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-6 w-fit">
        <ArrowLeft className="w-4 h-4" />
        <span>{t('common.actions.back')}</span>
      </Link>

      <div className="glass rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 mt-2">
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-6">
          <div className="aspect-[2/3] w-full max-w-[240px] mx-auto overflow-hidden rounded-xl shadow-xl bg-muted-bg border border-border-color/20">
            {novel.hasCover ? (
              <img
                src={novelsApi.getCoverUrl(novel.id)}
                alt={novel.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <TxtCover title={novel.title} />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Link
              to={`/novel/${novel.id}/read`}
              className="w-full py-3 px-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <BookOpen className="w-5 h-5" />
              {t('common.actions.startReading')}
            </Link>

            {job?.status === 'running' || job?.status === 'pausing' ? (
              <button
                onClick={() => runAnalysisAction('pause')}
                disabled={analysisAction !== null}
                className="w-full py-3 px-4 bg-yellow-500/15 hover:bg-yellow-500/20 text-yellow-300 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors border border-yellow-500/20 disabled:opacity-60"
              >
                {analysisAction === 'pause' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Pause className="w-5 h-5" />}
                {job.status === 'pausing' ? t('bookDetail.pausingAnalysis') : t('bookDetail.pauseAnalysis')}
              </button>
            ) : job?.canResume ? (
              <button
                onClick={() => runAnalysisAction('resume')}
                disabled={analysisAction !== null}
                className="w-full py-3 px-4 bg-brand-700 hover:bg-brand-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {analysisAction === 'resume' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                {t('bookDetail.resumeAnalysis')}
              </button>
            ) : (!job || job.canStart) ? (
              <button
                onClick={() => runAnalysisAction('start')}
                disabled={analysisAction !== null}
                className="w-full py-3 px-4 bg-muted-bg text-text-primary font-medium rounded-xl flex items-center justify-center gap-2 transition-colors border border-border-color/20 disabled:opacity-60"
              >
                {analysisAction === 'start' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bot className="w-5 h-5" />}
                {t('bookDetail.startAnalysis')}
              </button>
            ) : null}

            {job?.canRestart && (
              <button
                onClick={() => runAnalysisAction('restart')}
                disabled={analysisAction !== null}
                className="w-full py-3 px-4 bg-muted-bg hover:bg-white/5 text-text-primary font-medium rounded-xl flex items-center justify-center gap-2 transition-colors border border-border-color/20 disabled:opacity-60"
              >
                {analysisAction === 'restart' ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                {t('bookDetail.restartAnalysis')}
              </button>
            )}

            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="w-full py-3 px-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              {t('bookDetail.deleteBook')}
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mb-2">{novel.title}</h1>
            {novel.author && (
              <p className="text-xl text-text-secondary">
                {t('bookDetail.byAuthor', { author: novel.author })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-8">
            <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {t('bookDetail.format')}
              </span>
              <span className="font-semibold text-text-primary">{novel.fileType.toUpperCase()}</span>
            </span>
            <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3" /> {t('bookDetail.chapters')}
              </span>
              <span className="font-semibold text-text-primary">{novel.chapter_count || 0}</span>
            </span>
            <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {t('bookDetail.wordCount')}
              </span>
              <span className="font-semibold text-text-primary">{(novel.totalWords / 1000).toFixed(1)}k</span>
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">{t('bookDetail.description')}</h3>
              {displayDescription ? (
                <div className="space-y-3">
                  <div className="prose prose-sm prose-invert max-w-none text-text-primary/90 leading-relaxed">
                    {displayDescription.split('\n').map((para, index) => (
                      <p key={index} className="mb-2">{para}</p>
                    ))}
                  </div>
                  {descriptionHint && <p className="text-xs text-accent">{descriptionHint}</p>}
                </div>
              ) : (
                <p className="text-text-secondary italic">{t('bookDetail.descriptionEmpty')}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">{t('bookDetail.aiAnalysisData')}</h3>
              <div className="rounded-2xl border border-border-color/20 bg-muted-bg/40 p-5 space-y-5">
                {isAnalysisLoading ? (
                  <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
                ) : (
                  <>
                    {analysisMessage && (
                      <div className="rounded-xl border border-border-color/20 bg-black/10 px-4 py-3 text-sm text-text-secondary leading-6">
                        {analysisMessage}
                      </div>
                    )}

                    {job ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 text-text-primary font-semibold">
                              <Bot className="w-4 h-4 text-accent" />
                              {t('bookDetail.analysisStatusLabel')}
                              <span>{jobStatusLabel}</span>
                            </div>
                            <p className="text-sm text-text-secondary mt-2">
                              {job.currentStage === 'overview'
                                ? t('bookDetail.analysisOverviewStageHint')
                                : t('bookDetail.analysisChapterStageHint')}
                            </p>
                          </div>
                          {job.totalChunks > 0 && (
                            <div className="text-sm text-text-secondary">
                              {t('bookDetail.analysisChunksSummary', {
                                completedChunks: job.completedChunks,
                                totalChunks: job.totalChunks,
                                analyzedChapters: job.analyzedChapters,
                                totalChapters: job.totalChapters,
                              })}
                            </div>
                          )}
                        </div>

                        {isJobRunning && job.totalChunks > 0 && (
                          <div className="space-y-3">
                            <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                              <div className="h-full bg-accent transition-all duration-300" style={{ width: `${job.progressPercent}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
                              <span>{t('bookDetail.analysisProgress', { percent: job.progressPercent.toFixed(2) })}</span>
                              {job.currentStage === 'overview'
                                ? <span>{t('bookDetail.analysisCurrentStage')}</span>
                                : job.currentChunk
                                  ? <span>{t('bookDetail.analysisCurrentChunk', { start: job.currentChunk.startChapterIndex + 1, end: job.currentChunk.endChapterIndex + 1 })}</span>
                                  : null}
                              {job.lastHeartbeat && <span>{t('bookDetail.analysisLastHeartbeat', { time: new Date(job.lastHeartbeat).toLocaleString() })}</span>}
                            </div>
                          </div>
                        )}

                        {job.lastError && (
                          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex gap-3">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{job.lastError}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-text-secondary">{t('bookDetail.analysisNoJob')}</p>
                    )}

                    {overview ? (
                      <div className="space-y-5">
                        <div className="rounded-xl border border-border-color/20 bg-card-bg/40 p-4">
                          <p className="text-sm text-text-secondary mb-2">{t('bookDetail.analysisOverviewTitle')}</p>
                          <p className="text-text-primary leading-7 whitespace-pre-line">{overview.globalSummary || t('bookDetail.analysisOverviewEmpty')}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-xl border border-border-color/20 bg-card-bg/40 p-4">
                            <p className="text-sm text-text-secondary mb-3">{t('bookDetail.analysisThemesTitle')}</p>
                            <div className="flex flex-wrap gap-2">
                              {overview.themes.length > 0 ? overview.themes.map((theme) => (
                                <span key={theme} className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm border border-accent/20">
                                  {theme}
                                </span>
                              )) : <span className="text-text-secondary text-sm">{t('bookDetail.analysisThemesEmpty')}</span>}
                            </div>
                          </div>

                          <div className="rounded-xl border border-border-color/20 bg-card-bg/40 p-4">
                            <p className="text-sm text-text-secondary mb-3">{t('bookDetail.analysisCharactersTitle')}</p>
                            <div className="space-y-2">
                              {topCharacters.length > 0 ? topCharacters.map((character) => (
                                <div key={character.name} className="flex items-center justify-between gap-4 text-sm">
                                  <div>
                                    <p className="text-text-primary font-medium">{character.name}</p>
                                    <p className="text-text-secondary">{character.role || t('bookDetail.analysisCharacterRoleFallback')}</p>
                                  </div>
                                  <span className="text-accent font-semibold">{character.sharePercent}%</span>
                                </div>
                              )) : <span className="text-text-secondary text-sm">{t('bookDetail.analysisCharactersEmpty')}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-dashed border-border-color/30 bg-muted-bg/50 text-text-secondary text-sm flex items-center justify-center min-h-[120px]">
                        {t('bookDetail.analysisNoOverview')}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title={t('bookDetail.deleteTitle')}
      >
        <div className="flex flex-col gap-6">
          <p className="text-text-primary">{t('bookDetail.deleteConfirm', { title: novel.title })}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.actions.delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
