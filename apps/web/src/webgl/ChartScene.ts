/**
 * Chart scene: thin-GL star map for the nav-console chart screen.
 * Backdrop dim, central star, orbit rings, plotted route, node markers,
 * and the ship dot arrive in screen pixels; geometry lives in harbor
 * chartModel (single source with the overlay hit rects). Follows PackScene.
 */

import type { ChartBurn, Rgb } from '../harbor/chartModel';
import { setFlatColor as setColor } from './LivingFixtures';
import type { RenderContext } from './StationModels';

export interface ChartSceneNode {
  readonly x: number;
  readonly y: number;
  readonly dotR: number;
  readonly ringR: number;
  readonly fill: Rgb;
  readonly ring: Rgb;
}

export interface ChartSceneView {
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly center: { readonly x: number; readonly y: number };
  readonly starR: number;
  /** Orbit radii in px, one per charted orbit. */
  readonly rings: readonly number[];
  /** Sampled transfer arcs in stop order; empty while docked. */
  readonly route: readonly { readonly x: number; readonly y: number }[];
  /** Coast time-ticks along each leg. */
  readonly ticks: readonly { readonly x: number; readonly y: number }[];
  /** Departure burn plus arrival retroburn. */
  readonly burns: readonly ChartBurn[];
  /** Flip diamonds, one per leg. */
  readonly flips: readonly { readonly x: number; readonly y: number }[];
  /** Route indices where braking phases start. */
  readonly flipIndices: readonly number[];
  /** Gravity wells that bend committed legs. */
  readonly wells: readonly { readonly x: number; readonly y: number; readonly r: number }[];
  /** Fresh intercept while adrift; empty otherwise. */
  readonly intercept: readonly { readonly x: number; readonly y: number }[];
  /** True while flamed-out adrift: committed route dims. */
  readonly adrift: boolean;
  /** Drafted-course ghost arcs; empty without a preview. */
  readonly previewRoute: readonly { readonly x: number; readonly y: number }[];
  readonly nodes: readonly ChartSceneNode[];
  readonly ship: { readonly x: number; readonly y: number };
}

/** Map a chart-model view onto scene geometry (pure; keeps GL thin). */
export function chartSceneViewOf(map: {
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly center: { readonly x: number; readonly y: number };
  readonly starR: number;
  readonly rings: readonly number[];
  readonly route: readonly { readonly x: number; readonly y: number }[];
  readonly ticks: readonly { readonly x: number; readonly y: number }[];
  readonly burns: readonly ChartBurn[];
  readonly flips: readonly { readonly x: number; readonly y: number }[];
  readonly flipIndices: readonly number[];
  readonly wells: readonly { readonly x: number; readonly y: number; readonly r: number }[];
  readonly intercept: readonly { readonly x: number; readonly y: number }[];
  readonly adrift: boolean;
  readonly previewRoute: readonly { readonly x: number; readonly y: number }[];
  readonly nodes: readonly {
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly fill: Rgb;
    readonly ring: Rgb;
  }[];
  readonly ship: { readonly x: number; readonly y: number };
}): ChartSceneView {
  return {
    rect: map.rect,
    center: map.center,
    starR: map.starR,
    rings: [...map.rings],
    route: map.route.map((point) => ({ ...point })),
    ticks: map.ticks.map((point) => ({ ...point })),
    burns: map.burns.map((burn) => ({ ...burn })),
    flips: map.flips.map((point) => ({ ...point })),
    flipIndices: [...map.flipIndices],
    wells: map.wells.map((well) => ({ ...well })),
    intercept: map.intercept.map((point) => ({ ...point })),
    adrift: map.adrift,
    previewRoute: map.previewRoute.map((point) => ({ ...point })),
    nodes: map.nodes.map((node) => ({
      x: node.x,
      y: node.y,
      dotR: node.r,
      ringR: node.r + 7,
      fill: node.fill,
      ring: node.ring,
    })),
    ship: { ...map.ship },
  };
}

/** Closed circle polyline as segment pairs for addThickSegment. */
export function circlePolyline(
  cx: number,
  cy: number,
  r: number,
  segments = 48
): readonly (readonly [number, number, number, number])[] {
  const lines: (readonly [number, number, number, number])[] = [];
  const steps = Math.max(8, Math.floor(segments));
  for (let i = 0; i < steps; i += 1) {
    const a = (Math.PI * 2 * i) / steps;
    const b = (Math.PI * 2 * (i + 1)) / steps;
    lines.push([
      cx + Math.cos(a) * r,
      cy + Math.sin(a) * r,
      cx + Math.cos(b) * r,
      cy + Math.sin(b) * r,
    ]);
  }
  return lines;
}

