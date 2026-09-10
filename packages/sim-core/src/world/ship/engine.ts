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
}

const SPECS: Readonly<Record<EngineTier, EngineSpec>> = {
  0: { tier: 0, speedKps: 4, rangeSu: 6, fuelPerLeg: 1 },
  1: { tier: 1, speedKps: 7, rangeSu: 12, fuelPerLeg: 1 },
  2: { tier: 2, speedKps: 11, rangeSu: 22, fuelPerLeg: 1 },
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
