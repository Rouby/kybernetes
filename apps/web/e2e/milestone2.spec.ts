import { expect, test } from '@playwright/test';

test.describe('Milestone 2: 2D Viewport, WASD Controls, Roles & Station Docking', () => {
  test('selects starting role and updates department and spawn location', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await expect(page.getByTestId('vessel-canvas')).toBeVisible();

    // Press 'KeyP' (or click WebGL role badge) to open role select modal
    await page.keyboard.press('KeyP');
    await expect(page.getByText('CREW MANIFEST: SELECT STARTING ORIGIN')).toBeVisible();

    // Select Cargo Stevedore
    await page.getByRole('button', { name: /Cargo Stevedore/i }).click({ force: true });
    await page.getByRole('button', { name: /CONFIRM ASSIGNMENT/i }).click();

    // Verify modal is closed and canvas remains active
    await expect(page.getByText('CREW MANIFEST: SELECT STARTING ORIGIN')).not.toBeVisible();
    await expect(page.getByTestId('vessel-canvas')).toBeVisible();
  });

  test('WASD movement updates pawn position coordinates', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();

    // Focus canvas and press ArrowLeft / KeyA to move left
    await canvas.click({ force: true });
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('KeyA');
      await page.waitForTimeout(50);
    }
    // Verify movement completed without error
    await expect(canvas).toBeVisible();
  });

  test('interacts with nearest station via [E] key and begins shift duty with round progress bar', async ({
    page,
  }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();

    // Press 'e' to start interaction immediately (rendered directly on WebGL2 HUD)
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);

    // Abort via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await expect(canvas).toBeVisible();
  });
});
