/**
 * Physical crate hauling (TRANSFORM M4). Cargo is bodies in space:
 * bayFloor (hub) -> carriedBy (hands) -> shipFloor (vessel rooms) ->
 * unpacked secured counts -> repacked crate -> destination bay -> sell.
 * No racks in slice one. Pure data + transitions; no DOM/Node imports.
 */

import type { World } from '../types.js';
import { CRATE_AREA, crateAreaOf } from './packGame.js';

export type CrateWhere = 'bayFloor' | 'carriedBy' | 'shipFloor';

export interface CrateItem {
  readonly goodId: string;
  readonly qty: number;
}

/** A crate seals iff its footprint area fits: no per-line or per-unit caps. */
export function validCrateItems(items: readonly CrateItem[]): boolean {
  if (!Array.isArray(items) || items.length < 1) return false;
  return items.every((item) => validId(item.goodId) && validQty(item.qty));
}

export interface Crate {
  readonly id: string;
  readonly items: readonly CrateItem[];
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
  | 'overfilled'
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

/** Total units in a crate across all its goods. */
export function crateQty(crate: Crate): number {
  let total = 0;
  for (const item of crate.items) total += item.qty;
  return total;
}

function validQty(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1;
}

function validId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64;
}

export function spawnCrate(
  hold: CargoState,
  args: {
    id: string;
    items: readonly CrateItem[];
    where: 'bayFloor' | 'shipFloor';
    frameId: string;
    x: number;
    y: number;
    angle?: number;
  }
): CargoResult {
  if (!validId(args.id)) return { ok: false, reason: 'bad-id' };
  if (!validCrateItems(args.items)) return { ok: false, reason: 'bad-qty' };
  if (crateAreaOf(args.items) > CRATE_AREA) return { ok: false, reason: 'overfilled' };
  if (hold.crates[args.id] !== undefined) return { ok: false, reason: 'duplicate-crate' };
  if (!validId(args.frameId) || !Number.isFinite(args.x) || !Number.isFinite(args.y)) {
    return { ok: false, reason: 'wrong-frame' };
  }
  const crate: Crate = {
    id: args.id,
    items: args.items.map((item) => ({ goodId: item.goodId, qty: item.qty })),
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

export function removeCrate(hold: CargoState, crateId: string): CargoState {
  if (hold.crates[crateId] === undefined) return hold;
  const crates = { ...hold.crates };
  delete crates[crateId];
  return { ...hold, crates };
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

function sumUnpackGoods(hold: CargoState, crateIds: readonly string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const id of crateIds) {
    for (const item of hold.crates[id]?.items ?? []) {
      totals[item.goodId] = (totals[item.goodId] ?? 0) + item.qty;
    }
  }
  return totals;
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

function securedCovers(hold: CargoState, vesselId: string, items: readonly CrateItem[]): boolean {
  for (const item of items) {
    if (securedQty(hold, vesselId, item.goodId) < item.qty) return false;
  }
  return true;
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
  const totals = sumUnpackGoods(hold, crateIds);
  const crates = withoutCrates(hold, crateIds);
  let secured: CargoState = { ...hold, crates };
  for (const [goodId, qty] of Object.entries(totals)) {
    secured = addSecured(secured, vesselId, goodId, qty);
  }
  return { ok: true, hold: secured };
}

function validateRepackRequest(
  hold: CargoState,
  vesselId: string,
  pawnFrame: string,
  items: readonly CrateItem[],
  spawn: { id: string }
): CargoReject | null {
  if (pawnFrame !== vesselId) return 'wrong-frame';
  if (!validCrateItems(items)) return 'bad-qty';
  if (crateAreaOf(items) > CRATE_AREA) return 'overfilled';
  if (!validId(spawn.id) || hold.crates[spawn.id] !== undefined) return 'duplicate-crate';
  if (!securedCovers(hold, vesselId, items)) return 'insufficient-secured';
  return null;
}

function deductSecuredGoods(
  hold: CargoState,
  vesselId: string,
  items: readonly CrateItem[]
): Readonly<Record<string, number>> {
  const vessel = { ...(hold.secured[vesselId] ?? {}) };
  for (const item of items) vessel[item.goodId] = (vessel[item.goodId] ?? 0) - item.qty;
  return vessel;
}

function createRepackedCrate(
  items: readonly CrateItem[],
  spawn: { id: string; frameId: string; x: number; y: number }
): Crate {
  return {
    id: spawn.id,
    items: items.map((item) => ({ goodId: item.goodId, qty: item.qty })),
    where: 'shipFloor',
    frameId: spawn.frameId,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
  };
}

export function repackCargo(
  hold: CargoState,
  vesselId: string,
  pawnFrame: string,
  items: readonly CrateItem[],
  spawn: { id: string; frameId: string; x: number; y: number }
): CargoResult {
  const rejected = validateRepackRequest(hold, vesselId, pawnFrame, items, spawn);
  if (rejected !== null) return { ok: false, reason: rejected };
  const vessel = deductSecuredGoods(hold, vesselId, items);
  const crate = createRepackedCrate(items, spawn);
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

/**
 * Lightweight second-pass cargo: drops crates for newly downed pawns without
 * re-syncing every carried position (pawn poses did not move since tickCargo).
 */
export function dropIncapacitatedCrates(world: World): World {
  let hold = world.cargo;
  for (const pawn of Object.values(world.pawns)) {
    if (!pawnNeedsDrop(pawn)) continue;
    const carried = carriedCrateOf(hold, pawn.id);
    if (carried === undefined) continue;
    const where = world.vessels[pawn.frameId] === undefined ? 'bayFloor' : 'shipFloor';
    const dropped = dropCrate(
      hold,
      pawn.id,
      pawn.frameId,
      carried.x,
      carried.y,
      where,
      [],
      pawn.facing
    );
    if (dropped.ok) hold = dropped.hold;
  }
  if (hold === world.cargo) return world;
  return { ...world, cargo: hold };
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
