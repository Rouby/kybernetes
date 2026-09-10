import { describe, expect, it } from 'vitest';
import { defaultVitals } from '../survival.js';
import { createEmptyWorld } from '../types.js';
import { emptyCargo, spawnCrate, unpackCrates } from './cargo.js';
import {
  createMarketLedger,
  hubBuyPrice,
  hubSellPrice,
  LEG_FOOD_COST,
  listingsFor,
  MARKET_HUBS,
  MARKET_MAX_STOCK,
  restockLedger,
  settleLegFood,
  starvePawn,
  sweepFuelToStores,
  TRADE_GOODS,
  tryBuy,
  trySell,
} from './market.js';

describe('market catalog (M5 mirror pair)', () => {
  it('holds six fixed goods on two hubs', () => {
    expect(TRADE_GOODS).toHaveLength(6);
    expect(MARKET_HUBS).toEqual(['hub_a', 'hub_b']);
  });

  it('never profits on a same-hub flip', () => {
    for (const hub of MARKET_HUBS) {
      for (const good of TRADE_GOODS) {
        const buy = hubBuyPrice(hub, good) ?? 0;
        const sell = hubSellPrice(hub, good) ?? 0;
        expect(buy).toBeGreaterThan(sell);
      }
    }
  });

  it('pays ~30% cross-hub on the trade goods with flat fuel', () => {
    expect((hubSellPrice('hub_b', 'scrap') ?? 0) - (hubBuyPrice('hub_a', 'scrap') ?? 0)).toBe(3);
    expect((hubSellPrice('hub_a', 'meds') ?? 0) - (hubBuyPrice('hub_b', 'meds') ?? 0)).toBe(3);
    expect(hubBuyPrice('hub_a', 'fuel_cells')).toBe(hubBuyPrice('hub_b', 'fuel_cells'));
  });
});

describe('market ledger', () => {
  it('starts full and restocks slowly with a clamp', () => {
    const ledger = createMarketLedger();
    expect(ledger.stock.hub_a?.scrap).toBe(MARKET_MAX_STOCK);
    expect(restockLedger(ledger, 30_000)).toBe(ledger);
    const drained = {
      ...ledger,
      stock: { ...ledger.stock, hub_a: { ...ledger.stock.hub_a, scrap: 40 } },
    };
    const rested = restockLedger(drained, 3 * 60_000);
    expect(rested.stock.hub_a?.scrap).toBe(43);
    expect(restockLedger(rested, 1_000_000_000).stock.hub_a?.scrap).toBe(MARKET_MAX_STOCK);
  });

  it('rejects buys without funds, stock, or known goods', () => {
    const ledger = createMarketLedger();
    const ok = tryBuy(ledger, 'hub_a', 'scrap', 2, 100, 0);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.cost).toBe(20);
    expect(ok.ledger.stock.hub_a?.scrap).toBe(MARKET_MAX_STOCK - 2);
    expect(tryBuy(ledger, 'hub_a', 'scrap', 2, 5, 0)).toEqual({
      ok: false,
      reason: 'insufficient-funds',
    });
    expect(tryBuy(ledger, 'hub_a', 'scrap', 60, 10_000, 0)).toEqual({
      ok: false,
      reason: 'bad-qty',
    });
    const empty = {
      ...ledger,
      stock: { ...ledger.stock, hub_a: { ...ledger.stock.hub_a, scrap: 1 } },
    };
    expect(tryBuy(empty, 'hub_a', 'scrap', 2, 10_000, 0)).toEqual({
      ok: false,
      reason: 'out-of-stock',
    });
    expect(tryBuy(ledger, 'hub_c', 'scrap', 1, 10_000, 0)).toEqual({
      ok: false,
      reason: 'unknown-hub',
    });
    expect(tryBuy(ledger, 'hub_a', 'spice', 1, 10_000, 0)).toEqual({
      ok: false,
      reason: 'unknown-good',
    });
  });

  it('pays out sells and absorbs stock with a clamp', () => {
    const ledger = createMarketLedger();
    const sold = trySell(ledger, 'hub_b', 'scrap', 3, 0);
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;
    expect(sold.revenue).toBe(39);
    expect(sold.ledger.stock.hub_b?.scrap).toBe(MARKET_MAX_STOCK);
  });

  it('lists restocked views without persisting', () => {
    const ledger = createMarketLedger();
    const listings = listingsFor(ledger, 'hub_a', 5 * 60_000);
    expect(listings).toHaveLength(6);
    expect(listings[0]).toMatchObject({ buyPrice: expect.any(Number) });
    expect(listingsFor(ledger, 'hub_c', 0)).toEqual([]);
    expect(ledger.lastRestockMs).toBe(0);
  });
});

describe('ship stores integration', () => {
  it('sweeps unpacked fuel into stores counts', () => {
    const seeded = spawnCrate(emptyCargo(), {
      id: 'f1',
      goodId: 'fuel_cells',
      qty: 3,
      where: 'shipFloor',
      frameId: 'ship',
      x: 1,
      y: 1,
    });
    if (!seeded.ok) throw new Error('seed');
    const unpacked = unpackCrates(seeded.hold, 'ship', 'ship', ['f1']);
    if (!unpacked.ok) throw new Error('unpack');
    const swept = sweepFuelToStores(unpacked.hold, 'ship');
    expect(swept.fuel).toBe(3);
    expect(swept.hold.secured['ship']?.['fuel_cells'] ?? 0).toBe(0);
    expect(sweepFuelToStores(swept.hold, 'ship').fuel).toBe(0);
  });

  it('settles one leg of food secured-first with shortfall change', () => {
    expect(LEG_FOOD_COST['rations']).toBe(1);
    const full = settleLegFood(
      { rations: 5, water: 0, o2_cells: 2 },
      { rations: 2, waterL: 4, o2Cells: 2, fuelCells: 1 }
    );
    expect(full.secured['rations']).toBe(4);
    expect(full.secured['water']).toBe(0);
    expect(full.stores.waterL).toBe(3);
    expect(full.shortfall).toBe(0);
    const broke = settleLegFood({}, { rations: 0, waterL: 0, o2Cells: 0, fuelCells: 0 });
    expect(broke.shortfall).toBe(3);
  });

  it('converts shortfall into vitals hunger and thirst', () => {
    const world = {
      ...createEmptyWorld(),
      vitals: { 'pawn:u1': { ...defaultVitals(false), hunger: 80, thirst: 80 } },
    };
    const starved = starvePawn(world, 'pawn:u1', 1);
    expect(starved.vitals['pawn:u1']?.hunger).toBe(50);
    expect(starved.vitals['pawn:u1']?.thirst).toBe(50);
    expect(starvePawn(world, 'pawn:u1', 0)).toBe(world);
    expect(starvePawn(world, 'pawn:ghost', 2)).toBe(world);
  });
});
