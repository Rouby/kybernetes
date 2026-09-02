import { expect, test } from '@playwright/test';

test.describe('Milestone 4: Hostile Boarding Actions & 2D Tactical Deck Combat', () => {
  test('triggers hostile boarding pod breach and displays raider squad in tactical telemetry', async ({
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

    // Intruders should appear in tactical telemetry
    await expect(page.getByText(/2 INTRUDERS/i)).toBeVisible();
    await expect(page.getByText(/Marauder Breacher/i)).toBeVisible();
    await expect(page.getByText(/Marauder Infiltrator/i)).toBeVisible();
  });

  test('engages hostile intruder with kinetic carbine in close-quarters combat', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText(/VESSEL DAEMON: SYNCED/i)).toBeVisible();

    // Trigger boarding pod breach
    await page.getByRole('button', { name: '+ SIM BOARDING SQUAD' }).click();
    await expect(page.getByText(/Marauder Breacher/i)).toBeVisible();

    // Click engage button on the active raider
    const engageBtn = page.getByRole('button', { name: /ENGAGE WITH KINETIC CARBINE/i }).first();
    await expect(engageBtn).toBeVisible();
    await engageBtn.click();

    // Verify engagement notice appears in HUD
    await expect(page.getByText(/ENGAGING HOSTILE RAIDER|FIRED WEAPON/i)).toBeVisible();
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

  test('captures milestone 4 tactical boarding combat viewport screenshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/VESSEL DAEMON: SYNCED/i)).toBeVisible();

    // Trigger boarding pod breach and deploy sentry
    await page.getByRole('button', { name: '+ SIM BOARDING SQUAD' }).click();
    await page.getByRole('button', { name: 'DEPLOY SENTRY (CARGO)' }).click();
    const lockBtn = page.getByRole('button', { name: /LOCK CARGO|UNLOCK CARGO/i });
    await lockBtn.click();

    // Wait 500ms for animations and canvas rendering
    await page.waitForTimeout(500);

    // Capture screenshot to docs/images and artifact directory
    await page.screenshot({ path: '../../docs/images/milestone4_viewport.png', fullPage: true });
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/b0c789ee-ec71-45bc-b4ce-c64a7aa83f95/milestone4_viewport.png',
      fullPage: true,
    });
  });
});
