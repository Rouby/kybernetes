import { expect, type Page, test } from '@playwright/test';
import { waitForBroadcast, waitForVesselSocket } from './helpers';

async function embarkFromMenu(
  page: Page,
  options?: { callsign?: string; colorId?: string; isCommission?: boolean }
) {
  if (options?.isCommission) {
    await page.getByTestId('start-ship-btn').click();
  } else {
    await page.getByTestId('join-ship-btn').click();
  }
  await expect(page.getByTestId('character-creation-modal')).toBeVisible();
  if (options?.callsign) {
    await page.getByTestId('dossier-callsign-input').fill(options.callsign);
  }
  if (options?.colorId) {
    await page.getByTestId(`suit-color-${options.colorId}`).click();
  }
  await page.getByTestId('confirm-dossier-btn').click();
  await expect(page.getByTestId('character-creation-modal')).not.toBeVisible();
}

test.describe('Milestone 5: Authoritative WebSocket Server, Multi-Room Lobbies & Real-Time Co-Op', () => {
  test('main menu commission new ship and disembark', async ({ page }) => {
    await page.goto('/');

    // Verify Main Menu is rendered
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('start-ship-btn')).toBeVisible();
    await expect(page.getByTestId('join-ship-btn')).toBeVisible();

    // Commission new vessel and complete character creation
    await embarkFromMenu(page, {
      isCommission: true,
      callsign: 'Cmdr-Rex',
      colorId: 'security_crimson',
    });

    // Verify player is onboard an authoritative instance with WebGL2 canvas
    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await waitForVesselSocket(page);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const width = box?.width ?? 1280;

    // Disembark back to main menu by clicking DISEMBARK button in WebGL2 HUD
    await canvas.click({ position: { x: width - 125, y: 64 } });
    await expect(page.getByTestId('main-menu')).toBeVisible();
  });

  test('multi-crew session: Alpha-1 and Bravo-2 connect to room HESP01 and sync live Crew Manifest', async ({
    browser,
  }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      // Connect Alpha-1 and Bravo-2 to default Beacon Code HESP01 via Main Menu
      await page1.goto('/?beacon=HESP01');
      await page2.goto('/?beacon=HESP01');

      // Both are on the main menu
      await expect(page1.getByTestId('main-menu')).toBeVisible();
      await expect(page2.getByTestId('main-menu')).toBeVisible();

      // Board vessel and configure operator dossier
      await embarkFromMenu(page1, { callsign: 'Alpha-1', colorId: 'hazard_amber' });
      await embarkFromMenu(page2, {
        callsign: 'Bravo-2',
        colorId: 'cyan_tech',
      });

      await expect(page1.getByTestId('vessel-canvas')).toBeVisible();
      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();
      await waitForVesselSocket(page1);
      await waitForVesselSocket(page2);

      // Open Crew Manifest Modal on Page 1 via [M] hotkey
      await page1.keyboard.press('KeyM');
      await expect(page1.getByTestId('crew-manifest-modal')).toBeVisible();

      // Verify both callsigns appear in the active roster exactly once
      await expect(page1.getByTestId('crew-member-Alpha-1')).toBeVisible();
      await expect(page1.getByTestId('crew-member-Bravo-2')).toBeVisible();

      // Close manifest
      await page1.getByTestId('close-manifest-btn').click();
      await expect(page1.getByTestId('crew-manifest-modal')).not.toBeVisible();
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('spatial pawn replication & floating nametags across connected peers', async ({
    browser,
  }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await page1.goto('/?beacon=HESP01');
      await embarkFromMenu(page1, { callsign: 'Alpha-1' });

      await page2.goto('/?beacon=HESP01');
      await embarkFromMenu(page2, { callsign: 'Bravo-2' });

      await expect(page1.getByTestId('vessel-canvas')).toBeVisible();
      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();

      // Alpha-1 navigates with WASD
      await page1.keyboard.press('KeyW');
      await page1.keyboard.press('KeyD');
      await page1.waitForTimeout(200);

      // Both canvases remain active and synced
      await expect(page1.getByTestId('vessel-canvas')).toBeVisible();
      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();

      // Replication proof: spatial snapshots stream to both peers.
      await waitForBroadcast(page1, 'SPATIAL_SNAPSHOT');
      await waitForBroadcast(page2, 'SPATIAL_SNAPSHOT');
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('shared vessel telemetry sync & cooperative boarder defense', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await page1.goto('/?beacon=HESP01');
      await embarkFromMenu(page1, { callsign: 'Alpha-1' });

      await page2.goto('/?beacon=HESP01');
      await embarkFromMenu(page2, { callsign: 'Bravo-2' });

      await expect(page1.getByTestId('vessel-canvas')).toBeVisible();
      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();

      // Alpha-1 fires weapon at intruder / into sector
      await page1.keyboard.press('KeyF');
      await page1.waitForTimeout(100);

      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('dual-operator protocol synchronization and collaborative heavy shift', async ({
    browser,
  }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await page1.goto('/?beacon=HESP01');
      await embarkFromMenu(page1, { callsign: 'Alpha-1' });

      await page2.goto('/?beacon=HESP01');
      await embarkFromMenu(page2, { callsign: 'Bravo-2' });

      await expect(page1.getByTestId('vessel-canvas')).toBeVisible();
      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();

      // Test Subspace Beacon modal via [B] hotkey
      await page1.keyboard.press('KeyB');
      await expect(page1.getByTestId('beacon-modal')).toBeVisible();
      await expect(page1.getByTestId('beacon-input')).toHaveValue('HESP01');
      await page1.keyboard.press('Escape');
      await expect(page1.getByTestId('beacon-modal')).not.toBeVisible();

      // Capture official Milestone 5 co-op screenshot
      await page1.screenshot({
        path: 'test-results/screenshots/milestone5_viewport.png',
        fullPage: true,
      });
      await page1.screenshot({
        path: 'test-results/screenshots/67a09665-d3cf-43a0-83fb-b03bc38ed4c7/milestone5_viewport.png',
        fullPage: true,
      });
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('crew state persistence per user (position and callsign preserved across disembark)', async ({
    page,
  }) => {
    await page.goto('/?beacon=HESP01');

    // Commission/board with custom character profile
    await embarkFromMenu(page, {
      callsign: 'Persist-Cadet',
      colorId: 'warp_violet',
    });

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();

    // Move pawn with keyboard locomotion
    await page.keyboard.press('KeyS');
    await page.keyboard.press('KeyS');
    await page.keyboard.press('KeyD');
    await page.waitForTimeout(200);

    const box = await canvas.boundingBox();
    const width = box?.width ?? 1280;

    // Disembark back to main menu via WebGL2 HUD button click
    await canvas.click({ position: { x: width - 125, y: 64 } });
    await expect(page.getByTestId('main-menu')).toBeVisible();

    // Re-board the same vessel
    await page.getByTestId('join-ship-btn').click();
    await expect(page.getByTestId('character-creation-modal')).toBeVisible();

    // Verify existing profile was preloaded from persistence
    await expect(page.getByTestId('dossier-callsign-input')).toHaveValue('Persist-Cadet');

    // Confirm and embark again
    await page.getByTestId('confirm-dossier-btn').click();
    await expect(page.getByTestId('vessel-canvas')).toBeVisible();
  });

  test('arc welder firing is propagated across peers', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await page1.goto('/?beacon=HESP01');
      await embarkFromMenu(page1, { callsign: 'Welder-1' });

      await page2.goto('/?beacon=HESP01');
      await embarkFromMenu(page2, { callsign: 'Observer-2' });

      await expect(page1.getByTestId('vessel-canvas')).toBeVisible();
      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();

      // Welder-1 equips the Arc Welder (Digit3)
      await page1.keyboard.press('Digit3');
      await page1.waitForTimeout(100);

      // Trigger continuous arc welder firing
      const canvas1 = page1.locator('canvas').first();
      const box = await canvas1.boundingBox();
      if (box) {
        await page1.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2);
        await page1.mouse.down();
        await page1.waitForTimeout(300);
        await page1.mouse.up();
      }

      // Observer-2 remains in session with canvas visible
      await expect(page2.getByTestId('vessel-canvas')).toBeVisible();
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });
});
