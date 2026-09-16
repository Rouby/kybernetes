/**
 * Solo-ship engine (TRANSFORM M2). Spool-up draws megawatts from the
 * reactor against a shared budget: overdraw brownouts the spool. Tune
 * decays across transit legs, wear caps effective tune until dockside
 * service. Speed/fuel factors feed the M3 leg machine. Pure + deterministic.
 */

import type { EngineTier } from './shipRecord.js';

export interface EngineSpec {
  readonly tier: EngineTier;
  readonly speedKps: number;
  readonly rangeSu: number;
  readonly fuelPerLeg: number;
  /** Physical cell slots; bunker capacity is slots * FUEL_PER_CELL. */
  readonly fuelSlots: number;
}

const SPECS: Readonly<Record<EngineTier, EngineSpec>> = {
  0: { tier: 0, speedKps: 4, rangeSu: 6, fuelPerLeg: 1, fuelSlots: 2 },
  1: { tier: 1, speedKps: 7, rangeSu: 12, fuelPerLeg: 1, fuelSlots: 3 },
  2: { tier: 2, speedKps: 11, rangeSu: 22, fuelPerLeg: 1, fuelSlots: 4 },
};

/** Tier stat table for the M3 range/speed check. */
export function engineSpecFor(tier: EngineTier): EngineSpec {
  return SPECS[tier];
}

export const ENGINE_SPOOL_MW = 20;
export const ENGINE_HOTEL_MW = 8;
export const SPOOL_UP_S = 8;
export const SPOOL_DOWN_S = 4;
export const TUNE_DECAY_PER_S = 0.004;
export const WEAR_PER_LEG = 0.15;
export const WEAR_TUNE_PENALTY = 0.5;

/** Fuel-value yielded by inserting one fuel cell into the engine. */
export const FUEL_PER_CELL = 1000;
/** Extra fuel-value burned mid-leg when tune is cold (replaces +1 cell). */
export const HEAT_EXTRA_FUEL = 300;
/** Nominal burn rate per leg-second at full thrust, per tier. */
const FUEL_PER_SECOND: Readonly<Record<EngineTier, number>> = { 0: 6.5, 1: 7.5, 2: 9 };

export interface EngineState {
  readonly spool: number;
  /** Latched console command; the tick spools toward it while powered. */
  readonly spoolCmd: 0 | 1;
  readonly tune: number;
  readonly wear: number;
  /** Latched while overdrawn; servers raise NOTICE on the rising edge. */
  readonly brownout: boolean;
}

export function coldEngine(): EngineState {
  return { spool: 0, spoolCmd: 0, tune: 1, wear: 0, brownout: false };
}

/** Bunker capacity for a tier: slots * FUEL_PER_CELL. */
export function fuelMaxForTier(tier: EngineTier): number {
  return engineSpecFor(tier).fuelSlots * FUEL_PER_CELL;
}

/** Clamp raw fuel-value into the tier bunker range. */
export function clampEngineFuel(fuel: number, tier: EngineTier): number {
  if (!Number.isFinite(fuel)) return 0;
  return Math.min(fuelMaxForTier(tier), Math.max(0, Math.floor(fuel)));
}

/** Fuel-value burned per real second of torch flight at throttle. */
export function fuelRateForLeg(tier: EngineTier, thrust01: number): number {
  const rate = FUEL_PER_SECOND[tier] ?? FUEL_PER_SECOND[0] ?? 6.5;
  return rate * thrustFuelFactor(clampFuelThrust(thrust01));
}

/** Fuel-value cost of one hop: burn rate scaled by leg seconds. */
export function fuelCostForLeg(tier: EngineTier, thrust01: number, legS: number): number {
  const secs = Number.isFinite(legS) ? Math.max(1, legS) : 1;
  return Math.max(1, Math.round(fuelRateForLeg(tier, thrust01) * secs));
}

function clampFuelThrust(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, value));
}

function thrustFuelFactor(thrust01: number): number {
  return 0.6 + 0.4 * thrust01;
}

/** Insert one loose cell into the bunker; undefined when no room/cell. */
export function loadFuelCell(
  looseCells: number,
  engineFuel: number,
  tier: EngineTier
): { looseCells: number; engineFuel: number } | undefined {
  if (!Number.isInteger(looseCells) || looseCells < 1) return undefined;
  const max = fuelMaxForTier(tier);
  if (!Number.isFinite(engineFuel) || engineFuel + FUEL_PER_CELL > max + 1e-9) return undefined;
  return { looseCells: looseCells - 1, engineFuel: Math.min(max, engineFuel + FUEL_PER_CELL) };
}

/** Remove one full cell of fuel back to loose stores; undefined when short. */
export function unloadFuelCell(
  looseCells: number,
  engineFuel: number,
  tier: EngineTier
): { looseCells: number; engineFuel: number } | undefined {
  void tier;
  if (!Number.isInteger(looseCells) || looseCells < 0) return undefined;
  if (!Number.isFinite(engineFuel) || engineFuel < FUEL_PER_CELL) return undefined;
  return { looseCells: looseCells + 1, engineFuel: engineFuel - FUEL_PER_CELL };
}

/** Tune capped by wear: a worn engine cannot hold a perfect tune. */
export function effectiveTune(state: Pick<EngineState, 'tune' | 'wear'>): number {
  return Math.max(0, state.tune * (1 - state.wear * WEAR_TUNE_PENALTY));
}

/** Cruise factor for the M3 leg clock: 0.55 at zero tune, 1.0 at perfect. */
export function speedFactor(state: Pick<EngineState, 'tune' | 'wear'>): number {
  return 0.55 + 0.45 * effectiveTune(state);
}

export function engineDemandMw(spool: number): number {
  return spool * ENGINE_SPOOL_MW + ENGINE_HOTEL_MW;
}

export interface EngineTickInput {
  readonly spoolCmd: 0 | 1;
  /** Absolute tune set 0-1; undefined keeps the current tune. */
  readonly tuneSet?: number;
}

export function tickEngine(
  state: EngineState,
  outputMW: number,
  underway: boolean,
  dtSeconds: number,
  cmd: EngineTickInput
): EngineState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return state;
  const tune = cmd.tuneSet === undefined ? state.tune : clamp01(cmd.tuneSet);
  const decayed = underway ? Math.max(0, tune - TUNE_DECAY_PER_S * dtSeconds) : tune;
  const brownout = outputMW < engineDemandMw(state.spool);
  const spool =
    cmd.spoolCmd === 1 && !brownout
      ? Math.min(1, state.spool + dtSeconds / SPOOL_UP_S)
      : Math.max(0, state.spool - dtSeconds / SPOOL_DOWN_S);
  return { spool, spoolCmd: state.spoolCmd, tune: decayed, wear: state.wear, brownout };
}

/** Dockside service between legs: wear resets, tune stays operator-set. */
export function serviceEngine(state: EngineState): EngineState {
  return { ...state, wear: 0 };
}

/** Wear accrued by one completed leg (called on docking, M3). */
export function wearEngine(state: EngineState, legs = 1): EngineState {
  if (!Number.isFinite(legs) || legs <= 0) return state;
  return { ...state, wear: Math.min(1, state.wear + WEAR_PER_LEG * legs) };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
