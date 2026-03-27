import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@infra/db';
import { parseBook } from '../../services/bookParser';
import { bookImportApi } from '../bookImportApi';

vi.mock('../../services/bookParser', () => ({
  parseBook: vi.fn().mockResolvedValue({
    title: 'Parsed Novel',
    author: 'Parsed Author',
    description: 'Parsed desc',
    coverBlob: null,
    chapters: [{ title: 'Ch1', content: 'Content 1' }, { title: 'Ch2', content: 'Content 2' }],
    rawText: 'Content 1\nContent 2',
    encoding: 'utf-8',
    totalWords: 20,
    fileHash: 'parsedhash',
    tags: ['fiction'],
    images: [],
  }),
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultTocRules: vi.fn().mockResolvedValue(undefined),
}));

describe('bookImportApi', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  it('upload creates novel and chapters', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const novel = await bookImportApi.importBook(file);
    expect(novel.title).toBe('Parsed Novel');
    expect(novel.chapterCount).toBe(2);
  });

  it('upload throws for unsupported file type', async () => {
    const file = new File(['data'], 'test.pdf', { type: 'application/pdf' });
    await expect(bookImportApi.importBook(file)).rejects.toThrow('Only .txt and .epub files are supported');
  });

  it('maps enabled toc rules to parseBook with default/custom sources preserved', async () => {
    await db.tocRules.bulkAdd([
      {
        id: undefined as unknown as number,
        name: 'Default Rule',
        rule: '^第\\d+章',
        example: '第1章 开始',
        serialNumber: 1,
        enable: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: undefined as unknown as number,
        name: 'Custom Rule',
        rule: '^\\d+[.、:：]\\s*.+$',
        example: '1. 开始',
        serialNumber: 2,
        enable: true,
        isDefault: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: undefined as unknown as number,
        name: 'Disabled Rule',
        rule: '^Chapter\\s+\\d+',
        example: 'Chapter 1',
        serialNumber: 3,
        enable: false,
        isDefault: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    await bookImportApi.importBook(file);

    expect(vi.mocked(parseBook)).toHaveBeenCalledWith(
      file,
      [
        { rule: '^第\\d+章', source: 'default' },
        { rule: '^\\d+[.、:：]\\s*.+$', source: 'custom' },
      ],
      expect.any(Object),
    );
  });
});
