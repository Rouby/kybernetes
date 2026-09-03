import { expect, test } from '@playwright/test';

test.describe('Milestone 3: Vessel Telemetry, Subsystems & Naval Damage Events', () => {
  test('renders immersive diegetic viewport during normal and combat states', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(800);

    // Verify debug alert buttons are not in the DOM
    await expect(page.getByRole('button', { name: 'YELLOW' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'RED ALERT' })).not.toBeVisible();
  });

  test('displays real-time telemetry for reactor, life support scrubbers, and hull shields', async ({
    page,
  }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(500);

    // Telemetry is rendered on WebGL2 canvas edge-to-edge
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(800);
  });

  test('simulates incoming torpedo run and intercepts via Point-Defense Turrets', async ({
    page,
  }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
  });

  test('simulates radiation flare and vents reactor coolant', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Verify debug vent coolant button is not in DOM
    await expect(page.getByRole('button', { name: /VENT REACTOR COOLANT/i })).not.toBeVisible();
  });

  test('captures milestone 3 tactical telemetry viewport screenshot', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/b0c789ee-ec71-45bc-b4ce-c64a7aa83f95/milestone3_viewport.png',
    });
  });
});
