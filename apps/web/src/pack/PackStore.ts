/**
 * PackStore: framework-free drag-to-pack physics (TRANSFORM M8 Phase 2).
 * Owns a headless matter-js world: open-top crate, gravity drop-in,
 * spring drag, 15-degree rotate, sleep-based seal gating. Client-only
 * cosmetics — the server trusts sealed counts, never placement. No DOM,
 * no React; Vitest drives it headless through update(nowMs).
 */

import { footprintFor, normalizeCrateAngle } from '@kybernetes/sim-core';
import Matter from 'matter-js';
import { packCrateRect } from '../webgl/ui/UiToolkit';

export interface PackContext {
  readonly mode: 'buy' | 'repack';
  readonly hubId?: string;
}

export interface PackBodyView {
  readonly id: number;
  readonly goodId: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly w: number;
  readonly h: number;
  readonly held: boolean;
  readonly inside: boolean;
  readonly settled: boolean;
}

export interface PackWallView {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PackSnapshot {
  readonly open: boolean;
  readonly bodies: readonly PackBodyView[];
  readonly walls: readonly PackWallView[];
  readonly crate: PackWallView;
  readonly stagedTotal: number;
  readonly insideTotal: number;
  readonly sealReady: boolean;
  readonly sealLabel: string;
  readonly hint: string;
}

export interface PackSealedItem {
  readonly goodId: string;
  readonly qty: number;
}

const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 3;
const MAX_BODIES = 48;
const SLOW_SPEED = 0.5;
const ROTATE_STEP = Math.PI / 12;
/** Furniture marker: the lid renders wooden and never counts as load. */
export const LID_GOOD_ID = 'lid';
const LID_W = 150;
const LID_H = 14;
const LID_SEAT_DX = 30;
const LID_SEAT_DY = 25;
const LID_SEAT_ANGLE = 0.2;

export function pointInRect(
  x: number,
  y: number,
  rect: { x: number; y: number; w: number; h: number }
): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Solver slop lets resting bodies sink hairline depths; contain with tolerance. */
const CONTAIN_EPS_PX = 1.5;

function cornersInside(
  body: Matter.Body,
  rect: { x: number; y: number; w: number; h: number }
): boolean {
  const loose = {
    x: rect.x - CONTAIN_EPS_PX,
    y: rect.y - CONTAIN_EPS_PX,
    w: rect.w + CONTAIN_EPS_PX * 2,
    h: rect.h + CONTAIN_EPS_PX * 2,
  };
  return body.vertices.every((v) => pointInRect(v.x, v.y, loose));
}

interface BodyMeta {
  readonly goodId: string;
  readonly w: number;
  readonly h: number;
}

export class PackStore {
  private readonly engine: Matter.Engine;
  private readonly meta = new Map<number, BodyMeta>();
  private drag: Matter.Constraint | null = null;
  private heldId: number | null = null;
  private ctx: PackContext | null = null;
  private lidId: number | null = null;
  private wallRects: PackWallView[] = [];
  private rectW = 0;
  private rectH = 0;
  private acc = 0;
  private lastMs = 0;
  private lastSealed: { kind: 'buy' | 'repack'; items: PackSealedItem[] } | null = null;
  private seenNoticeId = 0;

  constructor() {
    this.engine = Matter.Engine.create({ enableSleeping: true });
    this.engine.gravity.y = 1;
  }

  public isOpen(): boolean {
    return this.ctx !== null;
  }

  public context(): PackContext | null {
    return this.ctx;
  }

  public open(ctx: PackContext): void {
    if (this.ctx !== null) this.close();
    this.ctx = ctx;
    this.lastSealed = null;
    this.rebuildStatics();
    this.acc = 0;
    this.lastMs = 0;
  }

  public close(): void {
    this.ctx = null;
    this.release();
    Matter.Composite.clear(this.engine.world, false, true);
    this.meta.clear();
    this.lidId = null;
    this.wallRects = [];
  }

  public setViewport(rectW: number, rectH: number): void {
    if (rectW === this.rectW && rectH === this.rectH) return;
    this.rectW = rectW;
    this.rectH = rectH;
    this.rebuildStatics();
  }

