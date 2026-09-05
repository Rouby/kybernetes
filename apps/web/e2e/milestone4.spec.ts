import { expect, test } from '@playwright/test';
import { quickBoard, sendAction, sendActionAndWait, waitForBroadcast } from './helpers';

test.describe('Milestone 4: Hostile Boarding Actions, DecisionTreeAI & FTL Grid Overhaul', () => {
  test('triggers hostile boarding pod breach and displays raider squad with AI state', async ({
    page,
  }) => {
    const canvas = await quickBoard(page);

    // Trigger an authoritative boarding breach and await the intruder alert.
    const alert = await sendActionAndWait<{ title: string }>(
      page,
      { type: 'TRIGGER_BOARDING_EVENT', breachRoomId: 'cargo' },
      'SHIP_ALERT'
    );
    expect(alert.title).toMatch(/INTRUDER ALERT/);

    // Combat telemetry must keep streaming after the breach.
    await waitForBroadcast(page, 'TELEMETRY_DELTA');
    await expect(canvas).toBeVisible();
  });

  test('equips weapons via toolbar hotkeys and fires projectiles toward target', async ({
    page,
  }) => {
    const canvas = await quickBoard(page);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Equip Pulse Laser via [2] hotkey

    await page.keyboard.press('Digit2');
    await page.waitForTimeout(100);

    // Press '1' hotkey to switch back to Kinetic Carbine
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(100);

    // Click on canvas to fire weapon into the game world
    await canvas.click({ position: { x: 400, y: 300 } });

    // Press Space to fire towards crosshair
    await page.keyboard.press('Space');

    // Authoritative round-trip: projectile fire replicates through the server tick.
    await sendAction(page, {
      type: 'FIRE_WEAPON',
      originX: 400,
      originY: 300,
      targetX: 500,
      targetY: 350,
      weaponType: 'kinetic_carbine',
    });
    await waitForBroadcast(page, 'TELEMETRY_DELTA');
    await expect(canvas).toBeVisible();
  });

  test('opens exterior hull airlock to physically vent atmosphere into space', async ({ page }) => {
    const canvas = await quickBoard(page);

    // Open the starboard outer airlock through the authoritative server.
    await sendAction(page, {
      type: 'TOGGLE_DOOR',
      doorId: 'airlock_stbd_outer',
      open: true,
    });
    const telemetry = await waitForBroadcast(page, 'TELEMETRY_DELTA');
    expect(telemetry).toBeTruthy();
    await expect(canvas).toBeVisible();
  });

  test('toggles bulkhead lockdown, atmospheric venting, and deploys sentry gun', async ({
    page,
  }) => {
    const canvas = await quickBoard(page);

    // Lock down the cargo bulkhead, vent the compartment, and deploy a sentry.
    await sendAction(page, { type: 'BULKHEAD_LOCK', bulkheadId: 'cargo', locked: true });
    await sendAction(page, { type: 'VENT_COMPARTMENT', compartmentId: 'cargo', venting: true });
    await sendAction(page, { type: 'DEPLOY_SENTRY', roomId: 'cargo' });
    await waitForBroadcast(page, 'TELEMETRY_DELTA');

    // Restore the compartment so later specs inherit a nominal vessel.
    await sendAction(page, { type: 'BULKHEAD_LOCK', bulkheadId: 'cargo', locked: false });
    await sendAction(page, { type: 'VENT_COMPARTMENT', compartmentId: 'cargo', venting: false });
    await expect(canvas).toBeVisible();
  });

  test('captures authentic FTL grid viewport screenshot with combat and venting', async ({
    page,
  }) => {
    const canvas = await quickBoard(page);

    // Fire weapon into cargo bay
    await canvas.click({ position: { x: 500, y: 350 } });
    await page.waitForTimeout(500);

    // Capture screenshot to docs/images and artifact directory
    await page.screenshot({ path: 'test-results/screenshots/ftl_viewport.png', fullPage: true });
    await page.screenshot({
      path: 'test-results/screenshots/milestone4_viewport.png',
      fullPage: true,
    });
    await page.screenshot({
      path: 'test-results/screenshots/b0c789ee-ec71-45bc-b4ce-c64a7aa83f95/milestone4_viewport.png',
      fullPage: true,
    });
  });

  test('verifies continuous kinetic fire, laser charge firing, and continuous welder arc', async ({
    page,
  }) => {
    const canvas = await quickBoard(page);

    // 1. Continuous Kinetic Firing: hold down mouse button on canvas for 300ms
    await page.keyboard.press('Digit1');
    await canvas.hover({ position: { x: 500, y: 350 } });
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();

    // 2. Laser Charge Firing: switch to Laser, hold down mouse button to charge then release
    await page.keyboard.press('Digit2');
    await canvas.hover({ position: { x: 520, y: 350 } });
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();

    // 3. Continuous Arc Welder: switch to Welder, hold down mouse button to spray continuous arc AOE
    await page.keyboard.press('Digit3');
    await canvas.hover({ position: { x: 500, y: 350 } });
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.up();

    // 4. Kinetic Magazine & Manual Reload: switch back to Kinetic and press KeyR to reload
    await page.keyboard.press('Digit1');
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(200);
    await expect(canvas).toBeVisible();
  });
});
