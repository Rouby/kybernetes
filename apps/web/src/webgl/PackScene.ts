/**
 * Pack bench scene: screen-space draw for the drag-to-pack overlay.
 * Backdrop, static crate walls, and physics bodies arrive in screen pixels
 * (PackStore works canvas-local; the frame adds the canvas origin).
 * Thin GL only; geometry lives in UiToolkit, bodies in PackStore.
 */

import { LID_GOOD_ID, type PackBodyView } from '../pack/PackStore';
import { setFlatColor as setColor } from './LivingFixtures';
import type { RenderContext } from './StationModels';

export interface PackSceneRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PackSceneView {
  readonly rect: PackSceneRect;
  readonly walls: readonly PackSceneRect[];
  readonly crate: PackSceneRect;
  readonly bodies: readonly PackBodyView[];
  readonly sealReady: boolean;
}

/** Screen-pixel orthographic matrix (y down) for the flat program. */
export function screenOrthoMatrix(width: number, height: number): Float32Array {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return new Float32Array([2 / w, 0, 0, 0, -2 / h, 0, -1, 1, 1]);
}

const GOOD_TINTS: Readonly<Record<string, readonly [number, number, number]>> = {
  rations: [0.25, 0.8, 0.4],
  water: [0.25, 0.5, 0.95],
  o2_cells: [0.6, 0.95, 1.0],
  fuel_cells: [1.0, 0.6, 0.15],
  scrap: [0.85, 0.55, 0.25],
  meds: [0.95, 0.95, 0.95],
  lid: [0.55, 0.38, 0.2],
};

function goodTint(goodId: string): readonly [number, number, number] {
  return GOOD_TINTS[goodId] ?? [0.6, 0.6, 0.65];
}

function fillRotated(
  ctx: RenderContext,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hx = w / 2;
  const hy = h / 2;
  const corner = (lx: number, ly: number): [number, number] => [
    x + lx * cos - ly * sin,
    y + lx * sin + ly * cos,
  ];
  const [ax, ay] = corner(-hx, -hy);
  const [bx, by] = corner(hx, -hy);
  const [cx, cy] = corner(hx, hy);
  const [dx, dy] = corner(-hx, hy);
  ctx.bufferAndDraw(new Float32Array([ax, ay, bx, by, cx, cy, ax, ay, cx, cy, dx, dy]));
}

function strapAlongX(ctx: RenderContext, x: number, y: number, w: number, angle: number): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hx = w / 2 - 3;
  const verts: number[] = [];
  ctx.addThickSegment(verts, x - hx * cos, y - hx * sin, x + hx * cos, y + hx * sin, 2);
  ctx.bufferAndDraw(new Float32Array(verts));
}

function outlineRotated(
  ctx: RenderContext,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hx = w / 2 + 2;
  const hy = h / 2 + 2;
  const corner = (lx: number, ly: number): [number, number] => [
    x + lx * cos - ly * sin,
    y + lx * sin + ly * cos,
  ];
  const [ax, ay] = corner(-hx, -hy);
  const [bx, by] = corner(hx, -hy);
  const [cx, cy] = corner(hx, hy);
  const [dx, dy] = corner(-hx, hy);
  const verts: number[] = [];
  ctx.addThickSegment(verts, ax, ay, bx, by, 2);
  ctx.addThickSegment(verts, bx, by, cx, cy, 2);
  ctx.addThickSegment(verts, cx, cy, dx, dy, 2);
  ctx.addThickSegment(verts, dx, dy, ax, ay, 2);
  ctx.bufferAndDraw(new Float32Array(verts));
}

function renderBody(ctx: RenderContext, body: PackBodyView): void {
  const [tr = 0.6, tg = 0.6, tb = 0.65] = goodTint(body.goodId);
  const held = body.held;
  const glow = held && !body.inside ? 0.35 : 0;
  setColor(ctx, Math.min(1, tr + glow), tg, tb, 0.95);
  fillRotated(ctx, body.x, body.y, body.w, body.h, body.angle);
  setColor(ctx, 0.05, 0.05, 0.08, 0.9);
  strapAlongX(ctx, body.x, body.y, body.w, body.angle);
  if (held) {
    setColor(ctx, 1.0, 0.9, 0.4, 0.9);
    strapAlongX(ctx, body.x, body.y, Math.min(body.w, body.h), body.angle + Math.PI / 2);
  }
  if (!body.inside && !held && body.settled && body.goodId !== LID_GOOD_ID) {
    setColor(ctx, 1.0, 0.22, 0.28, 0.95);
    outlineRotated(ctx, body.x, body.y, body.w, body.h, body.angle);
  }
}

