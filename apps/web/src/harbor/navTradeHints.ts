/**
 * Target-port cargo demand for the nav console: what the goods aboard
 * would fetch at a destination hub. Pure and unit-tested; the nav screen
 * renders the rows and sessionOverlay supplies the aboard list.
 */

import type { CargoStateBroadcast, CrateSnapshot, SnapshotBroadcast } from '@kybernetes/protocol';
import { hubSellPrice } from '@kybernetes/sim-core';

export interface AboardGood {
  readonly goodId: string;
  readonly qty: number;
}

export interface CargoDemandRow {
  readonly goodId: string;
  readonly qty: number;
  readonly unitPrice: number;
  readonly total: number;
}

/** Goods aboard: ship-floor crates + pawn-carried crate + secured hold. */
export function aboardCargoFor(
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  cargo: CargoStateBroadcast | null
): AboardGood[] {
  const totals = new Map<string, number>();
  addCrateGoods(totals, snapshot, pawnId);
  addSecuredGoods(totals, cargo);
  return [...totals.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([goodId, qty]) => ({ goodId, qty }))
    .sort((a, b) => (a.goodId < b.goodId ? -1 : 1));
}

function addCrateGoods(
  totals: Map<string, number>,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null
): void {
  if (snapshot === null) return;
  for (const crate of snapshot.crates ?? []) {
    if (!isAboardCrate(crate, pawnId)) continue;
    for (const item of crate.items) {
      totals.set(item.goodId, (totals.get(item.goodId) ?? 0) + item.qty);
    }
  }
}

function isAboardCrate(crate: CrateSnapshot, pawnId: string | null): boolean {
  if (crate.where === 'shipFloor') return true;
  return crate.where === 'carriedBy' && pawnId !== null && crate.carrierId === pawnId;
}

function addSecuredGoods(totals: Map<string, number>, cargo: CargoStateBroadcast | null): void {
  for (const entry of cargo?.secured ?? []) {
    totals.set(entry.goodId, (totals.get(entry.goodId) ?? 0) + entry.qty);
  }
}

/** Destination sell table for goods aboard; empty when nothing is priced. */
export function cargoDemandFor(
  targetHubId: string,
  aboard: readonly AboardGood[]
): CargoDemandRow[] {
  const rows: CargoDemandRow[] = [];
  for (const good of aboard) {
    const unitPrice = hubSellPrice(targetHubId, good.goodId);
    if (unitPrice === undefined || !(good.qty > 0)) continue;
    rows.push({ goodId: good.goodId, qty: good.qty, unitPrice, total: unitPrice * good.qty });
  }
  return rows.sort((a, b) => b.total - a.total || (a.goodId < b.goodId ? -1 : 1));
}