  private ensureLid(): void {
    if (this.ctx === null || this.rectW < 200) return;
    if (this.lidId !== null && this.bodyById(this.lidId) !== undefined) return;
    const crate = packCrateRect(this.rectW, this.rectH);
    const lid = Matter.Bodies.rectangle(
      Math.min(crate.x + crate.w + 12 + LID_W / 2, this.rectW - LID_W / 2 - 8),
      this.rectH - LID_H / 2,
      LID_W,
      LID_H,
      { friction: 0.7, restitution: 0.05, density: 0.0008 }
    );
    this.lidId = lid.id;
    this.meta.set(lid.id, { goodId: LID_GOOD_ID, w: LID_W, h: LID_H });
    Matter.Composite.add(this.engine.world, lid);
  }

  private lidBody(): Matter.Body | undefined {
    if (this.lidId === null) return undefined;
    return this.bodyById(this.lidId);
  }

  private liveGoods(): Matter.Body[] {
    return this.liveBodies().filter((body) => body.id !== this.lidId);
  }

  private lidMouth(): { x: number; y: number } {
    const crate = packCrateRect(this.rectW, this.rectH);
    return { x: crate.x + crate.w / 2, y: crate.y - LID_H / 2 };
  }

  private lidSeated(): boolean {
    const lid = this.lidBody();
    if (lid === undefined) return false;
    const mouth = this.lidMouth();
    if (Math.abs(lid.position.x - mouth.x) > LID_SEAT_DX) return false;
    if (Math.abs(lid.position.y - mouth.y) > LID_SEAT_DY) return false;
    if (Math.abs(normalizeCrateAngle(lid.angle)) > LID_SEAT_ANGLE) return false;
    return this.isSlow(lid);
  }

  private rebuildStatics(): void {
    if (this.ctx === null) return;
    this.release();
    for (const body of Matter.Composite.allBodies(this.engine.world)) {
      if (body.isStatic) Matter.Composite.remove(this.engine.world, body);
    }
    const specs = packWallSpecs(this.rectW, this.rectH);
    this.wallRects = specs.slice(0, 3).map((spec) => ({
      x: spec.cx - spec.w / 2,
      y: spec.cy - spec.h / 2,
      w: spec.w,
      h: spec.h,
    }));
    const opts = { isStatic: true, friction: 0.8 };
    for (const spec of specs) {
      Matter.Composite.add(
        this.engine.world,
        Matter.Bodies.rectangle(spec.cx, spec.cy, spec.w, spec.h, opts)
      );
    }
    this.ensureLid();
  }

  public bodyCount(): number {
    return this.meta.size;
  }

  public stageUnit(goodId: string, w: number, h: number): boolean {
    if (this.ctx === null || this.meta.size >= MAX_BODIES) return false;
    if (!(w > 0) || !(h > 0)) return false;
    const crate = packCrateRect(this.rectW, this.rectH);
    const body = Matter.Bodies.rectangle(
      crate.x + crate.w / 2 + (Math.random() - 0.5) * 40,
      crate.y - 24,
      w,
      h,
      { friction: 0.6, frictionStatic: 1, restitution: 0.05, density: 0.001 }
    );
    Matter.Body.setAngle(body, (Math.random() - 0.5) * 0.4);
    this.meta.set(body.id, { goodId, w, h });
    Matter.Composite.add(this.engine.world, body);
    return true;
  }

  public pressAt(x: number, y: number): boolean {
    if (this.ctx === null || this.drag !== null) return false;
    const bodies = Matter.Query.point(Matter.Composite.allBodies(this.engine.world), { x, y });
    const body = bodies.filter((entry) => !entry.isStatic).pop();
    if (body === undefined) return false;
    Matter.Sleeping.set(body, false);
    this.drag = Matter.Constraint.create({
      pointA: { x, y },
      bodyB: body,
      pointB: { x: x - body.position.x, y: y - body.position.y },
      stiffness: 0.1,
      damping: 0.08,
      length: 0,
    });
    this.heldId = body.id;
    Matter.Composite.add(this.engine.world, this.drag);
    return true;
  }

  public moveTo(x: number, y: number): void {
    if (this.drag === null) return;
    this.drag.pointA.x = x;
    this.drag.pointA.y = y;
    const body = (this.drag.bodyB ?? undefined) as Matter.Body | undefined;
    if (body !== undefined) Matter.Sleeping.set(body, false);
  }

  public release(): void {
    if (this.drag === null) return;
    const body = (this.drag.bodyB ?? undefined) as Matter.Body | undefined;
    Matter.Composite.remove(this.engine.world, this.drag);
    this.drag = null;
    this.heldId = null;
    if (body === undefined) return;
    Matter.Body.setVelocity(body, { x: body.velocity.x * 0.35, y: body.velocity.y * 0.35 });
    Matter.Sleeping.set(body, false);
  }

