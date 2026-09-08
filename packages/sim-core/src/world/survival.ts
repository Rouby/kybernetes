/**
 * Survival v1: hunger/thirst/fatigue, pO2 hypoxia, vacuum and thermal drains,
 * suit oxygen and battery, bleedout with revive. Fed by authoritative atmos
 * probes; missing readings default to nominal so airless tests stay healthy.
 */

import type { PawnBody, World } from './types.js';

export interface PawnVitals {
  readonly hunger: number;
  readonly thirst: number;
  readonly fatigue: number;
  readonly hypoxia: number;
  readonly suitSealed: boolean;
  readonly suitO2: number;
  readonly suitIntegrity: number;
  readonly suitBattery: number;
  readonly bodyTempC: number;
  readonly bleedoutS: number;
  readonly sleeping: boolean;
  readonly mags: readonly number[];
  readonly reloadingS: number;
}

export const SUIT_O2_MAX = 600;
export const BLEEDOUT_S = 45;
export const BLEED_RATE = 2;
export const VACUUM_DRAIN = 8;
export const REVIVE_HP = 30;
export const MAG_SIZE = 30;
export const MAG_COUNT = 5;
export const RELOAD_S = 2;

export function loadedAmmo(vitals: PawnVitals): number {
  return vitals.mags[0] ?? 0;
}

export function spareRounds(vitals: PawnVitals): number {
  return vitals.mags.slice(1).reduce((sum, rounds) => sum + rounds, 0);
}

export function defaultVitals(suitSealed: boolean): PawnVitals {
  return {
    hunger: 100,
    thirst: 100,
    fatigue: 0,
    hypoxia: 0,
    suitSealed,
    suitO2: SUIT_O2_MAX,
    suitIntegrity: 100,
    suitBattery: 100,
    bodyTempC: 37,
    bleedoutS: 0,
    sleeping: false,
    mags: Array.from({ length: MAG_COUNT }, () => MAG_SIZE),
    reloadingS: 0,
  };
}

export function ensureVitals(world: World, pawnId: string): PawnVitals {
  const existing = world.vitals[pawnId];
  if (existing !== undefined) return existing;
  return defaultVitals(world.pawns[pawnId]?.health.suitSealed ?? false);
}

export function setSuitSealed(world: World, pawnId: string, sealed: boolean): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return world;
  const vitals = ensureVitals(world, pawnId);
  if (vitals.suitSealed === sealed && pawn.health.suitSealed === sealed) return world;
  return {
    ...world,
    pawns: {
      ...world.pawns,
      [pawnId]: { ...pawn, health: { ...pawn.health, suitSealed: sealed } },
    },
    vitals: { ...world.vitals, [pawnId]: { ...vitals, suitSealed: sealed } },
  };
}

export function applyConsume(world: World, pawnId: string): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return world;
  const vitals = ensureVitals(world, pawnId);
  return {
    ...world,
    vitals: {
      ...world.vitals,
      [pawnId]: {
        ...vitals,
        hunger: Math.min(100, vitals.hunger + 20),
        thirst: Math.min(100, vitals.thirst + 20),
      },
    },
  };
}

export function setSleeping(world: World, pawnId: string, sleeping: boolean): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return world;
  const vitals = ensureVitals(world, pawnId);
  if (vitals.sleeping === sleeping) return world;
  return { ...world, vitals: { ...world.vitals, [pawnId]: { ...vitals, sleeping } } };
}

export function startReload(world: World, pawnId: string): { world: World; result: 'ok' | 'full' | 'none' | 'busy' } {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return { world, result: 'none' };
  const vitals = ensureVitals(world, pawnId);
  if (vitals.reloadingS > 0) return { world, result: 'busy' };
  if (loadedAmmo(vitals) >= MAG_SIZE) return { world, result: 'full' };
  if (vitals.mags.length < 2) return { world, result: 'none' };
  return {
    world: {
      ...world,
      vitals: { ...world.vitals, [pawnId]: { ...vitals, reloadingS: RELOAD_S } },
    },
    result: 'ok',
  };
}

export function startBleeding(world: World, pawnId: string, seconds: number): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return world;
  const vitals = ensureVitals(world, pawnId);
  const bleedoutS = Math.max(vitals.bleedoutS, seconds);
  if (bleedoutS === vitals.bleedoutS) return world;
  return { ...world, vitals: { ...world.vitals, [pawnId]: { ...vitals, bleedoutS } } };
}

export function tickSurvival(world: World, dtSeconds: number): World {
  if (!(dtSeconds > 0)) return world;
  let next = world;
  for (const pawn of Object.values(world.pawns)) {
    next = tickPawnVitals(next, pawn, dtSeconds);
  }
  return next;
}

function completeReload(vitals: PawnVitals, dt: number): PawnVitals {
  if (vitals.reloadingS <= 0) return vitals;
  const remaining = vitals.reloadingS - dt;
  if (remaining > 0) return { ...vitals, reloadingS: remaining };
  const [spent, ...spares] = vitals.mags;
  if (spares.length === 0) return { ...vitals, reloadingS: 0 };
  const best = Math.max(...spares);
  const bestIndex = spares.indexOf(best);
  const rest = spares.filter((_, index) => index !== bestIndex);
  const retained = spent !== undefined && spent > 0 ? [...rest, spent] : rest;
  return { ...vitals, mags: [best, ...retained], reloadingS: 0 };
}

