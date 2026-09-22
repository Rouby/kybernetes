/**
 * Solo-ship engine (TRANSFORM M2, despooled). The torch is a hot torch:
 * tiers set speed/range/fuel bunkers, throttle scales the burn, and legs
 * fly at full rate with no spool charge, tune decay, or wear. Fuel and
 * tiers feed the voyage leg machine. Pure + deterministic.
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

/** Fuel-value yielded by inserting one fuel cell into the engine. */
export const FUEL_PER_CELL = 1000;
/** Nominal burn rate per leg-second at full thrust, per tier. */
const FUEL_PER_SECOND: Readonly<Record<EngineTier, number>> = { 0: 6.5, 1: 7.5, 2: 9 };

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

function clampFuelThrust(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, value));
}

function thrustFuelFactor(thrust01: number): number {
  return 0.6 + 0.4 * thrust01;
}
