import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReaderPage from '../ReaderPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';
import { db } from '../../services/db';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('ReaderPage', () => {
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
      content: 'Test chapter content for the reader.',
      chapterIndex: 0,
      wordCount: 100,
    });
  });

  it('renders reader layout', async () => {
    render(
      <MemoryRouter initialEntries={['/novel/1/read']}>
        <ThemeProvider>
          <Routes>
            <Route path="/novel/:id/read" element={<ReaderPage />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
  });
});
