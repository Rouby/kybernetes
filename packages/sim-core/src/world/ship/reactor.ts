/**
 * Solo-ship reactor chore seam (TRANSFORM M2).
 * M1 ships only the tier table; the drift/tune tick lands in M2.
 * Pure data only; no DOM/Node imports.
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
