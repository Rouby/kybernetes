/**
 * Ship console view-model: pure derivation of reactor/engine panel state
 * from SHIP_SYSTEMS snapshots. The tsx shells render these numbers; all
 * branching lives here so panels stay thin and Vitest pins the wording.
 */

import type { ShipSystemsBroadcast } from '@kybernetes/protocol';

export type ReactorBandStatus = 'cold' | 'nominal' | 'warning' | 'critical' | 'scrammed';

export interface ReactorViewModel {
  readonly tempK: number;
  readonly bandLo: number;
  readonly bandHi: number;
  /** 0-1 needle position across a lo-100..hi+100 display range. */
  readonly tempPct: number;
  readonly status: ReactorBandStatus;
  readonly rodsPct: number;
  readonly coolantPct: number;
  readonly outputMW: number;
  readonly demandMW: number;
  readonly powerOk: boolean;
  readonly restartLabel: string;
  readonly restartEnabled: boolean;
}

export interface EngineViewModel {
  readonly spoolPct: number;
  readonly tunePct: number;
  readonly wearPct: number;
  readonly brownout: boolean;
  readonly spoolLabel: string;
  readonly fuel: number;
  readonly fuelMax: number;
  readonly fuelSlots: number;
  readonly fuelPct: number;
  readonly fuelLabel: string;
}

const SCRAM_CRITICAL_MARGIN_K = 60;

export function reactorViewModel(systems: ShipSystemsBroadcast): ReactorViewModel {
  const status = reactorStatus(systems);
  return {
    tempK: systems.tempK,
    bandLo: systems.bandLo,
    bandHi: systems.bandHi,
    tempPct: tempNeedle(systems),
    status,
    rodsPct: Math.round(systems.rods * 100),
    coolantPct: Math.round(systems.coolant * 100),
    outputMW: systems.outputMW,
    demandMW: systems.demandMW,
    powerOk: systems.outputMW >= systems.demandMW,
    restartLabel: systems.scrammed ? 'RESTART REACTOR' : 'IGNITE REACTOR',
    restartEnabled: systems.scrammed || status === 'cold',
  };
}

export function engineViewModel(systems: ShipSystemsBroadcast): EngineViewModel {
  const fuel = Math.max(0, Math.floor(systems.fuel ?? 0));
  const fuelMax = Math.max(1, Math.floor(systems.fuelMax ?? 2000));
  const fuelSlots = Math.max(1, Math.floor(systems.fuelSlots ?? 2));
  return {
    spoolPct: Math.round(systems.spool * 100),
    tunePct: Math.round(systems.tune * 100),
    wearPct: Math.round(systems.wear * 100),
    brownout: systems.brownout,
    spoolLabel: systems.spool > 0.5 ? 'SPOOL OFF' : 'SPOOL ON',
    fuel,
    fuelMax,
    fuelSlots,
    fuelPct: Math.max(0, Math.min(100, Math.round((fuel / fuelMax) * 100))),
    fuelLabel: `FUEL ${fuel}/${fuelMax} SLOTS ${fuelSlots}`,
  };
}

function reactorStatus(systems: ShipSystemsBroadcast): ReactorBandStatus {
  if (systems.scrammed) return 'scrammed';
  if (systems.tempK > systems.bandHi) {
    return systems.tempK >= systems.bandHi + SCRAM_CRITICAL_MARGIN_K ? 'critical' : 'warning';
  }
  if (systems.tempK < systems.bandLo) return 'cold';
  return 'nominal';
}

function tempNeedle(systems: ShipSystemsBroadcast): number {
  const lo = systems.bandLo - 100;
  const hi = systems.bandHi + 100;
  const pct = ((systems.tempK - lo) / (hi - lo)) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
