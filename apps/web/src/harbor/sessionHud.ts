/**
 * Session HUD text lines: pure string builders behind the harbor HUD
 * cards. No React, no DOM: unit tests assert the exact strings the e2e
 * specs read from the harbor-status/testid feed.
 */

import type { InteractTarget } from './interactTarget';
import type { useHarborSocket } from './useHarborSocket';

export type HarborSocket = ReturnType<typeof useHarborSocket>;

function shortId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}

export function describeTarget(target: InteractTarget | null): string {
  if (target === null) return 'target:-';
  if (target.kind === 'door') return `target:door:${target.open ? 'open' : 'closed'}`;
  return 'target:fixture';
}

function ventCount(socket: HarborSocket): number {
  return (socket.telemetry?.atmos ?? []).filter((room) => room.pressureKpa < 50).length;
}

export function statusLine(socket: HarborSocket): string {
  if (!socket.connected) return 'offline';
  const pawn = socket.snapshot?.pawns.find((entry) => entry.id === socket.pawnId);
  const room = pawn === undefined ? '-' : shortId(pawn.roomHint);
  const face = pawn === undefined ? '?' : Math.round(((pawn.facing * 180) / Math.PI + 360) % 360);
  const sx = pawn === undefined ? '?' : Math.round(pawn.x);
  return `tick:${socket.snapshot?.tick ?? '-'} room:${room} sx:${sx} face:${face} vent:${ventCount(socket)}`;
}

export function vitalsLine(socket: HarborSocket): string {
  const vitals = socket.vitals?.vitals;
  if (vitals === undefined) return 'vitals:-';
  const reload = vitals.reloading ? '(reloading)' : '';
  return `hp:${Math.round(vitals.health)} hyp:${Math.round(vitals.hypoxia)} suit:${vitals.suitSealed ? 'sealed' : 'open'} hunger:${Math.round(vitals.hunger)} mag:${vitals.ammo}/${vitals.reserve} spares:[${vitals.mags.join(',')}]${reload} credits:${socket.vitals?.credits ?? 0}`;
}

export function offerLine(offer: HarborSocket['offer']): string {
  if (offer === null) return 'offer:-';
  return `offer:${offer.jobs.join('/')}`;
}

export function noticesLine(notices: HarborSocket['notices']): string {
  if (notices.length === 0) return 'notices:-';
  return notices.map((notice) => `${notice.title}:${notice.message}`).join(' | ');
}
