import type { ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import {
  angDiff,
  harborBoard,
  startDaemon,
  statFace,
  statRoom,
  statSX,
  statX,
  stopDaemon,
  waitForHarbor,
} from './helpers';

test.describe('Harbor client smoke (C2)', () => {
  let daemon: ChildProcess | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('connects, joins, and streams ticked snapshots', async ({ page }) => {
    const canvas = await harborBoard(page, { callsign: 'Smoke-1' });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(900);
    await expect(page.getByTestId('harbor-status')).toContainText('room:lobby');
    const first = await waitForHarbor(page, 'harbor-status', (t) => /tick:(\d+)/.test(t), 10000);
    const firstTick = Number(/tick:(\d+)/.exec(first)?.[1] ?? 0);
    const second = await waitForHarbor(
      page,
      'harbor-status',
      (t) => Number(/tick:(\d+)/.exec(t)?.[1] ?? 0) > firstTick,
      10000
    );
    expect(Number(/tick:(\d+)/.exec(second)?.[1] ?? 0)).toBeGreaterThan(firstTick);
    await expect(page.getByTestId('harbor-vitals')).toContainText('hp:100');
    await expect(page.getByTestId('harbor-manifest')).toContainText('HESP01');
  });

  test('hides the debug panel on the default route', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await expect(page.getByTestId('harbor-status')).toBeHidden();
  });

  test('moves on input with server-confirmed positions', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-2' });
    const settled = await waitForHarbor(page, 'harbor-pos', (t) => !Number.isNaN(statX(t)), 10000);
    const before = statX(settled);
    await page.keyboard.down('d');
    const moved = await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > before + 40, 15000);
    await page.keyboard.up('d');
    expect(statX(moved)).toBeGreaterThan(before);
    await page.waitForTimeout(1500);
    const pos = statX(await page.getByTestId('harbor-pos').innerText());
    const server = statSX(await page.getByTestId('harbor-status').innerText());
    expect(Math.abs(pos - server)).toBeLessThanOrEqual(30);
  });

  test('aims at the cursor and fires on click', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-6' });
    await page.mouse.move(1200, 400);
    await waitForHarbor(page, 'harbor-status', (t) => angDiff(statFace(t), 0) < 35, 10000);
    await page.mouse.move(100, 400);
    await waitForHarbor(page, 'harbor-status', (t) => angDiff(statFace(t), 180) < 35, 10000);
    await page.mouse.click(1100, 400);
    await waitForHarbor(
      page,
      'harbor-vitals',
      (t) => Number(/mag:(\d+)\//.exec(t)?.[1] ?? 30) < 30,
      10000
    );
  });

  test('fires full-auto while held', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-8' });
    await page.keyboard.down('f');
    await page.waitForTimeout(1000);
    await page.keyboard.up('f');
    const text = await page.getByTestId('harbor-vitals').innerText();
    expect(Number(/mag:(\d+)\//.exec(text)?.[1] ?? 30)).toBeLessThan(28);
  });

  test('holds fire while reloading without sending', async ({ page }) => {
    await harborBoard(page, { callsign: 'Smoke-10' });
    await page.keyboard.press('f');
    await expect(page.getByTestId('harbor-vitals')).toContainText('mag:29/120', { timeout: 10000 });
    await page.keyboard.press('r');
    await expect(page.getByTestId('harbor-vitals')).toContainText('(reloading)', {
      timeout: 10000,
    });
    await page.evaluate(() => {
      const sock = (window as unknown as { __kybernetesSocket?: WebSocket }).__kybernetesSocket;
      if (sock === undefined) throw new Error('no harbor socket');
      (window as unknown as { __fireCount?: number }).__fireCount = 0;
      const send = sock.send.bind(sock);
      sock.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
        try {
          if (typeof data === 'string' && JSON.parse(data).type === 'FIRE') {
            const counter = window as unknown as { __fireCount?: number };
            counter.__fireCount = (counter.__fireCount ?? 0) + 1;
          }
        } catch {
          // Non-JSON frames never carry intents.
        }
        return send(data as string);
      };
    });
    await page.keyboard.down('f');
    await page.waitForTimeout(1000);
    await page.keyboard.up('f');
    const sent = await page.evaluate(
      () => (window as unknown as { __fireCount?: number }).__fireCount ?? -1
    );
    expect(sent).toBe(0);
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
      (t) => Number(/mag:(\d+)\//.exec(t)?.[1] ?? 30) < 30,
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
