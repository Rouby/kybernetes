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
 * Board the harbor client: load ?harbor=1, wait for canvas, socket, JOINED
 * handshake, and the first SNAPSHOT. Returns the canvas locator.
 */
export async function harborBoard(
  page: Page,
  options: { beacon?: string; callsign?: string } = {}
) {
  const params = new URLSearchParams({ harbor: '1', debug: '1' });
  if (options.beacon !== undefined) params.set('beacon', options.beacon);
  if (options.callsign !== undefined) params.set('callsign', options.callsign);
  await page.goto(`/?${params.toString()}`);
  const canvas = page.getByTestId('harbor-canvas');
  await expect(canvas).toBeVisible();
  await waitForHarborSocket(page);
  await waitForHarbor(page, 'harbor-pawn', (t) => t !== '' && t !== '-', 20000);
  await waitForHarbor(page, 'harbor-status', (t) => t.includes('room:'), 20000);
  await waitForHarbor(page, 'harbor-vitals', (t) => t.includes('hp:'), 20000);
  return canvas;
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
