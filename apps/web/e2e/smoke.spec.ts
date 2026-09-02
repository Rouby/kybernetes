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

    // Check center 2D viewport
    await expect(page.getByText('2D TOP-DOWN VESSEL VIEWPORT')).toBeVisible();

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
});
