/**
 * Market panel view-model (TRANSFORM M5): pure derivation of the trade
 * screen from MARKET_STATE listings + snapshot bay crates + ship credits.
 * The GL market screen renders these rows; all branching lives here so the
 * panel stays thin and Vitest pins the wording.
 */

import type {
  CargoStateBroadcast,
  MarketStateBroadcast,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import { HUB_PORTS } from '@kybernetes/sim-core';

export interface MarketBuyRow {
  readonly goodId: string;
  readonly qty: number;
  readonly cost: number;
  readonly label: string;
  readonly buttonId: string;
}

export interface MarketScreenModel {
  readonly hubId: string;
  readonly hubLabel: string;
  readonly creditsLabel: string;
  readonly listingLines: readonly string[];
  readonly buys: readonly MarketBuyRow[];
  readonly sellLabel: string;
  readonly sellIds: readonly string[];
  readonly hasSell: boolean;
  readonly hint: string;
}

const MAX_BUY_QTY = 5;
const MAX_SELL_IDS = 8;

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
  cargo: CargoStateBroadcast | null,
  pawnId: string | null,
  credits: number
): MarketScreenModel {
  const frameId = pawnFrameOf(snapshot, pawnId);
  const hubId = hubIdForFrame(frameId);
  if (market === null || hubId === null || market.hubId !== hubId) return emptyMarket(hubId);
  const buys = buyRowsFor(market, credits);
  const sellIds = sellIdsFor(snapshot, frameId, market);
  const sellValue = sellValueFor(snapshot, sellIds, market);
  return {
    hubId,
    hubLabel: HUB_LABELS[hubId] ?? hubId.toUpperCase(),
    creditsLabel: `Credits: ${credits}cr`,
    listingLines: market.listings.map(
      (listing) => `${listing.goodId} ${listing.buyPrice}/${listing.sellPrice} (${listing.stock})`
    ),
    buys,
    sellLabel:
      sellIds.length === 0 ? 'Bay: empty' : `SELL ALL BAY (${sellIds.length}) +${sellValue}cr`,
    sellIds,
    hasSell: sellIds.length > 0,
    hint: hintFor(buys.length, sellIds.length, cargo),
  };
}

function emptyMarket(hubId: string | null): MarketScreenModel {
  return {
    hubId: hubId ?? '—',
    hubLabel: 'NO MARKET',
    creditsLabel: 'Credits: —',
    listingLines: [],
    buys: [],
    sellLabel: 'Bay: —',
    sellIds: [],
    hasSell: false,
    hint: 'Stand at a market stall while docked',
  };
}

function buyRowsFor(market: MarketStateBroadcast, credits: number): MarketBuyRow[] {
  const rows: MarketBuyRow[] = [];
  for (const listing of market.listings) {
    const affordable = Math.floor(credits / listing.buyPrice);
    const qty = Math.max(0, Math.min(MAX_BUY_QTY, listing.stock, affordable));
    if (qty < 1) continue;
    rows.push({
      goodId: listing.goodId,
      qty,
      cost: qty * listing.buyPrice,
      label: `BUY ${listing.goodId.toUpperCase()} x${qty} ${qty * listing.buyPrice}cr`,
      buttonId: `buy:${listing.goodId}`,
    });
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

function sellValueFor(
  snapshot: SnapshotBroadcast | null,
  sellIds: readonly string[],
  market: MarketStateBroadcast
): number {
  if (snapshot === null) return 0;
  const prices = new Map(
    market.listings.map((listing) => [listing.goodId, listing.sellPrice] as const)
  );
  let value = 0;
  for (const id of sellIds) {
    const crate = (snapshot.crates ?? []).find((entry) => entry.id === id);
    for (const item of crate?.items ?? []) value += (prices.get(item.goodId) ?? 0) * item.qty;
  }
  return value;
}

function hintFor(buys: number, sells: number, cargo: CargoStateBroadcast | null): string {
  if (buys === 0 && sells === 0) return 'No credits and an empty bay';
  const carrying = cargo !== null && Object.keys(cargo.carriedByPawn).length > 0;
  if (carrying) return 'Hands full: set the crate down first';
  if (sells > 0) return 'Haul aboard, unpack, transit, re-pack, haul back, sell';
  return 'Buy low, haul to the ship, unpack into the hold';
}

function pawnFrameOf(snapshot: SnapshotBroadcast | null, pawnId: string | null): string | null {
  if (snapshot === null || pawnId === null) return null;
  return snapshot.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
}
