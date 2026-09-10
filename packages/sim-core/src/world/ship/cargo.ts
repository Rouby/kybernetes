/**
 * Physical crate hauling (TRANSFORM M4). Cargo is bodies in space:
 * bayFloor (hub) -> carriedBy (hands) -> shipFloor (vessel rooms) ->
 * unpacked secured counts -> repacked crate -> destination bay -> sell.
 * No racks in slice one. Pure data + transitions; no DOM/Node imports.
 */

import type { World } from '../types.js';

export type CrateWhere = 'bayFloor' | 'carriedBy' | 'shipFloor';

export interface Crate {
  readonly id: string;
  readonly goodId: string;
  readonly qty: number;
  readonly where: CrateWhere;
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  /** Facing in radians. Snapped orthogonal on grab, free on drop. */
  readonly angle: number;
  readonly carrierId?: string;
}

export function normalizeCrateAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  let wrapped = angle % (Math.PI * 2);
  if (wrapped > Math.PI) wrapped -= Math.PI * 2;
  if (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

/** Orthogonal grab: the pawn squares the crate to itself on pickup. */
export function snapOrthogonal(facing: number): number {
  const step = Math.PI / 2;
  const base = Number.isFinite(facing) ? facing : 0;
  return normalizeCrateAngle(Math.round(base / step) * step);
}

export interface CargoState {
  readonly crates: Readonly<Record<string, Crate>>;
  readonly secured: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export type CargoReject =
  | 'bad-qty'
  | 'bad-id'
  | 'duplicate-crate'
  | 'unknown-crate'
  | 'already-carrying'
  | 'not-carrying'
  | 'too-far'
  | 'wrong-frame'
  | 'not-ship-floor'
  | 'insufficient-secured';

export type CargoResult =
  | { readonly ok: true; readonly hold: CargoState }
  | { readonly ok: false; readonly reason: CargoReject };

export const MAX_QTY_PER_CRATE = 10;
export const PICKUP_RADIUS_PX = 120;
export const CARRY_SPEED_MULT = 0.75;
export const DROP_NUDGE_PX = 40;
/** Hands offset ahead of the pawn center, along its facing. Crates ride here. */
export const HAND_REACH_PX = 22;

export function handsPosFor(
  pos: { x: number; y: number },
  facing: number
): { x: number; y: number } {
  const angle = Number.isFinite(facing) ? facing : 0;
  return { x: pos.x + Math.cos(angle) * HAND_REACH_PX, y: pos.y + Math.sin(angle) * HAND_REACH_PX };
}

export function emptyCargo(): CargoState {
  return { crates: {}, secured: {} };
}

export function isCarrying(hold: CargoState, pawnId: string): boolean {
  return carriedCrateOf(hold, pawnId) !== undefined;
}

export function carriedCrateOf(hold: CargoState, pawnId: string): Crate | undefined {
  for (const crate of Object.values(hold.crates)) {
    if (crate.where === 'carriedBy' && crate.carrierId === pawnId) return crate;
  }
  return undefined;
}

export function carryingPawnIds(hold: CargoState): readonly string[] {
  const ids: string[] = [];
  for (const crate of Object.values(hold.crates)) {
    if (crate.where === 'carriedBy' && crate.carrierId !== undefined) ids.push(crate.carrierId);
  }
  return ids;
}

export function speedMultiplierFor(hold: CargoState, pawnId: string): number {
  return isCarrying(hold, pawnId) ? CARRY_SPEED_MULT : 1;
}

export function cratesOnFrame(hold: CargoState, frameId: string): readonly Crate[] {
  return Object.values(hold.crates).filter((crate) => crate.frameId === frameId);
}

export function securedOf(hold: CargoState, vesselId: string): Readonly<Record<string, number>> {
  return hold.secured[vesselId] ?? {};
}

export function securedQty(hold: CargoState, vesselId: string, goodId: string): number {
  return hold.secured[vesselId]?.[goodId] ?? 0;
}

function validQty(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY_PER_CRATE;
}

function validId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64;
}

export function spawnCrate(
  hold: CargoState,
  args: {
    id: string;
    goodId: string;
    qty: number;
    where: 'bayFloor' | 'shipFloor';
    frameId: string;
    x: number;
    y: number;
    angle?: number;
  }
): CargoResult {
  if (!validId(args.id) || !validId(args.goodId)) return { ok: false, reason: 'bad-id' };
  if (!validQty(args.qty)) return { ok: false, reason: 'bad-qty' };
  if (hold.crates[args.id] !== undefined) return { ok: false, reason: 'duplicate-crate' };
  if (!validId(args.frameId) || !Number.isFinite(args.x) || !Number.isFinite(args.y)) {
    return { ok: false, reason: 'wrong-frame' };
  }
  const crate: Crate = {
    id: args.id,
    goodId: args.goodId,
    qty: args.qty,
    where: args.where,
    frameId: args.frameId,
    x: args.x,
    y: args.y,
    angle: normalizeCrateAngle(args.angle ?? 0),
  };
  return { ok: true, hold: { ...hold, crates: { ...hold.crates, [crate.id]: crate } } };
}

function inPickupRange(crate: Crate, pos: { x: number; y: number }): boolean {
  return Math.hypot(crate.x - pos.x, crate.y - pos.y) <= PICKUP_RADIUS_PX;
}

export function pickupCrate(
  hold: CargoState,
  crateId: string,
  pawnId: string,
  pawnFrame: string,
  pawnPos: { x: number; y: number },
  pawnFacing = 0
): CargoResult {
  const crate = hold.crates[crateId];
  if (crate === undefined) return { ok: false, reason: 'unknown-crate' };
  if (crate.where === 'carriedBy') return { ok: false, reason: 'already-carrying' };
  if (isCarrying(hold, pawnId)) return { ok: false, reason: 'already-carrying' };
  if (crate.frameId !== pawnFrame) return { ok: false, reason: 'wrong-frame' };
  if (!inPickupRange(crate, pawnPos)) return { ok: false, reason: 'too-far' };
  const lifted: Crate = {
    ...crate,
    where: 'carriedBy',
    carrierId: pawnId,
    angle: snapOrthogonal(pawnFacing),
  };
  return { ok: true, hold: { ...hold, crates: { ...hold.crates, [crate.id]: lifted } } };
}

export function nudgeDropPos(
  x: number,
  y: number,
  fixtures: readonly { x: number; y: number }[]
): { x: number; y: number } {
  const crowded = fixtures.some((fix) => Math.hypot(fix.x - x, fix.y - y) < 30);
  if (!crowded) return { x, y };
  return { x: x + DROP_NUDGE_PX, y: y + DROP_NUDGE_PX };
}

export function dropCrate(
  hold: CargoState,
  pawnId: string,
  frameId: string,
  x: number,
  y: number,
  where: 'bayFloor' | 'shipFloor',
  fixtures: readonly { x: number; y: number }[] = [],
  angle?: number
): CargoResult {
  const carried = carriedCrateOf(hold, pawnId);
  if (carried === undefined) return { ok: false, reason: 'not-carrying' };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'wrong-frame' };
  const nudged = nudgeDropPos(x, y, fixtures);
  const dropped: Crate = {
    ...carried,
    where,
    frameId,
    x: nudged.x,
    y: nudged.y,
    angle: normalizeCrateAngle(angle ?? carried.angle),
    carrierId: undefined,
  };
  return { ok: true, hold: { ...hold, crates: { ...hold.crates, [dropped.id]: dropped } } };
}

