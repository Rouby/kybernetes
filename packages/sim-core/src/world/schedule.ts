/**
 * Vessel schedule: docked -> departing -> in_transit -> inbound -> docked.
 * Phase entries seal and unseal the Andockschleuse dock portals; while docked,
 * pawns walk the tube in world space with no teleport (see dockCrossing.ts).
 */

import { sealPortal, unsealPortal } from './doors.js';
import type { World } from './types.js';

export const DOCKED_S = 30;
export const DEPARTING_S = 3;
export const TRANSIT_S = 20;
export const INBOUND_S = 5;

export const DESTINATIONS = ['New Anchorage', 'Kepler Yard', 'Vesta Dock'] as const;

/**
 * Docked vessel origin (frame-local → world): the west mouth at local
 * (0, 340) lands on world (1210, 260), flush with the Andockschleuse tube
 * east face (1210) and dead-level with its axis (y 260). The corridor mouth
 * mates the tube end for a seamless world-space walk.
 */
export const SHIP_ORIGIN = { x: 1210, y: -80 };
/** Holding origin while off-station: far east, off-screen, out of the way. */
export const SHIP_FAR_ORIGIN = { x: 2800, y: -80 };

/** World-space mouth segment where the tube meets the ship (for crossing). */
export interface DockMouthWorld {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface TransitState {
  readonly vesselId: string;
  readonly timerS: number;
  readonly legIndex: number;
  readonly destination: string;
}

export interface DockLink {
  readonly id: string;
  readonly stationFrame: string;
  /** Inner airlock (korridor_ost <-> andock_a). */
  readonly stationPortal: string;
  /** Tube mouth (andock_tube <-> space), cut by the hull tube room. */
  readonly tubePortal: string;
  /** Station-side tube room pawns walk through. */
  readonly tubeRoom: string;
  readonly vesselFrame: string;
  /** Ship mouth (korridor_schiff <-> space), mates the tube in world space. */
  readonly vesselPortal: string;
  /** World-space mouth segment where tube meets ship. */
  readonly mouthWorld: DockMouthWorld;
}

/** Dock gate portal ids (all leaves of every dock link). */
export function dockGateIds(world: World): Set<string> {
  const ids = new Set<string>();
  for (const dock of Object.values(world.docks)) {
    ids.add(dock.stationPortal);
    ids.add(dock.tubePortal);
    ids.add(dock.vesselPortal);
  }
  return ids;
}

/** The dock link owning a gate portal, if any. */
export function dockLinkForPortal(world: World, portalId: string): DockLink | undefined {
  for (const dock of Object.values(world.docks)) {
    if (
      dock.stationPortal === portalId ||
      dock.tubePortal === portalId ||
      dock.vesselPortal === portalId
    )
      return dock;
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
  return tickVesselMotion(next, dtSeconds);
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
    for (const portalId of [dock.stationPortal, dock.tubePortal, dock.vesselPortal]) {
      const portal = portals[portalId];
      if (portal === undefined) continue;
      portals[portalId] = open ? unsealPortal(portal, world.tick) : sealPortal(portal, world.tick);
    }
  }
  return { ...world, portals };
}

function gatesSealed(world: World, dock: DockLink): boolean {
  const stationGate = world.portals[dock.stationPortal];
  const tubeGate = world.portals[dock.tubePortal];
  const vesselGate = world.portals[dock.vesselPortal];
  return (
    stationGate?.state === 'sealed' ||
    tubeGate?.state === 'sealed' ||
    vesselGate?.state === 'sealed'
  );
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
