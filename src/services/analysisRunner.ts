import { db } from './db';
import type { Novel, Chapter, AnalysisJob, AnalysisChunk, ChapterAnalysis, AnalysisOverview } from './db';
import { loadAndPurifyChapters } from '../api/reader';
import { getAiConfig } from '../api/settings';
import { debugLog } from './debug';
import {
  AnalysisConfigError,
  AnalysisErrorCode,
  AnalysisExecutionError,
  AnalysisJobStateError,
  ChunkingError,
  buildRuntimeAnalysisConfig,
} from './analysis';
import {
  buildCharacterGraphPayload,
  isChapterAnalysisComplete,
  isOverviewComplete,
} from './analysis/aggregates';
import { buildChunkFromChapters } from './analysis/chunking';
import {
  buildAnalysisChunks,
  runChunkAnalysis,
  runOverviewAnalysis,
  runSingleChapterAnalysis,
} from './analysis/service';
import type {
  AnalysisChunkPayload,
  ChunkAnalysisResult,
  OverviewAnalysisResult,
  RuntimeAnalysisConfig,
} from './analysis/types';

import type {
  AnalysisStatusResponse,
  AnalysisChunkStatus,
  AnalysisJobStatus,
  ChapterAnalysisResult,
  AnalysisOverview as ApiAnalysisOverview,
  CharacterGraphResponse,
} from '../api/analysis';

// ── Constants ──────────────────────────────────────────────────────────────

const RUNNING_STATUSES = new Set(['running', 'pausing']);
const RESUMABLE_STATUSES = new Set(['paused', 'failed']);

// ── Active runners (AbortController per novelId) ──────────────────────────

const ACTIVE_RUNNERS = new Map<number, AbortController>();


// ── AI config helpers ─────────────────────────────────────────────────────

