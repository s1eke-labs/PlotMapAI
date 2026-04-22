import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import {
  buildLongTestEpubFile,
  buildMultiChapterTestEpubFile,
  LONG_BOOK_TITLE,
  MULTI_CHAPTER_BOOK_CHAPTER_TITLES,
  MULTI_CHAPTER_BOOK_TITLE,
} from '../fixtures/testEpubFile';
import {
  clickNextPageResponsive,
  disableAnimations,
  exitAndReopenReader,
  exitReaderToDetailPage,
  hideReaderChromeResponsive,
  importEpubToDetailPage,
  navigateToChapterByTitleResponsive,
  openReaderDirect,
  openReaderFromDetailPage,
  readPersistedReadingProgress,
  readReaderViewportSnapshot,
  readVisibleContentAnchor,
  revealReaderChromeResponsive,
  setReaderPreferences,
  waitForPersistedReadingProgress,
  waitForReaderBranch,
} from '../helpers/readerVisualHarness';

interface ReadingMarker {
  anchorSnippet: string;
  chapterIndex: number | null;
  contentMode: 'paged' | 'scroll';
  pageIndex: number | null;
}

const MAX_CROSS_CHAPTER_STEPS = 18;

async function waitForViewportScrollable(page: Page): Promise<void> {
  await expect.poll(async () => {
    return page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
      return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    });
  }, {
    timeout: 20_000,
    message: 'Expected reader-viewport to have a non-zero scrollable range',
  }).toBeGreaterThan(0);
}

async function scrollViewportToProgress(page: Page, progress: number): Promise<void> {
  await waitForViewportScrollable(page);
  await page.getByTestId('reader-viewport').evaluate((element, nextProgress) => {
    const viewport = element as HTMLElement;
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = Math.round(maxScrollTop * nextProgress);
    viewport.dispatchEvent(new Event('scroll'));
  }, progress);
}

async function scrollViewportByPixels(page: Page, deltaY: number): Promise<void> {
  await waitForViewportScrollable(page);
  await page.getByTestId('reader-viewport').evaluate((element, nextDeltaY) => {
    const viewport = element as HTMLElement;
    viewport.scrollTop += nextDeltaY;
    viewport.dispatchEvent(new Event('scroll'));
  }, deltaY);
}

async function waitForScrollProgress(
  page: Page,
  novelId: number,
  minimumProgress: number,
  description: string,
) {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'scroll'
      && (snapshot.chapterProgress ?? 0) >= minimumProgress,
    { description, timeout: 15_000 },
  );
}

async function waitForPagedProgress(
  page: Page,
  novelId: number,
  minimumPageIndex: number,
  description: string,
) {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'paged'
      && (snapshot.pageIndex ?? 0) >= minimumPageIndex,
    { description, timeout: 15_000 },
  );
}

async function waitForExactPagedProgress(
  page: Page,
  novelId: number,
  expectedPageIndex: number,
  description: string,
) {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'paged'
      && snapshot.pageIndex === expectedPageIndex,
    { description, timeout: 15_000 },
  );
}

async function waitForConvergedPagedProgressAndViewport(
  page: Page,
  novelId: number,
  description: string,
  expectedPageIndex?: number,
): Promise<{
  progress: NonNullable<Awaited<ReturnType<typeof readPersistedReadingProgress>>>;
  snapshot: Awaited<ReturnType<typeof readReaderViewportSnapshot>>;
}> {
  let progress: Awaited<ReturnType<typeof readPersistedReadingProgress>> = null;
  let snapshot: Awaited<ReturnType<typeof readReaderViewportSnapshot>> | null = null;

  await expect.poll(async () => {
    [snapshot, progress] = await Promise.all([
      readReaderViewportSnapshot(page),
      readPersistedReadingProgress(page, novelId),
    ]);

    if (
      snapshot.branch !== 'paged'
      || snapshot.currentPageIndex === null
      || progress?.contentMode !== 'paged'
      || progress.pageIndex !== snapshot.currentPageIndex
    ) {
      return false;
    }

    if (expectedPageIndex !== undefined && snapshot.currentPageIndex !== expectedPageIndex) {
      return false;
    }

    return true;
  }, {
    message: description,
    timeout: 15_000,
  }).toBe(true);

  if (!snapshot || !progress) {
    throw new Error(`${description}: paged progress/viewport did not converge.`);
  }

  return {
    progress,
    snapshot,
  };
}

