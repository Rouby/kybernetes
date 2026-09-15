import { expect, type Page, test } from '@playwright/test';
import { waitForHarbor } from './boarding';
import { harborUrl, type StartedDaemon, startDaemon, stopDaemon } from './daemon';

/**
 * Star-chart captures: open the nav console in the live world, screenshot
 * the chart screen, draft a POI visit, and screenshot the preview state.
 * Movement is closed-loop off the debug pos readout toward the bridge
 * nav console at ship frame (100, 65); the E key opens whatever fixture
 * is nearest, so the loop also taps E and watches for the plot zone.
 */

interface UiZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type UiWindow = { __uiZones?: UiZone[] };

async function waitUiZone(page: Page, id: string, timeout = 15000): Promise<UiZone> {
  const handle = await page.waitForFunction(
    (want: string) => (window as unknown as UiWindow).__uiZones?.find((z) => z.id === want) ?? null,
    id,
    { timeout }
  );
  return (await handle.jsonValue()) as UiZone;
}

async function uiZoneIds(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as unknown as UiWindow).__uiZones ?? []).map((z) => z.id));
}

async function clickZone(page: Page, canvasTestId: string, zone: UiZone): Promise<void> {
  const box = await page.getByTestId(canvasTestId).boundingBox();
  if (box === null) throw new Error(`canvas missing: ${canvasTestId}`);
  await page.mouse.click(box.x + zone.x + zone.w / 2, box.y + zone.y + zone.h / 2);
}

function parsePos(text: string): { x: number; y: number } | null {
  const match = /x:(-?\d+) y:(-?\d+)/.exec(text);
  if (match === null) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

async function readPos(page: Page): Promise<{ x: number; y: number } | null> {
  const text = await page.getByTestId('harbor-pos').innerText();
  return parsePos(text);
}

const NAV_CONSOLE = { x: 100, y: 65 };
const NEAR_PX = 24;

async function chartOpen(page: Page): Promise<boolean> {
  return (await uiZoneIds(page)).includes('plot:hub_b');
}

function stepKey(dx: number, dy: number): string {
  if (Math.abs(dx) > 24) return dx > 0 ? 'KeyD' : 'KeyA';
  if (Math.abs(dy) > 24) return dy > 0 ? 'KeyS' : 'KeyW';
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'KeyD' : 'KeyA';
  return dy > 0 ? 'KeyS' : 'KeyW';
}

interface WalkTarget {
  readonly x: number;
  readonly y: number;
  readonly zoneId: string;
}

interface WalkState {
  stuck: number;
  lastDist: number | null;
  slide: number;
}

interface Sense {
  readonly zones: readonly string[];
  readonly pos: { x: number; y: number } | null;
}

async function sense(page: Page): Promise<Sense> {
  return page.evaluate(() => {
    const w = window as unknown as { __uiZones?: { id: string }[] };
    const el = document.querySelector('[data-testid="harbor-pos"]');
    const match = /x:(-?\d+) y:(-?\d+)/.exec(el?.textContent ?? '');
    return {
      zones: (w.__uiZones ?? []).map((z) => z.id),
      pos: match === null ? null : { x: Number(match[1]), y: Number(match[2]) },
    };
  });
}

async function walkStep(page: Page, target: WalkTarget, state: WalkState): Promise<boolean> {
  const seen = await sense(page);
  if (seen.zones.includes(target.zoneId)) return true;
  const pos = seen.pos;
  if (pos === null) {
    await page.waitForTimeout(300);
    return false;
  }
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < NEAR_PX) {
    await tapInteract(page, state);
    return false;
  }
  await stride(page, dx, dy, dist, state);
  const after = await sense(page);
  await trackStride(page, state, dist, pos, after.pos);
  return after.zones.includes(target.zoneId);
}

async function tapInteract(page: Page, state: WalkState): Promise<void> {
  state.stuck = 0;
  state.slide = 0;
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
}

async function stride(
  page: Page,
  dx: number,
  dy: number,
  dist: number,
  state: WalkState
): Promise<void> {
  const key = state.slide > 0 ? otherKey(dx, dy) : stepKey(dx, dy);
  if (state.slide > 0) state.slide -= 1;
  const holdMs = Math.min(300, Math.max(100, Math.round(dist * 3)));
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}

async function trackStride(
  page: Page,
  state: WalkState,
  dist: number,
  from: { x: number; y: number },
  next: { x: number; y: number } | null
): Promise<void> {
  const moved = next === null ? 0 : Math.hypot(next.x - from.x, next.y - from.y);
  const last = state.lastDist;
  state.lastDist = dist;
  if (moved > 6 || (last !== null && dist < last - 2)) {
    state.stuck = 0;
    return;
  }
  state.stuck += 1;
  if (state.stuck % 4 === 0) await page.keyboard.press('e');
  if (state.stuck >= 8) {
    state.stuck = 0;
    state.slide = 3;
  }
}

