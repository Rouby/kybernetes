/**
 * Trade-hub market seam (TRANSFORM M5). MVP is a small fixed catalog
 * with per-hub prices; dynamic supply/demand is explicitly later.
 * Pure data only; no DOM/Node imports.
 */

export interface MarketListing {
  readonly goodId: string;
  readonly buyPrice: number;
  readonly sellPrice: number;
}

export const STARTER_CATALOG: readonly MarketListing[] = [
  { goodId: 'rations', buyPrice: 6, sellPrice: 4 },
  { goodId: 'water', buyPrice: 3, sellPrice: 2 },
  { goodId: 'o2_cells', buyPrice: 8, sellPrice: 6 },
  { goodId: 'fuel_cells', buyPrice: 12, sellPrice: 9 },
  { goodId: 'scrap', buyPrice: 5, sellPrice: 7 },
  { goodId: 'meds', buyPrice: 14, sellPrice: 11 },
];

/** M1 helper: fixed-catalog margin must stay non-negative per hub. */
export function marginFor(listing: MarketListing): number {
  return listing.sellPrice - listing.buyPrice;
}
