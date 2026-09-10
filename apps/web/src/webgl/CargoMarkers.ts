/**
 * Physical cargo markers: floor piles plus the carried crate.
 * Promoted from Clutter set dressing to real entities (TRANSFORM M4):
 * positions arrive in world coords via renderState.mapCargoCrates.
 * Thin GL only; placement math lives in sim-core packGame/cargo.
 */

import type { CargoCrateView } from '../harbor/renderState';
import { setFlatColor as setColor } from './LivingFixtures';
import type { RenderContext } from './StationModels';

export type { CargoCrateView };

const CRATE_S = 14;

type Corner = { readonly x: number; readonly y: number };

/** Rotated square corners (-h,-h),(h,-h),(h,h),(-h,h) about the crate center. */
function crateCorners(
  x: number,
  y: number,
  s: number,
  angle: number
): [Corner, Corner, Corner, Corner] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const half = s / 2;
  const rot = (lx: number, ly: number): Corner => ({
    x: x + lx * cos - ly * sin,
    y: y + lx * sin + ly * cos,
  });
  return [rot(-half, -half), rot(half, -half), rot(half, half), rot(-half, half)];
}

function fillCorners(ctx: RenderContext, corners: [Corner, Corner, Corner, Corner]): void {
  const [a, b, c, d] = corners;
  ctx.bufferAndDraw(new Float32Array([a.x, a.y, b.x, b.y, c.x, c.y, a.x, a.y, c.x, c.y, d.x, d.y]));
}

function mid(a: Corner, b: Corner): Corner {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function strapCorners(corners: [Corner, Corner, Corner, Corner], verts: number[]): void {
  const [a, b, c, d] = corners;
  const left = mid(a, d);
  const right = mid(b, c);
  verts.push(left.x, left.y, right.x, right.y);
}

function outlineCorners(corners: [Corner, Corner, Corner, Corner], verts: number[]): void {
  const [a, b, c, d] = corners;
  verts.push(a.x, a.y, b.x, b.y, b.x, b.y, c.x, c.y, c.x, c.y, d.x, d.y, d.x, d.y, a.x, a.y);
}

function drawSegments(ctx: RenderContext, verts: number[], thickness: number): void {
  const segs: number[] = [];
  for (let i = 0; i + 3 < verts.length; i += 4) {
    const x1 = verts[i];
    const y1 = verts[i + 1];
    const x2 = verts[i + 2];
    const y2 = verts[i + 3];
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;
    ctx.addThickSegment(segs, x1, y1, x2, y2, thickness);
  }
  ctx.bufferAndDraw(new Float32Array(segs));
}

function renderOneCrate(ctx: RenderContext, view: CargoCrateView, highlight: boolean): void {
  const s = view.carried ? CRATE_S + 2 : CRATE_S;
  const corners = crateCorners(view.x, view.y, s, view.angle);
  if (view.carried) setColor(ctx, 0.0, 0.85, 1.0, 0.9);
  else setColor(ctx, 0.55, 0.42, 0.2, 0.9);
  fillCorners(ctx, corners);
  const strap: number[] = [];
  strapCorners(corners, strap);
  setColor(ctx, 0.08, 0.06, 0.04, 0.9);
  drawSegments(ctx, strap, 2);
  if (highlight) {
    const frame: number[] = [];
    outlineCorners(corners, frame);
    setColor(ctx, 1.0, 0.85, 0.3, 0.9);
    drawSegments(ctx, frame, 1.5);
  }
}

/** Floor piles draw over clutter, under pawns. Call after fixtures. */
export function renderFloorCrates(
  ctx: RenderContext,
  crates: readonly CargoCrateView[],
  nearestId: string | null | undefined,
  _time: number
): void {
  for (const view of crates) {
    if (!view.carried) renderOneCrate(ctx, view, view.id === nearestId);
  }
}

/** Carried crates draw above pawns so the hands read. Call after pawns. */
export function renderCarriedCrates(
  ctx: RenderContext,
  crates: readonly CargoCrateView[],
  _time: number
): void {
  for (const view of crates) {
    if (view.carried) renderOneCrate(ctx, view, false);
  }
}
