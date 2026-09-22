/**
 * Voyage transit legs (TRANSFORM M3, multi-hop since Drift Captain 1b).
 * Interior + abstract transit: the player plots a stop chain at the nav
 * console and keeps doing chores inside while each hop timer runs. Fuel,
 * tiers, and tune shape the clock; the server feeds checks
 * (hot/powered/fuel) and applies world side effects (see systems).
 * Pure + deterministic; all randomness lives in the reactor drift.
 */

import { planTripLeg, torchAccel } from '../../astro/guidance.js';
import { fuelCostForLeg, fuelMaxForTier, fuelRateForLeg } from './engine.js';
import { chartLaneFraction, HUB_A, isHubId } from './ports.js';
import type { EngineTier } from './shipRecord.js';

export type NavPhase = 'docked' | 'in_transit' | 'docking';

export interface NavState {
  readonly phase: NavPhase;
  readonly destHubId: string | undefined;
  readonly remainingS: number;
  readonly legId: number;
  /** Hub whose dock mouth the vessel physically sits at while docked. */
  readonly portHubId: string;
  /** Out of fuel mid-leg: the timer freezes until rescue (hail, refuel, tow). */
  readonly flameout: boolean;
  /** Rescue-drone countdown from a HAIL; 0 means none outstanding. */
  readonly hailS: number;
  /** Committed stop chain (POI flybys + final hub); empty while docked. */
  readonly stops: readonly string[];
  /** Index into stops of the live hop. */
  readonly legIndex: number;
  /** Throttle 0.1-1.0 of the 1g torch band; scales leg clocks and burns. */
  readonly thrust01: number;
  /** Live-hop total seconds from guidance; absent on legacy states. */
  readonly legTotalS?: number;
}

/** Docking approach: the hull eases into the destination mate before unsealing. */
export const DOCKING_S = 5;
/** A hailed rescue drone answers after a little over a minute adrift. */
export const HAIL_WAIT_S = 75;

const LEG_S: Readonly<Record<EngineTier, number>> = { 0: 150, 1: 110, 2: 80 };

export function legDurationSeconds(tier: EngineTier): number {
  return LEG_S[tier];
}

export const DOCKED_NAV: NavState = {
  phase: 'docked',
  destHubId: undefined,
  remainingS: 0,
  legId: 0,
  portHubId: HUB_A,
  flameout: false,
  hailS: 0,
  stops: [],
  legIndex: 0,
  thrust01: 1,
};

/** Lowest throttle step: 10% of the 1g band (0% would never arrive). */
export const MIN_THRUST01 = 0.1;

/** Clamp raw throttle into the flyable band; non-finite reads full. */
export function clampThrust01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(MIN_THRUST01, value));
}

/** Brachistochrone clock: time scales with the inverse square root. */
export function thrustTimeFactor(thrust01: number): number {
  return 1 / Math.sqrt(clampThrust01(thrust01));
}

/** Leg seconds from guidance when clocked, else the lane-table nominal. */
export function legWindowS(
  fromId: string,
  toId: string,
  tier: EngineTier,
  thrust01: number,
  nowS: number | undefined
): number {
  if (nowS !== undefined) {
    const planned = planTripLeg(fromId, toId, torchAccel(tier, thrust01), nowS);
    if (planned !== null) return planned.totalS;
  }
  return hopScaledS(fromId, toId, tier, thrust01);
}

/** Full-tune seconds for one hop at throttle: lane fraction, scaled. */
export function hopScaledS(
  fromId: string,
  toId: string,
  tier: EngineTier,
  thrust01: number
): number {
  return Math.max(1, Math.round(hopBaseS(fromId, toId, tier) * thrustTimeFactor(thrust01)));
}

/** M1 helper: true while the ship is committed to a leg. */
export function isUnderway(nav: NavState): boolean {
  return nav.phase === 'in_transit' || nav.phase === 'docking';
}

export interface PlotChecks {
  readonly hot: boolean;
  readonly powered: boolean;
  /** Flyable fuel-value in the engine bunker (replaces loose fuelCells). */
  readonly engineFuel: number;
  /** @deprecated loose cells; accepted as fallback (cells*1000) during migration. */
  readonly fuelCells?: number;
}

export type PlotReject =
  | 'already-underway'
  | 'unknown-hub'
  | 'same-hub'
  | 'no-power'
  | 'no-fuel'
  | 'unknown-node'
  | 'empty-voyage'
  | 'same-stop';

