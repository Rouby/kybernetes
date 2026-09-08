/**
 * Breach view: render-ready breach models cut straight from the live
 * portal table. Every model carries its authoritative segment, area, and
 * birth tick from the PortalEdge combat created — no string-id room-top
 * anchor lookups. Pure math, no DOM.
 */

import type { AirFlow, SnapshotPortal, WallSegment } from '@kybernetes/protocol';
import type { PortalEdge, Vec2, World } from './types.js';

/** Below this area a hole is a puncture decal; it never carves the wall. */
export const PUNCTURE_MAX_M2 = 0.2;
/** Molten rim cools to vacuum frost over this many seconds. */
export const BREACH_GLOW_S = 10;
/** Ticks per second in the world kernel (FIXED_DT = 1/20). */
export const TICKS_PER_S = 20;

export interface BreachSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface BreachRenderModel extends BreachSegment {
  readonly id: string;
  readonly frameId: string;
  readonly roomA: string;
  readonly roomB: string;
  readonly areaM2: number;
  readonly bornTick: number;
  readonly ageTicks: number;
  readonly cx: number;
  readonly cy: number;
  /** Unit normal of the segment, oriented A->B (outward for hull holes). */
  readonly nx: number;
  readonly ny: number;
  readonly lenPx: number;
  readonly isHull: boolean;
  readonly sizeClass: 'puncture' | 'breach';
}

/** Live breach edges: destroyed hole portals cut by combat. */
export function breachEdgesOf(world: World): PortalEdge[] {
  return Object.values(world.portals).filter(
    (portal) => portal.kind === 'hole' && portal.state === 'destroyed'
  );
}

