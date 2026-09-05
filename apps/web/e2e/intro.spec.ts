import { expect, test } from '@playwright/test';
import { quickBoard, sendActionAndWait, waitForBroadcast } from './helpers';

test.describe('Intro hire loop', () => {
  test('docks, offers two jobs, and hires on accept', async ({ page }) => {
    await quickBoard(page);
    const docking = await waitForBroadcast<{ phase: string }>(page, 'SHIP_DOCKING_UPDATE', 45000);
    expect(docking.phase).toBe('docked');
    await expect(page.getByTestId('docking-banner')).toBeVisible();
    const docked = await sendActionAndWait(
      page,
      { type: 'TALK_TO_CAPTAIN', captainId: 'captain_helm_01' },
      'CAPTAIN_JOB_OFFER',
      40000
    );
    const jobs = (docked as { jobs: { job: string }[] }).jobs;
    expect(jobs).toHaveLength(2);
    expect(jobs[0].job).not.toBe(jobs[1].job);
    await expect(page.getByRole('dialog', { name: 'Captain job offer' })).toBeVisible();
    const offerId = (docked as { offerId: string }).offerId;
    const assigned = await sendActionAndWait(
      page,
      { type: 'ACCEPT_JOB_OFFER', offerId, job: jobs[0].job },
      'JOB_ASSIGNED',
      20000
    );
    expect((assigned as { job: string }).job).toBe(jobs[0].job);
  });
});