function requirePagedPageIndex(marker: ReadingMarker, context: string): number {
  if (typeof marker.pageIndex !== 'number') {
    throw new Error(`${context}: paged marker.pageIndex is not a number.`);
  }

  return marker.pageIndex;
}

async function readAnchorSnippet(page: Page): Promise<string> {
  let anchor: Awaited<ReturnType<typeof readVisibleContentAnchor>> = null;

  await expect.poll(async () => {
    anchor = await readVisibleContentAnchor(page);
    return anchor?.textSnippet?.length ? anchor.textSnippet : null;
  }, {
    timeout: 15_000,
  }).not.toBeNull();

  return anchor!.textSnippet;
}

async function captureMarker(
  page: Page,
  novelId: number,
  contentMode: 'paged' | 'scroll',
): Promise<ReadingMarker> {
  const anchorSnippet = await readAnchorSnippet(page);
  const persisted = await waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null && snapshot.contentMode === contentMode,
    { description: `capture ${contentMode} marker`, timeout: 15_000 },
  );

  return {
    anchorSnippet,
    chapterIndex: persisted.canonical.chapterIndex,
    contentMode,
    pageIndex: persisted.pageIndex,
  };
}

async function capturePagedMarker(page: Page, novelId: number): Promise<ReadingMarker> {
  const { progress, snapshot } = await waitForConvergedPagedProgressAndViewport(
    page,
    novelId,
    'capture paged progress/viewport convergence',
  );
  const anchorSnippet = await readAnchorSnippet(page);

  return {
    anchorSnippet,
    chapterIndex: progress.canonical.chapterIndex,
    contentMode: 'paged',
    pageIndex: snapshot.currentPageIndex,
  };
}

async function expectPagedMarkerRestored(
  page: Page,
  novelId: number,
  marker: ReadingMarker,
  description: string,
): Promise<void> {
  const expectedPageIndex = requirePagedPageIndex(marker, description);
  const restoredProgress = await waitForExactPagedProgress(
    page,
    novelId,
    expectedPageIndex,
    `${description} persisted pageIndex=${expectedPageIndex}`,
  );
  const { snapshot: restoredSnapshot } = await waitForConvergedPagedProgressAndViewport(
    page,
    novelId,
    `${description} progress/viewport pageIndex=${expectedPageIndex}`,
    expectedPageIndex,
  );

  expect(restoredProgress.pageIndex).toBe(expectedPageIndex);
  expect(restoredSnapshot.currentPageIndex).toBe(expectedPageIndex);
}

