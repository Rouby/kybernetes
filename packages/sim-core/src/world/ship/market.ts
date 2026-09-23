/**
 * Trade-hub market (TRANSFORM M5). Fixed mirror-pair catalog, per-hub
 * in-memory stock with slow restock, unpacked-fuel sweep into ship stores,
 * and per-leg food settlement (secured cargo first, ship stores second,
 * vitals shortfall after). Pure data + transitions; no DOM/Node imports.
 */

import type { World } from '../types.js';
import type { CargoState } from './cargo.js';
import { CRATE_AREA, crateAreaOf } from './packGame.js';
import type { ShipStores } from './shipRecord.js';

export const TRADE_GOODS = ['rations', 'water', 'o2_cells', 'fuel_cells', 'scrap', 'meds'] as const;

export type TradeGood = (typeof TRADE_GOODS)[number];

interface HubPrice {
  readonly buy: number;
  readonly sell: number;
}

/** Mirror pair (~30% cross-hub spread on scrap/meds; fuel flat overhead). */
const HUB_PRICES: Readonly<Record<string, Readonly<Record<string, HubPrice>>>> = {
  hub_a: {
    rations: { buy: 5, sell: 4 },
    water: { buy: 4, sell: 3 },
    o2_cells: { buy: 6, sell: 5 },
    fuel_cells: { buy: 12, sell: 11 },
    scrap: { buy: 10, sell: 9 },
    meds: { buy: 15, sell: 13 },
  },
  hub_b: {
    rations: { buy: 7, sell: 6 },
    water: { buy: 6, sell: 5 },
    o2_cells: { buy: 8, sell: 7 },
    fuel_cells: { buy: 12, sell: 11 },
    scrap: { buy: 15, sell: 13 },
    meds: { buy: 10, sell: 9 },
  },
  hub_c: {
    rations: { buy: 5, sell: 4 },
    water: { buy: 4, sell: 3 },
    o2_cells: { buy: 6, sell: 5 },
    fuel_cells: { buy: 9, sell: 8 },
    scrap: { buy: 12, sell: 10 },
    meds: { buy: 14, sell: 12 },
  },
  hub_d: {
    rations: { buy: 8, sell: 7 },
    water: { buy: 5, sell: 4 },
    o2_cells: { buy: 6, sell: 5 },
    fuel_cells: { buy: 12, sell: 11 },
    scrap: { buy: 10, sell: 9 },
    meds: { buy: 15, sell: 13 },
  },
};

export const MARKET_HUBS: readonly string[] = ['hub_a', 'hub_b', 'hub_c', 'hub_d'];
export const MARKET_MAX_STOCK = 50;
export const MARKET_RESTOCK_PER_MIN = 1;
export const MARKET_RESTOCK_MS = 60_000;

export function isTradeGood(value: unknown): value is TradeGood {
  return typeof value === 'string' && (TRADE_GOODS as readonly string[]).includes(value);
}

export function hubPrices(hubId: string): Readonly<Record<string, HubPrice>> | undefined {
  return HUB_PRICES[hubId];
}

export function hubBuyPrice(hubId: string, goodId: string): number | undefined {
  return HUB_PRICES[hubId]?.[goodId]?.buy;
}

export function hubSellPrice(hubId: string, goodId: string): number | undefined {
  return HUB_PRICES[hubId]?.[goodId]?.sell;
}

export interface MarketLedger {
  readonly stock: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly lastRestockMs: number;
}

export function createMarketLedger(): MarketLedger {
  const stock: Record<string, Record<string, number>> = {};
  for (const hub of MARKET_HUBS) {
    const table: Record<string, number> = {};
    for (const good of TRADE_GOODS) table[good] = MARKET_MAX_STOCK;
    stock[hub] = table;
  }
  return { stock, lastRestockMs: 0 };
}

export function restockLedger(ledger: MarketLedger, nowMs: number): MarketLedger {
  if (!Number.isFinite(nowMs) || nowMs < ledger.lastRestockMs) return ledger;
  const minutes = Math.floor((nowMs - ledger.lastRestockMs) / MARKET_RESTOCK_MS);
  if (minutes < 1) return ledger;
  return {
    stock: restockedTables(ledger.stock, minutes * MARKET_RESTOCK_PER_MIN),
    lastRestockMs: ledger.lastRestockMs + minutes * MARKET_RESTOCK_MS,
  };
}