export function renderChartScene(ctx: RenderContext, scene: ChartSceneView): void {
  if (!Number.isFinite(scene.rect.w) || !Number.isFinite(scene.rect.h)) return;
  if (scene.rect.w <= 0 || scene.rect.h <= 0) return;
  renderStar(ctx, scene);
  renderWells(ctx, scene);
  renderRings(ctx, scene);
  renderRoute(ctx, scene);
  renderPreviewRoute(ctx, scene);
  renderIntercept(ctx, scene);
  renderFlips(ctx, scene);
  renderTicks(ctx, scene);
  renderBurns(ctx, scene);
  renderNodes(ctx, scene);
  renderShip(ctx, scene);
}

/** Chevron triangle: apex leads along dir, base trails behind. */
export function chevronVerts(
  x: number,
  y: number,
  angle: number,
  size: number,
  dir: 1 | -1
): readonly [number, number, number, number, number, number] {
  const fx = Math.cos(angle) * dir;
  const fy = Math.sin(angle) * dir;
  const px = -fy;
  const py = fx;
  return [
    x + fx * size,
    y + fy * size,
    x - fx * size * 0.6 + px * size * 0.75,
    y - fy * size * 0.6 + py * size * 0.75,
    x - fx * size * 0.6 - px * size * 0.75,
    y - fy * size * 0.6 - py * size * 0.75,
  ];
}

function renderTicks(ctx: RenderContext, scene: ChartSceneView): void {
  if (scene.ticks.length === 0) return;
  setColor(ctx, 0.0, 0.9, 1.0, 0.5);
  for (const tick of scene.ticks) ctx.drawCircle(tick.x, tick.y, 2, 8);
}

function renderBurns(ctx: RenderContext, scene: ChartSceneView): void {
  const pro: number[] = [];
  const retro: number[] = [];
  const plume: number[] = [];
  for (const burn of scene.burns) pushBurn(pro, retro, plume, burn);
  if (pro.length > 0) {
    setColor(ctx, 0.0, 0.9, 1.0, 0.95);
    ctx.bufferAndDraw(new Float32Array(pro));
  }
  if (plume.length > 0) {
    setColor(ctx, 0.7, 0.95, 1.0, 0.3);
    ctx.bufferAndDraw(new Float32Array(plume));
  }
  if (retro.length > 0) {
    setColor(ctx, 1.0, 0.72, 0.3, 0.95);
    ctx.bufferAndDraw(new Float32Array(retro));
  }
}

function pushBurn(outPro: number[], outRetro: number[], outPlume: number[], burn: ChartBurn): void {
  // Burn angles carry solved thrust vectors, so every apex leads along thrust;
  // kind only batches boost (cyan) versus brake (amber) paint.
  const along = { x: Math.cos(burn.angle), y: Math.sin(burn.angle) };
  const out = burn.kind === 'pro' ? outPro : outRetro;
  for (const step of [0, 1, 2]) {
    const back = step * (burn.size + 5);
    const tri = chevronVerts(
      burn.x - along.x * back,
      burn.y - along.y * back,
      burn.angle,
      burn.size,
      1
    );
    out.push(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5]);
  }
  if (burn.kind === 'pro') pushPlume(outPlume, burn, along);
}

function pushPlume(out: number[], burn: ChartBurn, along: { x: number; y: number }): void {
  const base = 2 * (burn.size + 5) + burn.size * 0.6;
  const bx = burn.x - along.x * base;
  const by = burn.y - along.y * base;
  const len = burn.size * 2.2;
  const px = -along.y;
  const py = along.x;
  out.push(
    bx,
    by,
    bx - along.x * len + px * burn.size * 0.5,
    by - along.y * len + py * burn.size * 0.5,
    bx - along.x * len - px * burn.size * 0.5,
    by - along.y * len - py * burn.size * 0.5
  );
}

function renderStar(ctx: RenderContext, scene: ChartSceneView): void {
  setColor(ctx, 1.0, 0.8, 0.55, 0.22);
  ctx.drawCircle(scene.center.x, scene.center.y, scene.starR * 2.2, 40);
  setColor(ctx, 1.0, 0.88, 0.66, 1);
  ctx.drawCircle(scene.center.x, scene.center.y, scene.starR, 32);
}

function renderRings(ctx: RenderContext, scene: ChartSceneView): void {
  setColor(ctx, 0.3, 0.62, 0.78, 0.4);
  const verts: number[] = [];
  for (const r of scene.rings) {
    for (const [x1, y1, x2, y2] of circlePolyline(scene.center.x, scene.center.y, r)) {
      ctx.addThickSegment(verts, x1, y1, x2, y2, 1);
    }
  }
  if (verts.length > 0) ctx.bufferAndDraw(new Float32Array(verts));
}

/** Committed legs: cyan boost runs alternate amber braking runs at flips. */
function renderRoute(ctx: RenderContext, scene: ChartSceneView): void {
  if (scene.route.length < 2) return;
  const bounds = runBounds(scene.route.length, scene.flipIndices);
  bounds.forEach((run, index) => {
    paintRun(ctx, scene, run, runColor(index, scene.adrift));
  });
}

