import type { NovelRecord } from '@infra/db/library';

import { db } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';

import { mapNovelRecordToView } from './mappers';
import { clearNovelCoverResourcesForNovel } from './utils/novelCoverResourceCache';

export interface NovelView {
  id: number;
  title: string;
  author: string;
  description: string;
  tags: string[];
  fileType: string;
  hasCover: boolean;
  originalFilename: string;
  originalEncoding: string;
  totalWords: number;
  chapterCount: number;
  createdAt: string;
}

interface LegacyNovelRecord extends Omit<NovelRecord, 'chapterCount'> {
  chapterCount?: number;
}

function hasStoredChapterCount(novel: LegacyNovelRecord): novel is NovelRecord {
  return Number.isFinite(novel.chapterCount);
}

async function buildChapterCountMap(novelIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  for (const novelId of novelIds) {
    counts.set(novelId, 0);
  }

  if (novelIds.length === 0) {
    return counts;
  }

  const chapters = await db.chapters.where('novelId').anyOf(novelIds).toArray();
  for (const chapter of chapters) {
    counts.set(chapter.novelId, (counts.get(chapter.novelId) ?? 0) + 1);
  }

  return counts;
}

async function persistChapterCounts(counts: Map<number, number>): Promise<void> {
  if (counts.size === 0) {
    return;
  }

  await Promise.all(Array.from(counts.entries()).map(async ([novelId, chapterCount]) => {
    await db.novels.update(novelId, { chapterCount });
  }));
}

async function ensureStoredChapterCounts(
  novels: LegacyNovelRecord[],
): Promise<NovelRecord[]> {
  const missingIds = novels
    .filter((novel) => !hasStoredChapterCount(novel))
    .map((novel) => novel.id);

  if (missingIds.length === 0) {
    return novels.map((novel) => ({
      ...novel,
      chapterCount: novel.chapterCount ?? 0,
    }));
  }

  const counts = await buildChapterCountMap(missingIds);
  await persistChapterCounts(counts);

  return novels.map((novel) => {
    if (hasStoredChapterCount(novel)) {
      return novel;
    }

    return {
      ...novel,
      chapterCount: counts.get(novel.id) ?? 0,
    };
  });
}

export const novelRepository = {
  async list(): Promise<NovelView[]> {
    const novels = await db.novels.orderBy('createdAt').reverse().toArray();
    const normalizedNovels = await ensureStoredChapterCounts(novels);

    return normalizedNovels.map((novel) => mapNovelRecordToView(novel));
  },

  async get(id: number): Promise<NovelView> {
    const novel = await db.novels.get(id) as LegacyNovelRecord | undefined;
    if (!novel) {
      throw createAppError({
        code: AppErrorCode.NOVEL_NOT_FOUND,
        kind: 'not-found',
        source: 'library',
        userMessageKey: 'errors.NOVEL_NOT_FOUND',
        debugMessage: 'Novel not found',
        details: { novelId: id },
      });
    }

    if (hasStoredChapterCount(novel)) {
      return mapNovelRecordToView(novel);
    }

    const chapterCount = await db.chapters.where('novelId').equals(id).count();
    await db.novels.update(id, { chapterCount });

    return mapNovelRecordToView({
      ...novel,
      chapterCount,
    });
  },

  async delete(id: number): Promise<{ message: string }> {
    await db.transaction(
      'rw',
      [
        db.novels,
        db.chapters,
        db.coverImages,
        db.chapterImages,
        db.novelImageGalleryEntries,
      ],
      async () => {
        await db.novels.delete(id);
        await db.chapters.where('novelId').equals(id).delete();
        await db.coverImages.where('novelId').equals(id).delete();
        await db.chapterImages.where('novelId').equals(id).delete();
        await db.novelImageGalleryEntries.where('novelId').equals(id).delete();
      },
    );

    clearNovelCoverResourcesForNovel(id);

    return { message: 'Novel deleted' };
  },
};
