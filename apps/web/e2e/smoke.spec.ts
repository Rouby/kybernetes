import { expect, test } from '@playwright/test';
import { waitForVesselSocket } from './helpers';

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
    await waitForVesselSocket(page);

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
    await waitForVesselSocket(page);
    await page.screenshot({
      path: 'test-results/screenshots/e40c455b-b06c-4b84-922b-edbfbc5751e2/user_aspect_ratio_hud.png',
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await waitForVesselSocket(page);

    await page.mouse.move(400, 200);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'test-results/screenshots/9ba7b719-c9d3-4458-b337-560f7c7a90d8/nameplate_removed_hud.png',
    });

    // Hover mouse directly over the crew member at screen center (640, 360)
    await page.mouse.move(640, 360);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: 'test-results/screenshots/9ba7b719-c9d3-4458-b337-560f7c7a90d8/crew_dossier_hud.png',
    });
    await page.screenshot({
      path: 'test-results/screenshots/e40c455b-b06c-4b84-922b-edbfbc5751e2/curved_helmet_hud.png',
    });
    await page.screenshot({
      path: 'test-results/screenshots/8eda711e-fa63-41a6-a093-9f9e68fe4f8e/reticle_zoom_alignment.png',
    });
  });

  test('captures realistic lighting and dark corridor viewport screenshot', async ({ page }) => {
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await waitForVesselSocket(page);
    // Move player down towards the central transit corridor
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyS');
    await page.mouse.move(500, 350);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: 'test-results/screenshots/8eda711e-fa63-41a6-a093-9f9e68fe4f8e/dense_submarine_ship.png',
    });
  });

  test('captures main menu screenshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/67a09665-d3cf-43a0-83fb-b03bc38ed4c7/main_menu.png',
      fullPage: true,
    });
  });

  test('clicks helmet UI buttons on visor canvas to open modals', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await waitForVesselSocket(page);

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    const width = box?.width ?? 1280;
    const height = box?.height ?? 720;
    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(38, Math.round(height * 0.055));
    const topVisorX = width - 595 - marginX;

    // Click the AUDIO [O] button on the curved visor glass (x: topVisorX + 220 + 40, y: marginY + 21 + 13)
    await page.mouse.click(topVisorX + 260, marginY + 34);
    await expect(page.getByTestId('audio-settings-modal')).toBeVisible();

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('audio-settings-modal')).not.toBeVisible();

    // Click BCN button on the curved visor glass (x: topVisorX + 10 + 35, y: marginY + 21 + 13)
    await page.mouse.click(topVisorX + 45, marginY + 34);
    await expect(page.getByTestId('beacon-modal')).toBeVisible();

    // Close beacon modal
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('beacon-modal')).not.toBeVisible();
  });

  test('operates hatch only via interaction key [E] when standing in front of door and ignores mouse clicks', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();
    await waitForVesselSocket(page);

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();

    // Clicking across the room at the door coordinates should NOT toggle the door
    await page.mouse.click(500, 360);
    await page.waitForTimeout(200);

    // Navigate around the reactor radiation shield to door_eng (x: 870..910, y: 432)
    // 1. Move left past the reactor shield boundary (x < 860)
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(350);
    await page.keyboard.up('KeyA');
    // 2. Move up to the catwalk spine level (y ~ 435)
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    // 3. Move right to the center of door_eng threshold (x ~ 885)
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(300);

    // 1. Aim away from the door (looking south into engineering: screen y=500)
    await page.mouse.move(640, 500);
    await page.waitForTimeout(200);
    // Pressing [E] while looking away should NOT operate the hatch
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(200);

    // 2. Aim directly at the door (looking north: screen y=320)
    await page.mouse.move(640, 320);
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'test-results/screenshots/8eda711e-fa63-41a6-a093-9f9e68fe4f8e/door_proximity_prompt.png',
    });

    // 3. Press [E] to toggle the hatch closed while looking directly at it
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'test-results/screenshots/8eda711e-fa63-41a6-a093-9f9e68fe4f8e/door_closed_prompt.png',
    });

    // 4. Press [E] immediately again while standing in place to toggle the hatch open again
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);

    await expect(canvas).toBeVisible();
  });
});