function runBounds(length: number, flipIndices: readonly number[]): { from: number; to: number }[] {
  const cuts = [...new Set([0, ...flipIndices.filter((i) => i > 0 && i < length - 1), length - 1])];
  cuts.sort((a, b) => a - b);
  const runs: { from: number; to: number }[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const from = cuts[i];
    const to = cuts[i + 1];
    if (from !== undefined && to !== undefined && to > from) runs.push({ from, to });
  }
  return runs;
}

function runColor(index: number, adrift: boolean): Rgb {
  if (adrift) return [0.35, 0.42, 0.5];
  if (index % 2 === 0) return [0.0, 0.9, 1.0];
  return [1.0, 0.72, 0.3];
}

function paintRun(
  ctx: RenderContext,
  scene: ChartSceneView,
  run: { from: number; to: number },
  color: Rgb
): void {
  setColor(ctx, color[0], color[1], color[2], scene.adrift ? 0.5 : 0.85);
  const verts: number[] = [];
  for (let i = run.from; i < run.to; i += 1) {
    const a = scene.route[i];
    const b = scene.route[i + 1];
    if (a === undefined || b === undefined) continue;
    ctx.addThickSegment(verts, a.x, a.y, b.x, b.y, 2.5);
  }
  if (verts.length > 0) ctx.bufferAndDraw(new Float32Array(verts));
}

/** Flip diamonds where braking phases start. */
function renderFlips(ctx: RenderContext, scene: ChartSceneView): void {
  if (scene.flips.length === 0) return;
  setColor(ctx, 1, 1, 1, 0.95);
  const verts: number[] = [];
  for (const flip of scene.flips) pushDiamond(verts, flip.x, flip.y, 7);
  if (verts.length > 0) ctx.bufferAndDraw(new Float32Array(verts));
}

function pushDiamond(out: number[], x: number, y: number, r: number): void {
  out.push(x, y - r, x + r, y, x, y + r, x, y - r, x, y + r, x - r, y);
}

/** Gravity-well exclusion discs. */
function renderWells(ctx: RenderContext, scene: ChartSceneView): void {
  for (const well of scene.wells) {
    setColor(ctx, 1.0, 0.45, 0.2, 0.1);
    ctx.drawCircle(well.x, well.y, well.r, 40);
    setColor(ctx, 1.0, 0.45, 0.2, 0.45);
    const verts: number[] = [];
    for (const [x1, y1, x2, y2] of circlePolyline(well.x, well.y, well.r, 40)) {
      ctx.addThickSegment(verts, x1, y1, x2, y2, 1);
    }
    if (verts.length > 0) ctx.bufferAndDraw(new Float32Array(verts));
  }
}

/** Live re-intercept while adrift: amber dashed arc to the moving target. */
function renderIntercept(ctx: RenderContext, scene: ChartSceneView): void {
  renderDashed(ctx, scene.intercept, 1.0, 0.72, 0.3, 0.8);
}

/** Drafted course as a dim dashed ghost under the committed route. */
function renderPreviewRoute(ctx: RenderContext, scene: ChartSceneView): void {
  renderDashed(ctx, scene.previewRoute, 0.0, 0.9, 1.0, 0.35);
}

function renderDashed(
  ctx: RenderContext,
  points: readonly { readonly x: number; readonly y: number }[],
  r: number,
  g: number,
  b: number,
  a: number
): void {
  if (points.length < 2) return;
  setColor(ctx, r, g, b, a);
  const verts: number[] = [];
  for (let i = 0; i < points.length - 1; i += 2) {
    const p = points[i];
    const q = points[i + 1];
    if (p === undefined || q === undefined) continue;
    ctx.addThickSegment(verts, p.x, p.y, q.x, q.y, 2);
  }
  if (verts.length > 0) ctx.bufferAndDraw(new Float32Array(verts));
}

function renderNodes(ctx: RenderContext, scene: ChartSceneView): void {
  for (const node of scene.nodes) {
    setColor(ctx, node.fill[0], node.fill[1], node.fill[2], 1);
    ctx.drawCircle(node.x, node.y, node.dotR, 24);
    setColor(ctx, node.ring[0], node.ring[1], node.ring[2], 0.9);
    const verts: number[] = [];
    for (const [x1, y1, x2, y2] of circlePolyline(node.x, node.y, node.ringR, 32)) {
      ctx.addThickSegment(verts, x1, y1, x2, y2, 2);
    }
    if (verts.length > 0) ctx.bufferAndDraw(new Float32Array(verts));
  }
}

function renderShip(ctx: RenderContext, scene: ChartSceneView): void {
  setColor(ctx, 1, 1, 1, 1);
  ctx.drawCircle(scene.ship.x, scene.ship.y, 4, 12);
  setColor(ctx, 0.0, 0.9, 1.0, 0.9);
  const verts: number[] = [];
  for (const [x1, y1, x2, y2] of circlePolyline(scene.ship.x, scene.ship.y, 9, 24)) {
    ctx.addThickSegment(verts, x1, y1, x2, y2, 1.5);
  }
  if (verts.length > 0) ctx.bufferAndDraw(new Float32Array(verts));
}
