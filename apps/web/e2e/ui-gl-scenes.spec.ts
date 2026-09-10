import type { ChildProcess } from 'node:child_process';
import { expect, type Page, test } from '@playwright/test';
import { waitForHarbor } from './boarding';
import { startDaemon, stopDaemon } from './daemon';

/**
 * WebGL2 UI scene captures: menu, customize, intro, live HUD, pause, and
 * settings on the framework-free stack; death/game-over need lethal flows
 * and stay unit-covered for now.
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

async function waitUiGone(page: Page, id: string, timeout = 15000): Promise<void> {
  await page.waitForFunction(
    (want: string) => !((window as unknown as UiWindow).__uiZones ?? []).some((z) => z.id === want),
    id,
    { timeout }
  );
}

async function clickZone(page: Page, canvasTestId: string, zone: UiZone): Promise<void> {
  const box = await page.getByTestId(canvasTestId).boundingBox();
  if (box === null) throw new Error(`canvas missing: ${canvasTestId}`);
  await page.mouse.click(box.x + zone.x + zone.w / 2, box.y + zone.y + zone.h / 2);
}

async function callsignValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Callsign"]');
    return input instanceof HTMLInputElement ? input.value : '';
  });
}

test.describe('GL UI scenes', () => {
  test.setTimeout(180000);
  let daemon: ChildProcess | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('menu boots to the GL splash without a socket', async ({ page }) => {
    await page.goto('/?harbor=1');
    await expect(page.getByTestId('gl-splash')).toBeVisible();
    await expect(page.getByTestId('terminal-canvas')).toHaveCount(0);
    const embark = await waitUiZone(page, 'embark');
    expect(embark.w).toBeGreaterThan(0);
    await waitUiZone(page, 'customize');
    await page.screenshot({ path: 'test-results/menu-gl.png' });
  });

  test('GL UI is the default with no flag', async ({ page }) => {
    await page.goto('/?harbor=1');
    await expect(page.getByTestId('gl-splash')).toBeVisible();
    await expect(page.getByTestId('terminal-canvas')).toHaveCount(0);
    await waitUiZone(page, 'embark');
  });

  test('menu Enter reaches the GL intro card', async ({ page }) => {
    await page.goto('/?harbor=1');
    await waitUiZone(page, 'embark');
    await page.keyboard.press('Enter');
    await waitUiGone(page, 'customize');
    await waitUiZone(page, 'embark');
    await page.screenshot({ path: 'test-results/intro-gl.png' });
  });

  test('customize tints, types, and embarks to the live world', async ({ page }) => {
    await page.goto('/?harbor=1&debug=1');
    await waitUiZone(page, 'embark');
    await page.keyboard.press('c');
    const tint = await waitUiZone(page, 'tint:#00e5ff');
    await clickZone(page, 'gl-splash', tint);
    const field = await waitUiZone(page, 'field:callsign');
    await clickZone(page, 'gl-splash', field);
    await page.waitForFunction(() => {
      const active = document.activeElement;
      const input = document.querySelector('input[aria-label="Callsign"]');
      return active !== null && active === input;
    });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Gl-1');
    expect(await callsignValue(page)).toBe('Gl-1');
    await page.screenshot({ path: 'test-results/customize-gl.png' });
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    await waitUiGone(page, 'field:callsign');
    await clickZone(page, 'gl-splash', await waitUiZone(page, 'embark'));
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('hp:'), 20000);
    await page.screenshot({ path: 'test-results/customize-game-gl.png' });
  });

  test('pause and settings ride the in-canvas overlay', async ({ page }) => {
    await page.goto('/?harbor=1&debug=1');
    await waitUiZone(page, 'embark');
    await page.keyboard.press('Enter');
    await waitUiGone(page, 'customize');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    await page.keyboard.press('Escape');
    const resume = await waitUiZone(page, 'resume');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/pause-gl.png' });
    await clickZone(page, 'harbor-canvas', await waitUiZone(page, 'audio'));
    await waitUiZone(page, 'voldn');
    await page.screenshot({ path: 'test-results/settings-gl.png' });
    await clickZone(page, 'harbor-canvas', await waitUiZone(page, 'close'));
    await waitUiZone(page, 'resume');
    await clickZone(page, 'harbor-canvas', resume);
    await page.keyboard.press('Escape');
    await waitUiZone(page, 'resume');
  });
});
