import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookDetailPage from '../BookDetailPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../../services/db';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('BookDetailPage', () => {
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
  });

  it('renders book details', async () => {
    render(
      <MemoryRouter initialEntries={['/novel/1']}>
        <Routes>
          <Route path="/novel/:id" element={<BookDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Mock Novel', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('bookDetail.description')).toBeInTheDocument();
  });
});