/** Resolve flyable fuel from checks (prefers engineFuel, falls back to cells). */
export function checksEngineFuel(checks: PlotChecks): number {
  if (Number.isFinite(checks.engineFuel)) return checks.engineFuel;
  if (Number.isFinite(checks.fuelCells)) return (checks.fuelCells as number) * 1000;
  return Number.NaN;
}

export function plotCourse(
  nav: NavState,
  destHubId: string,
  checks: PlotChecks,
  engineTier: EngineTier = 0,
  nowS?: number
): { nav: NavState } | { reject: PlotReject } {
  if (nav.phase !== 'docked') return { reject: 'already-underway' };
  if (!isHubId(destHubId)) return { reject: 'unknown-hub' };
  if (destHubId === nav.portHubId) return { reject: 'same-hub' };
  if (!checks.hot || !checks.powered) return { reject: 'no-power' };
  const legS = legWindowS(nav.portHubId, destHubId, engineTier, 1, nowS);
  const fuel = checksEngineFuel(checks);
  const need = fuelCostForLeg(engineTier, 1, legS);
  if (!Number.isFinite(fuel) || fuel < need) return { reject: 'no-fuel' };
  return {
    nav: {
      phase: 'in_transit',
      destHubId,
      remainingS: legS,
      legId: nav.legId + 1,
      portHubId: nav.portHubId,
      flameout: false,
      hailS: 0,
      stops: [destHubId],
      legIndex: 0,
      thrust01: 1,
      legTotalS: legS,
    },
  };
}

/**
 * Hail a rescue drone while flamed-out adrift. Idempotent: only the
 * first hail per stranding starts the countdown, later hails no-op.
 */
export function hailForRescue(nav: NavState): NavState {
  if (nav.phase !== 'in_transit' || !nav.flameout || nav.hailS > 0) return nav;
  return { ...nav, hailS: HAIL_WAIT_S };
}

/** DISTRESS reset: towed home, sitting docked at the given hub. */
export function resetLegTo(nav: NavState, portHubId: string): NavState {
  if (!isHubId(portHubId)) return nav;
  return { ...DOCKED_NAV, portHubId, legId: nav.legId };
}

/** Minimal cursor for hop math; NavState satisfies this structurally. */
export interface HopCursor {
  readonly portHubId: string;
  readonly destHubId: string | undefined;
  readonly stops: readonly string[];
  readonly legIndex: number;
}

/** Node the live hop departs from (dock mouth, then each cleared stop). */
export function hopFrom(nav: HopCursor): string {
  if (nav.legIndex <= 0) return nav.portHubId;
  return nav.stops[nav.legIndex - 1] ?? nav.portHubId;
}

/** Node the live hop flies toward (final destHubId when stops run out). */
export function hopTo(nav: HopCursor): string {
  return nav.stops[nav.legIndex] ?? nav.destHubId ?? nav.portHubId;
}

/** Full-tune seconds for one hop: lane fraction of the tier leg duration. */
export function hopBaseS(fromId: string, toId: string, tier: EngineTier): number {
  const fraction = chartLaneFraction(fromId, toId) ?? 1;
  return Math.max(1, Math.round(fraction * legDurationSeconds(tier)));
}

export interface ReactorPower {
  readonly hot: boolean;
  readonly scrammed: boolean;
}

export function tickNavLeg(
  nav: NavState,
  reactor: ReactorPower,
  engineTier: EngineTier,
  engineFuel: number,
  dtSeconds: number,
  nowS?: number
): { nav: NavState; engineFuel: number; fuelCells: number } {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0)
    return { nav, engineFuel, fuelCells: engineFuel };
  if (nav.phase === 'in_transit') {
    const out = tickTransit(nav, reactor, engineTier, engineFuel, dtSeconds, nowS);
    return { nav: out.nav, engineFuel: out.engineFuel, fuelCells: out.engineFuel };
  }
  if (nav.phase === 'docking') {
    const out = tickDocking(nav, engineFuel, dtSeconds);
    return { nav: out.nav, engineFuel: out.engineFuel, fuelCells: out.engineFuel };
  }
  return { nav, engineFuel, fuelCells: engineFuel };
}

