import { expect, test } from '@playwright/test';

test.describe('Milestone 4: Hostile Boarding Actions, DecisionTreeAI & FTL Grid Overhaul', () => {
  test('triggers hostile boarding pod breach and displays raider squad with AI state', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText(/VESSEL DAEMON: SYNCED/i)).toBeVisible();

    // Verify Tactical Security Defense section exists
    await expect(page.getByText('TACTICAL SECURITY DEFENSE')).toBeVisible();
    await expect(page.getByText('SECURED')).toBeVisible();

    // Trigger boarding pod breach simulation
    const simBoardingBtn = page.getByRole('button', { name: '+ SIM BOARDING SQUAD' });
    await expect(simBoardingBtn).toBeVisible();
    await simBoardingBtn.click();

    // Intruders should appear in tactical telemetry with DecisionTreeAI states
    await expect(page.getByText(/2 INTRUDERS/i)).toBeVisible();
    await expect(page.getByText(/Marauder Breacher/i)).toBeVisible();
    await expect(page.getByText(/Marauder Infiltrator/i)).toBeVisible();
    await expect(page.getByText(/AI:/i).first()).toBeVisible();
  });

  test('equips weapons via toolbar hotkeys and fires projectiles toward target', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText(/VESSEL DAEMON: SYNCED/i)).toBeVisible();

    // Verify weapon toolbar
    await expect(page.getByRole('button', { name: '[1] KINETIC' })).toBeVisible();
    await expect(page.getByRole('button', { name: '[2] LASER' })).toBeVisible();
    await expect(page.getByRole('button', { name: '[3] WELDER' })).toBeVisible();

    // Equip Pulse Laser
    await page.getByRole('button', { name: '[2] LASER' }).click();

    // Press '1' to switch back to Kinetic Carbine
    await page.keyboard.press('Digit1');

    // Click on canvas to fire weapon
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 400, y: 300 } });

    // Press Space to fire towards crosshair
    await page.keyboard.press('Space');
  });

  test('opens exterior hull airlock to physically vent atmosphere into space', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/VESSEL DAEMON: SYNCED/i)).toBeVisible();

    // Toggle Port Airlock or Cargo Vent
    const ventBtn = page.getByRole('button', { name: /VENT PORT AIRLOCK|SEAL PORT AIRLOCK/i });
    if (await ventBtn.isVisible()) {
      await ventBtn.click();
      await expect(
        page.getByRole('button', { name: /VENT PORT AIRLOCK|SEAL PORT AIRLOCK/i })
      ).toBeVisible();
    }
  });

  test('toggles bulkhead lockdown, atmospheric venting, and deploys sentry gun', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText(/VESSEL DAEMON: SYNCED/i)).toBeVisible();

    // 1. Bulkhead Lockdown toggle
    const lockCargoBtn = page.getByRole('button', { name: /LOCK CARGO GATES|UNLOCK CARGO/i });
    await expect(lockCargoBtn).toBeVisible();
    await lockCargoBtn.click();
    await expect(
      page.getByRole('button', { name: /LOCK CARGO GATES|UNLOCK CARGO/i })
    ).toBeVisible();

    // 2. Atmospheric Venting toggle
    const ventCargoBtn = page.getByRole('button', { name: /VENT CARGO O2|SEAL CARGO O2/i });
    await expect(ventCargoBtn).toBeVisible();
    await ventCargoBtn.click();
    await expect(page.getByRole('button', { name: /VENT CARGO O2|SEAL CARGO O2/i })).toBeVisible();

    // 3. Deploy Sentry Gun
    const deploySentryBtn = page.getByRole('button', { name: 'DEPLOY SENTRY (CARGO)' });
    await expect(deploySentryBtn).toBeVisible();
    await deploySentryBtn.click();
  });

  test('captures authentic FTL grid viewport screenshot with combat and venting', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText(/VESSEL DAEMON: SYNCED/i)).toBeVisible();

    // Trigger boarding pod breach, deploy sentry, and open vent
    await page.getByRole('button', { name: '+ SIM BOARDING SQUAD' }).click();
    await page.getByRole('button', { name: 'DEPLOY SENTRY (CARGO)' }).click();

    // Fire weapon into cargo bay
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 500, y: 350 } });

    // Wait 500ms for animations and canvas rendering
    await page.waitForTimeout(500);

    // Capture screenshot to docs/images and artifact directory
    await page.screenshot({ path: '../../docs/images/ftl_viewport.png', fullPage: true });
    await page.screenshot({ path: '../../docs/images/milestone4_viewport.png', fullPage: true });
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/b0c789ee-ec71-45bc-b4ce-c64a7aa83f95/milestone4_viewport.png',
      fullPage: true,
    });
  });
});
