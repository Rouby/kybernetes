/**
 * Market panel view-model (TRANSFORM M5): pure derivation of the trade
 * screen from MARKET_STATE listings + snapshot bay crates + ship credits.
 * The GL market screen renders these rows; all branching lives here so the
 * panel stays thin and Vitest pins the wording.
 */

import type { MarketStateBroadcast, SnapshotBroadcast } from '@kybernetes/protocol';
import { HUB_PORTS } from '@kybernetes/sim-core';

export interface MarketTableCell {
  readonly name: string;
  readonly stock: number;
  readonly buy: number;
  readonly sell: number;
}

export interface MarketScreenModel {
  readonly hubId: string;
  readonly hubLabel: string;
  readonly creditsLabel: string;
  readonly left: readonly MarketTableCell[];
  readonly right: readonly MarketTableCell[];
}

export interface SellCrateRow {
  readonly crateId: string;
  readonly label: string;
  readonly value: number;
  readonly buttonId: string;
}

export interface SellScreenModel {
  readonly hubId: string;
  readonly hubLabel: string;
  readonly rows: readonly SellCrateRow[];
  readonly totalLabel: string;
  readonly sellIds: readonly string[];
  readonly hint: string;
}

const MAX_SELL_IDS = 8;
const MAX_SELL_ROWS = 5;

const HUB_LABELS: Readonly<Record<string, string>> = {
  hub_a: 'NEW ANCHORAGE',
  hub_b: 'KEPLER YARD',
};

export function hubIdForFrame(frameId: string | null): string | null {
  if (frameId === null) return null;
  for (const port of Object.values(HUB_PORTS)) {
    if (port.stationFrame === frameId) return port.hubId;
  }
  return null;
}

export function marketScreenFor(
  market: MarketStateBroadcast | null,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  credits: number
): MarketScreenModel {
  const frameId = pawnFrameOf(snapshot, pawnId);
  const hubId = hubIdForFrame(frameId);
  if (market === null || hubId === null || market.hubId !== hubId) return emptyMarket(hubId);
  const cells = market.listings.map((listing) => ({
    name: listing.goodId,
    stock: listing.stock,
    buy: listing.buyPrice,
    sell: listing.sellPrice,
  }));
  const half = Math.ceil(cells.length / 2);
  return {
    hubId,
    hubLabel: HUB_LABELS[hubId] ?? hubId.toUpperCase(),
    creditsLabel: `Credits: ${credits}cr`,
    left: cells.slice(0, half),
    right: cells.slice(half),
  };
}

export function sellScreenFor(
  market: MarketStateBroadcast | null,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null
): SellScreenModel {
  const frameId = pawnFrameOf(snapshot, pawnId);
  const hubId = hubIdForFrame(frameId);
  if (market === null || hubId === null || market.hubId !== hubId) return emptySell(hubId);
  const sellIds = sellIdsFor(snapshot, frameId, market);
  const rows = sellRowsFor(snapshot, sellIds, market);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return {
    hubId,
    hubLabel: HUB_LABELS[hubId] ?? hubId.toUpperCase(),
    rows,
    totalLabel: rows.length === 0 ? 'Bay: empty' : `Bay total +${total}cr`,
    sellIds,
    hint: sellHint(rows.length, sellIds.length),
  };
}

function emptySell(hubId: string | null): SellScreenModel {
  return {
    hubId: hubId ?? '—',
    hubLabel: 'NO MARKET',
    rows: [],
    totalLabel: 'Bay: —',
    sellIds: [],
    hint: 'Stand at a market stall while docked',
  };
}

function emptyMarket(hubId: string | null): MarketScreenModel {
  return {
    hubId: hubId ?? '—',
    hubLabel: 'NO MARKET',
    creditsLabel: 'Credits: —',
    left: [],
    right: [],
  };
}

function sellRowsFor(
  snapshot: SnapshotBroadcast | null,
  sellIds: readonly string[],
  market: MarketStateBroadcast
): SellCrateRow[] {
  if (snapshot === null) return [];
  const prices = new Map(
    market.listings.map((listing) => [listing.goodId, listing.sellPrice] as const)
  );
  const rows: SellCrateRow[] = [];
  for (const id of sellIds.slice(0, MAX_SELL_ROWS)) {
    const crate = (snapshot.crates ?? []).find((entry) => entry.id === id);
    if (crate === undefined) continue;
    let value = 0;
    const parts: string[] = [];
    for (const item of crate.items) {
      value += (prices.get(item.goodId) ?? 0) * item.qty;
      parts.push(`${item.goodId} x${item.qty}`);
    }
    rows.push({ crateId: id, label: parts.join(' + '), value, buttonId: `sell:${id}` });
  }
  return rows;
}

function sellIdsFor(
  snapshot: SnapshotBroadcast | null,
  frameId: string | null,
  market: MarketStateBroadcast
): string[] {
  if (snapshot === null || frameId === null) return [];
  const priced = new Set(market.listings.map((listing) => listing.goodId));
  return (snapshot.crates ?? [])
    .filter((crate) => crate.where === 'bayFloor' && crate.frameId === frameId)
    .filter((crate) => crate.items.every((item) => priced.has(item.goodId)))
    .slice(0, MAX_SELL_IDS)
    .map((crate) => crate.id);
}

function sellHint(rows: number, sellIds: number): string {
  if (rows === 0) return 'Haul crates back to this bay to sell';
  if (sellIds > rows) return `Showing ${rows} - SELL ALL takes the rest too`;
  return 'One crate per seal - or take it all';
}

function pawnFrameOf(snapshot: SnapshotBroadcast | null, pawnId: string | null): string | null {
  if (snapshot === null || pawnId === null) return null;
  return snapshot.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
}
