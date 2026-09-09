/**
 * Solo-ship engine chore seam (TRANSFORM M2).
 * M1 ships only the tier table; spool/tune/wear land in M2/M3.
 * Pure data only; no DOM/Node imports.
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
