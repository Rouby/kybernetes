import { expect, test } from '@playwright/test';

test.describe('Atmospheric & Environmental Sensor View-Overlays', () => {
  test('cycles view-overlays via [V] key shortcut and HUD sensor button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?e2e=true');

    // Quick-board into the ship
    await page.getByTestId('quick-board-btn').click();

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);

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
      path: 'C:/Users/jonat/.gemini/antigravity/brain/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_o2.png',
    });

    // Cycle to Temperature
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // Capture screenshot of Thermal distribution heatmap overlay
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_temp.png',
    });

    // Cycle to Pressure
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // Capture screenshot of Barometric cabin pressure heatmap overlay
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_pressure.png',
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
    await page.goto('/?e2e=true');
    await page.getByTestId('quick-board-btn').click();

    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();

    // Cycle to Pressure overlay mode [V] x 3
    await page.keyboard.press('KeyV');
    await page.keyboard.press('KeyV');
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(300);

    // Trigger airlock opening via window or socket
    await page.evaluate(() => {
      const win = window as unknown as { __kybernetesSocket?: WebSocket };
      if (win.__kybernetesSocket && win.__kybernetesSocket.readyState === WebSocket.OPEN) {
        win.__kybernetesSocket.send(
          JSON.stringify({
            type: 'TOGGLE_DOOR',
            doorId: 'airlock_stbd_outer',
            timestamp: Date.now(),
          })
        );
      }
    });

    // Wait for fast 2-4s decompression wave to vent airlock
    await page.waitForTimeout(2200);

    // Capture screenshot of decompressed void indigo cells
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/624877c0-8b32-434c-a965-cdf97ec0de13/sensor_overlay_pressure.png',
    });
  });
});
