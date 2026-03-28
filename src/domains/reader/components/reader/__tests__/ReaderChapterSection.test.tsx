import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReaderChapterSection from '../ReaderChapterSection';

vi.mock('../../../api/readerApi', () => ({
  readerApi: {
    getImageUrl: vi.fn().mockResolvedValue(null),
  },
}));

describe('ReaderChapterSection', () => {
  it('renders the chapter heading once and skips a duplicated title paragraph', () => {
    const { container } = render(
      <ReaderChapterSection
        title="Chapter 1"
        content={'Chapter 1\n\nFirst paragraph\nSecond paragraph'}
        novelId={1}
        paragraphSpacing={24}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByText('Chapter 1')).toHaveLength(1);
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph')).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it('forwards distinct classes for plain, mixed, and blank paragraphs', () => {
    const { container } = render(
      <ReaderChapterSection
        title="Chapter 1"
        content={'Chapter 1\n\nPlain paragraph\nBefore [IMG:cover] After'}
        novelId={1}
        paragraphSpacing={24}
        paragraphClassName="plain-paragraph"
        mixedParagraphClassName="mixed-paragraph"
        blankParagraphClassName="blank-paragraph"
      />,
    );

    expect(screen.getByText('Plain paragraph')).toHaveClass('plain-paragraph');
    expect(container.querySelectorAll('.blank-paragraph')).toHaveLength(1);
    expect(container.querySelector('.mixed-paragraph')).toBeInTheDocument();
  });
});
