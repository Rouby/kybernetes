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

/**
 * Docked vessel origin (frame-local → world): the stern ramp mouth at local
 * (100, 360) lands on world (1090, 200), a 70px umbilical off the gauntlet
 * east face (1020) and dead-level with its axis (y 200). The wedge tip at
 * local x40 kisses the tube mouth for a visibly mated dock.
 */
export const SHIP_ORIGIN = { x: 990, y: -160 };
/** Holding origin while off-station: far east, off-screen, out of the way. */
export const SHIP_FAR_ORIGIN = { x: 2600, y: -400 };

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
  /** Frame-local landing just past the gate on the vessel side. */
  readonly vesselEgress: { readonly x: number; readonly y: number };
  /** Frame-local landing just past the gate on the station side. */
  readonly stationEgress: { readonly x: number; readonly y: number };
}

/** Dock gate portal ids (both leaves of every dock link). */
export function dockGateIds(world: World): Set<string> {
  const ids = new Set<string>();
  for (const dock of Object.values(world.docks)) {
    ids.add(dock.stationPortal);
    ids.add(dock.vesselPortal);
  }
  return ids;
}

/** The dock link owning a gate portal, if any. */
export function dockLinkForPortal(world: World, portalId: string): DockLink | undefined {
  for (const dock of Object.values(world.docks)) {
    if (dock.stationPortal === portalId || dock.vesselPortal === portalId) return dock;
  }
  return undefined;
}

/**
 * True while pawns may stroll through a dock gate: vessel docked and the
 * cycle has not sealed the leaves. Movement and sight honor this; the air
 * graph keeps reading the sealed-safe states underneath.
 */
export function isDockGateWalkable(world: World, portalId: string): boolean {
  const dock = dockLinkForPortal(world, portalId);
  if (dock === undefined) return false;
  const vessel = world.vessels[dock.vesselFrame];
  if (vessel === undefined || vessel.schedule !== 'docked') return false;
  return !gatesSealed(world, dock);
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

/** Cruise speed px/s for dock approach and departure burns. */
export const VESSEL_CRUISE_PX_S = 340;

/** Where a vessel should hold station-keeping per schedule phase. */
export function originTargetFor(phase: string): { x: number; y: number } {
  if (phase === 'in_transit') return { ...SHIP_FAR_ORIGIN };
  if (phase === 'departing') return { x: SHIP_ORIGIN.x + 550, y: SHIP_ORIGIN.y };
  if (phase === 'inbound') return { ...SHIP_ORIGIN };
  return { ...SHIP_ORIGIN };
}

export function tickSchedule(world: World, dtSeconds: number): World {
  if (!(dtSeconds > 0)) return world;
  let next = world;
  for (const vessel of Object.values(world.vessels)) {
    next = tickVesselTransit(next, vessel.id, dtSeconds);
  }
  next = tickVesselMotion(next, dtSeconds);
  return stepBoarding(next);
}

/**
 * Fly the boat: ease each vessel origin toward its phase target so the ship
 * visibly departs after hiring and swings back on the inbound leg. Pawns
 * ride in frame-local coords (the renderer adds the origin), so no carried
 * drift is applied here — frame vel stays station-keeping zero.
 */
export function tickVesselMotion(world: World, dtSeconds: number): World {
  let moved = false;
  const vessels = { ...world.vessels };
  for (const vessel of Object.values(world.vessels)) {
    // Only scenario vessels with a transit record hold docking station-
    // keeping; bare hulls in unit rigs stay exactly where they are built.
    if (world.transit[vessel.id] === undefined) continue;
    const target = originTargetFor(vessel.schedule);
    const dx = target.x - vessel.origin.x;
    const dy = target.y - vessel.origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;
    const step = Math.min(dist, VESSEL_CRUISE_PX_S * dtSeconds);
    vessels[vessel.id] = {
      ...vessel,
      origin: { x: vessel.origin.x + (dx / dist) * step, y: vessel.origin.y + (dy / dist) * step },
    };
    moved = true;
  }
  return moved ? { ...world, vessels } : world;
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

function gatesSealed(world: World, dock: DockLink): boolean {
  const stationGate = world.portals[dock.stationPortal];
  const vesselGate = world.portals[dock.vesselPortal];
  return stationGate?.state === 'sealed' || vesselGate?.state === 'sealed';
}

/**
 * Posted crew ride their vessel: captains and hired NPC crew never drift
 * through the dock volumes on patrol. Players (pawn:*) and visitors roam.
 */
function isPostedCrew(world: World, pawnId: string): boolean {
  if (pawnId.startsWith('captain:')) return true;
  return pawnId.startsWith('npc:') && world.crew[pawnId] !== undefined;
}

function stepBoarding(world: World): World {
  const docks = Object.values(world.docks);
  if (docks.length === 0) return world;
  const pawns = { ...world.pawns };
  for (const dock of docks) {
    const vessel = world.vessels[dock.vesselFrame];
    if (vessel === undefined || vessel.schedule !== 'docked') continue;
    if (gatesSealed(world, dock)) continue;
    for (const pawn of Object.values(pawns)) {
      if (isPostedCrew(world, pawn.id)) continue;
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
  // Egress lands a stride past the gate leaf on the far side, facing and
  // velocity untouched: the flip reads as one more step down the tube.
  if (
    pawn.frameId === dock.stationFrame &&
    nearPawn(pawn, dock.stationX, dock.stationY, dock.radius)
  ) {
    const pos = { ...dock.vesselEgress };
    const gateRoom = world.portals[dock.vesselPortal]?.roomA;
    return {
      ...pawn,
      frameId: dock.vesselFrame,
      pos,
      roomHint: roomAt(world, dock.vesselFrame, pos.x, pos.y) ?? gateRoom ?? pawn.roomHint,
      transferCooldownUntilTick: world.tick + TRANSFER_COOLDOWN_TICKS,
    };
  }
  if (
    pawn.frameId === dock.vesselFrame &&
    nearPawn(pawn, dock.vesselX, dock.vesselY, dock.radius)
  ) {
    const pos = { ...dock.stationEgress };
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

/** Room id containing a frame-local point; bounds are edge-inclusive. Canonical lookup shared by schedule, crew, and combat. */
export function roomAt(world: World, frameId: string, x: number, y: number): string | undefined {
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
