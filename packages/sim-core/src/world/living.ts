/**
 * Living slice: dense hub + workhorse ship fixtures, power/heat,
 * water loop, and food chain. Pure deterministic transitions;
 * no DOM/Node imports. All inputs explicit, all outputs new objects.
 */

import type { Fixture, RoomLiving, World } from './types.js';

export const REACTOR_KW = 100;
export const STOVE_KW = 3;
export const STOVE_COOK_KW = 6;
export const HYDRO_KW = 1.5;
export const RECYCLER_KW = 1;
export const FREEZER_KW = 0.5;

export const COOK_S = 8;
export const RECYCLE_S = 6;
export const GROW_S = 60;
export const REPAIR_PER_HIT = 34;
export const DAMAGE_PER_SHOT = 34;

export const WATER_MAX_L = 20;
export const MEALS_MAX = 4;
export const RAW_MAX = 10;

export function fixtureIntegrity(fix: Fixture): number {
  return fix.integrity ?? 100;
}

export function fixtureOnline(fix: Fixture): boolean {
  if ((fix.integrity ?? 100) <= 0) return false;
  return fix.online ?? true;
}

export function defaultRoomLiving(roomId: string): RoomLiving {
  return {
    roomId,
    powerKw: 0,
    heatC: 20,
    waterCleanL: 8,
    waterGreyL: 4,
    growth01: 0,
    mealsReady: 0,
    breakerTripped: false,
  };
}

export function ensureRoomLiving(world: World, roomId: string): RoomLiving {
  return world.living[roomId] ?? defaultRoomLiving(roomId);
}

function writeRoom(world: World, room: RoomLiving): World {
  return { ...world, living: { ...world.living, [room.roomId]: room } };
}

export function fixtureLoadKw(fix: Fixture): number {
  if (!fixtureOnline(fix)) return 0;
  if (fix.kind === 'stove') return (fix.progress01 ?? 0) > 0 ? STOVE_COOK_KW : STOVE_KW;
  if (fix.kind === 'hydro_tray') return HYDRO_KW;
  if (fix.kind === 'water_recycler') return RECYCLER_KW;
  if (fix.kind === 'freezer') return FREEZER_KW;
  return 0;
}

export function damageFixture(world: World, fixtureId: string, amount = DAMAGE_PER_SHOT): World {
  const fix = world.fixtures[fixtureId];
  if (fix === undefined) return world;
  const integrity = Math.max(0, fixtureIntegrity(fix) - amount);
  const online = integrity > 0 ? (fix.online ?? true) : false;
  const next: Fixture = { ...fix, integrity, online };
  return { ...world, fixtures: { ...world.fixtures, [fixtureId]: next } };
}

export function repairFixture(world: World, fixtureId: string): World {
  const fix = world.fixtures[fixtureId];
  if (fix === undefined) return world;
  const integrity = Math.min(100, fixtureIntegrity(fix) + REPAIR_PER_HIT);
  const online = integrity > 0;
  const progress01 = integrity <= 0 ? fix.progress01 : fix.progress01;
  const next: Fixture =
    fix.kind === 'breaker_box' && integrity > 0
      ? { ...fix, integrity, online, progress01: 0 }
      : { ...fix, integrity, online, progress01 };
  let out: World = { ...world, fixtures: { ...world.fixtures, [fixtureId]: next } };
  if (fix.kind === 'breaker_box' && integrity > 0) {
    const room = ensureRoomLiving(out, fix.roomId);
    out = writeRoom(out, { ...room, breakerTripped: false });
  }
  return out;
}

export function claimFixture(world: World, fixtureId: string, pawnId: string): World {
  const fix = world.fixtures[fixtureId];
  if (fix === undefined) return world;
  if (fix.kind !== 'personal_locker' && fix.kind !== 'claim_bunk') return world;
  if (fix.claimedBy !== undefined && fix.claimedBy !== pawnId) return world;
  if (fix.claimedBy === pawnId) return world;
  const next: Fixture = { ...fix, claimedBy: pawnId };
  return { ...world, fixtures: { ...world.fixtures, [fixtureId]: next } };
}

export function startCook(world: World, stoveId: string): World {
  const stove = world.fixtures[stoveId];
  if (stove === undefined || stove.kind !== 'stove') return world;
  if (!fixtureOnline(stove)) return world;
  if ((stove.progress01 ?? 0) > 0) return world;
  const room = ensureRoomLiving(world, stove.roomId);
  if (room.breakerTripped) return world;
  if (room.mealsReady >= MEALS_MAX) return world;
  const freezer = findKindInRoom(world, stove.roomId, 'freezer');
  const stock = freezer !== undefined ? Math.round((freezer.level01 ?? 0) * RAW_MAX) : 2;
  if (stock <= 0) return world;
  let out = world;
  if (freezer !== undefined) {
    const nextStock = stock - 1;
    out = {
      ...out,
      fixtures: {
        ...out.fixtures,
        [freezer.id]: { ...freezer, level01: nextStock / RAW_MAX },
      },
    };
  }
  return {
    ...out,
    fixtures: { ...out.fixtures, [stoveId]: { ...stove, progress01: 0.001 } },
  };
}

