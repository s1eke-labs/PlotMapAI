import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ChapterParagraph from '../ChapterParagraph';

vi.mock('../../api/readerApi', () => ({
  readerApi: {
    getImageUrl: vi.fn().mockResolvedValue(null),
  },
}));

describe('ChapterParagraph', () => {
  it('renders a pure text paragraph without a mixed-content wrapper', () => {
    const { container } = render(
      <ChapterParagraph
        text="Pure text"
        novelId={1}
        marginBottom={24}
        className="plain-paragraph"
        containerClassName="mixed-paragraph"
      />,
    );

    expect(screen.getByText('Pure text')).toHaveClass('plain-paragraph');
    expect(container.querySelector('.mixed-paragraph')).not.toBeInTheDocument();
  });

  it('keeps mixed paragraphs as intact blocks while preserving text styles', () => {
    const { container } = render(
      <ChapterParagraph
        text="Before [IMG:cover] After"
        novelId={1}
        marginBottom={24}
        className="plain-paragraph"
        containerClassName="mixed-paragraph"
      />,
    );

    const mixedContainer = container.querySelector('.mixed-paragraph');

    expect(mixedContainer).toBeInTheDocument();
    expect(mixedContainer?.querySelectorAll('p.plain-paragraph')).toHaveLength(2);
  });
});