export function dropAllForPawn(
  hold: CargoState,
  pawnId: string,
  frameId: string,
  x: number,
  y: number,
  where: 'bayFloor' | 'shipFloor',
  angle?: number
): CargoState {
  const result = dropCrate(hold, pawnId, frameId, x, y, where, [], angle);
  return result.ok ? result.hold : hold;
}

function sumUnpackQty(hold: CargoState, crateIds: readonly string[]): number {
  let total = 0;
  for (const id of crateIds) total += hold.crates[id]?.qty ?? 0;
  return total;
}

function cratesUnpackable(
  hold: CargoState,
  vesselId: string,
  crateIds: readonly string[]
): boolean {
  for (const id of crateIds) {
    const crate = hold.crates[id];
    if (crate === undefined || crate.where !== 'shipFloor' || crate.frameId !== vesselId)
      return false;
  }
  return true;
}

function withoutCrates(hold: CargoState, crateIds: readonly string[]): Record<string, Crate> {
  const crates = { ...hold.crates };
  for (const id of crateIds) delete crates[id];
  return crates;
}

function addSecured(hold: CargoState, vesselId: string, goodId: string, qty: number): CargoState {
  const vessel = { ...(hold.secured[vesselId] ?? {}) };
  vessel[goodId] = (vessel[goodId] ?? 0) + qty;
  return { ...hold, secured: { ...hold.secured, [vesselId]: vessel } };
}

