/**
 * Unified interact targeting: doors and living fixtures compete in one
 * facing-gated contest so [E] and its HUD prompt always agree on the
 * thing you are looking at. Score blends distance with the mouse cursor:
 * hovering a machine pulls it ahead of nearer-but-unhovered candidates.
 * Walls and shut doors occlude (glass does not). Pure and unit-tested;
 * HarborApp sends the intent, HarborViewport shows the prompt.
 * Frame-local coords throughout.
 */

import type { ClientIntent, FixtureSnapshot, SnapshotPortal } from '@kybernetes/protocol';
import { segmentsIntersect, type World, wallBlocksSight } from '@kybernetes/sim-core';
import {
  FIXTURE_USE_RADIUS_PX,
  type FixtureContact,
  fixturePrompt,
  fixtureUseIntent,
  frameOf,
  toContact,
} from './fixtureAction';
import { dockGateIds } from './renderState';

/** Client reach for doors (server allows more; tight keeps corners honest). */
export const DOOR_USE_RADIUS_PX = 80;
/** Half-angle of the facing cone: candidates outside it never win. */
export const INTERACT_CONE_RAD = 0.65;
/** Inside this range the pawn uses it no matter the facing. */
export const INTERACT_NEAR_PX = 28;
/** Cursor pull fades out beyond this distance from the candidate. */
export const CURSOR_RADIUS_PX = 60;
/** Max score lead a dead-on hover grants; steeper than 1px/px so a hovered
 * candidate always beats a nearer unhovered one (triangle inequality). */
export const CURSOR_WEIGHT = 70;

export interface DoorSpot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface SightSeg {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type InteractTarget =
  | { readonly kind: 'fixture'; readonly contact: FixtureContact }
  | { readonly kind: 'door'; readonly id: string; readonly open: boolean; readonly dist: number };

const DOCK_GATES = new Set<string>(dockGateIds());

/** Door midpoints on a frame, dock leaves excluded (the cycle owns them). */
export function doorSpotsOf(world: World, frameId: string): DoorSpot[] {
  const spots: DoorSpot[] = [];
  for (const edge of Object.values(world.portals)) {
    if (world.rooms[edge.roomA]?.frameId !== frameId) continue;
    if (DOCK_GATES.has(edge.id)) continue;
    spots.push({
      id: edge.id,
      x: (edge.segment.x1 + edge.segment.x2) / 2,
      y: (edge.segment.y1 + edge.segment.y2) / 2,
    });
  }
  return spots;
}

/** Sight-blocking segments: opaque walls plus shut solid leaves (glass never blocks). */
export function sightBlockers(
  statics: World,
  frameId: string,
  portals: readonly SnapshotPortal[]
): SightSeg[] {
  const segs: SightSeg[] = [];
  for (const wall of statics.wallsByFrame[frameId] ?? []) {
    if (!wallBlocksSight(wall)) continue;
    segs.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
  }
  const live = new Map(portals.map((portal) => [portal.id, portal.state] as const));
  for (const edge of Object.values(statics.portals)) {
    const room = statics.rooms[edge.roomA];
    if (room?.frameId !== frameId) continue;
    if (edge.kind === 'window' || edge.kind === 'open' || edge.kind === 'hole') continue;
    if (live.get(edge.id) === 'open') continue;
    segs.push({
      x1: edge.segment.x1,
      y1: edge.segment.y1,
      x2: edge.segment.x2,
      y2: edge.segment.y2,
    });
  }
  return segs;
}

/** True when no sight-blocking segment crosses the pawn-to-target line. */
export function visibleFrom(
  blockers: readonly SightSeg[],
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  for (const seg of blockers) {
    if (segmentsIntersect(from, to, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }))
      return false;
  }
  return true;
}

export function selectInteractTarget(args: {
  fixtures: readonly FixtureSnapshot[] | undefined;
  doors: readonly DoorSpot[];
  openById: ReadonlyMap<string, boolean>;
  frameId: string;
  at: { x: number; y: number };
  facing: number;
  cursor?: { x: number; y: number } | null;
  blockers?: readonly SightSeg[];
}): InteractTarget | null {
  const blockers = args.blockers ?? [];
  let best: InteractTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const consider = (dist: number, x: number, y: number, make: () => InteractTarget): void => {
    if (dist <= INTERACT_NEAR_PX) {
      accept(make(), dist);
      return;
    }
    if (!inCone(args.at, args.facing, x, y)) return;
    if (!visibleFrom(blockers, args.at, { x, y })) return;
    accept(make(), scoreFor(dist, x, y, args.cursor));
  };
  const accept = (target: InteractTarget, score: number): void => {
    if (score >= bestScore) return;
    best = target;
    bestScore = score;
  };
  for (const fixture of args.fixtures ?? []) {
    if (frameOf(fixture.roomId) !== args.frameId) continue;
    const contact = toContact(fixture, args.at);
    if (contact.dist > FIXTURE_USE_RADIUS_PX) continue;
    consider(contact.dist, contact.x, contact.y, () => ({ kind: 'fixture', contact }));
  }
  for (const door of args.doors) {
    const dist = Math.hypot(door.x - args.at.x, door.y - args.at.y);
    if (dist > DOOR_USE_RADIUS_PX) continue;
    consider(dist, door.x, door.y, () => ({
      kind: 'door',
      id: door.id,
      open: args.openById.get(door.id) ?? false,
      dist,
    }));
  }
  return best;
}

function scoreFor(
  dist: number,
  x: number,
  y: number,
  cursor: { x: number; y: number } | null | undefined
): number {
  if (cursor === null || cursor === undefined) return dist;
  const pull = Math.hypot(cursor.x - x, cursor.y - y);
  if (pull >= CURSOR_RADIUS_PX) return dist;
  return dist - (1 - pull / CURSOR_RADIUS_PX) * CURSOR_WEIGHT;
}

function inCone(at: { x: number; y: number }, facing: number, x: number, y: number): boolean {
  if (!Number.isFinite(facing)) return true;
  const aim = Math.atan2(y - at.y, x - at.x);
  return Math.abs(normAngle(aim - facing)) <= INTERACT_CONE_RAD;
}

function normAngle(angle: number): number {
  let wrapped = angle % (Math.PI * 2);
  if (wrapped > Math.PI) wrapped -= Math.PI * 2;
  if (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

/** Intent the [E] key sends for the selected target. */
export function targetIntent(target: InteractTarget): ClientIntent {
  if (target.kind === 'fixture') return fixtureUseIntent(target.contact);
  return { type: 'DOOR', seq: 0, portalId: target.id, wantOpen: !target.open };
}

/** Short HUD action name for the [E] prompt. */
export function targetPrompt(target: InteractTarget): string {
  if (target.kind === 'fixture') return fixturePrompt(target.contact);
  return target.open ? 'Close door' : 'Open door';
}
