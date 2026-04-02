import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';

import { novelRepository } from '../novelRepository';
import {
  acquireNovelCoverResource,
  peekNovelCoverResource,
  resetNovelCoverResourceCacheForTests,
} from '../utils/novelCoverResourceCache';

interface LegacyNovelRecordFixture {
  author: string;
  coverPath: string;
  createdAt: string;
  description: string;
  fileHash: string;
  fileType: string;
  originalEncoding: string;
  originalFilename: string;
  tags: string[];
  title: string;
  totalWords: number;
}

function createNovelRecordFixture(overrides: Partial<LegacyNovelRecordFixture & {
  chapterCount: number;
}> = {}) {
  return {
    author: '',
    coverPath: '',
    createdAt: '2026-04-01T00:00:00.000Z',
    description: '',
    fileHash: 'fixture-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'fixture.txt',
    tags: [],
    title: 'Fixture Novel',
    totalWords: 100,
    chapterCount: 0,
    ...overrides,
  };
}

function createLegacyNovelRecordFixture(
  overrides: Partial<LegacyNovelRecordFixture> = {},
): LegacyNovelRecordFixture {
  return {
    author: '',
    coverPath: '',
    createdAt: '2026-04-01T00:00:00.000Z',
    description: '',
    fileHash: 'legacy-hash',
    fileType: 'txt',
    originalEncoding: 'utf-8',
    originalFilename: 'legacy.txt',
    tags: [],
    title: 'Legacy Novel',
    totalWords: 100,
    ...overrides,
  };
}

