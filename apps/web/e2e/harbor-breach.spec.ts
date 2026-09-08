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
    await page.mouse.move(640, 80);
    await waitForHarbor(page, 'harbor-status', (t) => angDiff(statFace(t), 270) < 35, 10000);
    await page.keyboard.press('f');
    await expect(page.getByTestId('harbor-vitals')).toContainText('mag:29/120', { timeout: 10000 });
    await waitForHarbor(
      page,
      'harbor-status',
      (t) => Number(/vent:(\d+)/.exec(t)?.[1] ?? 0) >= 1,
      30000
    );
    await page.keyboard.press('r');
    await expect(page.getByTestId('harbor-vitals')).toContainText('(reloading)', {
      timeout: 10000,
    });
    await expect(page.getByTestId('harbor-vitals')).toContainText('mag:30/119', { timeout: 15000 });
  });
});