export function unpackCrates(
  hold: CargoState,
  vesselId: string,
  pawnFrame: string,
  crateIds: readonly string[]
): CargoResult {
  if (pawnFrame !== vesselId) return { ok: false, reason: 'wrong-frame' };
  if (crateIds.length < 1 || crateIds.length > 8) return { ok: false, reason: 'unknown-crate' };
  if (!cratesUnpackable(hold, vesselId, crateIds)) return { ok: false, reason: 'not-ship-floor' };
  const first = hold.crates[crateIds[0] as string];
  if (first === undefined) return { ok: false, reason: 'unknown-crate' };
  if (!crateIds.every((id) => hold.crates[id]?.goodId === first.goodId)) {
    return { ok: false, reason: 'unknown-crate' };
  }
  const total = sumUnpackQty(hold, crateIds);
  const crates = withoutCrates(hold, crateIds);
  return { ok: true, hold: addSecured({ ...hold, crates }, vesselId, first.goodId, total) };
}

export function repackCargo(
  hold: CargoState,
  vesselId: string,
  pawnFrame: string,
  goodId: string,
  qty: number,
  spawn: { id: string; frameId: string; x: number; y: number }
): CargoResult {
  if (pawnFrame !== vesselId) return { ok: false, reason: 'wrong-frame' };
  if (!validId(goodId) || !validQty(qty)) return { ok: false, reason: 'bad-qty' };
  if (!validId(spawn.id) || hold.crates[spawn.id] !== undefined) {
    return { ok: false, reason: 'duplicate-crate' };
  }
  if (securedQty(hold, vesselId, goodId) < qty)
    return { ok: false, reason: 'insufficient-secured' };
  const vessel = { ...(hold.secured[vesselId] ?? {}) };
  vessel[goodId] = (vessel[goodId] ?? 0) - qty;
  const crate: Crate = {
    id: spawn.id,
    goodId,
    qty,
    where: 'shipFloor',
    frameId: spawn.frameId,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
  };
  return {
    ok: true,
    hold: {
      crates: { ...hold.crates, [crate.id]: crate },
      secured: { ...hold.secured, [vesselId]: vessel },
    },
  };
}

export function syncCarriedPositions(
  hold: CargoState,
  pawns: Readonly<Record<string, { frameId: string; x: number; y: number; facing: number }>>
): CargoState {
  let crates = hold.crates;
  let changed = false;
  for (const crate of Object.values(crates)) {
    if (crate.where !== 'carriedBy' || crate.carrierId === undefined) continue;
    const pawn = pawns[crate.carrierId];
    if (pawn === undefined) continue;
    const hands = handsPosFor(pawn, pawn.facing);
    const angle = normalizeCrateAngle(pawn.facing);
    if (
      pawn.frameId === crate.frameId &&
      hands.x === crate.x &&
      hands.y === crate.y &&
      angle === crate.angle
    )
      continue;
    crates = {
      ...crates,
      [crate.id]: { ...crate, frameId: pawn.frameId, x: hands.x, y: hands.y, angle },
    };
    changed = true;
  }
  return changed ? { ...hold, crates } : hold;
}

function pawnPointsOf(
  pawns: World['pawns']
): Record<string, { frameId: string; x: number; y: number; facing: number }> {
  const points: Record<string, { frameId: string; x: number; y: number; facing: number }> = {};
  for (const pawn of Object.values(pawns))
    points[pawn.id] = { frameId: pawn.frameId, x: pawn.pos.x, y: pawn.pos.y, facing: pawn.facing };
  return points;
}

function pawnNeedsDrop(pawn: { health: { hp: number; incapacitated: boolean } }): boolean {
  return pawn.health.hp <= 0 || pawn.health.incapacitated;
}

/** Per-tick cargo: carried crates follow paws; death/incap auto-drops in place. */
export function tickCargo(world: World): World {
  const synced = syncCarriedPositions(world.cargo, pawnPointsOf(world.pawns));
  let hold = synced;
  for (const pawn of Object.values(world.pawns)) {
    if (!pawnNeedsDrop(pawn)) continue;
    const carried = carriedCrateOf(hold, pawn.id);
    if (carried === undefined) continue;
    const where = world.vessels[pawn.frameId] === undefined ? 'bayFloor' : 'shipFloor';
    hold = dropAllForPawn(hold, pawn.id, pawn.frameId, carried.x, carried.y, where, pawn.facing);
  }
  if (hold === world.cargo) return world;
  return { ...world, cargo: hold };
}
