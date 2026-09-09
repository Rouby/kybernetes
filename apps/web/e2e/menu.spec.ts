import type { ChildProcess } from 'node:child_process';
import { expect, type Page, test } from '@playwright/test';
import { terminalZoneCenter, waitForHarbor } from './boarding';
import { startDaemon, stopDaemon } from './daemon';

async function zoneCenter(page: Page, id: string): Promise<{ x: number; y: number }> {
  return terminalZoneCenter(page, id);
}

test.describe('Game shell menu', () => {
  let daemon: ChildProcess | null = null;
  test.beforeAll(async () => {
    daemon = await startDaemon();
  });
  test.afterAll(async () => {
    await stopDaemon(daemon);
    daemon = null;
  });

  test('boots to the canvas terminal without a socket', async ({ page }) => {
    await page.goto('/?harbor=1');
    await expect(page.getByTestId('terminal-canvas')).toBeVisible();
    await expect(page.getByTestId('harbor-canvas')).toBeHidden();
    const embark = await terminalZoneCenter(page, 'embark');
    expect(embark.x).toBeGreaterThan(0);
    expect(embark.y).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/menu.png' });
  });

  test('embarks through canvas hit-testing into the live world', async ({ page }) => {
    await page.goto('/?harbor=1&debug=1');
    await expect(page.getByTestId('terminal-canvas')).toBeVisible();
    const at = await zoneCenter(page, 'embark');
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('hp:'), 20000);
  });

  test('customizes identity then embarks into the live world', async ({ page }) => {
    await page.goto('/?harbor=1&debug=1');
    await page.keyboard.press('c');
    await expect(page.getByRole('dialog', { name: 'Customize character' })).toBeVisible();
    await page.getByLabel('Callsign').fill('Menu-1');
    await page.getByRole('button', { name: 'HULL TRIM ion' }).click();
    await page.getByRole('button', { name: 'THRUSTER DRIVE amber' }).click();
    await page.screenshot({ path: 'test-results/customize.png' });
    await page.getByRole('button', { name: /save.*embark/i }).click();
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('hp:'), 20000);
    await page.screenshot({ path: 'test-results/customize-game.png' });
  });

  test('pauses on Escape, resumes, and quits to menu', async ({ page }) => {
    await page.goto('/?harbor=1&debug=1');
    await page.keyboard.press('e');
    await expect(page.getByTestId('harbor-canvas')).toBeVisible();
    await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.screenshot({ path: 'test-results/pause.png' });
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'QUIT TO MENU' }).click();
    await expect(page.getByTestId('terminal-canvas')).toBeVisible();
    await expect(page.getByTestId('harbor-canvas')).toBeHidden();
  });
});
