import { expect, type Page, test } from '@playwright/test';

async function statsText(page: Page): Promise<string> {
  return page.getByTestId('play-stats').innerText();
}

function statX(text: string): number {
  return Number(/x:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

function statHyp(text: string): number {
  return Number(/hyp:(-?\d+)/.exec(text)?.[1] ?? Number.NaN);
}

function statRoom(text: string): string {
  return /room:([A-Za-z_]+)/.exec(text)?.[1] ?? '';
}

async function waitForStats(
  page: Page,
  pred: (text: string) => boolean,
  timeoutMs: number
): Promise<string> {
  const start = Date.now();
  let text = await statsText(page);
  while (!pred(text)) {
    if (Date.now() - start > timeoutMs) throw new Error(`stats timeout; last: ${text}`);
    await page.waitForTimeout(200);
    text = await statsText(page);
  }
  return text;
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

  test('harbor: walk aboard, hire, watch, grade, and redock', async ({ page }) => {
    await page.goto('/?hull=harbor&play=1');
    await expect(page.getByTestId('play-canvas')).toBeVisible();
    await expect(page.getByTestId('play-stats')).toContainText('room:lobby');
    await expect(page.getByTestId('play-stats')).toContainText('role:none');

    await page.keyboard.down('d');
    await waitForStats(page, (t) => statX(t) > 510, 20000);
    await page.keyboard.up('d');
    await page.keyboard.press('e');
    await expect(page.getByTestId('play-notice')).toContainText('door open');
    await page.keyboard.down('d');
    await waitForStats(page, (t) => statX(t) > 820 || statRoom(t) === 'corridor', 20000);
    await page.keyboard.up('d');
    for (let tap = 0; tap < 40; tap += 1) {
      const seen = await statsText(page);
      if (statRoom(seen) === 'corridor') break;
      await page.keyboard.press('d');
      await page.waitForTimeout(300);
    }
    const crossed = await waitForStats(
      page,
      (t) => statRoom(t) === 'corridor' && statX(t) < 800,
      8000
    );
    expect(statX(crossed)).toBeLessThan(800);

    await page.keyboard.press('h');
    await expect(page.getByTestId('play-notice')).toContainText('offer:');
    await page.keyboard.press('j');
    await expect(page.getByTestId('play-notice')).toContainText('hired');
    await expect
      .poll(() => page.getByTestId('play-stats').innerText())
      .toMatch(/role:(engineer|deckhand|cook|security)/);

    await expect(page.getByTestId('play-stats')).toContainText('grade:S', { timeout: 45000 });
    await expect(page.getByTestId('play-stats')).toContainText('credits:200');
    await expect(page.getByTestId('play-stats')).toContainText('sched:docked', { timeout: 20000 });
    await expect(page.getByTestId('play-hud')).toContainText('crew:4');
    await expect(page.getByTestId('play-hud')).toContainText('beacon:HESP01');
    await expect(page.getByTestId('play-hud')).toContainText('hull:100');
    await expect(page.getByTestId('play-hud')).toContainText('heat:0');
    await expect(page.getByTestId('play-hud')).toContainText('say:', { timeout: 20000 });
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

  test('harbor lobby: suit seal matters for hypoxia', async ({ page }) => {
    await page.goto('/?hull=harbor&play=1');
    await expect(page.getByTestId('play-canvas')).toBeVisible();
    await expect(page.getByTestId('play-stats')).toContainText('suit:open');
    await page.keyboard.press('b');
    await expect(page.getByTestId('play-notice')).toContainText('puncture lobby');
    const gasping = await waitForStats(page, (t) => statHyp(t) > 5, 30000);
    const choking = statHyp(gasping);
    await page.keyboard.press('t');
    await expect(page.getByTestId('play-notice')).toContainText('suit sealed');
    await expect(page.getByTestId('play-stats')).toContainText('suit:sealed');
    await page.waitForTimeout(3000);
    expect(statHyp(await statsText(page))).toBeLessThan(choking);
  });

  test('station: shot door and wall vent rooms', async ({ page }) => {
    await page.goto('/?hull=station&play=1');
    await expect(page.getByTestId('play-canvas')).toBeVisible();
    await page.keyboard.press('f');
    await expect(page.getByTestId('play-notice')).toContainText('fire door');
    for (let i = 0; i < 3; i += 1) {
      await page.waitForTimeout(400);
      await page.keyboard.press('f');
    }
    await expect(page.getByTestId('play-notice')).toContainText('fire breach');
    await page.keyboard.press('f');
    await waitForStats(page, (t) => t.includes('vent:1'), 20000);
    await page.keyboard.down('w');
    await page.waitForTimeout(1200);
    await page.keyboard.up('w');
    await page.keyboard.press('f');
    await waitForStats(page, (t) => t.includes('vent:2'), 25000);
  });
});