function restockedTables(stock: MarketLedger['stock'], amount: number): MarketLedger['stock'] {
  const next: Record<string, Record<string, number>> = {};
  for (const [hub, table] of Object.entries(stock)) {
    const restocked: Record<string, number> = {};
    for (const [good, qty] of Object.entries(table)) {
      restocked[good] = Math.min(MARKET_MAX_STOCK, qty + amount);
    }
    next[hub] = restocked;
  }
  return next;
}

export type MarketReject =
  | 'unknown-hub'
  | 'unknown-good'
  | 'bad-qty'
  | 'overfilled'
  | 'out-of-stock'
  | 'insufficient-funds';

export interface MarketItem {
  readonly goodId: string;
  readonly qty: number;
}

/** A trade seals iff its footprint area fits: no per-line or per-unit caps. */
function validTradeItems(items: readonly MarketItem[]): boolean {
  if (!Array.isArray(items) || items.length < 1) return false;
  return items.every(
    (item) => typeof item.goodId === 'string' && Number.isInteger(item.qty) && item.qty >= 1
  );
}

export type BuyResult =
  | { readonly ok: true; readonly ledger: MarketLedger; readonly cost: number }
  | { readonly ok: false; readonly reason: MarketReject };

export function tryBuy(
  ledger: MarketLedger,
  hubId: string,
  items: readonly MarketItem[],
  credits: number,
  nowMs: number
): BuyResult {
  if (hubPrices(hubId) === undefined) return { ok: false, reason: 'unknown-hub' };
  if (!validTradeItems(items)) return { ok: false, reason: 'bad-qty' };
  if (crateAreaOf(items) > CRATE_AREA) return { ok: false, reason: 'overfilled' };
  const rested = restockLedger(ledger, nowMs);
  const cost = buyCost(hubId, items);
  if (cost === undefined) return { ok: false, reason: 'unknown-good' };
  for (const item of items) {
    if ((rested.stock[hubId]?.[item.goodId] ?? 0) < item.qty) {
      return { ok: false, reason: 'out-of-stock' };
    }
  }
  if (!Number.isFinite(credits) || credits < cost) {
    return { ok: false, reason: 'insufficient-funds' };
  }
  let next = rested;
  for (const item of items) next = takeStock(next, hubId, item.goodId, item.qty);
  return { ok: true, ledger: next, cost };
}

function buyCost(hubId: string, items: readonly MarketItem[]): number | undefined {
  let cost = 0;
  for (const item of items) {
    const price = hubBuyPrice(hubId, item.goodId);
    if (price === undefined) return undefined;
    cost += price * item.qty;
  }
  return cost;
}

function takeStock(ledger: MarketLedger, hubId: string, goodId: string, qty: number): MarketLedger {
  const table = { ...(ledger.stock[hubId] ?? {}) };
  table[goodId] = (table[goodId] ?? 0) - qty;
  return { ...ledger, stock: { ...ledger.stock, [hubId]: table } };
}

export type SellResult =
  | { readonly ok: true; readonly ledger: MarketLedger; readonly revenue: number }
  | { readonly ok: false; readonly reason: MarketReject };

export function trySell(
  ledger: MarketLedger,
  hubId: string,
  items: readonly MarketItem[],
  nowMs: number
): SellResult {
  if (hubPrices(hubId) === undefined) return { ok: false, reason: 'unknown-hub' };
  if (!validTradeItems(items)) return { ok: false, reason: 'bad-qty' };
  const rested = restockLedger(ledger, nowMs);
  const revenue = sellRevenue(hubId, items);
  if (revenue === undefined) return { ok: false, reason: 'unknown-good' };
  let next = rested;
  for (const item of items) next = giveStock(next, hubId, item.goodId, item.qty);
  return { ok: true, ledger: next, revenue };
}

function sellRevenue(hubId: string, items: readonly MarketItem[]): number | undefined {
  let revenue = 0;
  for (const item of items) {
    const price = hubSellPrice(hubId, item.goodId);
    if (price === undefined) return undefined;
    revenue += price * item.qty;
  }
  return revenue;
}

