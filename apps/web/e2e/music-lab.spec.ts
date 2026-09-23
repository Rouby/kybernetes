/** Techno lab smoke: grid renders, mute/solo flip, transport starts the loop. */
import { expect, test } from '@playwright/test';

test('techno lab renders the voice grid and toggles', async ({ page }) => {
  await page.goto('/?music=1');
  await expect(page.getByTestId('musiclab')).toBeVisible();

  const rows = page.locator('.vrow');
  await expect(rows).toHaveCount(13);
  await expect(rows.first().locator('.mcell')).toHaveCount(32);

  const firstMute = rows.first().locator('.vbtn').first();
  await firstMute.click();
  await expect(firstMute).toHaveClass(/on/);
  await firstMute.click();
  await expect(firstMute).not.toHaveClass(/on/);

  const chopSolo = rows.nth(10).locator('.vbtn').nth(1);
  await chopSolo.click();
  await expect(chopSolo).toHaveClass(/solo-on/);
  await chopSolo.click();

  await page.getByRole('button', { name: 'START LOOP' }).click();
  await expect(page.locator('.technolab p').first()).toContainText('LOOP', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/music-lab.png' });
});
