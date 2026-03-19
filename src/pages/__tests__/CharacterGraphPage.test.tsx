import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterGraphPage from '../CharacterGraphPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../../services/db';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('CharacterGraphPage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.novels.add({
      id: 1,
      title: 'Mock Novel',
      author: 'Test Author',
      description: 'A test novel',
      tags: '[]',
      fileType: 'txt',
      fileHash: 'abc123',
      coverPath: '',
      originalFilename: 'test.txt',
      originalEncoding: 'utf-8',
      totalWords: 1000,
      createdAt: new Date().toISOString(),
    });
    await db.chapters.add({
      id: 1,
      novelId: 1,
      title: 'Chapter 1',
      content: 'Test chapter content',
      chapterIndex: 0,
      wordCount: 100,
    });
    await db.chapterAnalyses.add({
      id: 1,
      novelId: 1,
      chapterIndex: 0,
      chapterTitle: 'Chapter 1',
      summary: 'A summary of chapter 1',
      keyPoints: '["key point 1"]',
      characters: JSON.stringify([{ name: 'Hero', role: 'protagonist', description: 'The main character', weight: 80 }]),
      relationships: '[]',
      tags: '["tag1"]',
      chunkIndex: 0,
      updatedAt: new Date().toISOString(),
    });
  });

  it('renders graph components', async () => {
    render(
      <MemoryRouter initialEntries={['/novel/1/graph']}>
        <Routes>
          <Route path="/novel/:id/graph" element={<CharacterGraphPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('characterGraph.title')).toBeInTheDocument();
    });
  });
});
