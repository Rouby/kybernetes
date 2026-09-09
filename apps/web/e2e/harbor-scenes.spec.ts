import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { harborBoard, waitForHarbor } from './boarding';
import { startDaemon, stopDaemon } from './daemon';
import { statRoom, statSX, statX } from './stats';

test.describe('Harbor scene captures', () => {
  test.setTimeout(180000);
  let daemon: ChildProcess | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('records lobby, doorway, and ship corridor scenes', async ({ page }) => {
    await harborBoard(page, { callsign: 'Scenes-1' });
    await expect(page.getByTestId('harbor-status')).toContainText('room:lobby');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/scene-lobby.png' });

    await page.keyboard.down('d');
    await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 510, 20000);
    await page.keyboard.up('d');
    let crossed = false;
    for (let attempt = 0; attempt < 3 && !crossed; attempt += 1) {
      await page.keyboard.press('e');
      await page.keyboard.down('d');
      try {
        await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 820, 6000);
        crossed = true;
      } catch {
        crossed = false;
      }
      await page.keyboard.up('d');
    }
    expect(crossed).toBe(true);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/scene-door.png' });

    for (let tap = 0; tap < 40; tap += 1) {
      const seen = await page.getByTestId('harbor-status').innerText();
      if (statRoom(seen) === 'corridor' || statSX(seen) > 875) break;
      await page.keyboard.down('d');
      await page.waitForTimeout(150);
      await page.keyboard.up('d');
      await page.waitForTimeout(250);
    }
    await waitForHarbor(page, 'harbor-status', (t) => statRoom(t) === 'corridor', 75000);
    await page.keyboard.down('a');
    await page.waitForTimeout(800);
    await page.keyboard.up('a');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/scene-ship.png' });
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
  });
});
