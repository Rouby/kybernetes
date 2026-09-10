import type { Page } from '@playwright/test';

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
