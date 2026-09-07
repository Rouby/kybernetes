import { expect, test } from '@playwright/test';
import { quickBoard, sendAction } from './helpers';

interface RoomSummary {
  isVenting?: boolean;
  windX?: number;
  windY?: number;
  pressureKpa?: number;
}

async function lastTelemetry(page: Parameters<typeof quickBoard>[0]): Promise<{
  roomAtmospheres?: Record<string, RoomSummary>;
} | null> {
  return page.evaluate(
    () => (window as unknown as { __lastTelemetry?: unknown }).__lastTelemetry as never
  );
}

test('venting broadcasts solver wind and station rooms with wind fields', async ({ page }) => {
  await quickBoard(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __kybernetesSocket?: WebSocket;
      __lastTelemetry?: unknown;
    };
    w.__lastTelemetry = null;
    w.__kybernetesSocket?.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(String((event as MessageEvent).data)) as { type?: string };
        if (parsed?.type === 'TELEMETRY_DELTA') w.__lastTelemetry = parsed;
      } catch {
        // ignore malformed frames
      }
    });
  });
  await sendAction(page, { type: 'TOGGLE_DOOR', doorId: 'airlock_eng', open: true });

  await expect
    .poll(
      async () => {
        const t = await lastTelemetry(page);
        const eng = t?.roomAtmospheres?.engineering;
        return eng?.isVenting === true && Math.hypot(eng.windX ?? 0, eng.windY ?? 0) > 8;
      },
      { timeout: 20_000 }
    )
    .toBe(true);

  const t = await lastTelemetry(page);
  expect(t?.roomAtmospheres?.station_lobby).toBeDefined();
  expect(t?.roomAtmospheres?.gauntlet).toBeDefined();
  expect(typeof t?.roomAtmospheres?.station_lobby?.windX).toBe('number');
  expect(typeof t?.roomAtmospheres?.station_lobby?.windY).toBe('number');

  await page.keyboard.press('v');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/atmos-wind/station-overlay.png' });
});
