import { expect, type Page, test } from '@playwright/test';
import { waitForVesselSocket } from './helpers';

async function embark(page: Page, callsign = 'Audio-Tester') {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('start-ship-btn').click();
  await expect(page.getByTestId('character-creation-modal')).toBeVisible();
  await page.getByTestId('dossier-callsign-input').fill(callsign);
  await page.getByTestId('confirm-dossier-btn').click();
  await expect(page.getByTestId('character-creation-modal')).not.toBeVisible();
  await expect(page.getByTestId('vessel-canvas')).toBeVisible();
}

test.describe('Pure Procedural Web Audio Engine & Acoustic Mixer', () => {
  test('toggles acoustic mixer modal via [O] key and adjusts mixer settings', async ({ page }) => {
    await embark(page, 'Sound-Officer');
    await waitForVesselSocket(page);

    // Open Acoustic Mixer via [O] hotkey
    await page.keyboard.press('KeyO');
    const audioModal = page.getByTestId('audio-settings-modal');
    await expect(audioModal).toBeVisible();

    // Verify modal contains Acoustic Mixer title and sliders
    await expect(page.locator('text=ACOUSTIC MIXER')).toBeVisible();
    await expect(page.locator('text=MASTER BUS')).toBeVisible();
    await expect(page.locator('text=SHIP AMBIENCE')).toBeVisible();
    await expect(page.locator('text=MECHANICAL FOLEY')).toBeVisible();
    await expect(page.locator('text=TERMINAL & UI')).toBeVisible();
    await expect(page.locator('text=CRISIS & ALARMS')).toBeVisible();

    // Capture screenshot of Acoustic Mixer modal
    await page.screenshot({
      path: 'test-results/screenshots/f3f5442f-0049-4b42-a019-a73110627114/audio_mixer_modal.png',
    });

    // Test mute toggle button
    const muteBtn = page.getByTestId('mute-toggle-btn');
    await expect(muteBtn).toContainText('MUTE MASTER AUDIO [U]');
    await muteBtn.click();
    await expect(muteBtn).toContainText('ALL AUDIO MUTED [U]');

    // Unmute via [U] hotkey
    await page.keyboard.press('KeyU');
    await expect(muteBtn).toContainText('MUTE MASTER AUDIO [U]');

    // Close via close button
    await page.getByTestId('close-audio-btn').click();
    await expect(audioModal).not.toBeVisible();

    // Test opening and closing via Escape
    await page.keyboard.press('KeyO');
    await expect(audioModal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(audioModal).not.toBeVisible();
  });
});
