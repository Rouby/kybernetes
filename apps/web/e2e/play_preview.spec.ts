import { expect, type Page, test } from '@playwright/test';

async function statsText(page: Page): Promise<string> {
  return page.getByTestId('play-stats').innerText();
}

function statX(text: string): number {
  return Number(/x:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

test.describe('Playable kernel slice (M3)', () => {
  test('station bay: E opens the gauntlet door, cooldown bites, walk through', async ({ page }) => {
    await page.goto('/?hull=station&play=1');
    await expect(page.getByTestId('play-canvas')).toBeVisible();
    await expect(page.getByTestId('play-stats')).toContainText('room:bay');
    await expect(page.getByTestId('play-stats')).toContainText('door:bay_gauntlet:closed');

    await page.keyboard.press('e');
    await expect(page.getByTestId('play-notice')).toContainText('door open');
    await expect(page.getByTestId('play-stats')).toContainText('door:bay_gauntlet:open');

    await page.keyboard.press('e');
    await expect(page.getByTestId('play-notice')).toContainText('door cooldown');
    await expect(page.getByTestId('play-stats')).toContainText('door:bay_gauntlet:open');

    await page.keyboard.down('d');
    await expect(page.getByTestId('play-stats')).toContainText('room:gauntlet', { timeout: 15000 });
    await page.keyboard.up('d');
    await expect(page.getByTestId('play-stats')).toContainText('explored:2');
  });

  test('station walls stop the pawn without tunneling', async ({ page }) => {
    await page.goto('/?hull=station&play=1');
    await expect(page.getByTestId('play-canvas')).toBeVisible();
    await page.keyboard.down('d');
    await page.waitForTimeout(4000);
    await page.keyboard.up('d');
    const x = statX(await statsText(page));
    expect(x).toBeLessThanOrEqual(1020 - 12 + 2);
  });

  test('hesperia armory: open the door and walk to the corridor', async ({ page }) => {
    await page.goto('/?hull=hesperia&play=1');
    await expect(page.getByTestId('play-canvas')).toBeVisible();
    await expect(page.getByTestId('play-stats')).toContainText('room:armory');
    await page.keyboard.press('e');
    await expect(page.getByTestId('play-notice')).toContainText('door open');
    await page.keyboard.down('w');
    await expect(page.getByTestId('play-stats')).toContainText('room:corridor', { timeout: 15000 });
    await page.keyboard.up('w');
    await expect(page.getByTestId('play-stats')).toContainText('explored:2');
  });

  test('station bay: hull puncture vents the room from authority telemetry', async ({ page }) => {
    await page.goto('/?hull=station&play=1');
    await expect(page.getByTestId('play-canvas')).toBeVisible();
    await expect(page.getByTestId('play-stats')).toContainText('p:101.3');
    await page.keyboard.press('b');
    await expect(page.getByTestId('play-notice')).toContainText('puncture bay');
    await expect(page.getByTestId('play-stats')).toContainText('vent:1', { timeout: 20000 });
    const text = await page.getByTestId('play-stats').innerText();
    const pressure = Number(/p:(\d+\.\d+)/.exec(text)?.[1] ?? Number.NaN);
    expect(pressure).toBeLessThan(101);
    await page.screenshot({ path: 'test-results/hull-vent.png' });
  });
});
