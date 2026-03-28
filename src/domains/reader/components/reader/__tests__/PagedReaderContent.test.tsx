import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PagedReaderContent from '../PagedReaderContent';

const chapterSectionSpy = vi.hoisted(() => vi.fn());

vi.mock('../ReaderChapterSection', () => ({
  default: (props: unknown) => {
    chapterSectionSpy(props);
    return <div data-testid="reader-chapter-section" />;
  },
}));

describe('PagedReaderContent', () => {
  it('passes paged break rules that allow plain text paragraphs to split naturally', () => {
    render(
      <PagedReaderContent
        chapter={{
          index: 0,
          title: 'Chapter 1',
          content: 'Text',
          wordCount: 100,
          totalChapters: 1,
          hasPrev: false,
          hasNext: false,
        }}
        novelId={1}
        pageIndex={0}
        pageCount={2}
        pagedViewportRef={{ current: null }}
        pagedContentRef={{ current: null }}
        fontSize={18}
        lineSpacing={1.8}
        paragraphSpacing={24}
        readerTheme="auto"
        textClassName=""
        headerBgClassName=""
        fitsTwoColumns={false}
        twoColumnWidth={undefined}
        twoColumnGap={48}
      />,
    );

    const forwardedProps = chapterSectionSpy.mock.calls.at(-1)?.[0];

    expect(forwardedProps).toEqual(expect.objectContaining({
      headingClassName: expect.stringContaining('break-inside-avoid'),
      paragraphClassName: 'indent-8',
      mixedParagraphClassName: 'break-inside-avoid',
    }));
    expect(forwardedProps).not.toHaveProperty('blankParagraphClassName');
  });
});
