import { expect, test } from '@playwright/test';
import { quickBoard, sendActionAndWait, waitForBroadcast } from './helpers';

test.describe('Station start and gauntlet boarding', () => {
  test('spawns in the station bay and hires once docked', async ({ page }) => {
    await quickBoard(page);

    const snapshot = await waitForBroadcast<{
      pawns: { callsign: string; x: number; y: number }[];
    }>(page, 'SPATIAL_SNAPSHOT');
    const me = snapshot.pawns.find((p) => p.callsign === 'Cadet');
    expect(me).toBeDefined();
    expect(me?.y ?? 0).toBeGreaterThan(800);
    expect(me?.x ?? 0).toBeGreaterThan(120);

    const earlyOffset = await page.evaluate(
      () => (window as unknown as { __shipOffset?: { x: number } }).__shipOffset?.x
    );
    expect(earlyOffset ?? 0).toBeLessThan(-500);
    await page.waitForTimeout(3000);
    const laterOffset = await page.evaluate(
      () => (window as unknown as { __shipOffset?: { x: number } }).__shipOffset?.x
    );
    expect(laterOffset ?? -9999).toBeGreaterThan((earlyOffset ?? -9999) + 100);

    const docking = await waitForBroadcast<{ phase: string }>(page, 'SHIP_DOCKING_UPDATE', 45000);
    expect(docking.phase).toBe('docked');
    const dockedOffset = await page.evaluate(
      () => (window as unknown as { __shipOffset?: { x: number } }).__shipOffset?.x
    );
    expect(Math.abs(dockedOffset ?? 9999)).toBeLessThan(50);
    await expect(page.getByTestId('docking-banner')).toBeVisible();

    const telemetry = await waitForBroadcast<{
      boarding: { doors: { id: string; isOpen: boolean; isSealed?: boolean }[] };
    }>(page, 'TELEMETRY_DELTA');
    const shipHatch = telemetry.boarding.doors.find((d) => d.id === 'gauntlet_ship_door');
    const stationHatch = telemetry.boarding.doors.find((d) => d.id === 'gauntlet_station_door');
    expect(shipHatch?.isOpen).toBe(true);
    expect(stationHatch?.isOpen).toBe(true);

    const offer = await sendActionAndWait<{ jobs: { job: string }[]; offerId: string }>(
      page,
      { type: 'TALK_TO_CAPTAIN', captainId: 'captain_helm_01' },
      'CAPTAIN_JOB_OFFER',
      20000
    );
    expect(offer.jobs).toHaveLength(2);
    const assigned = await sendActionAndWait<{ job: string }>(
      page,
      { type: 'ACCEPT_JOB_OFFER', offerId: offer.offerId, job: offer.jobs[0].job },
      'JOB_ASSIGNED',
      20000
    );
    expect(assigned.job).toBe(offer.jobs[0].job);
  });
});