function otherKey(dx: number, dy: number): string {
  if (Math.abs(dx) >= Math.abs(dy)) return dy > 0 ? 'KeyS' : 'KeyW';
  return dx > 0 ? 'KeyD' : 'KeyA';
}

async function walkToTarget(page: Page, target: WalkTarget, maxSteps: number): Promise<boolean> {
  const state: WalkState = { stuck: 0, lastDist: null, slide: 0 };
  for (let i = 0; i < maxSteps; i += 1) {
    if (await walkStep(page, target, state)) return true;
  }
  return (await uiZoneIds(page)).includes(target.zoneId);
}

/** Follow door waypoints, then finish on the target console. */
async function walkRoute(
  page: Page,
  waypoints: ReadonlyArray<{ x: number; y: number }>,
  target: WalkTarget,
  maxSteps: number
): Promise<boolean> {
  const state: WalkState = { stuck: 0, lastDist: null, slide: 0 };
  let leg = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    const seen = await sense(page);
    if (seen.zones.includes(target.zoneId)) return true;
    const point = waypoints[leg];
    if (point === undefined) return walkToTarget(page, target, maxSteps - i);
    const pos = seen.pos;
    if (pos !== null && Math.hypot(point.x - pos.x, point.y - pos.y) < 30) {
      leg += 1;
      state.stuck = 0;
      state.lastDist = null;
      continue;
    }
    if (await walkStep(page, { ...point, zoneId: target.zoneId }, state)) return true;
  }
  return (await uiZoneIds(page)).includes(target.zoneId);
}

const BRIDGE_DOOR = { x: 60, y: 70 };
const CORRIDOR_TOP = { x: 12, y: 70 };
const CORRIDOR_MID = { x: 12, y: 320 };
const CORRIDOR_BOTTOM = { x: 12, y: 560 };
const REACTOR_DOOR = { x: 60, y: 560 };
const REACTOR_CONSOLE = { x: 110, y: 480, zoneId: 'restart' };
const TO_REACTOR = [BRIDGE_DOOR, CORRIDOR_TOP, CORRIDOR_MID, CORRIDOR_BOTTOM, REACTOR_DOOR];
const TO_BRIDGE = [REACTOR_DOOR, CORRIDOR_BOTTOM, CORRIDOR_MID, CORRIDOR_TOP, BRIDGE_DOOR];

test.describe('Star chart course plotting', () => {
  test.setTimeout(300000);
  let daemon: StartedDaemon | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('nav console opens a starfield chart and drafts a POI visit', async ({ page }) => {
    await page.goto(harborUrl(daemon, 'debug=1'));
    await waitUiZone(page, 'embark');
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    await page.waitForTimeout(1200);
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    const box = await page.getByTestId('harbor-canvas').boundingBox();
    if (box === null) throw new Error('canvas missing: harbor-canvas');
    const clickUiZone = async (id: string): Promise<void> => {
      const zone = await waitUiZone(page, id);
      await page.mouse.click(box.x + zone.x + zone.w / 2, box.y + zone.y + zone.h / 2);
    };
    await expect(page.getByTestId('harbor-canvas')).toBeVisible({ timeout: 30000 });
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    expect(await walkRoute(page, TO_REACTOR, REACTOR_CONSOLE, 400)).toBe(true);
    await clickUiZone('restart');
    await page.waitForTimeout(800);
    await clickUiZone('close');
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
    await page.mouse.click(box.x + zone.x + zone.w / 2, box.y + zone.y + zone.h / 2);
    await page.waitForFunction(
      () => ((window as unknown as UiWindow).__uiZones ?? []).some((z) => z.id === 'confirm'),
      null,
      { timeout: 15000 }
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/chart-preview.png' });
    const down = await waitUiZone(page, 'thrustDown');
    await page.mouse.click(box.x + down.x + down.w / 2, box.y + down.y + down.h / 2);
    await page.mouse.click(box.x + down.x + down.w / 2, box.y + down.y + down.h / 2);
    await page.waitForTimeout(800);
    expect(await uiZoneIds(page)).toContain('confirm');
    await page.screenshot({ path: 'test-results/chart-thrust.png' });
    const confirm = await waitUiZone(page, 'confirm');
    await page.mouse.click(box.x + confirm.x + confirm.w / 2, box.y + confirm.y + confirm.h / 2);
    await page.waitForFunction(
      () => !((window as unknown as UiWindow).__uiZones ?? []).some((z) => z.id === 'confirm'),
      null,
      { timeout: 15000 }
    );
    await page.waitForTimeout(14000);
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await page.screenshot({ path: 'test-results/chart-flight.png' });
  });
});
