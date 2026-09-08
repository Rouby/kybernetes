/**
 * Portal graph doors: cooldown, clearance, airlock sequencing,
 * destroyed-to-hole transition the air solver can see.
 */

import type { PortalEdge, World } from './types.js';

export const DOOR_COOLDOWN_TICKS = 24;

export type DoorToggleResult =
  | { readonly ok: true; readonly portal: PortalEdge }
  | {
      readonly ok: false;
      readonly reason: 'not-found' | 'cooldown' | 'sealed' | 'destroyed' | 'clearance';
    };

export function isPortalConnecting(portal: PortalEdge): boolean {
  if (portal.kind === 'window') return false;
  if (portal.state === 'open') return true;
  if (portal.state === 'destroyed' && portal.kind === 'hole') return true;
  if (portal.kind === 'open') return true;
  if (portal.kind === 'hole' && portal.state !== 'sealed') return true;
  return false;
}

export function tryToggleDoor(
  world: World,
  portalId: string,
  wantOpen: boolean,
  pawnClearance: number
): DoorToggleResult {
  const portal = world.portals[portalId];
  if (portal === undefined) return { ok: false, reason: 'not-found' };
  if (portal.state === 'destroyed') return { ok: false, reason: 'destroyed' };
  if (portal.state === 'sealed') return { ok: false, reason: 'sealed' };
  if (world.tick < portal.cooldownUntilTick) return { ok: false, reason: 'cooldown' };
  if (pawnClearance < portal.clearance) return { ok: false, reason: 'clearance' };
  return { ok: true, portal: withDoorState(portal, wantOpen, world.tick) };
}

export function destroyPortal(portal: PortalEdge, tick: number): PortalEdge {
  return {
    ...portal,
    kind: 'hole',
    state: 'destroyed',
    cooldownUntilTick: tick,
  };
}

export function sealPortal(portal: PortalEdge, tick: number): PortalEdge {
  return { ...portal, state: 'sealed', cooldownUntilTick: tick };
}

/** Returns a sealed dock portal to a shut edge. Docked transfer volumes move pawns
 * while the edge stays vacuum-safe; only explicit toggles or damage reopen it. */
export function unsealPortal(portal: PortalEdge, tick: number): PortalEdge {
  return { ...portal, state: 'closed', cooldownUntilTick: tick };
}

/** Nearest portal to a pawn within maxDist of its segment midpoint. */
export function nearestPortal(
  world: World,
  pawnId: string,
  maxDist: number
): PortalEdge | undefined {
  const pawn = world.pawns[pawnId];
  if (pawn === undefined || !(maxDist > 0)) return undefined;
  let nearest: PortalEdge | undefined;
  let nearestDist = maxDist;
  for (const portal of Object.values(world.portals)) {
    const room = world.rooms[portal.roomA];
    if (room === undefined || room.frameId !== pawn.frameId) continue;
    const distance = segmentMidpointDistance(portal, pawn.pos);
    if (distance < nearestDist) {
      nearest = portal;
      nearestDist = distance;
    }
  }
  return nearest;
}

function segmentMidpointDistance(portal: PortalEdge, pos: { x: number; y: number }): number {
  const midX = (portal.segment.x1 + portal.segment.x2) / 2;
  const midY = (portal.segment.y1 + portal.segment.y2) / 2;
  return Math.hypot(pos.x - midX, pos.y - midY);
}

function withDoorState(portal: PortalEdge, wantOpen: boolean, tick: number): PortalEdge {
  return {
    ...portal,
    state: wantOpen ? 'open' : 'closed',
    cooldownUntilTick: tick + DOOR_COOLDOWN_TICKS,
  };
}
