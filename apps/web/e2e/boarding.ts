import { expect, type Page } from '@playwright/test';

interface E2ESocketWindow {
  __kybernetesSocket?: WebSocket;
}

/** Wait until the harbor socket reports OPEN. */
async function waitForHarborSocket(page: Page, timeout = 20_000): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as E2ESocketWindow).__kybernetesSocket?.readyState === 1
        ),
      { timeout }
    )
    .toBe(true);
}

/**
 * Board the harbor client: load ?harbor=1, embark through the menu, wait
 * for canvas, socket, JOINED handshake, and the first SNAPSHOT. Returns
 * the canvas locator.
 */
export async function harborBoard(
  page: Page,
  options: { beacon?: string; callsign?: string } = {}
) {
  const params = new URLSearchParams({ harbor: '1', debug: '1' });
  if (options.beacon !== undefined) params.set('beacon', options.beacon);
  if (options.callsign !== undefined) params.set('callsign', options.callsign);
  await page.goto(`/?${params.toString()}`);
  await expect(page.getByTestId('terminal-canvas')).toBeVisible();
  const embark = await terminalZoneCenter(page, 'embark');
  await page.mouse.click(embark.x, embark.y);
  const canvas = page.getByTestId('harbor-canvas');
  await expect(canvas).toBeVisible();
  await waitForHarborSocket(page);
  await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
  await waitForHarbor(page, 'harbor-status', (t) => t.includes('room:'), 20000);
  await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('hp:'), 20000);
  return canvas;
}

/** Terminal hit zones published by the canvas menu for pointer tests. */
interface TerminalZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function terminalZoneCenter(
  page: Page,
  id: string
): Promise<{ x: number; y: number }> {
  const zones = await page.evaluate(() => {
    const seen = (window as unknown as { __terminalMenuZones?: TerminalZone[] })
      .__terminalMenuZones;
    return seen ?? [];
  });
  const zone = zones.find((entry) => entry.id === id);
  if (zone === undefined) throw new Error(`terminal zone missing: ${id}`);
  return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
}

/** Read a harbor HUD readout by test id. */
async function harborText(page: Page, testId: string): Promise<string> {
  return page.getByTestId(testId).innerText();
}

/** Poll a harbor HUD readout until the predicate holds. */
export async function waitForHarbor(
  page: Page,
  testId: string,
  pred: (text: string) => boolean,
  timeoutMs: number
): Promise<string> {
  const start = Date.now();
  let text = await harborText(page, testId);
  while (!pred(text)) {
    if (Date.now() - start > timeoutMs) throw new Error(`harbor timeout; last ${testId}: ${text}`);
    await page.waitForTimeout(200);
    text = await harborText(page, testId);
  }
  return text;
}

/**
 * Wait until the shared viewport target matches on two consecutive polls.
 * Use with no keys held: a stationary pawn cannot move between the confirm
 * poll and the keypress, so the press fires the observed target instead of
 * racing it. A timeout here means the pawn stopped out of reach.
 */
export async function waitForStableTarget(
  page: Page,
  pred: (text: string) => boolean,
  timeoutMs = 20000
): Promise<string> {
  const start = Date.now();
  let prev = await harborText(page, 'harbor-target');
  for (;;) {
    await page.waitForTimeout(200);
    const text = await harborText(page, 'harbor-target');
    if (pred(text) && pred(prev)) return text;
    prev = text;
    if (Date.now() - start > timeoutMs)
      throw new Error(`stable target timeout; last harbor-target: ${text}`);
  }
}
