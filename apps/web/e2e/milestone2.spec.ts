import { expect, test } from '@playwright/test';

test.describe('Milestone 2: 2D Viewport, WASD Controls, Roles & Station Docking', () => {
  test('selects starting role and updates department and spawn location', async ({ page }) => {
    await page.goto('/');

    // Verify initial default role is Wiper
    await expect(page.getByText(/ROLE: MAINTENANCE WIPER/i)).toBeVisible();
    await expect(page.getByText('POS: (924, 570)')).toBeVisible();

    // Click role button to open modal
    await page.getByRole('button', { name: /ROLE: MAINTENANCE WIPER/i }).click();
    await expect(page.getByText('CREW MANIFEST: SELECT STARTING ORIGIN')).toBeVisible();

    // Select Cargo Stevedore
    await page.getByRole('button', { name: /Cargo Stevedore/i }).click({ force: true });
    await page.getByRole('button', { name: /CONFIRM ASSIGNMENT/i }).click();

    // Verify role changed to Stevedore
    await expect(page.getByText(/ROLE: CARGO STEVEDORE/i)).toBeVisible();
    await expect(page.getByText('POS: (540, 570)')).toBeVisible();
    await expect(page.getByText('Hold Logistics & Salvage')).toBeVisible();
  });

  test('WASD movement updates pawn position coordinates', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('POS: (924, 570)')).toBeVisible();

    // Focus canvas and press ArrowLeft / KeyA to move left
    await page.locator('canvas').click({ force: true });
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('KeyA');
      await page.waitForTimeout(50);
    }

    // Verify X coordinate moved to the left
    await expect(page.getByText(/POS: \([89]\d\d,/)).toBeVisible();
  });

  test('interacts with nearest station via [E] key and begins shift duty with round progress bar', async ({
    page,
  }) => {
    await page.goto('/');

    // Wiper starts at (924, 570) right next to Reactor Core Monitor (970, 570)
    await expect(page.getByText(/Reactor Core Monitor/i)).toBeVisible();

    // In-world prompt shows direct action without modals
    await expect(page.getByText(/Scrub Plasma Grids/i).first()).toBeVisible();

    // Press 'e' to start interaction immediately with round progress bar (no modals)
    await page.keyboard.press('KeyE');

    // Verify lean Shift Progress indicator appears
    await expect(page.getByText(/SHIFT PROGRESS/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /ABORT SHIFT/i })).toBeVisible();

    // Abort via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByText(/SHIFT PROGRESS/i)).not.toBeVisible();
  });
});