async function loadRuntimeConfig(): Promise<RuntimeAnalysisConfig> {
  const stored = await getAiConfig();
  return buildRuntimeAnalysisConfig(stored);
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────

async function loadNovel(novelId: number): Promise<Novel> {
  const novel = await db.novels.get(novelId);
  if (!novel) throw new AnalysisJobStateError(AnalysisErrorCode.NOVEL_NOT_FOUND);
  return novel;
}

async function loadPurifiedChaptersForAnalysis(novelId: number): Promise<Chapter[]> {
  const chapters = await loadAndPurifyChapters(novelId);
  if (!chapters.length) throw new AnalysisJobStateError(AnalysisErrorCode.NO_CHAPTERS);
  return chapters;
}

async function loadJob(novelId: number): Promise<AnalysisJob | undefined> {
  return db.analysisJobs.where('novelId').equals(novelId).first();
}

async function ensureJob(novelId: number): Promise<AnalysisJob> {
  const job = await loadJob(novelId);
  if (!job) throw new AnalysisJobStateError(AnalysisErrorCode.JOB_NOT_FOUND);
  return job;
}

async function loadChunks(novelId: number): Promise<AnalysisChunk[]> {
  return db.analysisChunks.where('novelId').equals(novelId).sortBy('chunkIndex');
}

async function loadChapterAnalyses(novelId: number): Promise<ChapterAnalysis[]> {
  return db.chapterAnalyses.where('novelId').equals(novelId).sortBy('chapterIndex');
}

async function loadOverview(novelId: number): Promise<AnalysisOverview | undefined> {
  return db.analysisOverviews.where('novelId').equals(novelId).first();
}

// ── Serialization ─────────────────────────────────────────────────────────

function serializeChunk(chunk: AnalysisChunk): AnalysisChunkStatus {
  return {
    chunkIndex: chunk.chunkIndex,
    startChapterIndex: chunk.startChapterIndex,
    endChapterIndex: chunk.endChapterIndex,
    chapterIndices: chunk.chapterIndices,
    status: chunk.status as AnalysisChunkStatus['status'],
    chunkSummary: chunk.chunkSummary,
    errorMessage: chunk.errorMessage,
    updatedAt: chunk.updatedAt,
  };
}

function serializeOverviewRow(overview: AnalysisOverview | undefined): ApiAnalysisOverview | null {
  if (!overview) return null;
  return {
    bookIntro: overview.bookIntro,
    globalSummary: overview.globalSummary,
    themes: overview.themes,
    characterStats: overview.characterStats,
    relationshipGraph: overview.relationshipGraph,
    totalChapters: overview.totalChapters,
    analyzedChapters: overview.analyzedChapters,
    updatedAt: overview.updatedAt,
  };
}

function serializeChapterAnalysisRow(row: ChapterAnalysis | undefined): ChapterAnalysisResult | null {
  if (!row) return null;
  return {
    chapterIndex: row.chapterIndex,
    chapterTitle: row.chapterTitle,
    summary: row.summary,
    keyPoints: row.keyPoints,
    characters: row.characters,
    relationships: row.relationships,
    tags: row.tags,
    chunkIndex: row.chunkIndex,
    updatedAt: row.updatedAt,
  };
}

// ── Incomplete chunk detection ────────────────────────────────────────────

async function findIncompleteChunkIndices(novelId: number, chunks: AnalysisChunk[]): Promise<Set<number>> {
  if (!chunks.length) return new Set();
  const chapterRows = await loadChapterAnalyses(novelId);
  const chapterMap = new Map<number, ChapterAnalysis>();
  for (const row of chapterRows) chapterMap.set(row.chapterIndex, row);
  const incomplete = new Set<number>();
  for (const chunk of chunks) {
    const indices = chunk.chapterIndices;
    if (chunk.status !== 'completed' || !indices.length) {
      incomplete.add(chunk.chunkIndex);
      continue;
    }
    if (indices.some(idx => !isChapterAnalysisComplete(chapterMap.get(idx)))) {
      incomplete.add(chunk.chunkIndex);
    }
  }
  return incomplete;
}

// ── Counter helpers ───────────────────────────────────────────────────────

async function countCompleteChapterAnalyses(novelId: number): Promise<number> {
  const rows = await loadChapterAnalyses(novelId);
  return rows.filter(r => isChapterAnalysisComplete(r)).length;
}

async function updateJobCounters(job: AnalysisJob, totalChapters: number): Promise<void> {
  const chunkRows = await loadChunks(job.novelId);
  const incomplete = await findIncompleteChunkIndices(job.novelId, chunkRows);
  job.totalChapters = totalChapters;
  job.totalChunks = chunkRows.length;
  job.completedChunks = chunkRows.filter(
    c => c.status === 'completed' && !incomplete.has(c.chunkIndex),
  ).length;
  job.analyzedChapters = await countCompleteChapterAnalyses(job.novelId);
}

// ── Stage detection ───────────────────────────────────────────────────────

function determineCurrentStage(
  status: string,
  totalChunks: number,
  completedChunks: number,
  overviewComplete: boolean,
  analysisComplete: boolean,
): AnalysisJobStatus['currentStage'] {
  if (analysisComplete) return 'completed';
  if (totalChunks <= 0 || status === 'idle') return 'idle';
  if (completedChunks >= totalChunks && !overviewComplete) return 'overview';
  return 'chapters';
}

// ── Status payload builder ────────────────────────────────────────────────

async function buildAnalysisStatusPayload(novelId: number): Promise<AnalysisStatusResponse> {
  const chapterCount = await db.chapters.where('novelId').equals(novelId).count();
  const job = await loadJob(novelId);
  const overview = await loadOverview(novelId);
  const chunkRows = await loadChunks(novelId);
  const serializedChunks = chunkRows.map(serializeChunk);
  const incompleteIndices = await findIncompleteChunkIndices(novelId, chunkRows);
  const completedChunks = chunkRows.filter(
    c => c.status === 'completed' && !incompleteIndices.has(c.chunkIndex),
  ).length;
  const totalChunks = serializedChunks.length;
  const expectedTotalChapters = job && job.totalChapters > 0 ? job.totalChapters : chapterCount;
  const analyzedChapters = job ? await countCompleteChapterAnalyses(novelId) : 0;
  const overviewComplete = isOverviewComplete(
    overview,
    expectedTotalChapters,
  );
  const analysisComplete =
    totalChunks > 0 &&
    incompleteIndices.size === 0 &&
    overviewComplete &&
    completedChunks >= totalChunks;

  const status = job ? job.status : 'idle';
  const currentStage = determineCurrentStage(
    status,
    totalChunks,
    completedChunks,
    overviewComplete,
    analysisComplete,
  );

  let currentChunk: AnalysisChunkStatus | null = null;
  if (job && totalChunks > 0 && currentStage === 'chapters') {
    currentChunk = serializedChunks.find(c => c.chunkIndex === job.currentChunkIndex) ?? null;
    if (
      currentChunk &&
      (incompleteIndices.has(currentChunk.chunkIndex) && currentChunk.status === 'completed')
    ) {
      currentChunk =
        serializedChunks.find(
          c =>
            c.status === 'running' ||
            c.status === 'pending' ||
            c.status === 'failed' ||
            incompleteIndices.has(c.chunkIndex),
        ) ?? null;
    }
  }

  const progressSteps = totalChunks + (totalChunks > 0 ? 1 : 0);
  const completedSteps = completedChunks + (overviewComplete && totalChunks > 0 ? 1 : 0);
  const progressPercent = progressSteps
    ? Math.round((completedSteps / progressSteps) * 10000) / 100
    : 0;
  const canResume =
    RESUMABLE_STATUSES.has(status) ||
    ((status === 'idle' || status === 'completed') && totalChunks > 0 && !analysisComplete);

  return {
    job: {
      status: status as AnalysisJobStatus['status'],
      currentStage,
      analysisComplete,
      totalChapters: expectedTotalChapters,
      analyzedChapters,
      totalChunks: job ? job.totalChunks : totalChunks,
      completedChunks,
      currentChunkIndex: job ? job.currentChunkIndex : 0,
      progressPercent,
      pauseRequested: job ? job.pauseRequested : false,
      lastError: job ? job.lastError : '',
      startedAt: job?.startedAt ?? null,
      completedAt: job?.completedAt ?? null,
      lastHeartbeat: job?.lastHeartbeat ?? null,
      updatedAt: job?.updatedAt ?? null,
      currentChunk,
      canStart: status === 'idle' || totalChunks === 0,
      canPause: RUNNING_STATUSES.has(status),
      canResume,
      canRestart: !RUNNING_STATUSES.has(status) && totalChunks > 0,
    },
    overview: serializeOverviewRow(overview),
    chunks: serializedChunks,
  };
}

// ── Job mutation helpers ──────────────────────────────────────────────────

function nowISO(): string {
  return new Date().toISOString();
}

async function resetJobPlan(
  novelId: number,
  totalChapters: number,
  chunks: AnalysisChunkPayload[],
): Promise<void> {
  if (!chunks.length) throw new AnalysisJobStateError(AnalysisErrorCode.NO_CHAPTERS);

  await clearAnalysisData(novelId);

  let job = await loadJob(novelId);
  if (!job) {
    const id = await db.analysisJobs.add({
      novelId,
      status: 'running',
      totalChapters: 0,
      analyzedChapters: 0,
      totalChunks: 0,
      completedChunks: 0,
      currentChunkIndex: 0,
      pauseRequested: false,
      lastError: '',
      startedAt: null,
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: nowISO(),
    });
    job = await db.analysisJobs.get(id);
    if (!job) throw new AnalysisJobStateError(AnalysisErrorCode.JOB_CREATE_FAILED);
  }

  const timestamp = nowISO();
  job.status = 'running';
  job.totalChapters = totalChapters;
  job.analyzedChapters = 0;
  job.totalChunks = chunks.length;
  job.completedChunks = 0;
  job.currentChunkIndex = chunks[0].chunkIndex as number;
  job.pauseRequested = false;
  job.lastError = '';
  job.startedAt = timestamp;
  job.completedAt = null;
  job.lastHeartbeat = null;
  job.updatedAt = timestamp;
  await db.analysisJobs.put(job);

  for (const chunk of chunks) {
    await db.analysisChunks.add({
      novelId,
      chunkIndex: chunk.chunkIndex,
      startChapterIndex: chunk.startChapterIndex,
      endChapterIndex: chunk.endChapterIndex,
      chapterIndices: chunk.chapterIndices,
      status: 'pending',
      chunkSummary: '',
      errorMessage: '',
      updatedAt: timestamp,
    });
  }
}

async function clearAnalysisData(novelId: number): Promise<void> {
  await db.analysisChunks.where('novelId').equals(novelId).delete();
  await db.chapterAnalyses.where('novelId').equals(novelId).delete();
  await db.analysisOverviews.where('novelId').equals(novelId).delete();
}

async function pauseJob(job: AnalysisJob): Promise<void> {
  debugLog('Analysis', `job paused: novelId=${job.novelId}`);
  job.status = 'paused';
  job.pauseRequested = false;
  job.lastHeartbeat = nowISO();
  job.updatedAt = nowISO();
  await db.analysisJobs.put(job);
}

async function failJob(novelId: number, message: string): Promise<void> {
  debugLog('Analysis', `job failed: novelId=${novelId} error="${message}"`);
  const job = await loadJob(novelId);
  if (!job) return;
  await updateJobCounters(job, job.totalChapters);
  job.status = 'failed';
  job.pauseRequested = false;
  job.lastError = message;
  job.lastHeartbeat = nowISO();
  job.updatedAt = nowISO();
  await db.analysisJobs.put(job);
}

// ── Chunk hydration ───────────────────────────────────────────────────────

async function hydrateChunkPayload(
  chunkRow: AnalysisChunk,
  chapterMap: Map<number, Chapter>,
): Promise<AnalysisChunkPayload> {
  const chapterIndices = chunkRow.chapterIndices;
  const chapters: Chapter[] = [];
  for (const chapterIndex of chapterIndices) {
    const chapter = chapterMap.get(chapterIndex);
    if (!chapter) throw new AnalysisJobStateError(AnalysisErrorCode.CHAPTER_MISSING);
    chapters.push(chapter);
  }
  return buildChunkFromChapters(chunkRow.chunkIndex, chapters);
}

// ── Error formatting ──────────────────────────────────────────────────────

function formatExceptionMessage(exc: unknown): string {
  if (
    exc instanceof AnalysisConfigError ||
    exc instanceof AnalysisExecutionError ||
    exc instanceof ChunkingError ||
    exc instanceof AnalysisJobStateError
  ) {
    return exc.message;
  }
  return `Internal error: ${exc instanceof Error ? exc.message : String(exc)}`;
}

// ── Mark chunk helpers ────────────────────────────────────────────────────

async function markChunkRunning(
  novelId: number,
  chunkPayload: AnalysisChunkPayload,
): Promise<void> {
  const chunkIndex = chunkPayload.chunkIndex;
  const chunk = await db.analysisChunks
    .where('[novelId+chunkIndex]')
    .equals([novelId, chunkIndex])
    .first();
  if (chunk) {
    chunk.status = 'running';
    chunk.errorMessage = '';
    chunk.updatedAt = nowISO();
    await db.analysisChunks.put(chunk);
  }
}

async function markChunkFailed(
  novelId: number,
  chunkPayload: AnalysisChunkPayload,
  errorMessage: string,
): Promise<void> {
  const chunkIndex = chunkPayload.chunkIndex;
  const chunk = await db.analysisChunks
    .where('[novelId+chunkIndex]')
    .equals([novelId, chunkIndex])
    .first();
  if (chunk) {
    chunk.status = 'failed';
    chunk.errorMessage = errorMessage;
    chunk.updatedAt = nowISO();
    await db.analysisChunks.put(chunk);
  }
}

async function saveChunkAnalysisResult(
  novelId: number,
  chunkPayload: AnalysisChunkPayload,
  result: ChunkAnalysisResult,
): Promise<void> {
  const chunkIndex = chunkPayload.chunkIndex;
  const chunk = await db.analysisChunks
    .where('[novelId+chunkIndex]')
    .equals([novelId, chunkIndex])
    .first();
  if (chunk) {
    chunk.status = 'completed';
    chunk.chunkSummary = result.chunkSummary || 'Chunk analysis completed.';
    chunk.errorMessage = '';
    chunk.updatedAt = nowISO();
    await db.analysisChunks.put(chunk);
  }

  for (const item of result.chapterAnalyses) {
    const existing = await db.chapterAnalyses
      .where('[novelId+chapterIndex]')
      .equals([novelId, item.chapterIndex])
      .first();
    const record: ChapterAnalysis = {
      id: existing?.id ?? (undefined as unknown as number),
      novelId,
      chapterIndex: item.chapterIndex,
      chapterTitle: item.title || '',
      summary: item.summary,
      keyPoints: item.keyPoints,
      characters: item.characters,
      relationships: item.relationships,
      tags: item.tags,
      chunkIndex,
      updatedAt: nowISO(),
    };
    if (existing) {
      record.id = existing.id;
      await db.chapterAnalyses.put(record);
    } else {
      await db.chapterAnalyses.add(record);
    }
  }
}

async function saveOverviewAnalysisResult(
  novelId: number,
  result: OverviewAnalysisResult,
): Promise<void> {
  const existing = await loadOverview(novelId);
  const record: AnalysisOverview = {
    id: existing?.id ?? (undefined as unknown as number),
    novelId,
    bookIntro: result.bookIntro,
    globalSummary: result.globalSummary,
    themes: result.themes,
    characterStats: result.characterStats,
    relationshipGraph: result.relationshipGraph,
    totalChapters: result.totalChapters,
    analyzedChapters: result.analyzedChapters,
    updatedAt: nowISO(),
  };
  if (existing) {
    record.id = existing.id;
    await db.analysisOverviews.put(record);
  } else {
    await db.analysisOverviews.add(record);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────

function spawnRunner(novelId: number): AbortController {
  const existing = ACTIVE_RUNNERS.get(novelId);
  if (existing && !existing.signal.aborted) {
    return existing;
  }
  const controller = new AbortController();
  ACTIVE_RUNNERS.set(novelId, controller);
  runAnalysisJob(novelId, controller.signal).catch(() => {
    // errors handled inside runAnalysisJob
  });
  return controller;
}

async function runAnalysisJob(novelId: number, signal: AbortSignal): Promise<void> {
  try {
    const novel = await loadNovel(novelId);
    const runtimeConfig = await loadRuntimeConfig();
    const chapters = await loadPurifiedChaptersForAnalysis(novelId);
    const chapterMap = new Map<number, Chapter>();
    for (const ch of chapters) chapterMap.set(ch.chapterIndex, ch);
    const chunkRows = await loadChunks(novelId);
    if (!chunkRows.length) {
      await failJob(novelId, AnalysisErrorCode.CHUNKS_NOT_FOUND);
      return;
    }

    const totalChapters = chapters.length;
    const totalChunks = chunkRows.length;
    debugLog('Analysis', `job started: novelId=${novelId} chunks=${totalChunks} chapters=${totalChapters}`);
    const incompleteIndices = await findIncompleteChunkIndices(novelId, chunkRows);
    if (incompleteIndices.size > 0) {
      for (const chunk of chunkRows) {
        if (incompleteIndices.has(chunk.chunkIndex) && chunk.status === 'completed') {
          chunk.status = 'pending';
          chunk.errorMessage = '';
          await db.analysisChunks.put(chunk);
        }
      }
    }

    for (const chunkRow of chunkRows) {
      if (signal.aborted) {
        const job = await loadJob(novelId);
        if (job) await pauseJob(job);
        return;
      }

      let job = await loadJob(novelId);
      if (!job) return;

      if (job.pauseRequested) {
        await pauseJob(job);
        return;
      }

      const currentChunk = await db.analysisChunks
        .where('[novelId+chunkIndex]')
        .equals([novelId, chunkRow.chunkIndex])
        .first();
      if (!currentChunk || currentChunk.status === 'completed') continue;

      const chunkPayload = await hydrateChunkPayload(currentChunk, chapterMap);
      debugLog('Analysis', `chunk ${chunkRow.chunkIndex + 1}/${totalChunks} starting`);
      await markChunkRunning(novelId, chunkPayload);
      job = (await loadJob(novelId))!;
      job.status = 'running';
      job.currentChunkIndex = chunkRow.chunkIndex;
      job.lastError = '';
      job.lastHeartbeat = nowISO();
      job.updatedAt = nowISO();
      await db.analysisJobs.put(job);

      try {
        const result = await runChunkAnalysis(runtimeConfig, novel.title, chunkPayload, totalChunks);
        job = await loadJob(novelId);
        if (!job) return;
        await saveChunkAnalysisResult(novelId, chunkPayload, result);
        await updateJobCounters(job, totalChapters);
        job.status = 'running';
        job.lastError = '';
        job.lastHeartbeat = nowISO();
        job.updatedAt = nowISO();

        if (job.pauseRequested) {
          await pauseJob(job);
          return;
        }
        await db.analysisJobs.put(job);
      } catch (exc) {
        const errorMessage = `Chunk ${chunkRow.chunkIndex + 1} failed: ${formatExceptionMessage(exc)}`;
        debugLog('Analysis', `chunk ${chunkRow.chunkIndex + 1} failed: ${exc}`);
        job = await loadJob(novelId);
        if (!job) return;
        await markChunkFailed(novelId, chunkPayload, errorMessage);
        await updateJobCounters(job, totalChapters);
        job.status = 'failed';
        job.pauseRequested = false;
        job.lastError = errorMessage;
        job.lastHeartbeat = nowISO();
        job.updatedAt = nowISO();
        await db.analysisJobs.put(job);
        return;
      }
    }

    let job = await loadJob(novelId);
    if (!job) return;

    await updateJobCounters(job, totalChapters);
    const overview = await loadOverview(novelId);
    const overviewComplete = isOverviewComplete(overview, totalChapters);

    if (job.pauseRequested) {
      await pauseJob(job);
      return;
    }

    if (job.completedChunks >= job.totalChunks && job.totalChunks > 0 && !overviewComplete) {
      const chapterRows = await loadChapterAnalyses(novelId);
      if (
        chapterRows.length < totalChapters ||
        chapterRows.some(r => !isChapterAnalysisComplete(r))
      ) {
        await failJob(novelId, AnalysisErrorCode.CHAPTERS_INCOMPLETE);
        return;
      }

      job = (await loadJob(novelId))!;
      job.status = 'running';
      job.currentChunkIndex = job.totalChunks;
      job.lastError = '';
      job.lastHeartbeat = nowISO();
      job.updatedAt = nowISO();
      await db.analysisJobs.put(job);

      debugLog('Analysis', `overview analysis starting`);
      try {
        const overviewResult = await runOverviewAnalysis(
          runtimeConfig,
          novel.title,
          chapterRows,
          totalChapters,
        );
        job = await loadJob(novelId);
        if (!job) return;
        await saveOverviewAnalysisResult(novelId, overviewResult);
        await updateJobCounters(job, totalChapters);
        job.status = 'completed';
        job.pauseRequested = false;
        job.completedAt = nowISO();
        job.lastError = '';
        job.lastHeartbeat = nowISO();
        job.updatedAt = nowISO();
        await db.analysisJobs.put(job);
        debugLog('Analysis', `job completed`);
        return;
      } catch (exc) {
        const errorMessage = `Overview generation failed: ${formatExceptionMessage(exc)}`;
        job = await loadJob(novelId);
        if (!job) return;
        await updateJobCounters(job, totalChapters);
        job.status = 'failed';
        job.pauseRequested = false;
        job.lastError = errorMessage;
        job.lastHeartbeat = nowISO();
        job.updatedAt = nowISO();
        await db.analysisJobs.put(job);
        return;
      }
    }

    if (job.completedChunks >= job.totalChunks && job.totalChunks > 0 && overviewComplete) {
      job.status = 'completed';
      job.pauseRequested = false;
      job.completedAt = job.completedAt || nowISO();
    } else if (!job.pauseRequested) {
      job.status = 'running';
    }
    job.updatedAt = nowISO();
    if (job.pauseRequested) {
      await pauseJob(job);
      return;
    }
    await db.analysisJobs.put(job);
  } catch (exc) {
    try {
      await failJob(novelId, formatExceptionMessage(exc));
    } catch {
      // swallow secondary errors
    }
  } finally {
    const active = ACTIVE_RUNNERS.get(novelId);
    if (active === ACTIVE_RUNNERS.get(novelId)) {
      ACTIVE_RUNNERS.delete(novelId);
    }
  }
}

// ── Recovery ──────────────────────────────────────────────────────────────

async function recoverInterruptedJobs(): Promise<void> {
  const jobs = await db.analysisJobs
    .filter(j => RUNNING_STATUSES.has(j.status))
    .toArray();
  debugLog('Analysis', `recovering ${jobs.length} interrupted jobs`);
  for (const job of jobs) {
    job.status = 'paused';
    job.pauseRequested = false;
    if (!job.lastError) {
      job.lastError = AnalysisErrorCode.APP_RESTARTED;
    }
    job.updatedAt = nowISO();
    await db.analysisJobs.put(job);
  }
  await db.analysisChunks
    .filter(c => c.status === 'running')
    .modify({ status: 'pending', errorMessage: '', updatedAt: nowISO() });
}

// Run recovery on module load
recoverInterruptedJobs().catch(() => {
  // best effort
});

// ── Public API ────────────────────────────────────────────────────────────

export async function getAnalysisStatus(novelId: number): Promise<AnalysisStatusResponse> {
  return buildAnalysisStatusPayload(novelId);
}

export async function startAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  await loadNovel(novelId);
  const runtimeConfig = await loadRuntimeConfig();
  const chapters = await loadPurifiedChaptersForAnalysis(novelId);
  const chunks = buildAnalysisChunks(chapters, runtimeConfig.contextSize);

  const job = await loadJob(novelId);
  if (job && RUNNING_STATUSES.has(job.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_IN_PROGRESS);
  }
  if (job && job.totalChunks > 0 && ['paused', 'failed', 'completed'].includes(job.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.JOB_ALREADY_EXISTS);
  }

  await resetJobPlan(novelId, chapters.length, chunks);
  spawnRunner(novelId);
  return buildAnalysisStatusPayload(novelId);
}

export async function pauseAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  const job = await ensureJob(novelId);
  if (!RUNNING_STATUSES.has(job.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.NO_PAUSABLE_JOB);
  }
  const updated = await db.analysisJobs
    .where('novelId')
    .equals(novelId)
    .filter(j => RUNNING_STATUSES.has(j.status))
    .modify({ pauseRequested: true, status: 'pausing', updatedAt: nowISO() });

  // Also abort the runner's async loop
  const controller = ACTIVE_RUNNERS.get(novelId);
  if (controller) controller.abort();

  if (updated === 0) {
    // status changed concurrently, no-op
  }
  return buildAnalysisStatusPayload(novelId);
}

export async function resumeAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  await loadNovel(novelId);
  await loadRuntimeConfig();
  const chapters = await loadPurifiedChaptersForAnalysis(novelId);
  const totalChapters = chapters.length;

  const job = await ensureJob(novelId);
  if (RUNNING_STATUSES.has(job.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_RUNNING);
  }
  if (
    !RESUMABLE_STATUSES.has(job.status) &&
    !(
      (job.status === 'idle' || job.status === 'completed') &&
      job.totalChunks > 0
    )
  ) {
    throw new AnalysisJobStateError(AnalysisErrorCode.JOB_NOT_RESUMABLE);
  }

  const chunks = await loadChunks(novelId);
  if (!chunks.length) {
    throw new AnalysisJobStateError(AnalysisErrorCode.NO_RESUMABLE_CHUNKS);
  }

  const incompleteIndices = await findIncompleteChunkIndices(novelId, chunks);
  for (const chunk of chunks) {
    if (incompleteIndices.has(chunk.chunkIndex) || chunk.status === 'failed' || chunk.status === 'running') {
      chunk.status = 'pending';
      chunk.errorMessage = '';
      chunk.updatedAt = nowISO();
      await db.analysisChunks.put(chunk);
    }
  }

  const reloadedChunks = await loadChunks(novelId);
  const completedCount = reloadedChunks.filter(c => c.status === 'completed').length;
  const overview = await loadOverview(novelId);
  const overviewComplete = isOverviewComplete(overview, totalChapters);
  if (completedCount >= reloadedChunks.length && overviewComplete) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_COMPLETED);
  }

  const nextPending = reloadedChunks.find(c => c.status !== 'completed');
  const timestamp = nowISO();
  job.status = 'running';
  job.pauseRequested = false;
  job.completedAt = null;
  job.lastError = '';
  job.totalChunks = reloadedChunks.length;
  job.completedChunks = completedCount;
  job.totalChapters = totalChapters;
  job.analyzedChapters = await countCompleteChapterAnalyses(novelId);
  job.currentChunkIndex = nextPending ? nextPending.chunkIndex : reloadedChunks[reloadedChunks.length - 1].chunkIndex;
  job.lastHeartbeat = timestamp;
  job.updatedAt = timestamp;
  await db.analysisJobs.put(job);

  spawnRunner(novelId);
  return buildAnalysisStatusPayload(novelId);
}