function tickTransit(
  nav: NavState,
  reactor: ReactorPower,
  engineTier: EngineTier,
  engineFuel: number,
  dtSeconds: number,
  nowS: number | undefined
): { nav: NavState; engineFuel: number } {
  if (nav.flameout) return tickStranded(nav, reactor, engineTier, engineFuel, dtSeconds);
  if (reactor.scrammed) return { nav, engineFuel };
  const stepBurn = fuelRateForLeg(engineTier, nav.thrust01) * dtSeconds;
  const fuelAfter = engineFuel - stepBurn;
  if (fuelAfter <= 0) {
    return { nav: { ...nav, flameout: true }, engineFuel: 0 };
  }
  const remaining = nav.remainingS - dtSeconds;
  if (remaining > 0) return { nav: { ...nav, remainingS: remaining }, engineFuel: fuelAfter };
  return finishHop(nav, engineTier, fuelAfter, nowS);
}

/**
 * Frozen leg clock with two ways back: a hailed drone refuels the
 * remainder on arrival, or restored bunker fuel resumes the burn
 * immediately. Both need a hot, unscrammed reactor.
 */
function tickStranded(
  nav: NavState,
  reactor: ReactorPower,
  engineTier: EngineTier,
  engineFuel: number,
  dtSeconds: number
): { nav: NavState; engineFuel: number } {
  const hailed = tickHail(nav, dtSeconds);
  if (!hailed.flameout) {
    if (nav.flameout && nav.hailS > 0) {
      return { nav: hailed, engineFuel: refuelFromDrone(engineTier, hailed, engineFuel) };
    }
    return { nav: hailed, engineFuel };
  }
  if (!reactor.hot || reactor.scrammed) return { nav: hailed, engineFuel };
  if (engineFuel <= 0) return { nav: hailed, engineFuel };
  return { nav: { ...hailed, flameout: false, hailS: 0 }, engineFuel };
}

/** Rescue-drone refuel: covers the estimated remainder of the live hop. */
function refuelFromDrone(engineTier: EngineTier, nav: NavState, engineFuel: number): number {
  const grant = fuelRateForLeg(engineTier, nav.thrust01) * Math.max(0, nav.remainingS);
  const max = fuelMaxForTier(engineTier);
  return Math.min(max, engineFuel + grant);
}

function tickHail(nav: NavState, dtSeconds: number): NavState {
  if (nav.hailS <= 0) return nav;
  if (nav.hailS - dtSeconds > 0) return { ...nav, hailS: nav.hailS - dtSeconds };
  return { ...nav, hailS: 0, flameout: false };
}

function finishHop(
  nav: NavState,
  engineTier: EngineTier,
  engineFuel: number,
  nowS: number | undefined
): { nav: NavState; engineFuel: number } {
  if (nav.legIndex + 1 < nav.stops.length) return advanceHop(nav, engineTier, engineFuel, nowS);
  return {
    nav: {
      ...nav,
      phase: 'docking',
      destHubId: nav.destHubId,
      remainingS: DOCKING_S,
    },
    engineFuel,
  };
}

function advanceHop(
  nav: NavState,
  engineTier: EngineTier,
  engineFuel: number,
  nowS: number | undefined
): { nav: NavState; engineFuel: number } {
  const next = nav.legIndex + 1;
  const from = nav.stops[nav.legIndex] ?? nav.portHubId;
  const to = nav.stops[next] ?? nav.destHubId ?? nav.portHubId;
  const baseS = legWindowS(from, to, engineTier, nav.thrust01, nowS);
  if (engineFuel <= 0) {
    return {
      nav: { ...nav, legIndex: next, remainingS: baseS, legTotalS: baseS, flameout: true },
      engineFuel: 0,
    };
  }
  return {
    nav: { ...nav, legIndex: next, remainingS: baseS, legTotalS: baseS },
    engineFuel,
  };
}

function tickDocking(
  nav: NavState,
  engineFuel: number,
  dtSeconds: number
): { nav: NavState; engineFuel: number } {
  const remaining = nav.remainingS - dtSeconds;
  if (remaining > 0) return { nav: { ...nav, remainingS: remaining }, engineFuel };
  return {
    nav: {
      phase: 'docked',
      destHubId: undefined,
      remainingS: 0,
      legId: nav.legId,
      portHubId: nav.destHubId ?? nav.portHubId,
      flameout: false,
      hailS: 0,
      stops: [],
      legIndex: 0,
      thrust01: 1,
    },
    engineFuel,
  };
}
