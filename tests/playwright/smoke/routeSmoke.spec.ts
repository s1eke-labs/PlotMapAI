import { expect, test } from '@playwright/test';

import {
  assertHeaderHidden,
  assertHeaderVisible,
  importTestBook,
  navigateToBookshelf,
  navigateToCharacterGraph,
  navigateToReader,
  navigateToSettings,
} from '../helpers/appHarness';

test.describe('路由冒烟测试', () => {
  test('书架页面可正常渲染', async ({ page }) => {
    await navigateToBookshelf(page);
    await assertHeaderVisible(page);
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('My Bookshelf');
  });

  test('设置页面可渲染并显示三个标签页', async ({ page }) => {
    await navigateToSettings(page);
    await assertHeaderVisible(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
    await expect(page.getByRole('button', { name: 'Book Parsing Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purification Rules' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI Analysis Settings' })).toBeVisible();
  });

  test('导入书籍后书籍详情页面可正常渲染', async ({ page }) => {
    const { title } = await importTestBook(page);
    await assertHeaderVisible(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start Reading' })).toBeVisible();
  });

  test('阅读器页面可正常渲染并隐藏页头', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToReader(page, novelId);
    await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 30_000 });
    await assertHeaderHidden(page);
  });

  test('人物关系图页面可渲染空状态', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);
    await expect(page.getByText('No character graph is available yet.')).toBeVisible();
  });

  test('点击页头 Logo 可返回书架', async ({ page }) => {
    await navigateToSettings(page);
    await page.getByText('PlotMapAI').first().click();
    await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
  });

  test('点击页头设置图标可进入设置页', async ({ page }) => {
    await navigateToBookshelf(page);
    await page.locator('a[title="Settings"]').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings');
  });

  test('主题切换可更新配色方案', async ({ page }) => {
    await navigateToBookshelf(page);
    const shell = page.getByTestId('app-layout-shell');
    const initialBg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.locator('header button').first().click();
    await expect.poll(async () => {
      return shell.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).not.toBe(initialBg);
  });
});
