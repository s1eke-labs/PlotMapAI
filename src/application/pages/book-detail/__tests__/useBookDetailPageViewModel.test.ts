import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisStatusResponse } from '@shared/contracts';

import { loadBookDetailAnalysisStatus, loadBookDetailPageData } from '@application/use-cases/library';

import { useBookDetailPageViewModel } from '../useBookDetailPageViewModel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@app/debug/service', () => ({
  reportAppError: vi.fn(),
}));

vi.mock('@application/use-cases/library', () => ({
  loadBookDetailAnalysisStatus: vi.fn(),
  loadBookDetailPageData: vi.fn(),
}));

const baseNovel = {
  author: 'Test Author',
  chapterCount: 6,
  createdAt: new Date().toISOString(),
  description: 'Fallback description',
  fileType: 'txt',
  hasCover: false,
  id: 1,
  originalEncoding: 'utf-8',
  originalFilename: 'test.txt',
  tags: [],
  title: 'Mock Novel',
  totalWords: 1000,
};

function createStatusResponse(
  overrides: Partial<AnalysisStatusResponse['job']> = {},
): AnalysisStatusResponse {
  return {
    chunks: [],
    job: {
      analysisComplete: false,
      analyzedChapters: 0,
      canPause: false,
      canRestart: false,
      canResume: false,
      canStart: true,
      completedAt: null,
      completedChunks: 0,
      currentChunk: null,
      currentChunkIndex: 0,
      currentStage: 'idle',
      lastError: '',
      lastHeartbeat: null,
      pauseRequested: false,
      progressPercent: 0,
      startedAt: null,
      status: 'idle',
      totalChapters: 0,
      totalChunks: 0,
      updatedAt: null,
      ...overrides,
    },
    overview: null,
  };
}

describe('useBookDetailPageViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(loadBookDetailPageData).mockResolvedValue({
      analysisStatus: createStatusResponse(),
      analysisStatusError: null,
      coverUrl: null,
      novel: baseNovel,
    });
    vi.mocked(loadBookDetailAnalysisStatus).mockResolvedValue({
      analysisStatus: createStatusResponse(),
      analysisStatusError: null,
    });
  });

  it('treats invalid ids as not-found without loading data', async () => {
    const { result } = renderHook(() => useBookDetailPageViewModel(Number.NaN));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(loadBookDetailPageData).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({
      code: 'NOVEL_NOT_FOUND',
      userMessageKey: 'bookDetail.notFound',
    });
  });

  it('loads page data and derives intro, chart, and job labels', async () => {
    vi.mocked(loadBookDetailPageData).mockResolvedValue({
      analysisStatus: {
        ...createStatusResponse({
          analysisComplete: false,
          canPause: true,
          canStart: false,
          currentStage: 'overview',
          status: 'running',
        }),
        overview: {
          analyzedChapters: 6,
          bookIntro: 'Line one\nLine two',
          characterStats: [
            { chapterCount: 6, chapters: [0], description: 'd1', name: 'A', role: 'Lead', sharePercent: 30, weight: 10 },
            { chapterCount: 5, chapters: [1], description: 'd2', name: 'B', role: 'Support', sharePercent: 20, weight: 9 },
            { chapterCount: 4, chapters: [2], description: 'd3', name: 'C', role: 'Support', sharePercent: 18, weight: 8 },
            { chapterCount: 3, chapters: [3], description: 'd4', name: 'D', role: 'Support', sharePercent: 14, weight: 7 },
            { chapterCount: 2, chapters: [4], description: 'd5', name: 'E', role: 'Support', sharePercent: 10, weight: 6 },
            { chapterCount: 1, chapters: [5], description: 'd6', name: 'F', role: 'Support', sharePercent: 8, weight: 5 },
          ],
          globalSummary: 'Summary',
          relationshipGraph: [],
          themes: ['growth'],
          totalChapters: 6,
          updatedAt: null,
        },
      },
      analysisStatusError: null,
      coverUrl: 'blob:cover',
      novel: {
        ...baseNovel,
        hasCover: true,
      },
    });

    const { result } = renderHook(() => useBookDetailPageViewModel(1));

    await waitFor(() => {
      expect(result.current.novel?.title).toBe('Mock Novel');
    });

    expect(result.current.coverUrl).toBe('blob:cover');
    expect(result.current.introText).toBe('Line one\nLine two');
    expect(result.current.introParagraphs.map((item) => item.paragraph)).toEqual(['Line one', 'Line two']);
    expect(result.current.characterChartData).toHaveLength(5);
    expect(result.current.isJobRunning).toBe(true);
    expect(result.current.jobStatusLabel).toBe('bookDetail.analysisStatusGeneratingOverview');
    expect(result.current.pageHrefs.reader).toBe('/novel/1/read');
    expect(result.current.pageHrefs.characterGraph).toBe('/novel/1/graph');
  });

  it('polls while the job is running and stops after it completes', async () => {
    vi.useFakeTimers();
    vi.mocked(loadBookDetailPageData).mockResolvedValue({
      analysisStatus: createStatusResponse({
        canPause: true,
        canStart: false,
        currentStage: 'chapters',
        status: 'running',
      }),
      analysisStatusError: null,
      coverUrl: null,
      novel: baseNovel,
    });
    vi.mocked(loadBookDetailAnalysisStatus).mockResolvedValue({
      analysisStatus: createStatusResponse({
        analysisComplete: true,
        canStart: false,
        currentStage: 'completed',
        status: 'completed',
      }),
      analysisStatusError: null,
    });

    const { result } = renderHook(() => useBookDetailPageViewModel(1));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.job?.status).toBe('running');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(loadBookDetailAnalysisStatus).toHaveBeenCalledWith(1);
    expect(result.current.job?.status).toBe('completed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(loadBookDetailAnalysisStatus).toHaveBeenCalledTimes(1);
  });
});
