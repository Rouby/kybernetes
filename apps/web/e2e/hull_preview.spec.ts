import { expect, test } from '@playwright/test';

test.describe('Hull compiler preview (M2)', () => {
  test('station hub compiles clean and renders walls with gaps', async ({ page }) => {
    await page.goto('/?hull=station');
    await expect(page.getByTestId('hull-canvas')).toBeVisible();
    await expect(page.getByTestId('hull-stats')).toContainText('rooms:3');
    await expect(page.getByTestId('hull-stats')).toContainText('portals:3');
    await expect(page.getByTestId('hull-stats')).toContainText('errors:0');
    await expect(page.getByTestId('hull-errors')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/hull-station.png' });
  });

  test('hesperia v2 compiles clean and renders nine rooms', async ({ page }) => {
    await page.goto('/?hull=hesperia');
    await expect(page.getByTestId('hull-canvas')).toBeVisible();
    await expect(page.getByTestId('hull-stats')).toContainText('rooms:9');
    await expect(page.getByTestId('hull-stats')).toContainText('portals:9');
    await expect(page.getByTestId('hull-stats')).toContainText('errors:0');
    await expect(page.getByTestId('hull-errors')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/hull-hesperia.png' });
  });
});
