/**
 * Pack screen view-model (TRANSFORM M8 Phase 2): pure derivation of the
 * palette, seal row, and hints from market/cargo states plus staged bodies.
 * Staging spends nothing — seals validate server-side with respawn
 * on reject — so the palette only gates on latest known budgets.
 */

import type {
  CargoStateBroadcast,
  MarketStateBroadcast,
  SnapshotBroadcast,
} from '@kybernetes/protocol';
import { hubIdForFrame } from '../harbor/marketModel';
import type { PackSnapshot } from './PackStore';

export interface PackPaletteEntry {
  readonly buttonId: string;
  readonly label: string;
  readonly unitPrice: number;
}

export interface PackScreenModel {
  readonly title: string;
  readonly budgetLabel: string;
  readonly palette: readonly PackPaletteEntry[];
  readonly sealLabel: string;
  readonly sealReady: boolean;
  readonly sealDetail: string;
  readonly hint: string;
}

export function stagedCountsOf(snap: PackSnapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const body of snap.bodies) counts[body.goodId] = (counts[body.goodId] ?? 0) + 1;
  return counts;
}

export function packScreenFor(
  mode: 'buy' | 'repack',
  hubId: string | null,
  market: MarketStateBroadcast | null,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  cargo: CargoStateBroadcast | null,
  credits: number,
  snap: PackSnapshot
): PackScreenModel {
  const staged = stagedCountsOf(snap);
  const screen =
    mode === 'buy'
      ? buyModel(hubId, market, snapshot, pawnId, credits, staged, snap)
      : repackModel(snapshot, pawnId, cargo, staged, snap);
  return { ...screen, sealDetail: sealDetailFor(mode, market, snap) };
}

/** Total cost of the sealable (inside) load in buy mode; empty otherwise. */
function sealDetailFor(
  mode: 'buy' | 'repack',
  market: MarketStateBroadcast | null,
  snap: PackSnapshot
): string {
  if (mode !== 'buy' || market === null) return '';
  const prices = new Map(
    market.listings.map((listing) => [listing.goodId, listing.buyPrice] as const)
  );
  let total = 0;
  for (const body of snap.bodies) {
    if (body.inside) total += prices.get(body.goodId) ?? 0;
  }
  return total > 0 ? `-${total}cr` : '';
}

function buyModel(
  hubId: string | null,
  market: MarketStateBroadcast | null,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  credits: number,
  staged: Record<string, number>,
  snap: PackSnapshot
): PackScreenModel {
  if (hubId === null || market === null || market.hubId !== hubId) {
    return {
      title: 'PACK // BUY',
      budgetLabel: 'No market data',
      palette: [],
      sealLabel: 'SEAL',
      sealReady: false,
      sealDetail: '',
      hint: snap.hint,
    };
  }
  const palette: PackPaletteEntry[] = [];
  for (const listing of market.listings) {
    const left =
      Math.min(listing.stock, Math.floor(credits / listing.buyPrice)) -
      (staged[listing.goodId] ?? 0);
    if (left < 1) continue;
    palette.push({
      buttonId: `add:${listing.goodId}`,
      label: `+ ${listing.goodId.toUpperCase()} (${left})`,
      unitPrice: listing.buyPrice,
    });
  }
  return {
    title: `PACK // BUY — ${market.hubId.toUpperCase()}`,
    budgetLabel: `Credits: ${credits}cr`,
    palette,
    sealLabel: snap.sealLabel,
    sealReady: snap.sealReady,
    sealDetail: '',
    hint: buyHint(palette.length, snap, snapshot, pawnId),
  };
}

function buyHint(
  paletteSize: number,
  snap: PackSnapshot,
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null
): string {
  if (snap.hint !== '') return snap.hint;
  if (paletteSize > 0) return 'Stage units, drag them into the crate, seal';
  const frameId = snapshot?.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
  const bayCount = (snapshot?.crates ?? []).filter(
    (crate) => crate.where === 'bayFloor' && crate.frameId === frameId
  ).length;
  return bayCount > 0 ? 'No affordable goods — SELL ALL BAY first' : 'No credits and an empty bay';
}

function repackModel(
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  cargo: CargoStateBroadcast | null,
  staged: Record<string, number>,
  snap: PackSnapshot
): PackScreenModel {
  const { aboard, held } = securedAboard(snapshot, pawnId, cargo);
  return {
    title: 'PACK // HOLD',
    budgetLabel: aboard ? 'Secured goods below' : 'Board the ship to re-pack',
    palette: paletteOf(held, staged),
    sealLabel: snap.sealLabel,
    sealReady: snap.sealReady,
    sealDetail: '',
    hint: snap.hint === '' ? 'Stage secured goods, drag them into the crate, seal' : snap.hint,
  };
}

function securedAboard(
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null,
  cargo: CargoStateBroadcast | null
): { aboard: boolean; held: Record<string, number> } {
  const frameId = snapshot?.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
  const aboard = frameId !== null && hubIdForFrame(frameId) === null;
  const held: Record<string, number> = {};
  if (aboard) {
    for (const entry of cargo?.secured ?? []) held[entry.goodId] = entry.qty;
  }
  return { aboard, held };
}

function paletteOf(
  held: Record<string, number>,
  staged: Record<string, number>
): PackPaletteEntry[] {
  const palette: PackPaletteEntry[] = [];
  for (const [goodId, qty] of Object.entries(held)) {
    const left = qty - (staged[goodId] ?? 0);
    if (left < 1) continue;
    palette.push({
      buttonId: `add:${goodId}`,
      label: `+ ${goodId.toUpperCase()} (${left})`,
      unitPrice: 0,
    });
  }
  return palette;
}
