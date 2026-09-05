import { expect, test } from '@playwright/test';
import { quickBoard } from './helpers';

test.describe('Atmospheric & Environmental Sensor View-Overlays', () => {
  test('cycles view-overlays via [V] key shortcut and HUD sensor button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const canvas = await quickBoard(page);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const width = box?.width ?? 1280;
    const height = box?.height ?? 720;

    // 1. Test keyboard cycling via [V]
    // Cycle to O2
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // Capture screenshot of Oxygen Available heatmap overlay
    await page.screenshot({
      path: 'test-results/screenshots/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_o2.png',
    });

    // Cycle to Temperature
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // Capture screenshot of Thermal distribution heatmap overlay
    await page.screenshot({
      path: 'test-results/screenshots/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_temp.png',
    });

    // Cycle to Pressure
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // Capture screenshot of Barometric cabin pressure heatmap overlay
    await page.screenshot({
      path: 'test-results/screenshots/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_pressure.png',
    });

    // Cycle back to OFF
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // 2. Test interactive HUD SENSOR button in the top-right visor
    const marginX = Math.max(72, Math.round(width * 0.055));
    const marginY = Math.max(38, Math.round(height * 0.055));
    const panelW = 595;
    const topVisorX = width - panelW - marginX;
    const topVisorY = marginY;

    // btn_sensor is at x + 305, y + 21, width 140, height 27
    const sensorBtnX = topVisorX + 305 + 70;
    const sensorBtnY = topVisorY + 21 + 13;

    // Click sensor button to activate O2 overlay
    await canvas.click({ position: { x: sensorBtnX, y: sensorBtnY } });
    await page.waitForTimeout(300);

    // Click again to cycle to TEMP
    await canvas.click({ position: { x: sensorBtnX, y: sensorBtnY } });
    await page.waitForTimeout(300);

    // Click again to cycle to ATM (Pressure)
    await canvas.click({ position: { x: sensorBtnX, y: sensorBtnY } });
    await page.waitForTimeout(300);

    // Click again to return to OFF
    await canvas.click({ position: { x: sensorBtnX, y: sensorBtnY } });
    await page.waitForTimeout(300);
  });

  test('rapidly decompresses compartment upon airlock opening and renders void indigo cells', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await quickBoard(page);

    // Cycle to Pressure overlay mode [V] x 3
    await page.keyboard.press('KeyV');
    await page.keyboard.press('KeyV');
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // Wait for the joined session socket before triggering the outer hatch.
    await expect
      .poll(() => page.evaluate(() => window.__kybernetesSocket?.readyState === WebSocket.OPEN))
      .toBe(true);
    await page.evaluate(() => {
      window.__kybernetesSocket?.send(
        JSON.stringify({
          type: 'TOGGLE_DOOR',
          doorId: 'airlock_stbd_outer',
          timestamp: Date.now(),
        })
      );
    });

    // Wait for fast 2-4s decompression wave to vent airlock
    await page.waitForTimeout(2200);

    // Capture screenshot of decompressed void indigo cells
    await page.screenshot({
      path: 'test-results/screenshots/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_pressure_decompressed.png',
    });
  });

  test('renders gentle decompression vapor billowing into space and organic snowflake visor frost upon depressurization', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await quickBoard(page);

    // Wait for the joined session socket before triggering the outer hatch.
    await expect
      .poll(() => page.evaluate(() => window.__kybernetesSocket?.readyState === WebSocket.OPEN))
      .toBe(true);

    // 1. Isolate engineering first by closing the radiation blast door
    await page.evaluate(() => {
      window.__kybernetesSocket?.send(
        JSON.stringify({
          type: 'TOGGLE_DOOR',
          doorId: 'door_eng',
          open: false,
          timestamp: Date.now(),
        })
      );
    });
    await page.waitForTimeout(100);

    // 2. Open aft engineering purge vent into vacuum
    await page.evaluate(() => {
      window.__kybernetesSocket?.send(
        JSON.stringify({
          type: 'TOGGLE_DOOR',
          doorId: 'airlock_eng',
          open: true,
          timestamp: Date.now(),
        })
      );
    });

    // Capture initial fine mist jet venting into space from the purge vent
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'test-results/screenshots/fc111e1b-2af9-4a71-bc88-c998a7c12ac2/isolated_airlock_venting_mist.png',
    });

    // 3. Wait for the isolated engineering compartment to fully evacuate to 0.0 kPa (2.5s)
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: 'test-results/screenshots/fc111e1b-2af9-4a71-bc88-c998a7c12ac2/isolated_airlock_evacuated_stopped.png',
    });

    // 4. Now open the NEXT door (door_eng): pressurized corridor vents into engineering and out the purge vent!
    await page.evaluate(() => {
      window.__kybernetesSocket?.send(
        JSON.stringify({
          type: 'TOGGLE_DOOR',
          doorId: 'door_eng',
          open: true,
          timestamp: Date.now(),
        })
      );
    });

    // Wait 500ms for cascading fine mist to erupt across the doorway and through the purge vent
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'test-results/screenshots/fc111e1b-2af9-4a71-bc88-c998a7c12ac2/cascading_next_room_fine_mist.png',
    });
  });
});
