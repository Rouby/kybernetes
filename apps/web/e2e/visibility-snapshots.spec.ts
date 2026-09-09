/**
 * On-demand screenshots for the sim-core visibility snapshots.
 * HUMAN VERIFICATION ONLY — never a commit gate (see AGENTS.md): Chromium
 * renders each deterministic SVG from
 * `packages/sim-core/test-results/visibility/` and saves a PNG next to the
 * other e2e artifacts. Math regressions stay caught by Vitest string
 * snapshots; these PNGs are for eyeballing walls, hidden areas, and LoS
 * polygons after a visual change.
 *
 * Run: `yarn test:visibility` (builds the SVGs via Vitest, then screenshots
 * them here). No daemon or game server needed: the page is pure
 * `setContent`, the preview webServer from the shared config just idles.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVG_DIR = path.resolve(
  HERE,
  '..',
  '..',
  '..',
  'packages',
  'sim-core',
  'test-results',
  'visibility'
);
const OUT_DIR = path.resolve(HERE, '..', 'test-results', 'visibility');

function svgFiles(): string[] {
  try {
    return readdirSync(SVG_DIR)
      .filter((f) => f.endsWith('.svg'))
      .sort();
  } catch {
    return [];
  }
}

function shotName(file: string): string {
  return path.basename(file, '.svg');
}

function pageHtml(svg: string): string {
  return (
    '<!doctype html><html><body style="margin:0;background:#0b1020;display:flex">' +
    svg +
    '</body></html>'
  );
}

const FILES = svgFiles();

test.describe('visibility snapshot screenshots', () => {
  test.setTimeout(120000);

  if (FILES.length === 0) {
    test('SVGs exist (run the Vitest generator first)', () => {
      throw new Error(
        `no SVGs in ${SVG_DIR}; run 'yarn --cwd packages/sim-core test visibilitySnapshots' first`
      );
    });
    return;
  }

  for (const file of FILES) {
    test(`${shotName(file)} renders`, async ({ page }) => {
      const svg = readFileSync(path.join(SVG_DIR, file), 'utf8');
      await page.setViewportSize({ width: 900, height: 700 });
      await page.setContent(pageHtml(svg), { waitUntil: 'load' });
      const shot = page.locator('svg');
      await expect(shot).toBeVisible();
      mkdirSync(OUT_DIR, { recursive: true });
      await shot.screenshot({ path: path.join(OUT_DIR, `${shotName(file)}.png`) });
    });
  }
});
