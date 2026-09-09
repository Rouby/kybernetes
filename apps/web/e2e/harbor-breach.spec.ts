import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
  angDiff,
  harborBoard,
  startDaemon,
  statFace,
  statX,
  stopDaemon,
  waitForHarbor,
} from './helpers';

test.describe('Harbor structural damage (own daemon: venting is permanent)', () => {
  let daemon: ChildProcess | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('breaches the bay wall, spends mag, and reloads', async ({ page }) => {
    test.setTimeout(180000);
    await harborBoard(page, { callsign: 'Breach-1' });
    await page.keyboard.down('d');
    await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 510, 20000);
    await page.keyboard.up('d');
    let crossed = false;
    for (let attempt = 0; attempt < 3 && !crossed; attempt += 1) {
      await page.keyboard.press('e');
      await page.keyboard.down('d');
      try {
        await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 650, 6000);
        crossed = true;
      } catch {
        crossed = false;
      }
      await page.keyboard.up('d');
    }
    expect(crossed).toBe(true);
    // Seal up: the vent wait outlasts open-suit hypoxia once the room drains.
    await page.keyboard.press('t');
    await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('suit:sealed'), 10000);
    // Fire from mid-room on purpose: pinned against the wall, the muzzle
    // spawns past the collider and rounds never touch it. At ~100px range
    // bloom still lands inside merge distance of the first puncture.
    await page.mouse.move(640, 80);
    await waitForHarbor(page, 'harbor-status', (t) => angDiff(statFace(t), 270) < 35, 10000);
    // One puncture (0.05m2) cannot vent the bay+lobby complex on any sane
    // timeout: walk a short full-auto burst so repeat hits widen it into a
    // real breach via merge, then the rooms vent faster than they refill.
    await page.keyboard.down('f');
    await waitForHarbor(
      page,
      'harbor-vitals',
      (t) => Number(/mag:(\d+)\//.exec(t)?.[1] ?? 30) <= 20,
      15000
    );
    await page.keyboard.up('f');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/scene-breach.png' });
    await waitForHarbor(
      page,
      'harbor-status',
      (t) => Number(/vent:(\d+)/.exec(t)?.[1] ?? 0) >= 1,
      90000
    );
    await page.keyboard.press('r');
    await expect(page.getByTestId('harbor-vitals')).toContainText('(reloading)', {
      timeout: 10000,
    });
    await expect(page.getByTestId('harbor-vitals')).toContainText('mag:30/', { timeout: 15000 });
    await expect(page.getByTestId('harbor-vitals')).not.toContainText('(reloading)');
  });
});