export function harvestTray(world: World, trayId: string): World {
  const tray = world.fixtures[trayId];
  if (tray === undefined || tray.kind !== 'hydro_tray') return world;
  if (!fixtureOnline(tray)) return world;
  const room = ensureRoomLiving(world, tray.roomId);
  if (room.breakerTripped) return world;
  if ((tray.progress01 ?? room.growth01) < 1) return world;
  const freezer = findKindInRoom(world, tray.roomId, 'freezer');
  let out = world;
  if (freezer !== undefined) {
    const stock = Math.round((freezer.level01 ?? 0) * RAW_MAX);
    const nextStock = Math.min(RAW_MAX, stock + 2);
    out = {
      ...out,
      fixtures: {
        ...out.fixtures,
        [freezer.id]: { ...freezer, level01: nextStock / RAW_MAX },
      },
    };
  }
  const cleared: Fixture = { ...tray, progress01: 0 };
  out = { ...out, fixtures: { ...out.fixtures, [trayId]: cleared } };
  return writeRoom(out, { ...room, growth01: 0 });
}

export function runRecycle(world: World, recyclerId: string): World {
  const rec = world.fixtures[recyclerId];
  if (rec === undefined || rec.kind !== 'water_recycler') return world;
  if (!fixtureOnline(rec)) return world;
  const room = ensureRoomLiving(world, rec.roomId);
  if (room.breakerTripped) return world;
  if (room.waterGreyL < 1 || room.waterCleanL >= WATER_MAX_L) return world;
  if ((rec.progress01 ?? 0) > 0) return world;
  const next: Fixture = { ...rec, progress01: 0.001 };
  return { ...world, fixtures: { ...world.fixtures, [recyclerId]: next } };
}

function findKindInRoom(world: World, roomId: string, kind: string): Fixture | undefined {
  for (const fix of Object.values(world.fixtures)) {
    if (fix.roomId === roomId && fix.kind === kind) return fix;
  }
  return undefined;
}

function tickRoomPower(world: World, roomId: string): World {
  const room = ensureRoomLiving(world, roomId);
  const fixes = Object.values(world.fixtures).filter((f) => f.roomId === roomId);
  const load = fixes.reduce((sum, f) => sum + fixtureLoadKw(f), 0);
  const breaker = fixes.find((f) => f.kind === 'breaker_box');
  const breakerDead = breaker !== undefined && fixtureIntegrity(breaker) <= 0;
  const tripped = breakerDead || load > REACTOR_KW || room.breakerTripped;
  const heatTarget = 20 + load * 2.2;
  const heatC = room.heatC + (heatTarget - room.heatC) * 0.02;
  return writeRoom(world, { ...room, powerKw: load, heatC, breakerTripped: tripped });
}

function tickStove(world: World, fix: Fixture, dt: number): World {
  const progress = fix.progress01 ?? 0;
  if (progress <= 0) return world;
  const room = ensureRoomLiving(world, fix.roomId);
  if (room.breakerTripped || !fixtureOnline(fix)) return world;
  const next = progress + dt / COOK_S;
  if (next < 1) {
    return {
      ...world,
      fixtures: { ...world.fixtures, [fix.id]: { ...fix, progress01: next } },
    };
  }
  const meals = Math.min(MEALS_MAX, room.mealsReady + 1);
  const cleared: Fixture = { ...fix, progress01: 0 };
  const out: World = {
    ...world,
    fixtures: { ...world.fixtures, [fix.id]: cleared },
  };
  return writeRoom(out, { ...room, mealsReady: meals });
}

function tickRecycler(world: World, fix: Fixture, dt: number): World {
  const progress = fix.progress01 ?? 0;
  if (progress <= 0) return world;
  const room = ensureRoomLiving(world, fix.roomId);
  if (room.breakerTripped || !fixtureOnline(fix)) return world;
  const next = progress + dt / RECYCLE_S;
  if (next < 1) {
    return {
      ...world,
      fixtures: { ...world.fixtures, [fix.id]: { ...fix, progress01: next } },
    };
  }
  const moved = Math.min(2, room.waterGreyL, WATER_MAX_L - room.waterCleanL);
  const cleared: Fixture = { ...fix, progress01: 0 };
  const out: World = {
    ...world,
    fixtures: { ...world.fixtures, [fix.id]: cleared },
  };
  return writeRoom(out, {
    ...room,
    waterCleanL: room.waterCleanL + moved,
    waterGreyL: room.waterGreyL - moved,
  });
}

function tickGrowth(world: World, roomId: string, dt: number): World {
  const room = ensureRoomLiving(world, roomId);
  const tray = findKindInRoom(world, roomId, 'hydro_tray');
  if (tray === undefined || !fixtureOnline(tray)) return world;
  if (room.breakerTripped) return world;
  if (room.waterCleanL < 0.5) return world;
  if ((tray.progress01 ?? room.growth01) >= 1) return world;
  const drink = Math.min(room.waterCleanL, 0.05 * dt);
  const grown = Math.min(1, (tray.progress01 ?? room.growth01) + dt / GROW_S);
  const grownTray: Fixture = { ...tray, progress01: grown };
  const out: World = {
    ...world,
    fixtures: { ...world.fixtures, [tray.id]: grownTray },
  };
  return writeRoom(out, {
    ...room,
    growth01: grown,
    waterCleanL: room.waterCleanL - drink,
    waterGreyL: room.waterGreyL + drink * 0.5,
  });
}

export function tickLiving(world: World, dtSeconds: number): World {
  if (!(dtSeconds > 0)) return world;
  let next = world;
  const roomIds = new Set<string>(Object.values(world.fixtures).map((f) => f.roomId));
  for (const roomId of roomIds) next = tickRoomPower(next, roomId);
  for (const fix of Object.values(next.fixtures)) {
    if (fix.kind === 'stove') next = tickStove(next, fix, dtSeconds);
    if (fix.kind === 'water_recycler') next = tickRecycler(next, fix, dtSeconds);
  }
  for (const roomId of roomIds) next = tickGrowth(next, roomId, dtSeconds);
  return next;
}