export async function restartAnalysis(novelId: number): Promise<AnalysisStatusResponse> {
  await loadNovel(novelId);
  const runtimeConfig = await loadRuntimeConfig();
  const chapters = await loadPurifiedChaptersForAnalysis(novelId);
  const chunks = buildAnalysisChunks(chapters, runtimeConfig.contextSize);

  const job = await loadJob(novelId);
  if (job && RUNNING_STATUSES.has(job.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.PAUSE_FIRST);
  }

  await resetJobPlan(novelId, chapters.length, chunks);
  spawnRunner(novelId);
  return buildAnalysisStatusPayload(novelId);
}

export async function refreshOverview(novelId: number): Promise<AnalysisStatusResponse> {
  await loadNovel(novelId);
  await loadRuntimeConfig();
  const chapters = await loadPurifiedChaptersForAnalysis(novelId);
  const totalChapters = chapters.length;

  const job = await loadJob(novelId);
  if (job && RUNNING_STATUSES.has(job.status)) {
    throw new AnalysisJobStateError(AnalysisErrorCode.ANALYSIS_IN_PROGRESS);
  }

  const chunkRows = await loadChunks(novelId);
  if (!chunkRows.length) {
    throw new AnalysisJobStateError(AnalysisErrorCode.NO_REUSEABLE_RESULTS);
  }

  const incompleteIndices = await findIncompleteChunkIndices(novelId, chunkRows);
  if (incompleteIndices.size > 0) {
    throw new AnalysisJobStateError(AnalysisErrorCode.CHAPTERS_INCOMPLETE_FOR_OVERVIEW);
  }

  const chapterRows = await loadChapterAnalyses(novelId);
  if (chapterRows.length < totalChapters || chapterRows.some(r => !isChapterAnalysisComplete(r))) {
    throw new AnalysisJobStateError(AnalysisErrorCode.CHAPTERS_INCOMPLETE_FOR_OVERVIEW);
  }

  const overview = await loadOverview(novelId);
  if (overview) {
    await db.analysisOverviews.delete(overview.id);
  }

  let currentJob = job;
  if (!currentJob) {
    const id = await db.analysisJobs.add({
      novelId,
      status: 'running',
      totalChapters: 0,
      analyzedChapters: 0,
      totalChunks: 0,
      completedChunks: 0,
      currentChunkIndex: 0,
      pauseRequested: false,
      lastError: '',
      startedAt: null,
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: nowISO(),
    });
    currentJob = await db.analysisJobs.get(id);
    if (!currentJob) throw new AnalysisJobStateError(AnalysisErrorCode.JOB_CREATE_FAILED);
  }

  const timestamp = nowISO();
  currentJob.status = 'running';
  currentJob.pauseRequested = false;
  currentJob.completedAt = null;
  currentJob.lastError = '';
  currentJob.totalChunks = chunkRows.length;
  currentJob.completedChunks = chunkRows.length;
  currentJob.totalChapters = totalChapters;
  currentJob.analyzedChapters = chapterRows.length;
  currentJob.currentChunkIndex = chunkRows.length;
  currentJob.lastHeartbeat = timestamp;
  currentJob.updatedAt = timestamp;
  await db.analysisJobs.put(currentJob);

  spawnRunner(novelId);
  return buildAnalysisStatusPayload(novelId);
}

