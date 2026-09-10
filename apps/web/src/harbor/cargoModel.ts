/**
 * Cargo panel view-model (TRANSFORM M4): pure derivation of the hold
 * panel state from SNAPSHOT crates + CARGO_STATE secured counts.
 * The GL cargo screen renders these strings; all branching lives here
 * so the panel stays thin and Vitest pins the wording.
 */

import type { CargoStateBroadcast, CrateSnapshot, SnapshotBroadcast } from '@kybernetes/protocol';
import type { CargoScreenModel } from '../webgl/ui/UiScreens';

export interface CargoFloorLine {
  readonly crateId: string;
  readonly label: string;
  readonly where: string;
}

function crateContentsLabel(items: readonly { goodId: string; qty: number }[]): string {
  return items.map((item) => `${item.goodId} x${item.qty}`).join(' + ');
}

export interface CargoSecuredLine {
  readonly goodId: string;
  readonly qty: number;
}

export interface CargoPanelModel {
  readonly carryingId: string | null;
  readonly carryingLabel: string;
  readonly floor: readonly CargoFloorLine[];
  readonly floorLabel: string;
  readonly secured: readonly CargoSecuredLine[];
  readonly securedLabel: string;
  readonly handsFull: boolean;
  readonly canUnpack: boolean;
  readonly hint: string;
}

const MAX_PANEL_LINES = 6;

export function cargoPanelModel(
  snapshot: SnapshotBroadcast | null,
  cargo: CargoStateBroadcast | null,
  pawnId: string | null
): CargoPanelModel {
  const crates = snapshot?.crates ?? [];
  const carrying = carryingOf(crates, cargo, pawnId);
  const floor = floorOf(crates, pawnId);
  const secured = (cargo?.secured ?? []).map((entry) => ({ goodId: entry.goodId, qty: entry.qty }));
  return {
    carryingId: carrying?.id ?? null,
    carryingLabel:
      carrying === undefined ? 'Hands: empty' : `Hands: ${crateContentsLabel(carrying.items)}`,
    floor,
    floorLabel: floorLabelFor(floor, crates.length),
    secured,
    securedLabel:
      secured.length === 0
        ? 'Hold: empty'
        : `Hold: ${secured.map((line) => `${line.goodId} x${line.qty}`).join(', ')}`,
    handsFull: carrying !== undefined,
    canUnpack: floor.some((line) => line.where === 'shipFloor'),
    hint: hintFor(carrying !== undefined, floor.length),
  };
}

function carryingOf(
  crates: readonly CrateSnapshot[],
  cargo: CargoStateBroadcast | null,
  pawnId: string | null
): CrateSnapshot | undefined {
  if (pawnId === null) return undefined;
  const direct = cargo?.carriedByPawn[pawnId];
  if (direct !== undefined) return crates.find((crate) => crate.id === direct);
  return crates.find((crate) => crate.where === 'carriedBy' && crate.carrierId === pawnId);
}

function floorOf(crates: readonly CrateSnapshot[], pawnId: string | null): CargoFloorLine[] {
  return crates
    .filter((crate) => crate.where !== 'carriedBy' || crate.carrierId !== pawnId)
    .filter((crate) => crate.where === 'bayFloor' || crate.where === 'shipFloor')
    .slice(0, MAX_PANEL_LINES)
    .map((crate) => ({
      crateId: crate.id,
      label: crateContentsLabel(crate.items),
      where: crate.where,
    }));
}

function floorLabelFor(floor: readonly CargoFloorLine[], total: number): string {
  if (total === 0) return 'Floor: no crates nearby';
  const extra = total - floor.length;
  const head = `Floor: ${floor.map((line) => line.label).join(', ')}`;
  return extra > 0 ? `${head} (+${extra} more)` : head;
}

function hintFor(handsFull: boolean, floorCount: number): string {
  if (handsFull) return 'G set down - U unpacks ship-floor crates - C seals secured goods';
  if (floorCount > 0) return 'E picks up - C opens the hold panel';
  return 'Buy goods at a market stall (M5) - C opens the hold panel';
}

/** Screen input for the GL hold panel: labels plus seal/unpack intents stock. */
export function cargoScreenFor(
  snapshot: SnapshotBroadcast | null,
  cargo: CargoStateBroadcast | null,
  pawnId: string | null
): {
  screen: CargoScreenModel;
  unpackIds: readonly string[];
  seal: Readonly<Record<string, number>>;
} {
  const model = cargoPanelModel(snapshot, cargo, pawnId);
  const frameId = pawnFrameOf(snapshot, pawnId);
  const sealEntries = model.secured.filter((line) => line.qty >= 1);
  const seal: Record<string, number> = {};
  for (const line of sealEntries) seal[line.goodId] = line.qty;
  return {
    screen: {
      carryingLabel: model.carryingLabel,
      floorLabel: model.floorLabel,
      securedLabel: model.securedLabel,
      hint: model.hint,
      canUnpack: model.canUnpack,
      handsFull: model.handsFull,
      seal: sealEntries.map((line) => ({ goodId: line.goodId, qty: Math.min(10, line.qty) })),
    },
    unpackIds: unpackableCrateIds(snapshot, frameId),
    seal,
  };
}

function pawnFrameOf(snapshot: SnapshotBroadcast | null, pawnId: string | null): string | null {
  if (snapshot === null || pawnId === null) return null;
  return snapshot.pawns.find((pawn) => pawn.id === pawnId)?.frameId ?? null;
}

/** Crate ids on the pawn's vessel floor, for the U (unpack-all) shortcut. */
export function unpackableCrateIds(
  snapshot: SnapshotBroadcast | null,
  frameId: string | null
): readonly string[] {
  if (snapshot === null || frameId === null) return [];
  return (snapshot.crates ?? [])
    .filter((crate) => crate.where === 'shipFloor' && crate.frameId === frameId)
    .map((crate) => crate.id);
}
