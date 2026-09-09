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

export function makeShipLost(
  shipId: string,
  reason: ShipLostReason,
  tick: number,
  serverTimeMs: number
): ShipLostBroadcast {
  return { type: 'SHIP_LOST', v: PROTOCOL_VERSION, tick, serverTimeMs, shipId, reason };
}
