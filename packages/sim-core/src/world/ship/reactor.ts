/**
 * Solo-ship reactor (TRANSFORM M2). Two-dial balance: control rods set
 * output/heat, coolant flow removes heat, and a slow seeded flux drift
 * pushes temperature out of band during transit legs. Docked-cold reactors
 * sit drift-free. Neglect climbs a recoverable ladder: warning -> scram /
 * blackout -> hull damage -> ship loss at condition 0 (see systems.ts).
 * Pure + deterministic; transit noise is hash-based, never Math.random.
 */

import type { ReactorTier } from './shipRecord.js';

export interface ReactorSpec {
  readonly tier: ReactorTier;
  readonly maxOutputMw: number;
  readonly coolingPerFlow: number;
  readonly driftPerS: number;
}

const SPECS: Readonly<Record<ReactorTier, ReactorSpec>> = {
  0: { tier: 0, maxOutputMw: 40, coolingPerFlow: 1, driftPerS: 0.02 },
  1: { tier: 1, maxOutputMw: 70, coolingPerFlow: 1.4, driftPerS: 0.012 },
  2: { tier: 2, maxOutputMw: 110, coolingPerFlow: 1.9, driftPerS: 0.006 },
};

/** Tier stat table for the M2 tune tick and the M3 power check. */
export function reactorSpecFor(tier: ReactorTier): ReactorSpec {
  return SPECS[tier];
}

export interface ReactorBand {
  readonly lo: number;
  readonly hi: number;
}

const BANDS: Readonly<Record<ReactorTier, ReactorBand>> = {
  0: { lo: 620, hi: 700 },
  1: { lo: 600, hi: 740 },
  2: { lo: 580, hi: 780 },
};

export function reactorBandFor(tier: ReactorTier): ReactorBand {
  return BANDS[tier];
}

export const REACTOR_COLD_K = 300;
export const REACTOR_REST_K = 350;
export const SCRAM_OVERHEAT_S = 15;
export const SCRAM_CRITICAL_MARGIN_K = 60;
export const DEFAULT_RODS = 0.3;
export const DEFAULT_COOLANT = 0.5;

export interface ReactorState {
  readonly hot: boolean;
  readonly tempK: number;
  /** Control-rod insertion 0-1: deeper rods mean less output and less heat. */
  readonly rods: number;
  /** Coolant flow 0-1. */
  readonly coolant: number;
  /** Slow random-walk drift term, roughly -1..1. */
  readonly flux: number;
  readonly fluxSeed: number;
  /** Seconds spent above the band; resets back in band. */
  readonly overheatS: number;
  readonly scrammed: boolean;
  /** Seconds since the scram started (damage grace in systems.ts). */
  readonly scramS: number;
  /** Latched while out of band; servers raise NOTICE on the rising edge. */
  readonly warned: boolean;
}

export function coldReactor(fluxSeed = 1): ReactorState {
  return {
    hot: false,
    tempK: REACTOR_COLD_K,
    rods: DEFAULT_RODS,
    coolant: DEFAULT_COOLANT,
    flux: 0,
    fluxSeed,
    overheatS: 0,
    scrammed: false,
    scramS: 0,
    warned: false,
  };
}

export function reactorOutputMw(state: Pick<ReactorState, 'rods'>, tier: ReactorTier): number {
  return reactorSpecFor(tier).maxOutputMw * (1 - 0.75 * clamp01(state.rods));
}

/** Console tune step: rods/coolant deltas in +-0.1, clamped. */
export function tuneReactor(
  state: ReactorState,
  rodsDelta: number,
  coolantDelta: number
): ReactorState {
  if (!Number.isFinite(rodsDelta) || !Number.isFinite(coolantDelta)) return state;
  return {
    ...state,
    rods: clamp01(state.rods + rodsDelta),
    coolant: clamp01(state.coolant + coolantDelta),
  };
}

/**
 * Light a cold reactor, or restart after a scram. Cold lights settle at
 * band center on default trims; restarts keep the operator's trims.
 */
export function restartReactor(state: ReactorState, tier: ReactorTier): ReactorState {
  const mid = (reactorBandFor(tier).lo + reactorBandFor(tier).hi) / 2;
  if (!state.hot && !state.scrammed) {
    return { ...coldReactor(state.fluxSeed), hot: true, tempK: mid };
  }
  if (!state.scrammed) return state;
  return { ...state, tempK: mid, overheatS: 0, scrammed: false, scramS: 0, warned: false };
}

export function tickReactor(
  state: ReactorState,
  tier: ReactorTier,
  dtSeconds: number,
  tick: number
): ReactorState {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || !state.hot) return state;
  if (state.scrammed) return coolScrammed(state, dtSeconds);
  const spec = reactorSpecFor(tier);
  const band = reactorBandFor(tier);
  const flux = easeFlux(state, spec, dtSeconds, tick);
  const output = reactorOutputMw(state, tier);
  const tempVel = output * 0.55 - state.coolant * 34 * spec.coolingPerFlow + flux * 2.5;
  const tempK = state.tempK + tempVel * dtSeconds;
  const overheatS = tempK > band.hi ? state.overheatS + dtSeconds : 0;
  const scrammed = overheatS >= SCRAM_OVERHEAT_S || tempK >= band.hi + SCRAM_CRITICAL_MARGIN_K;
  return {
    ...state,
    tempK,
    flux,
    overheatS: scrammed ? 0 : overheatS,
    scrammed,
    scramS: scrammed ? 0 : state.scramS,
    warned: scrammed || tempK > band.hi,
  };
}

function coolScrammed(state: ReactorState, dtSeconds: number): ReactorState {
  return {
    ...state,
    tempK: approach(state.tempK, REACTOR_REST_K, 8 * dtSeconds),
    scramS: state.scramS + dtSeconds,
  };
}

function easeFlux(state: ReactorState, spec: ReactorSpec, dtSeconds: number, tick: number): number {
  const simSeconds = Math.max(0, tick) * dtSeconds;
  const target = (hash01(state.fluxSeed, Math.floor(simSeconds / 25)) * 2 - 1) * 0.8;
  const rate = Math.min(1, (0.15 + spec.driftPerS * 5) * dtSeconds);
  return state.flux + (target - state.flux) * rate;
}

function hash01(seed: number, n: number): number {
  const x = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
