import { expect, test } from '@playwright/test';
import { quickBoard } from './helpers';

test.describe('Station hub window and job board', () => {
  test('renders the hub fixtures without errors', async ({ page }) => {
    const canvas = await quickBoard(page);
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/screenshots/hub/station_hub_window.png' });
    await expect(canvas).toBeVisible();
  });
});
