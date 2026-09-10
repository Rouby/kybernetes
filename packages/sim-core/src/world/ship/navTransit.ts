/**
 * Hub-to-hub transit legs (TRANSFORM M3). Interior + abstract transit: the
 * player plots at the nav console and keeps doing chores inside while the
 * leg timer runs. Fuel, tiers, and tune shape the clock; the server feeds
 * checks (hot/powered/fuel) and applies world side effects (see systems).
 * Pure + deterministic; all randomness lives in the reactor drift.
 */

import { type EngineState, effectiveTune, engineSpecFor, speedFactor } from './engine.js';
import { HUB_A, isHubId } from './ports.js';
import type { EngineTier } from './shipRecord.js';

export type NavPhase = 'docked' | 'spooling' | 'in_transit' | 'docking';

export interface NavState {
  readonly phase: NavPhase;
  readonly destHubId: string | undefined;
  readonly remainingS: number;
  readonly legId: number;
  /** Hub whose dock mouth the vessel physically sits at while docked. */
  readonly portHubId: string;
  /** Out of fuel mid-leg: the timer freezes until a DISTRESS tow (server). */
  readonly flameout: boolean;
  /** Mid-leg extra burn already resolved, so it fires exactly once. */
  readonly extraBurned: boolean;
}

export const SPOOL_S = 10;
export const DOCKING_S = 10;
export const SPOOL_READY = 0.8;
export const LOW_TUNE_BURN = 0.4;

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
  extraBurned: false,
};

/** M1 helper: true while the ship is committed to a leg. */
export function isUnderway(nav: NavState): boolean {
  return nav.phase === 'spooling' || nav.phase === 'in_transit' || nav.phase === 'docking';
}

export interface PlotChecks {
  readonly hot: boolean;
  readonly powered: boolean;
  readonly fuelCells: number;
}

export type PlotReject = 'already-underway' | 'unknown-hub' | 'same-hub' | 'no-power' | 'no-fuel';

export function plotCourse(
  nav: NavState,
  destHubId: string,
  checks: PlotChecks
): { nav: NavState } | { reject: PlotReject } {
  if (nav.phase !== 'docked') return { reject: 'already-underway' };
  if (!isHubId(destHubId)) return { reject: 'unknown-hub' };
  if (destHubId === nav.portHubId) return { reject: 'same-hub' };
  if (!checks.hot || !checks.powered) return { reject: 'no-power' };
  if (!Number.isFinite(checks.fuelCells) || checks.fuelCells < 1) return { reject: 'no-fuel' };
  return {
    nav: {
      phase: 'spooling',
      destHubId,
      remainingS: SPOOL_S,
      legId: nav.legId + 1,
      portHubId: nav.portHubId,
      flameout: false,
      extraBurned: false,
    },
  };
}

/** Abort before departure; committed legs fly (DISTRESS is the way home). */
export function cancelLeg(nav: NavState): NavState {
  if (nav.phase !== 'spooling') return nav;
  return { ...DOCKED_NAV, portHubId: nav.portHubId, legId: nav.legId };
}

/** DISTRESS reset: towed home, sitting docked at the given hub. */
export function resetLegTo(nav: NavState, portHubId: string): NavState {
  if (!isHubId(portHubId)) return nav;
  return { ...DOCKED_NAV, portHubId, legId: nav.legId };
}

export interface ReactorPower {
  readonly hot: boolean;
  readonly scrammed: boolean;
}

export function tickNavLeg(
  nav: NavState,
  engine: EngineState,
  reactor: ReactorPower,
  engineTier: EngineTier,
  fuelCells: number,
  dtSeconds: number
): { nav: NavState; fuelCells: number } {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return { nav, fuelCells };

  if (nav.phase === 'spooling') {
    return tickSpooling(nav, engine, reactor, engineTier, fuelCells, dtSeconds);
  }

  if (nav.phase === 'in_transit') {
    return tickTransit(nav, engine, reactor, engineTier, fuelCells, dtSeconds);
  }

  if (nav.phase === 'docking') return tickDocking(nav, fuelCells, dtSeconds);

  return { nav, fuelCells };
}

function tickSpooling(
  nav: NavState,
  engine: EngineState,
  reactor: ReactorPower,
  engineTier: EngineTier,
  fuelCells: number,
  dtSeconds: number
): { nav: NavState; fuelCells: number } {
  if (!reactor.hot || reactor.scrammed) return { nav, fuelCells };
  const remaining = nav.remainingS - dtSeconds;
  if (remaining > 0) return { nav: { ...nav, remainingS: remaining }, fuelCells };
  if (engine.spool < SPOOL_READY || fuelCells < 1) {
    return { nav: { ...nav, remainingS: 0 }, fuelCells };
  }
  return {
    nav: { ...nav, phase: 'in_transit', remainingS: legDurationSeconds(engineTier) },
    fuelCells: fuelCells - engineSpecFor(engineTier).fuelPerLeg,
  };
}

function tickTransit(
  nav: NavState,
  engine: EngineState,
  reactor: ReactorPower,
  engineTier: EngineTier,
  fuelCells: number,
  dtSeconds: number
): { nav: NavState; fuelCells: number } {
  if (nav.flameout || reactor.scrammed) return { nav, fuelCells };

  const burned = burnExtraFuel(nav, engine, engineTier, fuelCells);
  if (burned.nav.flameout) return burned;
  const remaining = burned.nav.remainingS - dtSeconds * speedFactor(engine);
  if (remaining > 0)
    return { nav: { ...burned.nav, remainingS: remaining }, fuelCells: burned.fuelCells };

  return {
    nav: {
      ...burned.nav,
      phase: 'docking',
      destHubId: burned.nav.destHubId,
      remainingS: DOCKING_S,
    },
    fuelCells: burned.fuelCells,
  };
}

function burnExtraFuel(
  nav: NavState,
  engine: EngineState,
  engineTier: EngineTier,
  fuelCells: number
): { nav: NavState; fuelCells: number } {
  if (nav.extraBurned || nav.remainingS > legDurationSeconds(engineTier) / 2) {
    return { nav, fuelCells };
  }

  const claimed = { ...nav, extraBurned: true };
  if (effectiveTune(engine) >= LOW_TUNE_BURN) return { nav: claimed, fuelCells };

  if (fuelCells > 0) return { nav: claimed, fuelCells: fuelCells - 1 };

  return { nav: { ...claimed, flameout: true }, fuelCells };
}

function tickDocking(
  nav: NavState,
  fuelCells: number,
  dtSeconds: number
): { nav: NavState; fuelCells: number } {
  const remaining = nav.remainingS - dtSeconds;
  if (remaining > 0) return { nav: { ...nav, remainingS: remaining }, fuelCells };
  return {
    nav: {
      phase: 'docked',
      destHubId: undefined,
      remainingS: 0,
      legId: nav.legId,
      portHubId: nav.destHubId ?? nav.portHubId,
      flameout: false,
      extraBurned: false,
    },
    fuelCells,
  };
}
