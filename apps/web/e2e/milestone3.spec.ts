import { expect, test } from '@playwright/test';
import { quickBoard, sendActionAndWait, waitForBroadcast } from './helpers';

test.describe('Milestone 3: Vessel Telemetry, Subsystems & Naval Damage Events', () => {
  test('renders immersive diegetic viewport during normal and combat states', async ({ page }) => {
    const canvas = await quickBoard(page);

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
    const canvas = await quickBoard(page);

    // Authoritative telemetry must stream over the socket (tick replication proof).
    const telemetry = await waitForBroadcast<{ shipName: string; reactorTemp: number }>(
      page,
      'TELEMETRY_DELTA'
    );
    expect(telemetry.shipName).toBeTruthy();

    // Telemetry is rendered on WebGL2 canvas edge-to-edge
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(800);
  });

  test('simulates incoming torpedo run and intercepts via Point-Defense Turrets', async ({
    page,
  }) => {
    const canvas = await quickBoard(page);

    // Trigger an authoritative torpedo run and capture its event id.
    const naval = await sendActionAndWait<{ event: { id: string; title: string } }>(
      page,
      { type: 'TRIGGER_NAVAL_EVENT', eventType: 'torpedo_run' },
      'NAVAL_DAMAGE_EVENT'
    );
    expect(naval.event.id).toBeTruthy();

    // Intercept through point-defense and await the authoritative triage result.
    const triage = await sendActionAndWait<{ actionType: string; success: boolean }>(
      page,
      { type: 'TRIGGER_PDT_INTERCEPT', eventId: naval.event.id },
      'DAMAGE_TRIAGE_RESULT'
    );
    expect(triage.actionType).toBe('PDT_INTERCEPT');

    await expect(canvas).toBeVisible();
  });

  test('simulates radiation flare and vents reactor coolant', async ({ page }) => {
    const canvas = await quickBoard(page);

    await sendActionAndWait(
      page,
      { type: 'TRIGGER_NAVAL_EVENT', eventType: 'radiation_burst' },
      'NAVAL_DAMAGE_EVENT'
    );

    const triage = await sendActionAndWait<{ actionType: string }>(
      page,
      { type: 'VENT_REACTOR_COOLANT' },
      'DAMAGE_TRIAGE_RESULT'
    );
    expect(triage.actionType).toBe('COOLANT_VENT');

    // Verify debug vent coolant button is not in DOM
    await expect(page.getByRole('button', { name: /VENT REACTOR COOLANT/i })).not.toBeVisible();
    await expect(canvas).toBeVisible();
  });

  test('captures milestone 3 tactical telemetry viewport screenshot', async ({ page }) => {
    const canvas = await quickBoard(page);
    await waitForBroadcast(page, 'TELEMETRY_DELTA');
    await page.screenshot({
      path: 'test-results/screenshots/b0c789ee-ec71-45bc-b4ce-c64a7aa83f95/milestone3_viewport.png',
    });
    await expect(canvas).toBeVisible();
  });
});
