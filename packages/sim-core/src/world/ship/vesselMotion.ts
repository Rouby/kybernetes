/**
 * Vessel-frame motion for nav-driven boats: station-keeping targets,
 * eased origins, hull velocity, frame assignment, and dock sealing.
 * Strike 2 motion authority: this is the SOLE mover for vessels carrying
 * ShipSystems. Legacy schedule/tickVesselMotion skips these hulls, so a
 * plotted leg never fights the harbor auto-tour over one origin.
 * Pure + deterministic; ticked through tickNavVesselMotion in systems.
 */

import { sealPortal, unsealPortal } from '../doors.js';
import { type DockLink, SHIP_FAR_ORIGIN, SHIP_ORIGIN, VESSEL_CRUISE_PX_S } from '../schedule.js';
import type { Vec2, VesselSchedulePhase, World } from '../types.js';
import type { NavState } from './navTransit.js';
import { HUB_PORTS } from './ports.js';
import type { ShipSystems } from './systems.js';

/** Destination mate in world space for a hub; undefined for POIs and nowhere. */
function mateOriginFor(world: World, hubId: string): Vec2 | undefined {
  const port = HUB_PORTS[hubId];
  const station = port === undefined ? undefined : world.stations[port.stationFrame];
  if (station === undefined) return undefined;
  return { x: station.origin.x + SHIP_ORIGIN.x, y: station.origin.y + SHIP_ORIGIN.y };
}

function currentOrigin(world: World, vesselId: string): Vec2 {
  return { ...(world.vessels[vesselId]?.origin ?? SHIP_ORIGIN) };
}

/**
 * Cruise hold off the departure mouth: the same east push the legacy
 * far hold gives home, re-anchored per port. Every hub shares one
 * berth, so every hold coincides in open water east of the dock; the
 * hull sits here for the whole leg (abstract cruise: stations unload,
 * the chart owns the trip) and there is no cross-world path to clip
 * through plates with.
 */
function cruiseHoldFor(world: World, nav: NavState): Vec2 {
  const mate = mateOriginFor(world, nav.portHubId);
  if (mate === undefined) return { ...SHIP_FAR_ORIGIN };
  return {
    x: mate.x + (SHIP_FAR_ORIGIN.x - SHIP_ORIGIN.x),
    y: mate.y + (SHIP_FAR_ORIGIN.y - SHIP_ORIGIN.y),
  };
}

/**
 * Station-keeping target for nav-driven vessels: the origin mate while
 * docked, the departure-relative cruise hold for the whole transit,
 * and the destination mate on the docking approach (a short glide back
 * into the shared berth). POI stops have no dock, so the hull holds.
 */
function navOriginTarget(world: World, vesselId: string, nav: NavState): Vec2 {
  if (nav.phase === 'in_transit' && !nav.flameout) {
    return cruiseHoldFor(world, nav);
  }
  const hubId = nav.phase === 'docking' ? (nav.destHubId ?? nav.portHubId) : nav.portHubId;
  return mateOriginFor(world, hubId) ?? currentOrigin(world, vesselId);
}

function stepToward(from: Vec2, to: Vec2, maxStep: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= Math.max(maxStep, 1)) return { ...to };
  return { x: from.x + (dx / dist) * maxStep, y: from.y + (dy / dist) * maxStep };
}

function setVesselOrigin(world: World, vesselId: string, origin: Vec2): World {
  const vessel = world.vessels[vesselId];
  if (vessel === undefined) return world;
  if (vessel.origin.x === origin.x && vessel.origin.y === origin.y) return world;
  return {
    ...world,
    vessels: { ...world.vessels, [vesselId]: { ...vessel, origin: { ...origin } } },
  };
}

/** Authoritative hull velocity from the easing step; zero while holding. */
function setVesselVel(
  world: World,
  vesselId: string,
  prev: Vec2,
  stepped: Vec2,
  dtSeconds: number
): World {
  const vessel = world.vessels[vesselId];
  if (vessel === undefined || !(dtSeconds > 0)) return world;
  const vel = { x: (stepped.x - prev.x) / dtSeconds, y: (stepped.y - prev.y) / dtSeconds };
  if (vessel.vel.x === vel.x && vessel.vel.y === vel.y) return world;
  return { ...world, vessels: { ...world.vessels, [vesselId]: { ...vessel, vel } } };
}

function dockSealed(world: World, dock: DockLink): boolean {
  const leaves = [dock.stationPortal, dock.tubePortal, dock.vesselPortal];
  return leaves.some((id) => world.portals[id]?.state === 'sealed');
}

/**
 * Unseal the current-port dock once the hull sits in the mate: the tube
 * leaves return to shut (vacuum-safe) edges. The crew still walks straight
 * ashore with no door micro-management — dock leaves are walkable while
 * unsealed — but neither mouth vents to space. Never leave docked mouths
 * 'open': both mate onto vacuum, not onto each other, and the air solver
 * would drain the ship corridor and the station tube.
 */
function unsealMatedDock(world: World, vesselId: string): World {
  const systems: ShipSystems | undefined = world.ships[vesselId];
  if (systems === undefined) return world;
  const port = HUB_PORTS[systems.nav.portHubId];
  const dock = port === undefined ? undefined : world.docks[port.dockId];
  if (dock === undefined || !dockSealed(world, dock)) return world;
  return sealDock(world, systems.nav.portHubId, true);
}

/** Ease one nav-driven vessel toward station-keeping and track its velocity. */
export function easeNavVessel(world: World, vesselId: string, dtSeconds: number): World {
  const systems: ShipSystems | undefined = world.ships[vesselId];
  if (systems === undefined) return world;
  const vessel = world.vessels[vesselId];
  if (vessel === undefined) return world;
  const target = navOriginTarget(world, vesselId, systems.nav);
  const stepped = stepToward(vessel.origin, target, VESSEL_CRUISE_PX_S * dtSeconds);
  let next = setVesselOrigin(world, vesselId, stepped);
  next = setVesselVel(next, vesselId, vessel.origin, stepped, dtSeconds);
  const mated = stepped.x === target.x && stepped.y === target.y;
  if (mated && vessel.schedule === 'docked') next = unsealMatedDock(next, vesselId);
  return next;
}

export function setVesselFrame(
  world: World,
  vesselId: string,
  schedule: VesselSchedulePhase,
  origin: { x: number; y: number } | undefined
): World {
  const vessel = world.vessels[vesselId];
  if (vessel === undefined) return world;
  const nextOrigin = origin === undefined ? { ...vessel.origin } : { ...origin };
  if (
    vessel.schedule === schedule &&
    vessel.origin.x === nextOrigin.x &&
    vessel.origin.y === nextOrigin.y
  ) {
    return world;
  }
  return {
    ...world,
    vessels: {
      ...world.vessels,
      [vesselId]: { ...vessel, schedule, origin: nextOrigin },
    },
  };
}

export function sealDock(world: World, hubId: string, open: boolean): World {
  const port = HUB_PORTS[hubId];
  const dock = port === undefined ? undefined : world.docks[port.dockId];
  if (dock === undefined) return world;
  const portals = { ...world.portals };
  let changed = false;
  for (const portalId of [dock.stationPortal, dock.tubePortal, dock.vesselPortal]) {
    const portal = portals[portalId];
    if (portal === undefined) continue;
    const next = open ? unsealPortal(portal, world.tick) : sealPortal(portal, world.tick);
    if (next !== portal) {
      portals[portalId] = next;
      changed = true;
    }
  }
  return changed ? { ...world, portals } : world;
}
