/**
 * Vessel schedule: docked -> departing -> in_transit -> inbound -> docked.
 * Phase entries seal and unseal the gauntlet dock portals; while docked,
 * pawns crossing the dock transfer volumes walk aboard (no teleport).
 */

import { sealPortal, unsealPortal } from './doors.js';
import type { World } from './types.js';

export const DOCKED_S = 30;
export const DEPARTING_S = 3;
export const TRANSIT_S = 20;
export const INBOUND_S = 5;

export const DESTINATIONS = ['New Anchorage', 'Kepler Yard', 'Vesta Dock'] as const;

/** Ticks a pawn ignores dock transfer volumes after crossing (gauntlet cycle). */
export const TRANSFER_COOLDOWN_TICKS = 40;

export interface TransitState {
  readonly vesselId: string;
  readonly timerS: number;
  readonly legIndex: number;
  readonly destination: string;
}

export interface DockLink {
  readonly id: string;
  readonly stationFrame: string;
  readonly stationPortal: string;
  readonly stationX: number;
  readonly stationY: number;
  readonly vesselFrame: string;
  readonly vesselPortal: string;
  readonly vesselX: number;
  readonly vesselY: number;
  readonly radius: number;
}

export function initialTransit(vesselId: string): TransitState {
  return { vesselId, timerS: DOCKED_S, legIndex: 0, destination: DESTINATIONS[0] ?? 'Nowhere' };
}

export function phaseDuration(phase: string): number {
  if (phase === 'departing') return DEPARTING_S;
  if (phase === 'in_transit') return TRANSIT_S;
  if (phase === 'inbound') return INBOUND_S;
  return DOCKED_S;
}

export function departVessel(world: World, vesselId: string): World {
  const vessel = world.vessels[vesselId];
  if (vessel === undefined || vessel.schedule !== 'docked') return world;
  return enterPhase(world, vesselId, 'departing');
}

export function tickSchedule(world: World, dtSeconds: number): World {
  if (!(dtSeconds > 0)) return world;
  let next = world;
  for (const vessel of Object.values(world.vessels)) {
    next = tickVesselTransit(next, vessel.id, dtSeconds);
  }
  return stepBoarding(next);
}

function tickVesselTransit(world: World, vesselId: string, dtSeconds: number): World {
  const transit = world.transit[vesselId];
  if (transit === undefined) return world;
  const timer = transit.timerS - dtSeconds;
  if (timer > 0) {
    return { ...world, transit: { ...world.transit, [vesselId]: { ...transit, timerS: timer } } };
  }
  const phase = world.vessels[vesselId]?.schedule ?? 'docked';
  if (phase === 'docked') return enterPhase(world, vesselId, 'departing');
  if (phase === 'departing') return enterPhase(world, vesselId, 'in_transit');
  if (phase === 'in_transit') return enterPhase(world, vesselId, 'inbound');
  return enterPhase(world, vesselId, 'docked');
}

function enterPhase(
  world: World,
  vesselId: string,
  phase: 'docked' | 'departing' | 'in_transit' | 'inbound'
): World {
  const transit = world.transit[vesselId];
  const vessel = world.vessels[vesselId];
  if (transit === undefined || vessel === undefined) return world;
  const legIndex = phase === 'docked' ? transit.legIndex + 1 : transit.legIndex;
  const withPhase: World = {
    ...world,
    vessels: { ...world.vessels, [vesselId]: { ...vessel, schedule: phase } },
    transit: {
      ...world.transit,
      [vesselId]: {
        ...transit,
        timerS: phaseDuration(phase),
        legIndex,
        destination: DESTINATIONS[legIndex % DESTINATIONS.length] ?? transit.destination,
      },
    },
  };
  return setDockPortals(withPhase, vesselId, phase === 'docked');
}

function setDockPortals(world: World, vesselId: string, open: boolean): World {
  const portals = { ...world.portals };
  for (const dock of Object.values(world.docks)) {
    if (dock.vesselFrame !== vesselId) continue;
    for (const portalId of [dock.stationPortal, dock.vesselPortal]) {
      const portal = portals[portalId];
      if (portal === undefined) continue;
      portals[portalId] = open ? unsealPortal(portal, world.tick) : sealPortal(portal, world.tick);
    }
  }
  return { ...world, portals };
}

function stepBoarding(world: World): World {
  const docks = Object.values(world.docks);
  if (docks.length === 0) return world;
  const pawns = { ...world.pawns };
  for (const dock of docks) {
    const vessel = world.vessels[dock.vesselFrame];
    if (vessel === undefined || vessel.schedule !== 'docked') continue;
    for (const pawn of Object.values(pawns)) {
      const moved = transferThroughDock(world, pawn, dock);
      if (moved !== undefined) pawns[pawn.id] = moved;
    }
  }
  return { ...world, pawns };
}

function transferThroughDock(
  world: World,
  pawn: World['pawns'][string],
  dock: DockLink
): World['pawns'][string] | undefined {
  if (pawn === undefined || world.tick < pawn.transferCooldownUntilTick) return undefined;
  if (
    pawn.frameId === dock.stationFrame &&
    nearPawn(pawn, dock.stationX, dock.stationY, dock.radius)
  ) {
    const pos = { x: dock.vesselX - 120, y: dock.vesselY };
    return {
      ...pawn,
      frameId: dock.vesselFrame,
      pos,
      roomHint: roomAt(world, dock.vesselFrame, pos.x, pos.y) ?? pawn.roomHint,
      transferCooldownUntilTick: world.tick + TRANSFER_COOLDOWN_TICKS,
    };
  }
  if (
    pawn.frameId === dock.vesselFrame &&
    nearPawn(pawn, dock.vesselX, dock.vesselY, dock.radius)
  ) {
    const pos = { x: dock.stationX - 120, y: dock.stationY };
    return {
      ...pawn,
      frameId: dock.stationFrame,
      pos,
      roomHint: roomAt(world, dock.stationFrame, pos.x, pos.y) ?? pawn.roomHint,
      transferCooldownUntilTick: world.tick + TRANSFER_COOLDOWN_TICKS,
    };
  }
  return undefined;
}

function roomAt(world: World, frameId: string, x: number, y: number): string | undefined {
  for (const room of Object.values(world.rooms)) {
    if (room.frameId !== frameId) continue;
    if (
      x >= room.rect.x &&
      x <= room.rect.x + room.rect.w &&
      y >= room.rect.y &&
      y <= room.rect.y + room.rect.h
    ) {
      return room.id;
    }
  }
  return undefined;
}

function nearPawn(
  pawn: { pos: { x: number; y: number } },
  x: number,
  y: number,
  radius: number
): boolean {
  return Math.hypot(pawn.pos.x - x, pawn.pos.y - y) <= radius;
}
