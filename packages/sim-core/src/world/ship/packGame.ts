/**
 * Checkout packing puzzle (TRANSFORM M4). Free-place physics, client-side only:
 * drag goods rects into a crate rect with AABB overlap reject. The server
 * trusts only goodId/qty/crateCount, never placement — this module is the
 * shared geometry + auto-pack fallback so web and tests agree. Pure, no DOM.
 */

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PlacedBox extends Box {
  readonly goodId: string;
}

export const CRATE_BOUNDS: Box = { x: 0, y: 0, w: 120, h: 80 };

export const GOODS_FOOTPRINTS: Readonly<Record<string, { w: number; h: number }>> = {
  rations: { w: 30, h: 20 },
  water: { w: 30, h: 30 },
  o2_cells: { w: 25, h: 25 },
  fuel_cells: { w: 35, h: 30 },
  scrap: { w: 50, h: 40 },
  meds: { w: 25, h: 20 },
};

export function footprintFor(goodId: string): { w: number; h: number } {
  return GOODS_FOOTPRINTS[goodId] ?? { w: 30, h: 20 };
}

export const CRATE_AREA = CRATE_BOUNDS.w * CRATE_BOUNDS.h;

export interface PackedItem {
  readonly goodId: string;
  readonly qty: number;
}

/** Footprint-area bound for mixed crates: the server trusts counts, not placement. */
export function crateAreaOf(items: readonly PackedItem[]): number {
  let area = 0;
  for (const item of items) {
    if (!Number.isInteger(item.qty) || item.qty < 1) continue;
    const foot = footprintFor(item.goodId);
    area += foot.w * foot.h * item.qty;
  }
  return area;
}

export function insideBounds(candidate: Box, bounds: Box = CRATE_BOUNDS): boolean {
  return (
    candidate.x >= bounds.x &&
    candidate.y >= bounds.y &&
    candidate.x + candidate.w <= bounds.x + bounds.w &&
    candidate.y + candidate.h <= bounds.y + bounds.h
  );
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export type PlaceReject = 'out-of-bounds' | 'overlap';

export function tryPlace(
  placed: readonly PlacedBox[],
  candidate: PlacedBox,
  bounds: Box = CRATE_BOUNDS
): { readonly ok: true } | { readonly ok: false; readonly reason: PlaceReject } {
  if (!insideBounds(candidate, bounds)) return { ok: false, reason: 'out-of-bounds' };
  for (const box of placed) {
    if (overlaps(box, candidate)) return { ok: false, reason: 'overlap' };
  }
  return { ok: true };
}

export function layoutEfficiency(placed: readonly PlacedBox[], bounds: Box = CRATE_BOUNDS): number {
  const area = bounds.w * bounds.h;
  if (!(area > 0)) return 0;
  let used = 0;
  for (const box of placed) used += box.w * box.h;
  return Math.max(0, Math.min(1, used / area));
}

/** Greedy shelf auto-pack: always succeeds, lays rows left-to-right, top-to-bottom. */
export function autoLayout(goodId: string, qty: number, bounds: Box = CRATE_BOUNDS): PlacedBox[] {
  const placed: PlacedBox[] = [];
  if (!Number.isInteger(qty) || qty < 1) return placed;
  const foot = footprintFor(goodId);
  let cursorX = bounds.x;
  let cursorY = bounds.y;
  let rowH = 0;
  for (let i = 0; i < qty; i += 1) {
    if (cursorX + foot.w > bounds.x + bounds.w) {
      cursorX = bounds.x;
      cursorY += rowH;
      rowH = 0;
    }
    if (cursorY + foot.h > bounds.y + bounds.h) break;
    placed.push({ goodId, x: cursorX, y: cursorY, w: foot.w, h: foot.h });
    cursorX += foot.w;
    rowH = Math.max(rowH, foot.h);
  }
  return placed;
}

/** Area-based crate estimate: how many crates this qty needs at perfect packing. */
export function cratesNeededFor(goodId: string, qty: number, bounds: Box = CRATE_BOUNDS): number {
  if (!Number.isInteger(qty) || qty < 1) return 0;
  const foot = footprintFor(goodId);
  const perCrate = Math.max(1, Math.floor((bounds.w * bounds.h) / (foot.w * foot.h)));
  return Math.max(1, Math.ceil(qty / perCrate));
}
