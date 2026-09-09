import type { ChildProcess } from 'node:child_process';
import { expect, type Page, test } from '@playwright/test';
import { harborBoard, waitForHarbor, waitForStableTarget } from './boarding';
import { startDaemon, stopDaemon } from './daemon';
import { statRoom, statSX, statX } from './stats';

async function crossCorridorDoor(page: Page): Promise<void> {
  let crossed = false;
  for (let attempt = 0; attempt < 3 && !crossed; attempt += 1) {
    await page.keyboard.down('d');
    await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 460, 20000);
    await page.keyboard.up('d');
    await page.waitForTimeout(400);
    await waitForStableTarget(page, (t) => t.startsWith('target:door'));
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
}

async function walkTubeToShip(page: Page): Promise<void> {
  let lastX = 0;
  let stills = 0;
  for (let tap = 0; tap < 200; tap += 1) {
    const seen = await page.getByTestId('harbor-status').innerText();
    if (statRoom(seen) === 'korridor_schiff') break;
    const x = statSX(seen);
    stills = Math.abs(x - lastX) < 5 ? stills + 1 : 0;
    lastX = x;
    if (stills >= 8) {
      stills = 0;
      await waitForHarbor(page, 'harbor-dock', (t) => t.includes('walk aboard'), 70000);
    }
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    await page.keyboard.up('d');
    await page.waitForTimeout(250);
  }
  await waitForHarbor(page, 'harbor-status', (t) => statRoom(t) === 'korridor_schiff', 20000);
}

async function hailCaptain(page: Page): Promise<string> {
  let offered = '';
  for (let i = 0; i < 6 && !offered.includes('/'); i += 1) {
    await waitForHarbor(page, 'harbor-dock', (t) => t.includes('walk aboard'), 70000);
    await page.keyboard.press('h');
    try {
      offered = await waitForHarbor(page, 'harbor-offer', (t) => t.includes('/'), 8000);
    } catch {
      offered = '';
    }
  }
  return offered;
}

test.describe('Harbor acceptance journey (C2)', () => {
  test.setTimeout(180000);
  let daemon: ChildProcess | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('walk aboard, hire, watch, grade over live v2', async ({ page }) => {
    test.setTimeout(420000);
    await harborBoard(page, { callsign: 'Journey-1' });
    await expect(page.getByTestId('harbor-status')).toContainText('room:korridor_mitte');

    await page.keyboard.down('d');
    await waitForHarbor(page, 'harbor-pos', (t) => statX(t) > 510, 20000);
    // The shared daemon may leave a corridor door open; toggle until the pawn
    // actually gets past it instead of assuming a direction. Stop and settle
    // before each press, then require the target on two consecutive polls:
    // a stationary pawn cannot move between the confirm poll and the key.
    await crossCorridorDoor(page);
    // The tube gates only walk while the vessel is docked (~30s per ~58s
    // cycle): wait for a walkable window, then tap east until the frame
    // flips instead of stopping at a position guess short of the mouth.
    // Tapping through a sealed window is harmless; the pawn resumes when
    // the ship re-docks and the gates unseal.
    await waitForHarbor(page, 'harbor-dock', (t) => t.includes('walk aboard'), 70000);
    // A departure mid-tube strands the pawn at the sealed mouth: when
    // position stalls, wait for the next walkable window instead of burning
    // the tap budget pushing at a sealed gate.
    await walkTubeToShip(page);
    // Brake, don't hike: the watch rosters crew by ship frame at leg start,
    // and the old 800ms westward walk could carry the pawn back through the
    // mouth, excluding them from tasks and pay without failing fast.
    await page.keyboard.down('a');
    await page.waitForTimeout(300);
    await page.keyboard.up('a');
    await waitForHarbor(page, 'harbor-status', (t) => statRoom(t) === 'korridor_schiff', 5000);

    // The captain only offers while docked: align each hail with a walkable
    // window instead of hailing into a transit leg for a minute straight.
    expect(await hailCaptain(page)).toContain('/');
    await page.keyboard.press('j');
    await expect(page.getByTestId('harbor-manifest')).toContainText('Journey-1', {
      timeout: 10000,
    });

    await expect(page.getByTestId('harbor-watch')).toContainText('watch#', { timeout: 25000 });
    // Grade S with every task done; the headcount varies because the watch
    // rosters whoever is aboard the ship frame when the leg starts, and the
    // approach walk can leave the player pawn just off-frame. The
    // backreference accepts any full house (3/3, 4/4) but not a partial.
    await expect(page.getByTestId('harbor-watch')).toContainText(/ S tasks:(\d+)\/\1/, {
      timeout: 45000,
    });
    await expect(page.getByTestId('harbor-vitals')).toContainText('credits:200');
  });
});
