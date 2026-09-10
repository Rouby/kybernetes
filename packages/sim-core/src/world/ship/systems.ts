/**
 * Solo-ship systems container (TRANSFORM M2/M3). One record per vessel
 * frame: reactor + engine + nav leg state, tiers, and hull condition.
 * Ticked inside tickWorld at fixed dt; tiers sync from the server-side
 * ShipRecord on spawn/upgrade (M6) via syncShipTiers. Pure + deterministic.
 */

import { sealPortal, unsealPortal } from '../doors.js';
import { SHIP_FAR_ORIGIN, SHIP_ORIGIN } from '../schedule.js';
import type { VesselSchedulePhase, World } from '../types.js';
import type { EngineState } from './engine.js';
import { coldEngine, effectiveTune, serviceEngine, tickEngine, wearEngine } from './engine.js';
import {
  cancelLeg,
  DOCKED_NAV,
  isUnderway,
  type NavState,
  type PlotChecks,
  type PlotReject,
  plotCourse,
  resetLegTo,
  tickNavLeg,
} from './navTransit.js';
import { HUB_PORTS, isHubId } from './ports.js';
import type { ReactorState } from './reactor.js';
import {
  coldReactor,
  reactorOutputMw,
  restartReactor,
  tickReactor,
  tuneReactor,
} from './reactor.js';
import type { EngineTier, ReactorTier } from './shipRecord.js';

export const SCRAM_DAMAGE_GRACE_S = 30;
export const SCRAM_DAMAGE_PER_S = 2;
export const FULL_CONDITION = 100;

export interface ShipSystems {
  readonly vesselId: string;
  readonly reactorTier: ReactorTier;
  readonly engineTier: EngineTier;
  readonly reactor: ReactorState;
  readonly engine: EngineState;
  readonly nav: NavState;
  /** Hull condition 0-100; the host mirrors it into the ShipRecord. */
  readonly condition: number;
  /** Fuel cells aboard; synced with the ShipRecord by the host. */
  readonly fuelCells: number;
}

export function defaultShipSystems(vesselId: string): ShipSystems {
  return {
    vesselId,
    reactorTier: 0,
    engineTier: 0,
    reactor: coldReactor(hashSeed(vesselId)),
    engine: coldEngine(),
    nav: { ...DOCKED_NAV },
    condition: FULL_CONDITION,
    fuelCells: 1,
  };
}

/** Idempotent: creates T0/T0 cold/docked systems for unknown vessels. */
export function ensureShipSystems(world: World, vesselId: string): World {
  if (world.vessels[vesselId] === undefined || world.ships[vesselId] !== undefined) return world;
  return { ...world, ships: { ...world.ships, [vesselId]: defaultShipSystems(vesselId) } };
}

export function syncShipTiers(
  world: World,
  vesselId: string,
  reactorTier: ReactorTier,
  engineTier: EngineTier
): World {
  if (world.vessels[vesselId] === undefined) return world;
  const current = world.ships[vesselId] ?? defaultShipSystems(vesselId);
  const synced =
    current.reactorTier === reactorTier && current.engineTier === engineTier
      ? current
      : { ...current, reactorTier, engineTier };
  if (world.ships[vesselId] === synced) return world;
  return { ...world, ships: { ...world.ships, [vesselId]: synced } };
}

export function syncShipStores(world: World, vesselId: string, fuelCells: number): World {
  if (!Number.isFinite(fuelCells) || fuelCells < 0) return world;
  const current = world.ships[vesselId];
  if (current === undefined || current.fuelCells === fuelCells) return world;
  return updateSystems(world, vesselId, (systems) => ({ ...systems, fuelCells }));
}

export function plotVoyage(
  world: World,
  vesselId: string,
  destHubId: string,
  checks: PlotChecks
): { world: World; reject?: PlotReject } {
  const ensured = ensureShipSystems(world, vesselId);
  const current = ensured.ships[vesselId];
  if (current === undefined) return { world: ensured };
  const plotted = plotCourse(current.nav, destHubId, checks);
  if (!('nav' in plotted)) return { world: ensured, reject: plotted.reject };
  return {
    world: {
      ...ensured,
      ships: { ...ensured.ships, [vesselId]: { ...current, nav: plotted.nav } },
    },
  };
}

export function cancelVoyage(world: World, vesselId: string): World {
  return updateSystems(world, vesselId, (systems) => ({ ...systems, nav: cancelLeg(systems.nav) }));
}

export function tuneShipReactor(
  world: World,
  vesselId: string,
  rodsDelta: number,
  coolantDelta: number
): World {
  return updateSystems(world, vesselId, (systems) => ({
    ...systems,
    reactor: tuneReactor(systems.reactor, rodsDelta, coolantDelta),
  }));
}

export function restartShipReactor(world: World, vesselId: string): World {
  return updateSystems(world, vesselId, (systems) => ({
    ...systems,
    reactor: restartReactor(systems.reactor, systems.reactorTier),
  }));
}

export function tuneShipEngine(
  world: World,
  vesselId: string,
  spoolCmd: 0 | 1,
  tuneSet?: number
): World {
  if (spoolCmd !== 0 && spoolCmd !== 1) return world;
  return updateSystems(world, vesselId, (systems) => ({
    ...systems,
    engine: {
      ...systems.engine,
      spoolCmd,
      tune: tuneSet === undefined ? systems.engine.tune : clamp01(tuneSet),
    },
  }));
}

