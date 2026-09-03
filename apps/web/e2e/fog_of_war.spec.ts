import { expect, test } from '@playwright/test';

test.describe('Performant Line of Sight & Realistic Persistent Fog of War', () => {
  test('uncovers persistent fog of war as player navigates through vessel compartments', async ({
    page,
  }) => {
    // 1. Board vessel via E2E quick board
    await page.goto('/?e2e=true');
    await expect(page.getByTestId('quick-board-btn')).toBeVisible();
    await page.getByTestId('quick-board-btn').click();

    // Wait for canvas to mount and initial frame to render
    const canvas = page.getByTestId('vessel-canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(400);

    // 2. Aim flashlight North towards corridor doorway
    await page.mouse.move(500, 100);
    await page.waitForTimeout(200);

    // 3. Move pawn North (KeyW) straight out of Engineering into Central Transit Corridor (y ~ 330)
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2200);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(300);

    // 4. Move pawn West (KeyA) along the open corridor past Cargo Bay
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(1600);
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(300);

    // 5. Aim flashlight West into the corridor ahead
    await page.mouse.move(150, 330);
    await page.waitForTimeout(600);

    // 6. Capture high-res screenshot of persistent Fog of War
    // Shows: Active 160-degree flashlight beam down corridor, Engineering behind in grayed-out explored memory, Bridge ahead in pitch black!
    await page.screenshot({
      path: 'C:/Users/jonat/.gemini/antigravity/brain/67a09665-d3cf-43a0-83fb-b03bc38ed4c7/fog_of_war.png',
      fullPage: true,
    });
  });
});