function giveStock(ledger: MarketLedger, hubId: string, goodId: string, qty: number): MarketLedger {
  const table = { ...(ledger.stock[hubId] ?? {}) };
  table[goodId] = Math.min(MARKET_MAX_STOCK, (table[goodId] ?? 0) + qty);
  return { ...ledger, stock: { ...ledger.stock, [hubId]: table } };
}

export interface MarketListing {
  readonly goodId: string;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly stock: number;
}

/** Restocked view for MARKET_STATE (pure; does not persist the restock). */
export function listingsFor(ledger: MarketLedger, hubId: string, nowMs: number): MarketListing[] {
  const prices = hubPrices(hubId);
  if (prices === undefined) return [];
  const rested = restockLedger(ledger, nowMs);
  return TRADE_GOODS.map((goodId) => ({
    goodId,
    buyPrice: prices[goodId]?.buy ?? 0,
    sellPrice: prices[goodId]?.sell ?? 0,
    stock: rested.stock[hubId]?.[goodId] ?? 0,
  }));
}

/** Unpacked fuel cells sweep straight into ship stores (flat-priced overhead). */
export function sweepFuelToStores(
  hold: CargoState,
  vesselId: string
): { hold: CargoState; fuel: number } {
  const fuel = hold.secured[vesselId]?.['fuel_cells'] ?? 0;
  if (fuel < 1) return { hold, fuel: 0 };
  const vessel = { ...(hold.secured[vesselId] ?? {}) };
  delete vessel['fuel_cells'];
  return { hold: { ...hold, secured: { ...hold.secured, [vesselId]: vessel } }, fuel };
}

/** Gentle per-leg mouths: one unit each of food, water, and o2. */
export const LEG_FOOD_COST: Readonly<Record<string, number>> = {
  rations: 1,
  water: 1,
  o2_cells: 1,
};

export interface FoodSettlement {
  readonly secured: Readonly<Record<string, number>>;
  readonly stores: ShipStores;
  /** Missing units; the host converts these into vitals hunger/thirst. */
  readonly shortfall: number;
}

/** Deduct one leg of food: secured cargo first, ship stores second. */
export function settleLegFood(
  secured: Readonly<Record<string, number>>,
  stores: ShipStores
): FoodSettlement {
  let pantry = { ...secured };
  let hold: ShipStores = { ...stores };
  let shortfall = 0;
  for (const [good, need] of Object.entries(LEG_FOOD_COST)) {
    const taken = takeFoodUnit(pantry, hold, good, need);
    pantry = taken.pantry;
    hold = taken.hold;
    shortfall += taken.missing;
  }
  return { secured: pantry, stores: hold, shortfall };
}

function takeFoodUnit(
  pantry: Record<string, number>,
  hold: ShipStores,
  good: string,
  need: number
): { pantry: Record<string, number>; hold: ShipStores; missing: number } {
  const fromPantry = Math.min(pantry[good] ?? 0, need);
  const rest = need - fromPantry;
  const storeKey = storeKeyFor(good);
  const fromHold = Math.min(hold[storeKey] ?? 0, rest);
  return {
    pantry: { ...pantry, [good]: (pantry[good] ?? 0) - fromPantry },
    hold: { ...hold, [storeKey]: (hold[storeKey] ?? 0) - fromHold },
    missing: rest - fromHold,
  };
}

function storeKeyFor(good: string): keyof ShipStores {
  if (good === 'water') return 'waterL';
  if (good === 'o2_cells') return 'o2Cells';
  if (good === 'fuel_cells') return 'fuelCells';
  return 'rations';
}

/** Convert a food shortfall into vitals hunger/thirst (existing kill path). */
export function starvePawn(world: World, pawnId: string, shortfall: number): World {
  if (!(shortfall > 0)) return world;
  const vitals = world.vitals[pawnId];
  if (vitals === undefined) return world;
  const hit = Math.min(100, shortfall * 30);
  return {
    ...world,
    vitals: {
      ...world.vitals,
      [pawnId]: {
        ...vitals,
        hunger: Math.max(0, vitals.hunger - hit),
        thirst: Math.max(0, vitals.thirst - hit),
      },
    },
  };
}