export async function analyzeSingleChapter(
  novelId: number,
  chapterIndex: number,
): Promise<ChapterAnalysisResult | null> {
  const runtimeConfig = await loadRuntimeConfig();
  const novel = await loadNovel(novelId);
  const chapters = await loadPurifiedChaptersForAnalysis(novelId);
  const chapter = chapters.find(ch => ch.chapterIndex === chapterIndex);
  if (!chapter) throw new AnalysisJobStateError(AnalysisErrorCode.CHAPTER_NOT_FOUND);

  const result = await runSingleChapterAnalysis(runtimeConfig, novel.title, chapter);
  if (result.chapterAnalyses.length === 0) return null;

  const item = result.chapterAnalyses[0];
  const existing = await db.chapterAnalyses
    .where('[novelId+chapterIndex]')
    .equals([novelId, chapterIndex])
    .first();
  const record: ChapterAnalysis = {
    id: existing?.id ?? (undefined as unknown as number),
    novelId,
    chapterIndex,
    chapterTitle: item.title || chapter.title || '',
    summary: item.summary,
    keyPoints: item.keyPoints,
    characters: item.characters,
    relationships: item.relationships,
    tags: item.tags,
    chunkIndex: -1,
    updatedAt: nowISO(),
  };
  if (existing) {
    record.id = existing.id;
    await db.chapterAnalyses.put(record);
  } else {
    await db.chapterAnalyses.add(record);
  }

  return serializeChapterAnalysisRow(record);
}

export async function getCharacterGraph(novelId: number): Promise<CharacterGraphResponse> {
  const chapters = await loadPurifiedChaptersForAnalysis(novelId);
  const chapterRows = await loadChapterAnalyses(novelId);
  const overview = await loadOverview(novelId);
  return buildCharacterGraphPayload(chapters, chapterRows, overview);
}

export async function getChapterAnalysis(
  novelId: number,
  chapterIndex: number,
): Promise<{ analysis: ChapterAnalysisResult | null }> {
  const row = await db.chapterAnalyses
    .where('[novelId+chapterIndex]')
    .equals([novelId, chapterIndex])
    .first();
  return { analysis: serializeChapterAnalysisRow(row) };
}

export async function getOverview(
  novelId: number,
): Promise<{ overview: ApiAnalysisOverview | null }> {
  const overview = await loadOverview(novelId);
  return { overview: serializeOverviewRow(overview) };
}
