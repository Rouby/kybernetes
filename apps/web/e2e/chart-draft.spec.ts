import { expect, test } from '@playwright/test';
import { waitForHarbor } from './boarding';
import { harborUrl, type StartedDaemon, startDaemon, stopDaemon } from './daemon';
import { clickZone, NAV_CONSOLE, type UiWindow, uiZoneIds, waitUiZone, walkToTarget } from './nav';

/**
 * Star-chart draft smoke (fast, CI-blocking): open the nav console in the
 * live world and draft a POI visit up to the confirm preview.
 *
 * Deliberately stops before CONFIRM: committing needs bunker fuel
 * and the departure/flight waits, which is what makes chart-course.spec.ts
 * (@slow) host-timing sensitive. This spec stays on the bridge, performs
 * no server-mutating intents, and is safe to retry against a shared daemon.
 */

test.describe('Star chart draft smoke', { tag: '@smoke' }, () => {
  test.setTimeout(120000);
  let daemon: StartedDaemon | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('nav console opens and drafts a POI visit', async ({ page }) => {
    await page.goto(harborUrl(daemon, 'debug=1'));
    await waitUiZone(page, 'embark');
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    await page.waitForTimeout(1200);
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    await expect(page.getByTestId('harbor-canvas')).toBeVisible({ timeout: 30000 });
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    // Seal the suit so a slow host never dies of hypoxia mid-walk.
    await page.keyboard.press('t');
    await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('suit:sealed'), 10000);
    // Spawn is aboard the bridge, so this walk stays in one room: no doors,
    // no corridor, no reactor/engine detour.
    expect(await walkToTarget(page, { ...NAV_CONSOLE, zoneId: 'plot:hub_b' }, 150)).toBe(true);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/chart-draft.png' });
    const zones = await uiZoneIds(page);
    expect(zones).toContain('plot:hub_b');
    const via = zones.find((id) => id.startsWith('via:'));
    expect(via).toBeDefined();
    if (via === undefined) throw new Error('no POI detour zone');
    const box = await page.getByTestId('harbor-canvas').boundingBox();
    if (box === null) throw new Error('canvas missing: harbor-canvas');
    const zone = await waitUiZone(page, via);
    await page.mouse.click(box.x + zone.x + zone.w / 2, box.y + zone.y + zone.h / 2);
    await page.waitForFunction(
      () => ((window as unknown as UiWindow).__uiZones ?? []).some((z) => z.id === 'confirm'),
      null,
      { timeout: 15000 }
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/chart-draft-preview.png' });
    // The thrust stepper is client-side draft state: one step keeps confirm.
    const downBox = await page.getByTestId('harbor-canvas').boundingBox();
    if (downBox === null) throw new Error('canvas missing: harbor-canvas');
    const down = await waitUiZone(page, 'thrustDown');
    await page.mouse.click(downBox.x + down.x + down.w / 2, downBox.y + down.y + down.h / 2);
    await page.waitForTimeout(800);
    expect(await uiZoneIds(page)).toContain('confirm');
  });
});
