import { expect, test } from '@playwright/test';

import { importTestBook, navigateToCharacterGraph } from '../helpers/appHarness';
import { assertEmptyState, clickBackToBookDetail } from '../helpers/characterGraphHarness';

test.describe('人物关系图行为', () => {
  test('正确显示空状态文案', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);
    await assertEmptyState(page);
    await expect(page.getByText('Start AI analysis from the book page first')).toBeVisible();
  });

  test('空状态包含返回书籍详情的链接', async ({ page }) => {
    const { novelId } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);
    await assertEmptyState(page);
    await expect(page.getByRole('link', { name: /analysis/i })).toBeVisible();
  });

  test('返回导航可回到书籍详情', async ({ page }) => {
    const { novelId, title } = await importTestBook(page);
    await navigateToCharacterGraph(page, novelId);

    await clickBackToBookDetail(page);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });
});
