/**
 * Browser screenshot shots for the visibility scenarios.
 * Runs ONLY under vitest.browser.config.ts (headless Chromium, on demand):
 *   yarn test:visibility
 * Each scenario paints the resolved LoS data onto a <canvas>, asserts the
 * sight invariants, then diffs against __screenshots__ goldens via
 * toMatchScreenshot (pixelmatch, 2% tolerance). First run writes the
 * goldens; re-run with --update after intentional visual changes. This is
 * the human signal, never an agent gate (see AGENTS.md).
 */

import type { WallSegment } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import type { Point2D } from './collision.js';
import { isPointInPolygon } from './fogOfWar.js';
import {
  polygonArea,
  resolveShot,
  SHOT_RADIUS,
  scenarioInputs,
  type VisibilitySnapshot,
} from './visibilityScenarios.js';

const SHOTS = scenarioInputs().map((input) => ({ name: input.name, snap: resolveShot(input) }));

function shotByName(name: string): VisibilitySnapshot {
  const found = SHOTS.find((shot) => shot.name === name);
  if (found === undefined) throw new Error(`unknown shot ${name}`);
  return found.snap;
}

function flag(snap: VisibilitySnapshot, label: string): boolean {
  const probe = snap.probes.find((entry) => entry.label === label);
  if (probe === undefined) throw new Error(`unknown probe ${label}`);
  return probe.visible;
}

describe('visibility canvas shots', () => {
  for (const shot of SHOTS) {
    it(`${shot.name} matches screenshot`, async () => {
      mountCanvas(shot.snap);
      await expect.element(page.getByTestId('shot')).toMatchScreenshot(shot.name, {
        comparatorName: 'pixelmatch',
        comparatorOptions: { allowedMismatchedPixelRatio: 0.02 },
      });
    });
  }

  it('rooms and doorways resolve visibility', () => {
    expect(flag(shotByName('s1-empty-box'), 'E')).toBe(true);
    expect(flag(shotByName('s2-wall-blocks'), 'clear')).toBe(true);
    expect(flag(shotByName('s2-wall-blocks'), 'behind')).toBe(false);
    expect(isPointInPolygon({ x: 150, y: 100 }, [...shotByName('s2-wall-blocks').polygon])).toBe(
      false
    );
    expect(polygonArea(shotByName('s2-wall-blocks').polygon)).toBeLessThan(
      Math.PI * SHOT_RADIUS * SHOT_RADIUS * 0.5
    );
    expect(flag(shotByName('s3a-door-open'), 'thru')).toBe(true);
    expect(flag(shotByName('s3b-door-shut'), 'thru')).toBe(false);
  });

  it('breach carving opens sight only past the puncture threshold', () => {
    const nicked = shotByName('s4-puncture-holds');
    expect(nicked.carvedWalls?.length ?? 0).toBe(nicked.walls.length);
    expect(flag(nicked, 'behind')).toBe(false);
    const torn = shotByName('s5-breach-opens');
    expect(torn.carvedWalls?.length ?? 0).toBeGreaterThan(torn.walls.length);
    expect(flag(torn, 'gap')).toBe(true);
    expect(flag(torn, 'wall')).toBe(false);
    expect(flag(shotByName('s6a-ship-intact'), 'beyond')).toBe(false);
    expect(flag(shotByName('s6b-ship-puncture'), 'beyond')).toBe(false);
    expect(flag(shotByName('s6c-ship-breach'), 'beyond')).toBe(true);
  });

  it('chains and paired breaches resolve through gaps only', () => {
    const chain = shotByName('s7-door-chain');
    expect(flag(chain, 'mid')).toBe(true);
    expect(flag(chain, 'far')).toBe(false);
    expect(flag(chain, 'home')).toBe(true);
    expect(isPointInPolygon({ x: 260, y: 100 }, [...chain.polygon])).toBe(false);
    const aligned = shotByName('s8a-aligned-breaches');
    expect(flag(aligned, 'thru')).toBe(true);
    expect(flag(aligned, 'side')).toBe(false);
    const staggered = shotByName('s8b-staggered-breaches');
    expect(flag(staggered, 'far')).toBe(false);
    expect(flag(staggered, 'low')).toBe(false);
    expect(flag(staggered, 'between')).toBe(true);
    expect(polygonArea(aligned.polygon)).toBeGreaterThan(polygonArea(staggered.polygon));
  });
});

function mountCanvas(snap: VisibilitySnapshot): void {
  document.body.innerHTML = '<canvas data-testid="shot" style="display:block"></canvas>';
  const canvas = document.querySelector('[data-testid="shot"]');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas mount failed');
  paintShot(canvas, snap);
}

function paintShot(canvas: HTMLCanvasElement, snap: VisibilitySnapshot): void {
  const view = snap.viewport;
  canvas.width = view.w;
  canvas.height = view.h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  ctx.translate(-view.x, -view.y);
  paintBackground(ctx, view.x, view.y, view.w, view.h);
  paintPolygon(ctx, snap.polygon);
  paintWalls(ctx, snap.walls, true);
  paintWalls(ctx, snap.carvedWalls ?? snap.walls, false);
  paintBreaches(ctx, snap.breaches);
  paintProbes(ctx, snap.origin, snap.probes);
  paintOrigin(ctx, snap.origin);
  paintTitle(ctx, snap.title, view.x, view.y);
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(x, y, w, h);
}

function paintPolygon(ctx: CanvasRenderingContext2D, poly: readonly Point2D[]): void {
  if (poly.length < 3) return;
  ctx.beginPath();
  poly.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,210,120,0.22)';
  ctx.fill();
  ctx.strokeStyle = '#ffd27f';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function paintWalls(
  ctx: CanvasRenderingContext2D,
  walls: readonly WallSegment[],
  dim: boolean
): void {
  ctx.save();
  if (dim) ctx.setLineDash([6, 4]);
  ctx.strokeStyle = dim ? '#475569' : '#cbd5e1';
  ctx.globalAlpha = dim ? 0.8 : 0.95;
  ctx.lineWidth = dim ? 5 : 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const w of walls) {
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
  }
  ctx.stroke();
  ctx.restore();
}

function paintBreaches(ctx: CanvasRenderingContext2D, breaches: readonly SvgBreach[]): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const b of breaches) {
    const full = b.sizeClass === 'breach';
    ctx.setLineDash(full ? [] : [5, 3]);
    ctx.strokeStyle = full ? '#fb923c' : '#f87171';
    ctx.globalAlpha = full ? 0.95 : 0.9;
    ctx.lineWidth = full ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function paintProbes(
  ctx: CanvasRenderingContext2D,
  origin: Point2D,
  probes: readonly SvgProbe[]
): void {
  ctx.save();
  ctx.font = '10px monospace';
  for (const p of probes) {
    const color = p.visible ? '#4ade80' : '#f87171';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(p.label ?? '', p.x + 7, p.y - 6);
  }
  ctx.restore();
}

function paintOrigin(ctx: CanvasRenderingContext2D, origin: Point2D): void {
  ctx.save();
  ctx.fillStyle = '#22d3ee';
  ctx.strokeStyle = '#0e7490';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function paintTitle(ctx: CanvasRenderingContext2D, title: string, x: number, y: number): void {
  ctx.save();
  ctx.font = '13px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(title, x + 10, y + 20);
  ctx.restore();
}
