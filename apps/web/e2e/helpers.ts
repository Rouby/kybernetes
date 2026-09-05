import { expect, type Page } from '@playwright/test';

interface E2ESocketWindow {
  __kybernetesSocket?: WebSocket;
}

/**
 * Wait until the app's vessel socket reports OPEN.
 * Replaces blind post-boarding waitForTimeout sleeps with a state predicate:
 * resolves as soon as the client is actually connected, fails fast otherwise.
 */
export async function waitForVesselSocket(page: Page, timeout = 20_000): Promise<void> {
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
 * Generate a unique 6-character vessel code for test isolation (full-entropy
 * base36 so parallel workers never share server state).
 */
export function uniqueBeacon(): string {
  return Math.floor(Math.random() * 2176782336)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
}

/**
 * Board via quick-board into an isolated vessel and wait for canvas + socket.
 * Defaults to a fresh unique room per call, so parallel workers never share
 * server state (doors, atmos, naval events, intruders) through the default vessel.
 * Returns the canvas locator.
 */
export async function quickBoard(page: Page, beacon = uniqueBeacon()) {
  await page.goto(`/?beacon=${beacon}&e2e=true`);
  await page.getByTestId('quick-board-btn').click();
  const canvas = page.getByTestId('vessel-canvas');
  await expect(canvas).toBeVisible();
  await waitForVesselSocket(page);
  return canvas;
}

/**
 * Resolve with the first server broadcast of the given type seen on the live
 * vessel socket. Attaches a one-shot message listener, so it proves a real
 * authoritative round-trip instead of just asserting the canvas is visible.
 */
export async function waitForBroadcast<T = Record<string, unknown>>(
  page: Page,
  type: string,
  timeout = 20_000
): Promise<T> {
  await waitForVesselSocket(page);
  const msg = await page.evaluate(
    ({ type, timeout }) =>
      new Promise<unknown>((resolve, reject) => {
        const sock = (window as unknown as E2ESocketWindow).__kybernetesSocket;
        if (!sock) {
          reject(new Error('no vessel socket'));
          return;
        }
        const timer = setTimeout(() => {
          sock.removeEventListener('message', onMessage);
          reject(new Error(`timed out waiting for ${type}`));
        }, timeout);
        const onMessage = (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(event.data)) as { type?: string };
            if (parsed && parsed.type === type) {
              clearTimeout(timer);
              sock.removeEventListener('message', onMessage);
              resolve(parsed);
            }
          } catch {
            // ignore malformed frames
          }
        };
        sock.addEventListener('message', onMessage);
      }),
    { type, timeout }
  );
  return msg as T;
}

/** Send a client action intent over the live vessel socket. */
export async function sendAction(page: Page, action: Record<string, unknown>): Promise<void> {
  await waitForVesselSocket(page);
  await page.evaluate((payload) => {
    (window as unknown as E2ESocketWindow).__kybernetesSocket?.send(JSON.stringify(payload));
  }, action);
}

/**
 * Send a client action and resolve with the first matching server broadcast.
 * Listener attach and send happen in a SINGLE evaluate step, so one-shot
 * replies (NAVAL_DAMAGE_EVENT, SHIP_ALERT, DAMAGE_TRIAGE_RESULT) cannot slip
 * through the gap between two separate evaluate calls. Prefer this over
 * sendAction + waitForBroadcast whenever the reply fires exactly once.
 */
export async function sendActionAndWait<T = Record<string, unknown>>(
  page: Page,
  action: Record<string, unknown>,
  type: string,
  timeout = 20_000
): Promise<T> {
  await waitForVesselSocket(page);
  const msg = await page.evaluate(
    ({ action, type, timeout }) =>
      new Promise<unknown>((resolve, reject) => {
        const sock = (window as unknown as E2ESocketWindow).__kybernetesSocket;
        if (sock?.readyState !== 1) {
          reject(new Error('no open vessel socket'));
          return;
        }
        const timer = setTimeout(() => {
          sock.removeEventListener('message', onMessage);
          reject(new Error(`timed out waiting for ${type}`));
        }, timeout);
        const onMessage = (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(String(event.data)) as { type?: string };
            if (parsed && parsed.type === type) {
              clearTimeout(timer);
              sock.removeEventListener('message', onMessage);
              resolve(parsed);
            }
          } catch {
            // ignore malformed frames
          }
        };
        sock.addEventListener('message', onMessage);
        sock.send(JSON.stringify(action));
      }),
    { action, type, timeout }
  );
  return msg as T;
}
