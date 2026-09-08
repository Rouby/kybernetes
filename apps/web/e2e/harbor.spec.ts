import { expect, test } from '@playwright/test';
import { harborBoard, statRoom, statX, waitForHarbor } from './helpers';

test.describe('Harbor client smoke (C2)', () => {
  test('connects, joins, and streams ticked snapshots', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-1' });
    await expect(page.getByTestId('harbor-status')).toContainText('room:lobby');
    const first = await waitForHarbor(page, 'harbor-status', (t) => /tick:(\d+)/.test(t), 10000);
    const firstTick = Number(/tick:(\d+)/.exec(first)?.[1] ?? 0);
    const second = await waitForHarbor(
      page,
      'harbor-status',
      (t) => Number(/tick:(\d+)/.exec(t)?.[1] ?? 0) > firstTick,
      10000,
    );
    expect(Number(/tick:(\d+)/.exec(second)?.[1] ?? 0)).toBeGreaterThan(firstTick);
    await expect(page.getByTestId('harbor-vitals')).toContainText('hp:100');
    await expect(page.getByTestId('harbor-manifest')).toContainText('HESP01');
  });

  test('moves on input with server-confirmed positions', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-2' });
    const settled = await waitForHarbor(page, 'harbor-pos', (t) => !Number.isNaN(statX(t)), 10000);
    const before = statX(settled);
    await page.keyboard.down('d');
    const moved = await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > before + 40, 15000);
    await page.keyboard.up('d');
    expect(statX(moved)).toBeGreaterThan(before);
  });

  test('talks, hires, and starts a watch', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-3' });
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
    await expect(page.getByTestId('harbor-manifest')).toContainText('Smoke-3', { timeout: 10000 });
    await expect(page.getByTestId('harbor-watch')).toContainText('watch#', { timeout: 20000 });
  });

  test('suit seal and fire register on the wire', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-4' });
    await page.keyboard.press('t');
    await expect(page.getByTestId('harbor-vitals')).toContainText('suit:sealed', {
      timeout: 10000,
    });
    await page.keyboard.press('f');
    await waitForHarbor(
      page,
      'harbor-vitals',
      (t) => Number(/heat:(\d+)/.exec(t)?.[1] ?? 0) > 0,
      10000
    );
  });

  test('toggles the lobby door open', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-5' });
    await page.keyboard.down('d');
    await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 510, 20000);
    await page.keyboard.up('d');
    await page.keyboard.press('e');
    await expect(page.getByTestId('harbor-notices')).toContainText('DOOR_ok', { timeout: 10000 });
    expect(statRoom(await page.getByTestId('harbor-status').innerText())).toBe('lobby');
  });
});