async function expectViewportContainsSnippet(page: Page, snippet: string): Promise<void> {
  await expect(
    page.getByTestId('reader-viewport').getByText(snippet, { exact: false }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

async function expectViewportNotContainsSnippet(page: Page, snippet: string): Promise<void> {
  const isVisible = await page.getByTestId('reader-viewport').getByText(snippet, { exact: false }).first()
    .isVisible()
    .catch(() => false);
  expect(isVisible).toBe(false);
}

async function advancePagedPages(page: Page, pageCount: number): Promise<void> {
  await hideReaderChromeResponsive(page);
  for (let index = 0; index < pageCount; index += 1) {
    await clickNextPageResponsive(page);
  }
}

async function switchReaderBranch(page: Page, branch: 'paged' | 'scroll'): Promise<void> {
  const targetModeLabel = branch === 'paged' ? 'Slide' : 'Vertical';
  await revealReaderChromeResponsive(page);
  const pageTurnButton = page.locator('button[title="Page Turn"]:visible').first();
  await pageTurnButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  const modeButton = page.locator(`button[title="${targetModeLabel}"]:visible`).first();
  await expect(modeButton).toBeVisible({ timeout: 8_000 });
  await modeButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await waitForReaderBranch(page, branch);
  await hideReaderChromeResponsive(page);
}

async function scrollUntilChapterReached(
  page: Page,
  novelId: number,
  targetChapterIndex: number,
): Promise<void> {
  let latestRevision = (await readPersistedReadingProgress(page, novelId))?.revision ?? 0;

  for (let step = 0; step < MAX_CROSS_CHAPTER_STEPS; step += 1) {
    await page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
      viewport.scrollTop += Math.max(120, Math.round(viewport.clientHeight * 0.85));
      viewport.dispatchEvent(new Event('scroll'));
    });

    const previousRevision = latestRevision;
    const persisted = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null && (snapshot.revision ?? 0) > previousRevision,
      { description: `advance scroll to chapter ${targetChapterIndex}`, timeout: 15_000 },
    );
    latestRevision = persisted.revision ?? latestRevision;

    if ((persisted.canonical.chapterIndex ?? 0) >= targetChapterIndex) {
      return;
    }
  }

  throw new Error(`Failed to reach chapter index ${targetChapterIndex} in scroll mode.`);
}

async function advancePagedUntilChapterReached(
  page: Page,
  novelId: number,
  targetChapterIndex: number,
): Promise<void> {
  let latestRevision = (await readPersistedReadingProgress(page, novelId))?.revision ?? 0;

  for (let step = 0; step < MAX_CROSS_CHAPTER_STEPS; step += 1) {
    await clickNextPageResponsive(page);
    const previousRevision = latestRevision;
    const persisted = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null && (snapshot.revision ?? 0) > previousRevision,
      { description: `advance paged to chapter ${targetChapterIndex}`, timeout: 15_000 },
    );
    latestRevision = persisted.revision ?? latestRevision;

    if ((persisted.canonical.chapterIndex ?? 0) >= targetChapterIndex) {
      return;
    }
  }

  throw new Error(`Failed to reach chapter index ${targetChapterIndex} in paged mode.`);
}

async function openBookFromBookshelf(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await disableAnimations(page);
  await page.getByRole('link', { name: title }).click();
  await disableAnimations(page);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
}

async function reopenFromBookshelf(page: Page, title: string): Promise<void> {
  await exitReaderToDetailPage(page);
  await page.getByRole('link', { name: 'Back' }).first().click();
  await disableAnimations(page);
  await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: title }).click();
  await disableAnimations(page);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
  await openReaderFromDetailPage(page);
}

