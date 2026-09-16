/**
 * Session HUD text lines: pure string builders behind the harbor HUD
 * cards. No React, no DOM: unit tests assert the exact strings the e2e
 * specs read from the harbor-status/testid feed.
 */

import type {
  HireOfferBroadcast,
  ShipStatusBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
  VitalsBroadcast,
} from '@kybernetes/protocol';
import type { InteractTarget } from './interactTarget';

export interface HarborSocket extends HudStatusSource, HudVitalsSource {
  readonly offer: HireOfferBroadcast | null;
  readonly notices: ReadonlyArray<{ readonly title: string; readonly message: string }>;
}

function shortId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}

export function describeTarget(target: InteractTarget | null): string {
  if (target === null) return 'target:-';
  if (target.kind === 'door') return `target:door:${target.open ? 'open' : 'closed'}`;
  if (target.kind === 'crate') return `target:crate:${target.id}`;
  return 'target:fixture';
}

export interface ActionHint {
  readonly key: string;
  readonly label: string;
  readonly alert: boolean;
}

export interface HintsInput {
  readonly carrying: boolean;
  readonly nearShipCrates: boolean;
  readonly aboardVessel: boolean;
  readonly vacuum: boolean;
}

/**
 * Contextual key hints for the HUD strip. [E] keeps its own prompt
 * surface (combat footer + world prompt); the strip covers the hidden
 * keys: dropping, stowing, hold inventory, and suit seal.
 */
export function actionHintsFor(input: HintsInput): ActionHint[] {
  const hints: ActionHint[] = [];
  if (input.carrying) hints.push({ key: '[G]', label: 'Drop crate', alert: false });
  if (input.nearShipCrates) hints.push({ key: '[U]', label: 'Stow into hold', alert: false });
  if (input.aboardVessel) hints.push({ key: '[C]', label: 'Hold inventory', alert: false });
  if (input.aboardVessel || input.vacuum) {
    hints.push({ key: '[T]', label: 'Seal suit', alert: input.vacuum });
  }
  return hints;
}

export function cargoLine(carryingId: string | null, securedCount: number): string {
  if (carryingId === null && securedCount === 0) return 'cargo:-';
  if (carryingId === null) return `cargo:secured=${securedCount}`;
  return `cargo:carrying=${carryingId} secured=${securedCount}`;
}

function ventCount(socket: { readonly telemetry: TelemetryBroadcast | null }): number {
  return (socket.telemetry?.atmos ?? []).filter((room) => room.pressureKpa < 50).length;
}

export interface HudStatusSource {
  readonly connected: boolean;
  readonly snapshot: SnapshotBroadcast | null;
  readonly pawnId: string | null;
  readonly telemetry: TelemetryBroadcast | null;
}

export function statusLine(socket: HudStatusSource): string {
  if (!socket.connected) return 'offline';
  const pawn = socket.snapshot?.pawns.find((entry) => entry.id === socket.pawnId);
  const room = pawn === undefined ? '-' : shortId(pawn.roomHint);
  const face = pawn === undefined ? '?' : Math.round(((pawn.facing * 180) / Math.PI + 360) % 360);
  const sx = pawn === undefined ? '?' : Math.round(pawn.x);
  return `tick:${socket.snapshot?.tick ?? '-'} room:${room} sx:${sx} face:${face} vent:${ventCount(socket)}`;
}

export interface HudVitalsSource {
  readonly vitals: VitalsBroadcast | null;
}

export function vitalsLine(socket: HudVitalsSource): string {
  const vitals = socket.vitals?.vitals;
  if (vitals === undefined) return 'vitals:-';
  const reload = vitals.reloading ? '(reloading)' : '';
  return `hp:${Math.round(vitals.health)} hyp:${Math.round(vitals.hypoxia)} suit:${vitals.suitSealed ? 'sealed' : 'open'} hunger:${Math.round(vitals.hunger)} mag:${vitals.ammo}/${vitals.reserve} spares:[${vitals.mags.join(',')}]${reload} credits:${socket.vitals?.credits ?? 0}`;
}

export function storesLine(status: ShipStatusBroadcast | null): string {
  const stores = status?.stores;
  if (stores === undefined) return 'stores:-';
  const bunker = status?.engineFuel ?? 0;
  return `stores:rations x${stores.rations} water x${stores.waterL} o2 x${stores.o2Cells} fuel x${stores.fuelCells} bunker ${bunker}`;
}

export function offerLine(offer: HarborSocket['offer']): string {
  if (offer === null) return 'offer:-';
  return `offer:${offer.jobs.join('/')}`;
}

export function noticesLine(
  notices: ReadonlyArray<{ readonly title: string; readonly message: string }>
): string {
  if (notices.length === 0) return 'notices:-';
  return notices.map((notice) => `${notice.title}:${notice.message}`).join(' | ');
}