/** Fixed-step systems tick for every vessel carrying systems state. */
export function tickShipSystems(world: World, dtSeconds: number): World {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return world;
  const prev = world.ships;
  let ships = prev;
  let changed = false;
  for (const systems of Object.values(prev)) {
    const next = tickOneVessel(systems, dtSeconds, world.tick);
    if (next !== systems) {
      ships = { ...ships, [systems.vesselId]: next };
      changed = true;
    }
  }
  let next = changed ? { ...world, ships } : world;
  for (const systems of Object.values(prev)) {
    const ticked = next.ships[systems.vesselId] ?? systems;
    next = applyVoyage(next, systems.nav, ticked, systems.vesselId);
  }
  return next;
}

function tickOneVessel(systems: ShipSystems, dtSeconds: number, tick: number): ShipSystems {
  const reactor = tickReactor(systems.reactor, systems.reactorTier, dtSeconds, tick);
  const output = systems.reactor.scrammed ? 0 : reactorOutputMw(reactor, systems.reactorTier);
  const engine = tickEngine(systems.engine, output, isUnderway(systems.nav), dtSeconds, {
    spoolCmd: systems.engine.spoolCmd,
  });
  const leg = tickNavLeg(
    systems.nav,
    engine,
    { hot: reactor.hot, scrammed: reactor.scrammed },
    systems.engineTier,
    systems.fuelCells,
    dtSeconds
  );
  const condition = applyScramDamage(systems.condition, leg.nav, reactor, engine, dtSeconds);
  if (
    reactor === systems.reactor &&
    engine === systems.engine &&
    leg.nav === systems.nav &&
    leg.fuelCells === systems.fuelCells &&
    condition === systems.condition
  ) {
    return systems;
  }
  return { ...systems, reactor, engine, nav: leg.nav, fuelCells: leg.fuelCells, condition };
}

function applyScramDamage(
  condition: number,
  nav: NavState,
  reactor: ReactorState,
  engine: EngineState,
  dtSeconds: number
): number {
  if (!reactor.scrammed || nav.phase !== 'in_transit') return condition;
  if (reactor.scramS <= SCRAM_DAMAGE_GRACE_S) return condition;
  const doubling = effectiveTune(engine) <= 0.05 ? 2 : 1;
  return Math.max(0, condition - SCRAM_DAMAGE_PER_S * doubling * dtSeconds);
}

/**
 * Voyage side effects on phase edges: departure seals the dock and throws
 * the vessel far; arrival re-docks at the destination mouth, unseals it,
 * and logs leg wear (dockside service runs at the next departure).
 */
function applyVoyage(world: World, prev: NavState, next: ShipSystems, vesselId: string): World {
  if (prev.phase === next.nav.phase) return world;
  if (prev.phase === 'spooling' && next.nav.phase === 'in_transit') {
    return departVoyage(world, vesselId, next);
  }
  if (prev.phase === 'in_transit' && next.nav.phase === 'docking') {
    return setVesselFrame(world, vesselId, 'inbound', undefined);
  }
  if (prev.phase === 'docking' && next.nav.phase === 'docked') {
    return arriveVoyage(world, vesselId, next);
  }
  return world;
}

function departVoyage(world: World, vesselId: string, next: ShipSystems): World {
  const sealed = sealDock(world, next.nav.portHubId, false);
  const moved = setVesselFrame(sealed, vesselId, 'in_transit', SHIP_FAR_ORIGIN);
  const serviced = { ...next, engine: serviceEngine(next.engine) };
  return { ...moved, ships: { ...moved.ships, [vesselId]: serviced } };
}

function arriveVoyage(world: World, vesselId: string, next: ShipSystems): World {
  const port = HUB_PORTS[next.nav.portHubId];
  const station = port === undefined ? undefined : world.stations[port.stationFrame];
  const vessel = world.vessels[vesselId];
  const home = vessel?.origin ?? { x: 0, y: 0 };
  const origin =
    station === undefined
      ? { ...home }
      : { x: station.origin.x + SHIP_ORIGIN.x, y: station.origin.y + SHIP_ORIGIN.y };
  let moved = setVesselFrame(world, vesselId, 'docked', origin);
  moved = sealDock(moved, next.nav.portHubId, true);
  const worn = { ...next, engine: wearEngine(next.engine, 1) };
  return { ...moved, ships: { ...moved.ships, [vesselId]: worn } };
}

/** DISTRESS tow: the vessel reappears docked at the given hub, bay open. */
export function resetVoyageTo(world: World, vesselId: string, hubId: string): World {
  const current = world.ships[vesselId];
  if (current === undefined || !isHubId(hubId)) return world;
  const port = HUB_PORTS[hubId];
  const station = port === undefined ? undefined : world.stations[port.stationFrame];
  const vessel = world.vessels[vesselId];
  if (station === undefined || vessel === undefined) return world;
  const origin = { x: station.origin.x + SHIP_ORIGIN.x, y: station.origin.y + SHIP_ORIGIN.y };
  let next = setVesselFrame(world, vesselId, 'docked', origin);
  next = sealDock(next, hubId, true);
  const nav = resetLegTo(current.nav, hubId);
  return { ...next, ships: { ...next.ships, [vesselId]: { ...current, nav } } };
}

function setVesselFrame(
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

function sealDock(world: World, hubId: string, open: boolean): World {
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

function updateSystems(
  world: World,
  vesselId: string,
  update: (systems: ShipSystems) => ShipSystems
): World {
  const current = world.ships[vesselId];
  if (current === undefined) return world;
  return { ...world, ships: { ...world.ships, [vesselId]: update(current) } };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  }
  return hash + 1;
}
