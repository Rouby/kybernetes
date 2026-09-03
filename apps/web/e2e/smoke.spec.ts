import { expect, test } from '@playwright/test';

test.describe('Kybernetes HUD Smoke Test', () => {
  test('renders tactical dashboard and vessel designation', async ({ page }) => {
    await page.goto('/');

    // Check title and vessel header
    await expect(page).toHaveTitle(/KYBERNETES/);
    await expect(page.getByText('KYBERNETES')).toBeVisible();
    await expect(page.getByText('VESSEL: CSS Hesperia')).toBeVisible();

    // Check survival vitals rail
    await expect(page.getByText('Crew Vitals')).toBeVisible();
    await expect(page.getByText('Nutrition')).toBeVisible();
    await expect(page.getByText('Hydration')).toBeVisible();
    await expect(page.getByText('Fatigue')).toBeVisible();

    // Check center 2D viewport canvas and controls
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Locomotion')).toBeVisible();

    // Check telemetry rail
    await expect(page.getByText('Telemetry & Subsystems')).toBeVisible();
    await expect(page.getByText('Reactor Thermal')).toBeVisible();
  });

  test('interacts with survival vital replenishment buttons', async ({ page }) => {
    await page.goto('/');

    // Click Consume Paste button
    const pasteBtn = page.getByRole('button', { name: /Consume Paste/i });
    await expect(pasteBtn).toBeVisible();
    await pasteBtn.click();

    // Click Drink Water button
    const waterBtn = page.getByRole('button', { name: /Drink Water/i });
    await expect(waterBtn).toBeVisible();
    await waterBtn.click();
  });

  test('captures viewport screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(600);
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/0c4b7fd5-9ade-40cb-83ca-de28f0fd9c42/viewport_m2.png',
    });
  });

  test('captures realistic lighting and dark corridor viewport screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    // Move player down towards the central transit corridor
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyS');
    await page.mouse.move(500, 350);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/0c4b7fd5-9ade-40cb-83ca-de28f0fd9c42/realistic_lighting.png',
    });
  });
});
