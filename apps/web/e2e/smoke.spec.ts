import { expect, test } from '@playwright/test';

test.describe('Kybernetes HUD Smoke Test', () => {
  test('renders tactical dashboard and vessel designation', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();

    // Check document title
    await expect(page).toHaveTitle(/KYBERNETES/);

    // Verify center 2D viewport canvas is rendered and fills screen
    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(800);
    expect(box?.height).toBeGreaterThan(500);
  });

  test('renders diegetic suit vitals without debug cheat buttons', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Verify debug cheat buttons are not in the DOM
    await expect(page.getByRole('button', { name: '+PASTE' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: '+WATER' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: '+REST' })).not.toBeVisible();
  });

  test('captures viewport screenshot', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 380 });
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/e40c455b-b06c-4b84-922b-edbfbc5751e2/user_aspect_ratio_hud.png',
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await page.waitForTimeout(600);

    await page.mouse.move(400, 200);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/9ba7b719-c9d3-4458-b337-560f7c7a90d8/nameplate_removed_hud.png',
    });

    // Hover mouse directly over the crew member at screen center (640, 360)
    await page.mouse.move(640, 360);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/9ba7b719-c9d3-4458-b337-560f7c7a90d8/crew_dossier_hud.png',
    });
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/e40c455b-b06c-4b84-922b-edbfbc5751e2/curved_helmet_hud.png',
    });
  });

  test('captures realistic lighting and dark corridor viewport screenshot', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
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

  test('captures main menu screenshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/67a09665-d3cf-43a0-83fb-b03bc38ed4c7/main_menu.png',
      fullPage: true,
    });
  });

  test('clicks helmet UI buttons on visor canvas to open modals', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await page.waitForTimeout(500);

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();

    // Click the AUDIO [O] button on the curved visor glass: x ~ 1030, y ~ 60
    await page.mouse.click(1030, 60);
    await expect(page.getByTestId('audio-settings-modal')).toBeVisible();

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('audio-settings-modal')).not.toBeVisible();

    // Click BCN button on the curved visor glass: x ~ 794, y ~ 63
    await page.mouse.click(794, 63);
    await expect(page.getByTestId('beacon-modal')).toBeVisible();

    // Close beacon modal
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('beacon-modal')).not.toBeVisible();
  });
});
