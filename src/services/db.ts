import Dexie, { type EntityTable } from 'dexie';
import yaml from 'js-yaml';
import defaultTocRulesRaw from './defaultTocRules.yaml?raw';

interface DefaultTocRule {
  name: string;
  rule: string;
  example: string;
  serialNumber: number;
  enable: boolean;
}

const defaultTocRules: DefaultTocRule[] = yaml.load(defaultTocRulesRaw) as DefaultTocRule[];

export interface Novel {
  id: number;
  title: string;
  author: string;
  description: string;
  tags: string;
  fileType: string;
  fileHash: string;
  coverPath: string;
  originalFilename: string;
  originalEncoding: string;
  totalWords: number;
  createdAt: string;
}

export interface Chapter {
  id: number;
  novelId: number;
  title: string;
  content: string;
  chapterIndex: number;
  wordCount: number;
}

export interface TocRule {
  id: number;
  name: string;
  rule: string;
  example: string;
  serialNumber: number;
  enable: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface PurificationRule {
  id: number;
  externalId: number | null;
  name: string;
  group: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  isEnabled: boolean;
  order: number;
  scopeTitle: boolean;
  scopeContent: boolean;
  bookScope: string;
  excludeBookScope: string;
  timeoutMs: number;
  createdAt: string;
}

export interface ReadingProgress {
  id: number;
  novelId: number;
  chapterIndex: number;
  scrollPosition: number;
  viewMode: string;
  updatedAt: string;
}

export interface AnalysisJob {
  id: number;
  novelId: number;
  status: string;
  totalChapters: number;
  analyzedChapters: number;
  totalChunks: number;
  completedChunks: number;
  currentChunkIndex: number;
  pauseRequested: boolean;
  lastError: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeat: string | null;
  updatedAt: string;
}

export interface AnalysisChunk {
  id: number;
  novelId: number;
  chunkIndex: number;
  startChapterIndex: number;
  endChapterIndex: number;
  chapterIndices: number[];
  status: string;
  chunkSummary: string;
  errorMessage: string;
  updatedAt: string;
}

export interface ChapterAnalysis {
  id: number;
  novelId: number;
  chapterIndex: number;
  chapterTitle: string;
  summary: string;
  keyPoints: string;
  characters: string;
  relationships: string;
  tags: string;
  chunkIndex: number;
  updatedAt: string;
}

export interface AnalysisOverview {
  id: number;
  novelId: number;
  bookIntro: string;
  globalSummary: string;
  themes: string;
  characterStats: string;
  relationshipGraph: string;
  totalChapters: number;
  analyzedChapters: number;
  updatedAt: string;
}

export interface CoverImage {
  id: number;
  novelId: number;
  blob: Blob;
}

export interface ChapterImage {
  id: number;
  novelId: number;
  imageKey: string;
  blob: Blob;
}

const db = new Dexie('PlotMapAI') as Dexie & {
  novels: EntityTable<Novel, 'id'>;
  chapters: EntityTable<Chapter, 'id'>;
  tocRules: EntityTable<TocRule, 'id'>;
  purificationRules: EntityTable<PurificationRule, 'id'>;
  readingProgress: EntityTable<ReadingProgress, 'id'>;
  analysisJobs: EntityTable<AnalysisJob, 'id'>;
  analysisChunks: EntityTable<AnalysisChunk, 'id'>;
  chapterAnalyses: EntityTable<ChapterAnalysis, 'id'>;
  analysisOverviews: EntityTable<AnalysisOverview, 'id'>;
  coverImages: EntityTable<CoverImage, 'id'>;
  chapterImages: EntityTable<ChapterImage, 'id'>;
};

db.version(1).stores({
  novels: '++id, createdAt',
  chapters: '++id, novelId, [novelId+chapterIndex]',
  tocRules: '++id, serialNumber',
  purificationRules: '++id, order, isEnabled',
  readingProgress: '++id, novelId',
  analysisJobs: '++id, novelId',
  analysisChunks: '++id, novelId, [novelId+chunkIndex]',
  chapterAnalyses: '++id, novelId, [novelId+chapterIndex]',
  analysisOverviews: '++id, novelId',
  coverImages: '++id, novelId',
});

db.version(2).stores({
  tocRules: '++id, serialNumber, enable',
});

db.version(3).stores({
  novelRawContent: null,
});

db.version(4).stores({
  chapterImages: '++id, novelId, [novelId+imageKey]',
});

export async function ensureDefaultTocRules(): Promise<void> {
  const count = await db.tocRules.count();
  if (count > 0) return;
  const now = new Date().toISOString();
  for (const rule of defaultTocRules) {
    await db.tocRules.add({
      id: undefined as unknown as number,
      name: rule.name,
      rule: rule.rule,
      example: rule.example,
      serialNumber: rule.serialNumber,
      enable: rule.enable,
      isDefault: true,
      createdAt: now,
    });
  }
}

export { db };
