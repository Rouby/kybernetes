/**
 * Authoritative death: the server declares it, the client renders it.
 * Dead is stricter than incapacitated: hp <= 0 means the run is over and
 * only RESTART (fresh run) recovers. Incapacitated with hp > 0 stays
 * revivable via bleedout stabilization. Pure math, no DOM/Node imports.
 */

import type { DeathCause } from '@kybernetes/protocol';
import { defaultVitals } from './survival.js';
import type { PawnBody, World } from './types.js';

export interface RespawnPoint {
  readonly frameId: string;
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
}

export function isDead(world: World, pawnId: string): boolean {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return false;
  return pawn.health.hp <= 0;
}

export function deathCauseFor(world: World, pawnId: string): DeathCause | undefined {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined || pawn.health.hp > 0) return undefined;
  return causeFromState(world, pawn);
}

interface DeathSignals {
  readonly bleedoutS: number;
  readonly hypoxia: number;
  readonly pressureKpa: number | undefined;
  readonly bodyTempC: number;
  readonly hunger: number;
  readonly thirst: number;
}

export function readVitalsSignals(
  vitals: World['vitals'][string] | undefined
): Omit<DeathSignals, 'pressureKpa'> {
  return {
    bleedoutS: vitals?.bleedoutS ?? 0,
    hypoxia: vitals?.hypoxia ?? 0,
    bodyTempC: vitals?.bodyTempC ?? 37,
    hunger: vitals?.hunger ?? 100,
    thirst: vitals?.thirst ?? 100,
  };
}

function readDeathSignals(world: World, pawn: PawnBody): DeathSignals {
  return {
    ...readVitalsSignals(world.vitals[pawn.id]),
    pressureKpa: world.atmos[pawn.roomHint]?.pressureKpa,
  };
}

function isVacuum(pressureKpa: number | undefined): boolean {
  return pressureKpa !== undefined && pressureKpa < 5;
}

function isThermal(bodyTempC: number): boolean {
  return bodyTempC < 35 || bodyTempC > 39;
}

function causeFromSignals(signals: DeathSignals): DeathCause {
  if (signals.bleedoutS > 0) return 'bleedout';
  if (signals.hypoxia >= 100) return 'hypoxia';
  if (isVacuum(signals.pressureKpa)) return 'vacuum';
  if (isThermal(signals.bodyTempC)) return 'thermal';
  if (signals.hunger <= 0) return 'starvation';
  if (signals.thirst <= 0) return 'dehydration';
  return 'combat';
}

function causeFromState(world: World, pawn: PawnBody): DeathCause {
  return causeFromSignals(readDeathSignals(world, pawn));
}

/**
 * Fresh-run restart: the world tick keeps running, this pawn wipes run
 * state and respawns at the station spawn. Keeps the same pawn id so the
 * owning session stays mapped; identity (color/trim/thruster) is preserved
 * while run state (health, vitals, crew role, spread, memory) resets.
 */
export function restartRun(world: World, pawnId: string, point: RespawnPoint): World {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined) return world;
  const fresh = defaultVitals(false);
  const crew = { ...world.crew };
  delete crew[pawnId];
  const spread = { ...world.spread };
  delete spread[pawnId];
  const memory = { ...world.memory };
  delete memory[pawnId];
  return {
    ...world,
    pawns: {
      ...world.pawns,
      [pawnId]: {
        ...pawn,
        frameId: point.frameId,
        roomHint: point.roomId,
        pos: { x: point.x, y: point.y },
        vel: { x: 0, y: 0 },
        facing: 0,
        health: { ...pawn.health, hp: pawn.health.maxHp, incapacitated: false },
      },
    },
    vitals: { ...world.vitals, [pawnId]: fresh },
    crew,
    spread,
    memory,
  };
}
