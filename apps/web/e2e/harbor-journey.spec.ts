import { expect, test } from '@playwright/test';
import { harborBoard, statRoom, statSX, statX, waitForHarbor } from './helpers';

test.describe('Harbor acceptance journey (C2)', () => {
  test.setTimeout(180000);

  test('walk aboard, hire, watch, grade over live v2', async ({ page }) => {
    await harborBoard(page, { callsign: 'Journey-1' });
    await expect(page.getByTestId('harbor-status')).toContainText('room:lobby');

    await page.keyboard.down('d');
    await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 510, 20000);
    await page.keyboard.up('d');
    // The shared daemon may leave the lobby door open; toggle until the pawn
    // actually gets past it instead of assuming a direction.
    let crossed = false;
    for (let attempt = 0; attempt < 3 && !crossed; attempt += 1) {
      await page.keyboard.press('e');
      await expect(page.getByTestId('harbor-notices')).toContainText('DOOR_ok', { timeout: 10000 });
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

    let offered = '';
    for (let i = 0; i < 18 && !offered.includes('/'); i += 1) {
      await page.keyboard.press('h');
      try {
        offered = await waitForHarbor(page, 'harbor-offer', (t) => t.includes('/'), 4000);
      } catch {
        offered = '';
      }
    }
    expect(offered).toContain('/');
    await page.keyboard.press('j');
    await expect(page.getByTestId('harbor-manifest')).toContainText('Journey-1', {
      timeout: 10000,
    });

    await expect(page.getByTestId('harbor-watch')).toContainText('watch#', { timeout: 25000 });
    await expect(page.getByTestId('harbor-watch')).toContainText(' S tasks:4/4', {
      timeout: 45000,
    });
    await expect(page.getByTestId('harbor-vitals')).toContainText('credits:200');
  });
});