function tickPawnVitals(world: World, pawn: PawnBody, dt: number): World {
  const vitals = completeReload(ensureVitals(world, pawn.id), dt);
  const air = world.atmos[pawn.roomHint];
  const pressureKpa = air?.pressureKpa ?? 101.3;
  const o2Percent = air?.o2Percent ?? 20.9;
  const tempC = air?.tempCelsius ?? 21;
  const suitOn = vitals.suitSealed && vitals.suitO2 > 0;
  const breathed = breathe(vitals, pressureKpa, o2Percent, suitOn, dt);
  const warmed = regulateHeat(breathed, tempC, suitOn, dt);
  const fed = metabolize(world, pawn, warmed, dt);
  const hurt = harm(pawn, fed, pressureKpa, suitOn, dt);
  return writeVitals(world, pawn, hurt.vitals, hurt.hp, hurt.incapacitated);
}

interface HurtResult {
  vitals: PawnVitals;
  hp: number;
  incapacitated: boolean;
}

function breathe(
  vitals: PawnVitals,
  pressureKpa: number,
  o2Percent: number,
  suitOn: boolean,
  dt: number
): PawnVitals {
  const suitO2 = suitOn ? Math.max(0, vitals.suitO2 - dt) : vitals.suitO2;
  if (suitOn) {
    return { ...vitals, suitO2, hypoxia: Math.max(0, vitals.hypoxia - 10 * dt) };
  }
  const po2 = pressureKpa * (o2Percent / 100);
  return { ...vitals, hypoxia: clamp01(vitals.hypoxia + hypoxiaRate(po2) * dt) };
}

function regulateHeat(vitals: PawnVitals, tempC: number, suitOn: boolean, dt: number): PawnVitals {
  const heated = suitOn && vitals.suitBattery > 0 && tempC < 10;
  const suitBattery = heated ? Math.max(0, vitals.suitBattery - 0.5 * dt) : vitals.suitBattery;
  const extreme = tempC < 10 || tempC > 35;
  const target = heated || !extreme ? 37 : tempC;
  const bodyTempC = vitals.bodyTempC + (target - vitals.bodyTempC) * Math.min(1, dt * 0.05);
  return { ...vitals, suitBattery, bodyTempC };
}

function metabolize(world: World, pawn: PawnBody, vitals: PawnVitals, dt: number): PawnVitals {
  const hunger = Math.max(0, vitals.hunger - 0.1 * dt);
  const thirst = Math.max(0, vitals.thirst - 0.15 * dt);
  const fatigue = vitals.sleeping
    ? Math.max(0, vitals.fatigue - dt)
    : Math.min(100, vitals.fatigue + fatigueRate(world, pawn.id) * dt);
  return { ...vitals, hunger, thirst, fatigue };
}

function fatigueRate(world: World, pawnId: string): number {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return 0.02;
  const vessel = world.vessels[pawn.frameId];
  if (vessel !== undefined && vessel.schedule === 'in_transit') return 0.1;
  return 0.02;
}

function harm(
  pawn: PawnBody,
  vitals: PawnVitals,
  pressureKpa: number,
  suitOn: boolean,
  dt: number
): HurtResult {
  let hp = pawn.health.hp;
  let bleedoutS = vitals.bleedoutS;
  let harmed = false;
  if (!suitOn && pressureKpa < 5) {
    hp -= VACUUM_DRAIN * dt;
    harmed = true;
  }
  if (vitals.bodyTempC < 35 || vitals.bodyTempC > 39) {
    hp -=
      Math.abs(vitals.bodyTempC < 35 ? 35 - vitals.bodyTempC : vitals.bodyTempC - 39) * 0.05 * dt;
    harmed = true;
  }
  if (vitals.hunger <= 0) {
    hp -= 0.5 * dt;
    harmed = true;
  }
  if (vitals.thirst <= 0) {
    hp -= dt;
    harmed = true;
  }
  if (bleedoutS > 0) {
    bleedoutS = Math.max(0, bleedoutS - dt);
    hp -= BLEED_RATE * dt;
    harmed = true;
  }
  if (!harmed && hp < pawn.health.maxHp) hp = Math.min(pawn.health.maxHp, hp + dt);
  hp = Math.min(pawn.health.maxHp, Math.max(0, hp));
  if (hp <= 0) return { vitals: { ...vitals, bleedoutS }, hp, incapacitated: true };
  if (pawn.health.incapacitated && (bleedoutS > 0 || hp < REVIVE_HP)) {
    return { vitals: { ...vitals, bleedoutS }, hp, incapacitated: true };
  }
  return { vitals: { ...vitals, bleedoutS }, hp, incapacitated: false };
}

function writeVitals(
  world: World,
  pawn: PawnBody,
  vitals: PawnVitals,
  hp: number,
  incapacitated: boolean
): World {
  const current = world.pawns[pawn.id];
  if (current === undefined) return world;
  return {
    ...world,
    pawns: {
      ...world.pawns,
      [pawn.id]: { ...current, health: { ...current.health, hp, incapacitated } },
    },
    vitals: { ...world.vitals, [pawn.id]: vitals },
  };
}

export function hypoxiaRate(po2Kpa: number): number {
  if (po2Kpa < 10) return 10;
  if (po2Kpa < 15) return 4;
  if (po2Kpa < 19) return 1;
  return -10;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