test.describe('移动端阅读会话恢复', () => {
  test('TC-001 滚动模式下退出重进，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.42);
    await waitForScrollProgress(page, novelId, 0.15, 'mobile scroll progress persisted');
    const marker = await captureMarker(page, novelId, 'scroll');

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.15, 'mobile scroll progress restored');

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-002 翻页模式下退出重进，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    await clickNextPageResponsive(page);
    await clickNextPageResponsive(page);
    await clickNextPageResponsive(page);
    await waitForPagedProgress(page, novelId, 2, 'mobile paged progress persisted');
    const marker = await capturePagedMarker(page, novelId);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');
    await expectPagedMarkerRestored(page, novelId, marker, 'mobile paged progress restored');

    expect(requirePagedPageIndex(marker, 'TC-002 baseline marker')).toBeGreaterThanOrEqual(2);
    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-003 从滚动模式切换到翻页模式后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.38);
    await waitForScrollProgress(page, novelId, 0.15, 'scroll progress persisted before mode switch');
    await captureMarker(page, novelId, 'scroll');

    await switchReaderBranch(page, 'paged');
    await advancePagedPages(page, 2);
    await waitForPagedProgress(page, novelId, 1, 'paged progress persisted after mode switch');
    const pagedMarker = await capturePagedMarker(page, novelId);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');
    await expectPagedMarkerRestored(page, novelId, pagedMarker, 'paged progress restored after reopen');

    await expectViewportContainsSnippet(page, pagedMarker.anchorSnippet);
  });

  test('TC-004 从翻页模式切换到滚动模式后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    await advancePagedPages(page, 3);
    await waitForPagedProgress(page, novelId, 2, 'paged progress persisted before scroll switch');
    await captureMarker(page, novelId, 'paged');

    await switchReaderBranch(page, 'scroll');
    await scrollViewportByPixels(page, 480);
    await waitForScrollProgress(page, novelId, 0.15, 'scroll progress persisted after mode switch');
    const scrollMarker = await captureMarker(page, novelId, 'scroll');

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.15, 'scroll progress restored after reopen');

    await expectViewportContainsSnippet(page, scrollMarker.anchorSnippet);
  });

  test('TC-005 滚动模式下跨章节后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollUntilChapterReached(page, novelId, 1);
    await scrollViewportByPixels(page, 120);
    const marker = await captureMarker(page, novelId, 'scroll');

    expect(marker.chapterIndex).toBe(1);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'scroll chapter 2 restored', timeout: 15_000 },
    );

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-006 翻页模式下跨章节后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    await advancePagedUntilChapterReached(page, novelId, 1);
    await advancePagedPages(page, 1);
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'paged'
        && snapshot.canonical.chapterIndex === 1
        && (snapshot.pageIndex ?? 0) >= 1,
      { description: 'paged chapter 2 baseline persisted before capture', timeout: 15_000 },
    );
    const marker = await capturePagedMarker(page, novelId);
    const expectedPageIndex = requirePagedPageIndex(marker, 'TC-006 baseline marker');

    expect(marker.chapterIndex).toBe(1);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');
    await expectPagedMarkerRestored(page, novelId, marker, 'paged chapter 2 restored');

    expect(expectedPageIndex).toBe(requirePagedPageIndex(marker, 'TC-006 restored marker'));
    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-007 通过目录跳转章节后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await navigateToChapterByTitleResponsive(page, MULTI_CHAPTER_BOOK_CHAPTER_TITLES[1]);
    await waitForReaderBranch(page, 'scroll');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'toc jump persisted to chapter 2', timeout: 15_000 },
    );
    await scrollViewportToProgress(page, 0.3);
    const marker = await captureMarker(page, novelId, 'scroll');

    expect(marker.chapterIndex).toBe(1);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'jumped chapter restored', timeout: 15_000 },
    );

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-008 返回书架后重新打开，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.52);
    await waitForScrollProgress(page, novelId, 0.2, 'scroll progress persisted before bookshelf reopen');
    const marker = await captureMarker(page, novelId, 'scroll');

    await reopenFromBookshelf(page, LONG_BOOK_TITLE);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.2, 'scroll progress restored after bookshelf reopen');

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-009 刷新页面后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    await advancePagedPages(page, 3);
    await waitForPagedProgress(page, novelId, 2, 'paged progress persisted before reload');
    const marker = await capturePagedMarker(page, novelId);

    await page.reload();
    await disableAnimations(page);
    await waitForReaderBranch(page, 'paged');
    await expectPagedMarkerRestored(page, novelId, marker, 'paged progress restored after reload');

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-010 多次切换阅读方式后，以最后一次阅读位置为准恢复', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.28);
    await waitForScrollProgress(page, novelId, 0.1, 'first scroll progress persisted');
    await captureMarker(page, novelId, 'scroll');

    await switchReaderBranch(page, 'paged');
    await advancePagedPages(page, 2);
    await waitForPagedProgress(page, novelId, 1, 'paged progress persisted in multi-switch');
    await captureMarker(page, novelId, 'paged');

    await switchReaderBranch(page, 'scroll');
    await scrollViewportByPixels(page, 560);
    await waitForScrollProgress(page, novelId, 0.2, 'final scroll progress persisted');
    const finalMarker = await captureMarker(page, novelId, 'scroll');

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.2, 'final scroll progress restored');

    await expectViewportContainsSnippet(page, finalMarker.anchorSnippet);
  });

  test('TC-011 不同书籍之间的阅读记录互不影响', async ({ page }) => {
    const firstBook = {
      chapterTitle: 'Corridor A',
      title: 'Long Scroll Register A',
    };
    const secondBook = {
      chapterTitle: 'Corridor B',
      title: 'Long Scroll Register B',
    };

    const { novelId: firstNovelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile({
        chapterTitle: firstBook.chapterTitle,
        fileName: 'long-scroll-a.epub',
        paragraphPrefix: 'Atlas A corridor landmark',
        title: firstBook.title,
      }),
      firstBook.title,
    );
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, firstNovelId);
    await waitForReaderBranch(page, 'scroll');
    await scrollViewportToProgress(page, 0.35);
    await waitForScrollProgress(page, firstNovelId, 0.1, 'first novel progress persisted');
    const firstMarker = await captureMarker(page, firstNovelId, 'scroll');
    await exitReaderToDetailPage(page);

    const { novelId: secondNovelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile({
        chapterTitle: secondBook.chapterTitle,
        fileName: 'long-scroll-b.epub',
        paragraphPrefix: 'Atlas B observatory signal',
        title: secondBook.title,
      }),
      secondBook.title,
    );
    await openReaderDirect(page, secondNovelId);
    await waitForReaderBranch(page, 'scroll');
    await scrollViewportToProgress(page, 0.58);
    await waitForScrollProgress(page, secondNovelId, 0.2, 'second novel progress persisted');
    const secondMarker = await captureMarker(page, secondNovelId, 'scroll');
    await exitReaderToDetailPage(page);

    await openBookFromBookshelf(page, firstBook.title);
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, firstNovelId, 0.1, 'first novel restored');
    await expectViewportContainsSnippet(page, firstMarker.anchorSnippet);
    await expectViewportNotContainsSnippet(page, secondMarker.anchorSnippet);

    await openBookFromBookshelf(page, secondBook.title);
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, secondNovelId, 0.2, 'second novel restored');
    await expectViewportContainsSnippet(page, secondMarker.anchorSnippet);
    await expectViewportNotContainsSnippet(page, firstMarker.anchorSnippet);
  });

  test('TC-012 同一章节内切换阅读方式后，阅读内容位置应连续', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.34);
    await waitForScrollProgress(page, novelId, 0.12, 'initial scroll persisted for continuity');
    const scrollMarker = await captureMarker(page, novelId, 'scroll');

    await switchReaderBranch(page, 'paged');
    await expectViewportContainsSnippet(page, scrollMarker.anchorSnippet);
    await advancePagedPages(page, 1);
    await waitForPagedProgress(page, novelId, 1, 'paged progress persisted for continuity');
    const pagedMarker = await captureMarker(page, novelId, 'paged');

    await switchReaderBranch(page, 'scroll');
    await expectViewportContainsSnippet(page, pagedMarker.anchorSnippet);
    await scrollViewportByPixels(page, 420);
    await waitForScrollProgress(page, novelId, 0.18, 'final scroll persisted for continuity');
    const finalMarker = await captureMarker(page, novelId, 'scroll');

    expect(scrollMarker.chapterIndex).toBe(0);
    expect(pagedMarker.chapterIndex).toBe(0);
    expect(finalMarker.chapterIndex).toBe(0);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.18, 'final scroll restored for continuity');

    await expectViewportContainsSnippet(page, finalMarker.anchorSnippet);
  });
});
