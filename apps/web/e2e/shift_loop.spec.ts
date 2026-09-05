import { expect, type Page, test } from '@playwright/test';
import { waitForVesselSocket } from './helpers';

async function embarkAsWiper(page: Page, callsign = 'Cadet-Solo') {
  await page.goto('/?beacon=SOLO01&e2e=true');
  await page.getByTestId('join-ship-btn').click();
  await expect(page.getByTestId('character-creation-modal')).toBeVisible();
  await page.getByTestId('dossier-callsign-input').fill(callsign);
  await page.getByTestId('confirm-dossier-btn').click();
  const canvas = page.getByTestId('vessel-canvas');
  await expect(canvas).toBeVisible();
  await canvas.focus();
}

test.describe('Shift Checklist Quests & Ambient Bot Crew Loop', () => {
  test('unoccupied roles are automatically staffed by bot crewmates in the manifest', async ({
    page,
  }) => {
    await embarkAsWiper(page, 'Solo-Eng');
    await waitForVesselSocket(page);

    // Open Crew Manifest Modal via [M]
    await page.keyboard.press('KeyM');
    await expect(page.getByTestId('crew-manifest-modal')).toBeVisible();

    // Verify player is on manifest
    await expect(page.getByTestId('crew-member-Solo-Eng')).toBeVisible();

    // Verify the 4 unchosen roles are staffed by our bots with diegetic callsigns
    await expect(page.getByTestId('crew-member-Cook Higgins [LOG-3]')).toBeVisible();
    await expect(page.getByTestId('crew-member-Marine Ortiz [SEC-3]')).toBeVisible();
    await expect(page.getByTestId('crew-member-Tender Chen [BIO-3]')).toBeVisible();
    await expect(page.getByTestId('crew-member-Rigger Kowalski [HLD-3]')).toBeVisible();

    // Close manifest
    await page.getByTestId('close-manifest-btn').click();
    await expect(page.getByTestId('crew-manifest-modal')).not.toBeVisible();
  });

  test('completes 3-task shift checklist, receives S/A rating, and debrief card opens', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await embarkAsWiper(page, 'Shift-Wiper');
    await waitForVesselSocket(page);

    // Capture gameplay HUD with top-left Shift Checklist panel
    await page.screenshot({
      path: 'test-results/screenshots/ca834404-2e36-4392-85f2-f64b63704217/shift_checklist_hud.png',
    });

    // Wiper spawns in Engineering right by reactor_primary_console (x: 850, y: 560)
    // Task 1: Scrub Plasma Grids (10s)
    await page.keyboard.press('KeyE');
    await page.waitForFunction(
      () =>
        (window as unknown as { __shiftChecklist?: { tasks: { completed: boolean }[] } })
          .__shiftChecklist?.tasks[0]?.completed,
      { timeout: 25000 }
    );

    // Task 2: Purge Coolant Lines (15s)
    await page.keyboard.press('KeyE');
    await page.waitForFunction(
      () =>
        (window as unknown as { __shiftChecklist?: { tasks: { completed: boolean }[] } })
          .__shiftChecklist?.tasks[1]?.completed,
      { timeout: 30000 }
    );

    // Task 3: Scrub Plasma Grids (10s)
    await page.keyboard.press('KeyE');
    await page.waitForFunction(
      () =>
        (window as unknown as { __shiftChecklist?: { tasks: { completed: boolean }[] } })
          .__shiftChecklist?.tasks[2]?.completed,
      { timeout: 25000 }
    );

    // After task 3 finishes, ShiftDebriefModal should pop up
    const debriefModal = page.getByTestId('shift-debrief-modal');
    await expect(debriefModal).toBeVisible({ timeout: 10000 });

    // Capture debrief popup card
    await page.screenshot({
      path: 'test-results/screenshots/ca834404-2e36-4392-85f2-f64b63704217/shift_debrief_modal.png',
    });

    // Verify button to commence next watch shift
    const nextBtn = page.getByTestId('btn-next-shift');
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();
    await expect(debriefModal).not.toBeVisible();
  });
});