function segCenter(seg: BreachSegment): Vec2 {
  return { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
}

function segLen(seg: BreachSegment): number {
  return Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
}

/**
 * Flow axis of a breach segment: the segment normal oriented from room A
 * toward room B (outward into vacuum for hull holes). Signed throat
 * velocity from TELEMETRY flows rides this axis (+ = A->B).
 */
export function breachFlowAxis(seg: BreachSegment, centerA: Vec2, centerB: Vec2 | null): Vec2 {
  const len = segLen(seg);
  if (len <= 0) return { x: 0, y: -1 };
  const dx = (seg.x2 - seg.x1) / len;
  const dy = (seg.y2 - seg.y1) / len;
  const center = segCenter(seg);
  const to =
    centerB === null
      ? { x: center.x - centerA.x, y: center.y - centerA.y }
      : { x: centerB.x - centerA.x, y: centerB.y - centerA.y };
  const n = { x: -dy, y: dx };
  const dot = n.x * to.x + n.y * to.y;
  return dot >= 0 ? n : { x: -n.x, y: -n.y };
}

/** Signed portal velocity resolved onto its flow axis (px/s vector). */
export function breachFlowVector(
  seg: BreachSegment,
  centerA: Vec2,
  centerB: Vec2 | null,
  velocityMps: number
): Vec2 {
  const axis = breachFlowAxis(seg, centerA, centerB);
  return { x: axis.x * velocityMps, y: axis.y * velocityMps };
}

export function breachModelOf(
  edge: PortalEdge,
  frameId: string,
  nowTick: number,
  centerA?: Vec2,
  centerB?: Vec2 | null
): BreachRenderModel {
  const lenPx = segLen(edge.segment);
  const center = segCenter(edge.segment);
  const fallback = { x: center.x, y: center.y - 1 };
  const axis = breachFlowAxis(edge.segment, centerA ?? fallback, centerB ?? null);
  const isHull = edge.roomB === 'space' || edge.roomB === 'vacuum';
  return {
    id: edge.id,
    frameId,
    roomA: edge.roomA,
    roomB: edge.roomB,
    areaM2: edge.areaM2,
    bornTick: edge.cooldownUntilTick,
    ageTicks: Math.max(0, nowTick - edge.cooldownUntilTick),
    x1: edge.segment.x1,
    y1: edge.segment.y1,
    x2: edge.segment.x2,
    y2: edge.segment.y2,
    cx: center.x,
    cy: center.y,
    nx: axis.x,
    ny: axis.y,
    lenPx,
    isHull,
    sizeClass: edge.areaM2 < PUNCTURE_MAX_M2 ? 'puncture' : 'breach',
  };
}

/** Center of a room rect in frame-local px (flow-axis orientation). */
export function roomRectCenter(rect: { x: number; y: number; w: number; h: number }): Vec2 {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Render models for every live breach, oldest first (stable draw order). */
export function breachModelsOf(world: World): BreachRenderModel[] {
  const models = breachEdgesOf(world).map((edge) => {
    const roomA = world.rooms[edge.roomA];
    const roomB = world.rooms[edge.roomB];
    return breachModelOf(
      edge,
      roomA?.frameId ?? '',
      world.tick,
      roomA === undefined ? undefined : roomRectCenter(roomA.rect),
      roomB === undefined ? null : roomRectCenter(roomB.rect)
    );
  });
  models.sort((a, b) => (a.bornTick < b.bornTick ? -1 : a.bornTick > b.bornTick ? 1 : 0));
  return models;
}

/** Wire fields channels.ts copies onto the SnapshotPortal for hole portals. */
export function snapshotBreachFields(
  edge: PortalEdge
): Pick<SnapshotPortal, 'areaM2' | 'bornTick' | 'roomA' | 'x1' | 'y1' | 'x2' | 'y2'> {
  return {
    areaM2: edge.areaM2,
    bornTick: edge.cooldownUntilTick,
    roomA: edge.roomA,
    x1: edge.segment.x1,
    y1: edge.segment.y1,
    x2: edge.segment.x2,
    y2: edge.segment.y2,
  };
}

/** True when two portal snapshots match including breach geometry. */
export function samePortalGeometry(a: SnapshotPortal, b: SnapshotPortal): boolean {
  return (
    a.open === b.open &&
    a.state === b.state &&
    (a.areaM2 ?? -1) === (b.areaM2 ?? -1) &&
    (a.bornTick ?? -1) === (b.bornTick ?? -1) &&
    (a.x1 ?? 0) === (b.x1 ?? 0) &&
    (a.y1 ?? 0) === (b.y1 ?? 0) &&
    (a.x2 ?? 0) === (b.x2 ?? 0) &&
    (a.y2 ?? 0) === (b.y2 ?? 0)
  );
}

interface WallCut {
  t0: number;
  t1: number;
}

function breachCutOnWall(wall: WallSegment, seg: BreachSegment): WallCut | null {
  const wx = wall.x2 - wall.x1;
  const wy = wall.y2 - wall.y1;
  const wallLenSq = wx * wx + wy * wy;
  if (wallLenSq <= 0) return null;
  const wallLen = Math.sqrt(wallLenSq);
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;
  const segLenPx = Math.hypot(sx, sy);
  if (segLenPx <= 0) return null;
  const align = Math.abs((wx * sx + wy * sy) / (wallLen * segLenPx));
  if (align < 0.5) return null;
  const cx = (seg.x1 + seg.x2) / 2;
  const cy = (seg.y1 + seg.y2) / 2;
  const t = ((cx - wall.x1) * wx + (cy - wall.y1) * wy) / wallLenSq;
  const px = wall.x1 + wx * t;
  const py = wall.y1 + wy * t;
  if (Math.hypot(cx - px, cy - py) > 6) return null;
  const half = segLenPx / 2 / wallLen;
  return { t0: t - half, t1: t + half };
}

function mergeCuts(cuts: WallCut[]): WallCut[] {
  cuts.sort((a, b) => a.t0 - b.t0);
  const merged: WallCut[] = [];
  for (const cut of cuts) {
    const last = merged[merged.length - 1];
    if (last === undefined || cut.t0 > last.t1) {
      merged.push({ ...cut });
      continue;
    }
    last.t1 = Math.max(last.t1, cut.t1);
  }
  return merged;
}

function emitWallPieces(wall: WallSegment, cuts: WallCut[]): WallSegment[] {
  const pieces: WallSegment[] = [];
  let cursor = 0;
  cuts.forEach((cut, i) => {
    const c0 = Math.max(0, Math.min(1, cut.t0));
    const c1 = Math.max(0, Math.min(1, cut.t1));
    if (c0 > cursor + 1e-4) {
      pieces.push({
        ...wall,
        id: `${wall.id}_br_${i}a`,
        x2: wall.x1 + (wall.x2 - wall.x1) * c0,
        y2: wall.y1 + (wall.y2 - wall.y1) * c0,
      });
    }
    cursor = Math.max(cursor, c1);
  });
  if (cursor < 1 - 1e-4) {
    pieces.push({
      ...wall,
      id: `${wall.id}_br_tail`,
      x1: wall.x1 + (wall.x2 - wall.x1) * cursor,
      y1: wall.y1 + (wall.y2 - wall.y1) * cursor,
    });
  }
  return pieces;
}

/**
 * Cut exact gaps where live breach segments lie along walls. Only
 * full breaches carve; punctures stay decals. Replaces the legacy
 * string-id room-top-anchor carve.
 */
export function carveWallsAtBreachSegments(
  walls: readonly WallSegment[],
  breaches: readonly BreachSegment[]
): WallSegment[] {
  if (breaches.length === 0) return [...walls];
  const out: WallSegment[] = [];
  for (const wall of walls) {
    const cuts: WallCut[] = [];
    for (const seg of breaches) {
      const cut = breachCutOnWall(wall, seg);
      if (cut !== null) cuts.push(cut);
    }
    if (cuts.length === 0) {
      out.push(wall);
      continue;
    }
    out.push(...emitWallPieces(wall, mergeCuts(cuts)));
  }
  return out;
}

/** Throat m/s rendered as px/s motion, soft-capped for readability. */
export function throatFlowToPx(velocityMps: number): number {
  const capped = Math.min(650, Math.abs(velocityMps) * 20);
  return velocityMps >= 0 ? capped : -capped;
}

/**
 * Join TELEMETRY throat velocities onto breach models. Missing entries
 * read as still air; callers scale particles by |velocity| * pressure.
 */
export function breachFlows(
  models: readonly BreachRenderModel[],
  flows: readonly AirFlow[]
): Map<string, number> {
  const table = new Map(flows.map((flow) => [flow.portalId, flow.velocityMps]));
  const out = new Map<string, number>();
  for (const model of models) out.set(model.id, table.get(model.id) ?? 0);
  return out;
}
