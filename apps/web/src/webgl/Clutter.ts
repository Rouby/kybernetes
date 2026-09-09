/**
 * Background clutter: pipes, vents, posters, crates. Pure set dressing,
 * deliberately dim so it reads as background next to living fixtures.
 * Never interactive: positions derive from room ids, never enter
 * snapshots, and never take part in targeting. Rendered first so every
 * fixture draws over it.
 */

import type { RenderContext } from './StationModels';

export interface ClutterRoom {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type ClutterBit =
  | {
      readonly kind: 'pipe';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | { readonly kind: 'vent'; readonly x: number; readonly y: number }
  | { readonly kind: 'poster'; readonly x: number; readonly y: number; readonly tone: number }
  | { readonly kind: 'crate'; readonly x: number; readonly y: number; readonly s: number };

export const VENT_W = 16;
export const VENT_H = 10;
export const POSTER_W = 22;
export const POSTER_H = 15;

function hashRoom(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function isWalkway(id: string): boolean {
  return id.includes('korridor') || id.includes('andock') || id.includes('tube');
}

/** Deterministic dressing bits for a room, all strictly inside its rect. */
export function clutterBitsFor(room: ClutterRoom): ClutterBit[] {
  const bits: ClutterBit[] = [];
  const hash = hashRoom(room.id);
  if (room.w >= room.h) {
    bits.push({
      kind: 'pipe',
      x1: room.x + 8,
      y1: room.y + 5,
      x2: room.x + room.w - 8,
      y2: room.y + 5,
    });
  } else {
    bits.push({
      kind: 'pipe',
      x1: room.x + 5,
      y1: room.y + 8,
      x2: room.x + 5,
      y2: room.y + room.h - 8,
    });
  }
  const corner = hash % 4;
  const vx = corner % 2 === 0 ? room.x + 12 : room.x + room.w - 12 - VENT_W;
  const vy = corner < 2 ? room.y + room.h - 10 - VENT_H : room.y + 24;
  bits.push({ kind: 'vent', x: vx, y: vy });
  if (room.w >= 100) {
    const span = Math.max(1, room.w - 60);
    bits.push({
      kind: 'poster',
      x: room.x + 20 + (hash % span),
      y: room.y + 3,
      tone: hash % 3,
    });
  }
  if (!isWalkway(room.id) && room.w >= 120 && room.h >= 100) {
    const side = (hash >> 2) % 2 === 0 ? room.x + 9 : room.x + room.w - 9 - 14;
    bits.push({ kind: 'crate', x: side, y: room.y + room.h - 9 - 14, s: 12 + (hash % 3) });
  }
  return bits;
}

function setColor(ctx: RenderContext, r: number, g: number, b: number, a = 1.0): void {
  ctx.gl.uniform4f(ctx.gl.getUniformLocation(ctx.flatProg, 'u_color'), r, g, b, a);
}

function renderPipe(ctx: RenderContext, x1: number, y1: number, x2: number, y2: number): void {
  setColor(ctx, 0.22, 0.25, 0.32, 0.55);
  const verts: number[] = [];
  ctx.addThickSegment(verts, x1, y1, x2, y2, 3.0);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.floor(len / 60);
  for (let i = 1; i <= steps; i += 1) {
    const t = (i * 60) / len;
    const jx = x1 + (x2 - x1) * t;
    const jy = y1 + (y2 - y1) * t;
    ctx.addThickSegment(verts, jx - 3, jy - 3, jx + 3, jy + 3, 2.0);
  }
  ctx.bufferAndDraw(new Float32Array(verts));
}

function renderVent(ctx: RenderContext, x: number, y: number, time: number): void {
  setColor(ctx, 0.1, 0.12, 0.16, 0.6);
  ctx.drawQuad(x, y, VENT_W, VENT_H);
  setColor(ctx, 0.25, 0.3, 0.38, 0.6);
  for (let i = 0; i < 3; i += 1) ctx.drawQuad(x + 2, y + 2 + i * 3, VENT_W - 4, 1.5);
  const glow = 0.3 + 0.3 * Math.sin(time * 2.0 + x);
  setColor(ctx, 0.2, 0.7, 0.4, glow);
  ctx.drawCircle(x + VENT_W - 3, y + 2, 1.2, 6);
}

const POSTER_TONES: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.35, 0.15],
  [0.2, 0.4, 0.45],
  [0.45, 0.25, 0.3],
];

function renderPoster(ctx: RenderContext, x: number, y: number, tone: number): void {
  setColor(ctx, 0.16, 0.17, 0.22, 0.55);
  ctx.drawQuad(x, y, POSTER_W, POSTER_H);
  const stripe = POSTER_TONES[tone % POSTER_TONES.length] ?? POSTER_TONES[0];
  if (stripe === undefined) return;
  setColor(ctx, stripe[0], stripe[1], stripe[2], 0.5);
  ctx.drawQuad(x + 2, y + 2, POSTER_W - 4, 4);
  setColor(ctx, 0.5, 0.55, 0.62, 0.4);
  ctx.drawQuad(x + 2, y + 8, POSTER_W - 4, 2);
}

function renderCrate(ctx: RenderContext, x: number, y: number, s: number): void {
  setColor(ctx, 0.23, 0.19, 0.14, 0.65);
  ctx.drawQuad(x, y, s, s);
  setColor(ctx, 0.35, 0.3, 0.22, 0.65);
  ctx.drawQuad(x, y, s, 2);
  ctx.drawQuad(x, y, 2, s);
}

/** Draws every room's bits dim; call before fixtures so dressing stays behind. */
export function renderClutter(
  ctx: RenderContext,
  rooms: readonly ClutterRoom[],
  time: number
): void {
  for (const room of rooms) {
    for (const bit of clutterBitsFor(room)) {
      if (bit.kind === 'pipe') renderPipe(ctx, bit.x1, bit.y1, bit.x2, bit.y2);
      else if (bit.kind === 'vent') renderVent(ctx, bit.x, bit.y, time);
      else if (bit.kind === 'poster') renderPoster(ctx, bit.x, bit.y, bit.tone);
      else renderCrate(ctx, bit.x, bit.y, bit.s);
    }
  }
}
