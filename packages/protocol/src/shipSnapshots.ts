/**
 * Solo-ship snapshots (TRANSFORM M1). Additive to protocol v2 snapshots:
 * SHIP_STATUS carries the owned-ship record; SHIP_LOST is the hard-fail
 * event (lose ship / game over -> restart in a starter skiff).
 * Pure types + makers only; no DOM/Node imports.
 * NOTE: stores are structural (protocol must not depend on sim-core).
 */

import { PROTOCOL_VERSION } from './envelope.js';

export interface ShipStatusStores {
  readonly rations: number;
  readonly waterL: number;
  readonly o2Cells: number;
  readonly fuelCells: number;
}

export interface ShipStatusSource {
  readonly shipId: string;
  readonly hullId: string;
  readonly reactorTier: number;
  readonly engineTier: number;
  readonly credits: number;
  readonly condition: number;
  readonly locationHubId: string;
  readonly alive: boolean;
  readonly stores: ShipStatusStores;
}

export interface ShipStatusBroadcast {
  readonly type: 'SHIP_STATUS';
  readonly v: typeof PROTOCOL_VERSION;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly shipId: string;
  readonly hullId: string;
  readonly reactorTier: number;
  readonly engineTier: number;
  readonly credits: number;
  readonly condition: number;
  readonly locationHubId: string;
  readonly alive: boolean;
  readonly stores: ShipStatusStores;
}

export type ShipLostReason = 'reactor' | 'vitals' | 'hull' | 'admin';

export interface ShipLostBroadcast {
  readonly type: 'SHIP_LOST';
  readonly v: typeof PROTOCOL_VERSION;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly shipId: string;
  readonly reason: ShipLostReason;
}

export function makeShipStatus(
  record: ShipStatusSource,
  tick: number,
  serverTimeMs: number
): ShipStatusBroadcast {
  return {
    type: 'SHIP_STATUS',
    v: PROTOCOL_VERSION,
    tick,
    serverTimeMs,
    shipId: record.shipId,
    hullId: record.hullId,
    reactorTier: record.reactorTier,
    engineTier: record.engineTier,
    credits: record.credits,
    condition: record.condition,
    locationHubId: record.locationHubId,
    alive: record.alive,
    stores: record.stores,
  };
}

export interface ShipSystemsSource {
  readonly vesselId: string;
  readonly tempK: number;
  readonly bandLo: number;
  readonly bandHi: number;
  readonly rods: number;
  readonly coolant: number;
  readonly outputMW: number;
  readonly demandMW: number;
  readonly scrammed: boolean;
  readonly warned: boolean;
  readonly spool: number;
  readonly tune: number;
  readonly wear: number;
  readonly brownout: boolean;
  readonly condition: number;
}

export interface ShipSystemsBroadcast {
  readonly type: 'SHIP_SYSTEMS';
  readonly v: typeof PROTOCOL_VERSION;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly vesselId: string;
  readonly tempK: number;
  readonly bandLo: number;
  readonly bandHi: number;
  readonly rods: number;
  readonly coolant: number;
  readonly outputMW: number;
  readonly demandMW: number;
  readonly scrammed: boolean;
  readonly warned: boolean;
  readonly spool: number;
  readonly tune: number;
  readonly wear: number;
  readonly brownout: boolean;
  readonly condition: number;
}

export function makeShipSystems(
  systems: ShipSystemsSource,
  tick: number,
  serverTimeMs: number
): ShipSystemsBroadcast {
  return {
    type: 'SHIP_SYSTEMS',
    v: PROTOCOL_VERSION,
    tick,
    serverTimeMs,
    vesselId: systems.vesselId,
    tempK: q1(systems.tempK),
    bandLo: q1(systems.bandLo),
    bandHi: q1(systems.bandHi),
    rods: q2(systems.rods),
    coolant: q2(systems.coolant),
    outputMW: q1(systems.outputMW),
    demandMW: q1(systems.demandMW),
    scrammed: systems.scrammed,
    warned: systems.warned,
    spool: q2(systems.spool),
    tune: q2(systems.tune),
    wear: q2(systems.wear),
    brownout: systems.brownout,
    condition: q1(systems.condition),
  };
}

function q1(value: number): number {
  return Math.round(value * 10) / 10;
}

function q2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface NavStateSource {
  readonly phase: string;
  readonly destHubId: string | undefined;
  readonly remainingS: number;
  readonly legId: number;
  readonly portHubId: string;
  readonly flameout: boolean;
}

export interface NavStateBroadcast {
  readonly type: 'NAV_STATE';
  readonly v: typeof PROTOCOL_VERSION;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly vesselId: string;
  readonly phase: string;
  readonly destHubId: string | undefined;
  readonly remainingS: number;
  readonly legId: number;
  readonly portHubId: string;
  readonly flameout: boolean;
}

export function makeNavState(
  vesselId: string,
  nav: NavStateSource,
  tick: number,
  serverTimeMs: number
): NavStateBroadcast {
  return {
    type: 'NAV_STATE',
    v: PROTOCOL_VERSION,
    tick,
    serverTimeMs,
    vesselId,
    phase: nav.phase,
    destHubId: nav.destHubId,
    remainingS: q1(nav.remainingS),
    legId: nav.legId,
    portHubId: nav.portHubId,
    flameout: nav.flameout,
  };
}

export function makeShipLost(
  shipId: string,
  reason: ShipLostReason,
  tick: number,
  serverTimeMs: number
): ShipLostBroadcast {
  return { type: 'SHIP_LOST', v: PROTOCOL_VERSION, tick, serverTimeMs, shipId, reason };
}