  public isDragging(): boolean {
    return this.drag !== null;
  }

  public rotateHeld(): boolean {
    const body = this.heldBody();
    if (body === undefined) return false;
    Matter.Body.setAngle(body, body.angle + ROTATE_STEP);
    Matter.Body.setAngularVelocity(body, 0);
    Matter.Sleeping.set(body, false);
    return true;
  }

  public clearStaged(): void {
    this.release();
    for (const body of this.liveGoods()) {
      Matter.Composite.remove(this.engine.world, body);
      this.meta.delete(body.id);
    }
  }

  public tidyUp(): void {
    const crate = packCrateRect(this.rectW, this.rectH);
    const lid = this.lidBody();
    if (lid !== undefined) {
      const mouth = this.lidMouth();
      Matter.Body.setAngle(lid, 0);
      Matter.Body.setPosition(lid, mouth);
      Matter.Body.setVelocity(lid, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(lid, 0);
      Matter.Sleeping.set(lid, false);
    }
    const spots = tidySpots(this.liveGoods(), crate);
    for (const body of this.liveGoods()) {
      const spot = spots.get(body.id);
      if (spot === undefined) continue;
      Matter.Body.setAngle(body, 0);
      Matter.Body.setPosition(body, spot);
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
      Matter.Sleeping.set(body, false);
    }
  }

  public sealReady(): boolean {
    if (this.ctx === null) return false;
    const live = this.liveGoods();
    if (live.length === 0) return false;
    if (!this.lidSeated()) return false;
    return live.every((body) => this.insideAndSlow(body));
  }

  public takeSealed(kind: 'buy' | 'repack'): PackSealedItem[] | null {
    if (!this.sealReady()) return null;
    const counts = new Map<string, number>();
    for (const body of this.liveGoods()) {
      const meta = this.meta.get(body.id);
      if (meta === undefined) continue;
      counts.set(meta.goodId, (counts.get(meta.goodId) ?? 0) + 1);
      Matter.Composite.remove(this.engine.world, body);
      this.meta.delete(body.id);
    }
    const lid = this.lidBody();
    if (lid !== undefined) {
      Matter.Composite.remove(this.engine.world, lid);
      this.meta.delete(lid.id);
    }
    this.lidId = null;
    this.ensureLid();
    const items = [...counts.entries()].map(([goodId, qty]) => ({ goodId, qty }));
    this.lastSealed = { kind, items };
    return items;
  }

  public reconcileNotices(notices: readonly { id: number; message: string }[]): void {
    const latest = notices[notices.length - 1];
    if (latest === undefined || latest.id === this.seenNoticeId) return;
    this.seenNoticeId = latest.id;
    const pending = this.lastSealed;
    if (pending === null) return;
    if (pending.kind === 'buy' && /^(MARKET_ok|MARKET_sold:)/.test(latest.message)) {
      this.lastSealed = null;
    } else if (pending.kind === 'repack' && latest.message === 'CARGO_ok') {
      this.lastSealed = null;
    } else if (isSealReject(pending.kind, latest.message)) {
      this.lastSealed = null;
      this.respawnItems(pending.items);
    }
  }

  public update(nowMs: number): void {
    if (this.ctx === null) return;
    if (!(nowMs >= 0)) return;
    if (this.lastMs <= 0) this.lastMs = nowMs;
    this.acc += Math.min(Math.max(nowMs - this.lastMs, 0), 100);
    this.lastMs = nowMs;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      Matter.Engine.update(this.engine, STEP_MS);
      this.acc -= STEP_MS;
      steps += 1;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.acc = 0;
    this.calmHeld();
  }

  /** Held bodies translate freely but stop winding up: R stays the steering. */
  private calmHeld(): void {
    const body = this.heldBody();
    if (body === undefined) return;
    const damped = body.angularVelocity * 0.6;
    Matter.Body.setAngularVelocity(body, Math.max(-0.15, Math.min(0.15, damped)));
  }

  public getSnapshot(): PackSnapshot {
    const bodies = this.liveBodies().map((body) => this.viewOf(body));
    const goods = bodies.filter((view) => view.goodId !== LID_GOOD_ID);
    const inside = goods.filter((view) => view.inside).length;
    const ready = this.sealReady();
    return {
      open: this.ctx !== null,
      bodies,
      walls: [...this.wallRects],
      crate: { ...packCrateRect(this.rectW, this.rectH) },
      stagedTotal: goods.length,
      insideTotal: inside,
      sealReady: ready,
      sealLabel: ready ? `SEAL (${goods.length})` : 'SEAL',
      hint: hintFor(this.ctx !== null, goods.length, inside, ready, this.lidSeated()),
    };
  }

  private heldBody(): Matter.Body | undefined {
    if (this.heldId === null) return undefined;
    return this.bodyById(this.heldId);
  }

  private bodyById(id: number): Matter.Body | undefined {
    return Matter.Composite.allBodies(this.engine.world).find((body) => body.id === id);
  }

  private liveBodies(): Matter.Body[] {
    return Matter.Composite.allBodies(this.engine.world).filter((body) => !body.isStatic);
  }

  private isSlow(body: Matter.Body): boolean {
    return body.isSleeping || body.speed < SLOW_SPEED;
  }

  private insideAndSlow(body: Matter.Body): boolean {
    if (!cornersInside(body, packCrateRect(this.rectW, this.rectH))) return false;
    return this.isSlow(body);
  }

  private viewOf(body: Matter.Body): PackBodyView {
    const meta = this.meta.get(body.id) ?? { goodId: 'unknown', w: 10, h: 10 };
    const crate = packCrateRect(this.rectW, this.rectH);
    return {
      id: body.id,
      goodId: meta.goodId,
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
      w: meta.w,
      h: meta.h,
      held: body.id === this.heldId,
      inside: cornersInside(body, crate),
      settled: this.isSlow(body),
    };
  }

  private respawnItems(items: PackSealedItem[]): void {
    for (const item of items) {
      const foot = footprintFor(item.goodId);
      for (let i = 0; i < item.qty; i += 1) {
        if (!this.stageUnit(item.goodId, foot.w, foot.h)) return;
      }
    }
  }
}

function isSealReject(kind: 'buy' | 'repack', message: string): boolean {
  if (kind === 'buy') return /^(MARKET_(?!ok|sold:))/.test(message);
  return /^(CARGO_(?!ok))/.test(message);
}

function hintFor(
  open: boolean,
  staged: number,
  inside: number,
  ready: boolean,
  lid: boolean
): string {
  if (!open) return '';
  if (staged === 0) return 'Add goods from the left, drag them into the crate';
  if (!lid) return 'Seat the lid across the crate mouth';
  if (inside < staged) return `${staged - inside} outside - drag everything inside to seal`;
  if (ready) return 'Load settled - seal it';
  return 'Settling… seal enables when the load sleeps';
}

interface WallSpec {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

function packWallSpecs(rectW: number, rectH: number): WallSpec[] {
  const crate = packCrateRect(rectW, rectH);
  const thick = 18;
  return [
    {
      cx: crate.x + crate.w / 2,
      cy: crate.y + crate.h + thick / 2,
      w: crate.w + thick * 2,
      h: thick,
    },
    { cx: crate.x - thick / 2, cy: crate.y + crate.h / 2, w: thick, h: crate.h },
    { cx: crate.x + crate.w + thick / 2, cy: crate.y + crate.h / 2, w: thick, h: crate.h },
    { cx: rectW / 2, cy: rectH + thick, w: rectW + thick * 4, h: thick * 2 },
  ];
}

function tidySpots(
  bodies: Matter.Body[],
  crate: { x: number; y: number; w: number; h: number }
): Map<number, { x: number; y: number }> {
  const order = [...bodies].sort((a, b) => boundsOf(b).h - boundsOf(a).h);
  const spots = new Map<number, { x: number; y: number }>();
  const gap = 2;
  let cursorX = crate.x + gap;
  let cursorY = crate.y + gap;
  let rowH = 0;
  for (const body of order) {
    const box = boundsOf(body);
    if (cursorX + box.w > crate.x + crate.w) {
      cursorX = crate.x + gap;
      cursorY += rowH + gap;
      rowH = 0;
    }
    if (cursorY + box.h > crate.y + crate.h) break;
    spots.set(body.id, { x: cursorX + box.w / 2, y: cursorY + box.h / 2 });
    cursorX += box.w + gap;
    rowH = Math.max(rowH, box.h);
  }
  return spots;
}

function boundsOf(body: Matter.Body): { w: number; h: number } {
  return { w: body.bounds.max.x - body.bounds.min.x, h: body.bounds.max.y - body.bounds.min.y };
}