interface WallRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Wide bars read as the box front face; tall bars as its side posts. */
function isFrontFace(wall: WallRect): boolean {
  return wall.w >= wall.h;
}

function plankGrooves(ctx: RenderContext, x: number, y: number, w: number, h: number): void {
  setColor(ctx, 0.3, 0.19, 0.1, 0.95);
  for (let line = y + 11; line < y + h - 2; line += 13) {
    ctx.drawQuad(x + 2, line, w - 4, 1.5);
  }
}

function renderFrontFace(ctx: RenderContext, wall: WallRect): void {
  setColor(ctx, 0.58, 0.38, 0.2, 0.95);
  ctx.drawQuad(wall.x, wall.y, wall.w, wall.h);
  setColor(ctx, 0.72, 0.5, 0.28, 0.95);
  ctx.drawQuad(wall.x, wall.y, wall.w, 2.5);
  setColor(ctx, 0.24, 0.15, 0.08, 0.95);
  ctx.drawQuad(wall.x, wall.y + wall.h - 2.5, wall.w, 2.5);
  plankGrooves(ctx, wall.x, wall.y, wall.w, wall.h);
}

function renderSidePost(ctx: RenderContext, wall: WallRect, overlap: number): void {
  const body = { x: wall.x, y: wall.y, w: wall.w, h: wall.h + overlap };
  setColor(ctx, 0.55, 0.36, 0.19, 0.95);
  ctx.drawQuad(body.x, body.y, body.w, body.h);
  setColor(ctx, 0.72, 0.5, 0.28, 0.95);
  ctx.drawQuad(body.x - 3, body.y - 6, body.w + 6, 7);
  setColor(ctx, 0.24, 0.15, 0.08, 0.95);
  ctx.drawQuad(body.x - 3, body.y - 6, body.w + 6, 2);
  plankGrooves(ctx, body.x, body.y + 4, body.w, body.h - 4);
}

function renderJoint(ctx: RenderContext, x: number, y: number): void {
  setColor(ctx, 0.33, 0.2, 0.1, 0.95);
  ctx.drawQuad(x - 9, y - 9, 18, 18);
  setColor(ctx, 0.64, 0.43, 0.22, 0.95);
  ctx.drawQuad(x - 9, y - 9, 18, 2);
}

/** One joined timber box: front face, lapped side posts with caps, dark joints. */
function renderCrate(ctx: RenderContext, walls: readonly WallRect[]): void {
  const front = walls.find((wall) => isFrontFace(wall));
  const posts = walls.filter((wall) => !isFrontFace(wall));
  if (front === undefined) return;
  renderFrontFace(ctx, front);
  for (const post of posts) renderSidePost(ctx, post, 8);
  const jointY = front.y + 4;
  renderJoint(ctx, front.x + 8, jointY);
  renderJoint(ctx, front.x + front.w - 8, jointY);
}

/** Back panel spans post tops to floor top so texture matches the box. */
export function backPanelFor(crate: PackSceneRect, walls: readonly PackSceneRect[]): PackSceneRect {
  const posts = walls.filter((wall) => wall.h > wall.w);
  const top = posts.length > 0 ? Math.min(...posts.map((wall) => wall.y)) : crate.y;
  const front = walls.find((wall) => wall.w >= wall.h);
  const bottom = front === undefined ? crate.y + crate.h : front.y;
  return { x: crate.x, y: top, w: crate.w, h: Math.max(0, bottom - top) };
}

/** Quiet plank back panel so the load reads against the bench. */
function renderCrateInterior(ctx: RenderContext, crate: PackSceneRect): void {
  setColor(ctx, 0.11, 0.13, 0.19, 0.95);
  ctx.drawQuad(crate.x, crate.y, crate.w, crate.h);
  setColor(ctx, 0.05, 0.06, 0.1, 0.9);
  for (let x = crate.x + 15; x < crate.x + crate.w - 2; x += 15) {
    ctx.drawQuad(x, crate.y + 2, 1, crate.h - 4);
  }
}

/** Paints the bench over the dimmed world, under the HUD panels. */
export function renderPackScene(ctx: RenderContext, scene: PackSceneView): void {
  setColor(ctx, 0.07, 0.09, 0.14, 1.0);
  ctx.drawQuad(scene.rect.x, scene.rect.y, scene.rect.w, scene.rect.h);
  renderCrateInterior(ctx, backPanelFor(scene.crate, scene.walls));
  renderCrate(ctx, scene.walls);
  if (scene.sealReady) {
    setColor(ctx, 0.2, 0.9, 0.45, 0.9);
    ctx.drawQuad(scene.rect.x, scene.rect.y + scene.rect.h - 3, scene.rect.w, 3);
  }
  for (const body of scene.bodies) renderBody(ctx, body);
}
