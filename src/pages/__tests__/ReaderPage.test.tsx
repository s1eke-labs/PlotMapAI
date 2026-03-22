import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReaderPage from '../ReaderPage';
import { analysisApi } from '../../api/analysis';
import type { AnalysisJobStatus } from '../../api/analysis';
import { readerApi } from '../../api/reader';

const i18nMock = vi.hoisted(() => ({
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock('../../api/reader', () => ({
  readerApi: {
    getChapters: vi.fn(),
    getProgress: vi.fn(),
    getChapterContent: vi.fn(),
    saveProgress: vi.fn(),
    getImageUrl: vi.fn(),
  },
}));

vi.mock('../../api/analysis', () => ({
  analysisApi: {
    getStatus: vi.fn(),
    getChapterAnalysis: vi.fn(),
    analyzeChapter: vi.fn(),
  },
}));

const chapters = [
  { index: 0, title: 'Chapter 1', wordCount: 100 },
  { index: 1, title: 'Chapter 2', wordCount: 120 },
];

const chapterContent = [
  {
    index: 0,
    title: 'Chapter 1',
    content: 'Chapter 1 content',
    wordCount: 100,
    totalChapters: 2,
    hasPrev: false,
    hasNext: true,
  },
  {
    index: 1,
    title: 'Chapter 2',
    content: 'Chapter 2 content',
    wordCount: 120,
    totalChapters: 2,
    hasPrev: true,
    hasNext: false,
  },
];

const completedAnalysis = {
  chapterIndex: 1,
  chapterTitle: 'Chapter 2',
  summary: 'Summary for chapter 2',
  keyPoints: ['Key point'],
  characters: [],
  relationships: [],
  tags: ['tag'],
  chunkIndex: 0,
  updatedAt: null,
};

const originalOffsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalScrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

function setPrototypeNumberGetter(
  property: 'offsetHeight' | 'clientWidth' | 'clientHeight' | 'scrollWidth',
  value: number,
) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get: () => value,
  });
}

function restorePrototypeDescriptor(
  property: 'offsetHeight' | 'clientWidth' | 'clientHeight' | 'scrollWidth',
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(HTMLElement.prototype, property, descriptor);
    return;
  }

  Reflect.deleteProperty(HTMLElement.prototype, property);
}

function createJob(overrides: Partial<AnalysisJobStatus> = {}): AnalysisJobStatus {
  return {
    status: 'idle',
    currentStage: 'idle',
    analysisComplete: false,
    totalChapters: 0,
    analyzedChapters: 0,
    totalChunks: 0,
    completedChunks: 0,
    currentChunkIndex: 0,
    progressPercent: 0,
    pauseRequested: false,
    lastError: '',
    startedAt: null,
    completedAt: null,
    lastHeartbeat: null,
    updatedAt: null,
    currentChunk: null,
    canStart: true,
    canPause: false,
    canResume: false,
    canRestart: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novel/1/read']}>
      <Routes>
        <Route path="/novel/:id/read" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ReaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(readerApi.getChapters).mockResolvedValue(chapters);
    vi.mocked(readerApi.getProgress).mockResolvedValue({
      chapterIndex: 0,
      scrollPosition: 0,
      viewMode: 'original',
      chapterProgress: 0,
      isTwoColumn: false,
    });
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => chapterContent[chapterIndex]);
    vi.mocked(readerApi.saveProgress).mockResolvedValue({ message: 'Progress saved' });
    vi.mocked(readerApi.getImageUrl).mockResolvedValue(null);
    vi.mocked(analysisApi.getStatus).mockResolvedValue({
      job: createJob(),
      overview: null,
      chunks: [],
    });
    vi.mocked(analysisApi.getChapterAnalysis).mockResolvedValue({ analysis: null });
    vi.mocked(analysisApi.analyzeChapter).mockResolvedValue({ analysis: completedAnalysis });
  });

  afterEach(() => {
    restorePrototypeDescriptor('offsetHeight', originalOffsetHeightDescriptor);
    restorePrototypeDescriptor('clientWidth', originalClientWidthDescriptor);
    restorePrototypeDescriptor('clientHeight', originalClientHeightDescriptor);
    restorePrototypeDescriptor('scrollWidth', originalScrollWidthDescriptor);
  });

  it('restores the stored chapter and summary view from reader state', async () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 1,
      viewMode: 'summary',
      isTwoColumn: false,
    }));
    vi.mocked(analysisApi.getChapterAnalysis).mockResolvedValueOnce({ analysis: completedAnalysis });

    renderPage();

    expect(await screen.findByText('Summary for chapter 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 2', level: 3 })).toBeInTheDocument();
    expect(readerApi.getChapterContent).toHaveBeenCalledWith(1, 1);
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 1,
      viewMode: 'summary',
      isTwoColumn: false,
    });
  });

  it('loads the selected chapter and persists progress when a chapter is chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Chapter 2/ }));

    await waitFor(() => {
      expect(readerApi.getChapterContent).toHaveBeenLastCalledWith(1, 1);
    });
    expect(await screen.findByRole('heading', { name: 'Chapter 2', level: 1 })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toEqual({
      chapterIndex: 1,
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: 0,
    });
  });

  it('switches to summary view and shows queued analysis state when chapter analysis is missing', async () => {
    vi.mocked(analysisApi.getStatus).mockResolvedValueOnce({
      job: createJob({
        status: 'running',
        currentStage: 'chapters',
        analysisComplete: false,
        totalChapters: 2,
        analyzedChapters: 1,
        totalChunks: 2,
        completedChunks: 1,
        currentChunkIndex: 0,
        progressPercent: 50,
        canStart: false,
        canPause: true,
        currentChunk: {
          chunkIndex: 0,
          startChapterIndex: 0,
          endChapterIndex: 0,
          chapterIndices: [0],
          status: 'running',
          chunkSummary: '',
          errorMessage: '',
          updatedAt: null,
        },
      }),
      overview: null,
      chunks: [],
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'reader.summary' }));

    expect(await screen.findByText('reader.analysisPanel.statusQueued')).toBeInTheDocument();
    expect(screen.getByText('reader.analysisPanel.progressTitle')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 0,
      viewMode: 'summary',
      isTwoColumn: false,
    });
  });

  it('restores legacy scrollPosition in scroll mode', async () => {
    setPrototypeNumberGetter('offsetHeight', 400);
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: false,
      scrollPosition: 240,
    }));

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    const readerContainer = container.querySelector('main .overflow-y-auto.hide-scrollbar') as HTMLDivElement | null;
    expect(readerContainer).not.toBeNull();

    await waitFor(() => {
      expect(readerContainer?.scrollTop).toBe(240);
    });
  });

  it('restores paged progress from chapterProgress', async () => {
    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    setPrototypeNumberGetter('scrollWidth', 1500);
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: true,
      chapterProgress: 0.5,
    }));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
  });

  it('flushes the latest reading state on pagehide', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Chapter 2/ }));

    window.dispatchEvent(new Event('pagehide'));

    await waitFor(() => {
      expect(readerApi.saveProgress).toHaveBeenCalledWith(1, expect.objectContaining({
        chapterIndex: 1,
        viewMode: 'original',
        chapterProgress: 0,
        isTwoColumn: false,
      }));
    });
  });

  it('renders an empty state when the novel has no chapters', async () => {
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce([]);
    vi.mocked(readerApi.getChapterContent).mockRejectedValueOnce(new Error('Chapter not found'));
    renderPage();

    expect(await screen.findByText('reader.noChapters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'reader.goBack' })).toHaveAttribute('href', '/novel/1');
  });
});
