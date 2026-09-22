import { expect, test } from '@playwright/test';
import { waitForHarbor } from './boarding';
import { harborUrl, type StartedDaemon, startDaemon, stopDaemon } from './daemon';
import {
  clickUiZone,
  clickZone,
  clickZoneFresh,
  NAV_CONSOLE,
  REACTOR_CONSOLE,
  TO_BRIDGE,
  TO_REACTOR,
  type UiWindow,
  uiZoneIds,
  waitUiZone,
  walkRoute,
} from './nav';

/**
 * Star-chart full journey (@slow, nightly/local only): open the nav console
 * in the live world, screenshot the chart screen, draft a POI visit, and
 * screenshot the preview state. Host-timing sensitive by design (long
 * closed-loop walks plus real departure/flight waits); the fast
 * chart-draft.spec.ts smoke covers the draft wiring in blocking CI.
 * Movement is closed-loop off the debug pos readout toward the bridge
 * nav console at ship frame (100, 65); the E key opens whatever fixture
 * is nearest, so the loop also taps E and watches for the plot zone.
 */

test.describe('Star chart course plotting', { tag: '@slow' }, () => {
  test.setTimeout(300000);
  let daemon: StartedDaemon | null = null;
  // Fresh daemon per attempt: plotting burns the starter cell and leaves
  // docked state behind, so retries need a clean world, not a shared one.
  test.beforeEach(async () => {
    daemon = await startDaemon();
  });
  test.afterEach(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('nav console opens a starfield chart and drafts a POI visit', async ({ page }) => {
    await page.goto(harborUrl(daemon, 'debug=1'));
    await waitUiZone(page, 'embark');
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    await page.waitForTimeout(1200);
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    await expect(page.getByTestId('harbor-canvas')).toBeVisible({ timeout: 30000 });
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    // Seal the suit for the long interior walks; slow runners otherwise die of hypoxia.
    await page.keyboard.press('t');
    await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('suit:sealed'), 10000);
    expect(await walkRoute(page, TO_REACTOR, REACTOR_CONSOLE, 400)).toBe(true);
    await clickUiZone(page, 'restart');
    await page.waitForTimeout(800);
    await clickUiZone(page, 'close');
    await page.waitForTimeout(800);
    // Solo-ship trader loop: plots burn bunker fuel and departures need a hot reactor.
    // Load the starter cell at the engine console before plotting.
    // The engine sits 60px east in the same room; nudge east and tap E.
    // Both consoles are in reach here, so close the reactor screen if it reopens.
    let engineOpen = false;
    for (let attempt = 0; attempt < 20 && !engineOpen; attempt += 1) {
      const zonesNow = await uiZoneIds(page);
      if (zonesNow.includes('loadFuel')) {
        engineOpen = true;
        break;
      }
      if (zonesNow.includes('restart')) {
        await clickUiZone(page, 'close');
        await page.waitForTimeout(400);
      }
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(250);
      await page.keyboard.up('KeyD');
      await page.keyboard.press('e');
      await page.waitForTimeout(400);
    }
    expect(engineOpen || (await uiZoneIds(page)).includes('loadFuel')).toBe(true);
    await clickUiZone(page, 'loadFuel');
    await waitForHarbor(page, 'harbor-stores', (t) => t.includes('bunker 1000'), 20000);
    await clickUiZone(page, 'close');
    await page.waitForTimeout(800);
    expect(await walkRoute(page, TO_BRIDGE, { ...NAV_CONSOLE, zoneId: 'plot:hub_b' }, 400)).toBe(
      true
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/chart-course.png' });
    const zones = await uiZoneIds(page);
    expect(zones).toContain('plot:hub_b');
    const via = zones.find((id) => id.startsWith('via:'));
    expect(via).toBeDefined();
    if (via === undefined) throw new Error('no POI detour zone');
    const zone = await waitUiZone(page, via);
    await clickZoneFresh(page, zone);
    await page.waitForFunction(
      () => ((window as unknown as UiWindow).__uiZones ?? []).some((z) => z.id === 'confirm'),
      null,
      { timeout: 15000 }
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/chart-preview.png' });
    const down = await waitUiZone(page, 'thrustDown');
    await clickZoneFresh(page, down);
    await clickZoneFresh(page, down);
    await page.waitForTimeout(800);
    expect(await uiZoneIds(page)).toContain('confirm');
    await page.screenshot({ path: 'test-results/chart-thrust.png' });
    const confirm = await waitUiZone(page, 'confirm');
    await clickZoneFresh(page, confirm);
    await page.waitForFunction(
      () => !((window as unknown as UiWindow).__uiZones ?? []).some((z) => z.id === 'confirm'),
      null,
      { timeout: 15000 }
    );
    // Departure proves the server accepted the draft (needs bunker fuel + hot reactor).
    // Plot buttons vanish as soon as the leg leaves docked.
    await page.waitForFunction(
      () => !((window as unknown as UiWindow).__uiZones ?? []).some((z) => z.id === 'plot:hub_b'),
      null,
      { timeout: 30000 }
    );
    await page.waitForTimeout(14000);
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await page.screenshot({ path: 'test-results/chart-flight.png' });
  });
});
