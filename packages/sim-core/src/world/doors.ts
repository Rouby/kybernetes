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

function withDoorState(portal: PortalEdge, wantOpen: boolean, tick: number): PortalEdge {
  return {
    ...portal,
    state: wantOpen ? 'open' : 'closed',
    cooldownUntilTick: tick + DOOR_COOLDOWN_TICKS,
  };
}
