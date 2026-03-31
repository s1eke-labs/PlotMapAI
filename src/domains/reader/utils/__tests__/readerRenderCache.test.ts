import { afterEach, describe, expect, it, vi } from 'vitest';

describe('readerRenderCache', () => {
  afterEach(() => {
    vi.doUnmock('@chenglou/pretext');
    vi.resetModules();
  });

  it('builds manifest summaries without invoking pretext measurement', async () => {
    const layoutWithLines = vi.fn(() => {
      throw new Error('manifest build should not invoke layoutWithLines');
    });
    const prepareWithSegments = vi.fn(() => {
      throw new Error('manifest build should not invoke prepareWithSegments');
    });

    vi.doMock('@chenglou/pretext', () => ({
      layoutWithLines,
      prepareWithSegments,
    }));

    const {
      createReaderLayoutSignature,
      createReaderTypographyMetrics,
      getPagedContentHeight,
      resetReaderLayoutPretextCacheForTests,
    } = await import('../readerLayout');
    const { buildStaticRenderManifest } = await import('../readerRenderCache');

    const chapter = {
      index: 2,
      title: 'Chapter 3',
      content: 'First paragraph for manifest estimation.\n[IMG:cover]\nSecond paragraph after the image.',
      hasNext: true,
      hasPrev: true,
      totalChapters: 6,
      wordCount: 180,
    };
    const imageDimensionsByKey = new Map([
      ['cover', { aspectRatio: 4 / 3, height: 900, width: 1200 }],
    ]);
    const typography = createReaderTypographyMetrics(18, 1.6, 16, 420);

    const scrollManifest = buildStaticRenderManifest({
      chapter,
      imageDimensionsByKey,
      layoutSignature: createReaderLayoutSignature({
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: 800,
        paragraphSpacing: 16,
        textWidth: 420,
      }),
      novelId: 7,
      typography,
      variantFamily: 'original-scroll',
    });

    const pagedManifest = buildStaticRenderManifest({
      chapter,
      imageDimensionsByKey,
      layoutSignature: createReaderLayoutSignature({
        columnCount: 2,
        columnGap: 32,
        fontSize: 18,
        lineSpacing: 1.6,
        pageHeight: getPagedContentHeight(800),
        paragraphSpacing: 16,
        textWidth: 280,
      }),
      novelId: 7,
      typography,
      variantFamily: 'original-paged',
    });

    expect(scrollManifest).toMatchObject({
      chapterIndex: 2,
      novelId: 7,
      storageKind: 'manifest',
      tree: null,
      variantFamily: 'original-scroll',
    });
    expect(scrollManifest.queryManifest).toEqual(expect.objectContaining({
      blockCount: 4,
      lineCount: expect.any(Number),
      totalHeight: expect.any(Number),
    }));
    expect(scrollManifest.queryManifest.startLocator).toMatchObject({
      blockIndex: 0,
      chapterIndex: 2,
      kind: 'heading',
      lineIndex: 0,
    });
    expect(scrollManifest.queryManifest.endLocator).toMatchObject({
      blockIndex: 3,
      chapterIndex: 2,
      kind: 'text',
    });

    expect(pagedManifest).toMatchObject({
      chapterIndex: 2,
      novelId: 7,
      storageKind: 'manifest',
      tree: null,
      variantFamily: 'original-paged',
    });
    expect(pagedManifest.queryManifest).toEqual(expect.objectContaining({
      blockCount: 4,
      lineCount: expect.any(Number),
      pageCount: expect.any(Number),
    }));
    expect(pagedManifest.queryManifest.pageCount).toBeGreaterThan(0);
    expect(prepareWithSegments).not.toHaveBeenCalled();
    expect(layoutWithLines).not.toHaveBeenCalled();

    resetReaderLayoutPretextCacheForTests();
  });
});