describe('novelRepository', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete();
    await db.open();
    resetNovelCoverResourceCacheForTests();
    URL.createObjectURL = vi.fn(() => 'blob:cover-url') as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    resetNovelCoverResourceCacheForTests();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('lists novels sorted by createdAt descending and reads stored chapterCount', async () => {
    await db.novels.add(createNovelRecordFixture({
      chapterCount: 4,
      createdAt: '2026-04-01T00:00:00.000Z',
      fileHash: 'first-hash',
      originalFilename: 'first.txt',
      title: 'First',
    }));
    await db.novels.add(createNovelRecordFixture({
      chapterCount: 12,
      createdAt: '2026-04-02T00:00:00.000Z',
      fileHash: 'second-hash',
      originalFilename: 'second.txt',
      title: 'Second',
    }));

    const result = await novelRepository.list();

    expect(result.map((novel) => novel.title)).toEqual(['Second', 'First']);
    expect(result.map((novel) => novel.chapterCount)).toEqual([12, 4]);
  });

  it('gets a novel by id and returns the stored chapterCount', async () => {
    const id = await db.novels.add(createNovelRecordFixture({
      author: 'Auth',
      chapterCount: 5,
      description: 'Desc',
      fileHash: 'get-hash',
      originalFilename: 'get.txt',
      tags: ['tag1'],
      title: 'Get Test',
      totalWords: 500,
    }));

    const novel = await novelRepository.get(id);

    expect(novel).toMatchObject({
      chapterCount: 5,
      tags: ['tag1'],
      title: 'Get Test',
    });
  });

  it('backfills missing chapterCount values in list() and persists them', async () => {
    const legacyNovelId = await db.table('novels').add(createLegacyNovelRecordFixture({
      createdAt: '2026-04-03T00:00:00.000Z',
      fileHash: 'legacy-list-hash',
      originalFilename: 'legacy-list.txt',
      title: 'Legacy List Novel',
    })) as number;
    await db.chapters.bulkAdd([
      {
        chapterIndex: 0,
        content: 'c1',
        novelId: legacyNovelId,
        title: 'Chapter 1',
        wordCount: 2,
      },
      {
        chapterIndex: 1,
        content: 'c2',
        novelId: legacyNovelId,
        title: 'Chapter 2',
        wordCount: 2,
      },
    ]);

    const novels = await novelRepository.list();
    const storedNovel = await db.novels.get(legacyNovelId);

    expect(novels[0]).toMatchObject({
      id: legacyNovelId,
      chapterCount: 2,
      title: 'Legacy List Novel',
    });
    expect(storedNovel?.chapterCount).toBe(2);
  });

  it('backfills missing chapterCount in get() and persists it', async () => {
    const legacyNovelId = await db.table('novels').add(createLegacyNovelRecordFixture({
      fileHash: 'legacy-get-hash',
      originalFilename: 'legacy-get.txt',
      title: 'Legacy Get Novel',
    })) as number;
    await db.chapters.bulkAdd([
      {
        chapterIndex: 0,
        content: 'c1',
        novelId: legacyNovelId,
        title: 'Chapter 1',
        wordCount: 2,
      },
      {
        chapterIndex: 1,
        content: 'c2',
        novelId: legacyNovelId,
        title: 'Chapter 2',
        wordCount: 2,
      },
      {
        chapterIndex: 2,
        content: 'c3',
        novelId: legacyNovelId,
        title: 'Chapter 3',
        wordCount: 2,
      },
    ]);

    const novel = await novelRepository.get(legacyNovelId);
    const storedNovel = await db.novels.get(legacyNovelId);

    expect(novel.chapterCount).toBe(3);
    expect(storedNovel?.chapterCount).toBe(3);
  });

  it('deletes only the library aggregate and leaves reader and analysis state alone', async () => {
    const id = await db.novels.add(createNovelRecordFixture({
      chapterCount: 1,
      coverPath: 'has_cover',
      fileHash: 'delete-hash',
      originalFilename: 'delete.txt',
      title: 'Delete Me',
    }));
    await db.chapters.add({
      chapterIndex: 0,
      content: 'chapter',
      novelId: id,
      title: 'Ch',
      wordCount: 7,
    });
    await db.coverImages.add({
      blob: new Blob(['cover']),
      novelId: id,
    });
    await db.chapterImages.add({
      blob: new Blob(['image']),
      imageKey: 'hero',
      novelId: id,
    });
    await db.novelImageGalleryEntries.add({
      blockIndex: 1,
      chapterIndex: 0,
      imageKey: 'hero',
      novelId: id,
      order: 0,
    });
    await db.readingProgress.add({
      chapterIndex: 3,
      mode: 'scroll',
      novelId: id,
      updatedAt: new Date().toISOString(),
    });
    await db.readerRenderCache.add({
      chapterIndex: 0,
      contentHash: 'content-hash',
      expiresAt: '2026-04-16T00:00:00.000Z',
      layoutKey: 'summary-shell:base',
      layoutSignature: {
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: 720,
        paragraphSpacing: 16,
        textWidth: 360,
      },
      novelId: id,
      queryManifest: {
        blockCount: 2,
        lineCount: 4,
        totalHeight: 120,
      },
      storageKind: 'manifest',
      tree: null,
      updatedAt: '2026-04-02T00:00:00.000Z',
      variantFamily: 'summary-shell',
    });

    await novelRepository.delete(id);

    await expect(db.novels.count()).resolves.toBe(0);
    await expect(db.chapters.count()).resolves.toBe(0);
    await expect(db.coverImages.count()).resolves.toBe(0);
    await expect(db.chapterImages.count()).resolves.toBe(0);
    await expect(db.novelImageGalleryEntries.count()).resolves.toBe(0);
    await expect(db.readingProgress.count()).resolves.toBe(1);
    await expect(db.readerRenderCache.count()).resolves.toBe(1);
  });

  it('releases an acquired cover resource when deleting a novel', async () => {
    const id = await db.novels.add(createNovelRecordFixture({
      chapterCount: 1,
      coverPath: 'has_cover',
      fileHash: 'cover-delete-hash',
      originalFilename: 'cover-delete.txt',
      title: 'Cover Novel',
    }));
    await db.coverImages.add({
      blob: new Blob(['cover']),
      novelId: id,
    });

    await acquireNovelCoverResource(id);
    expect(peekNovelCoverResource(id)).toBe('blob:cover-url');

    await novelRepository.delete(id);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover-url');
    expect(peekNovelCoverResource(id)).toBeUndefined();
  });
});
