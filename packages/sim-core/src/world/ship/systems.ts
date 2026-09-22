/**
 * Solo-ship systems container (TRANSFORM M2/M3). One record per vessel
 * frame: reactor + engine + nav leg state, tiers, and hull condition.
 * Ticked inside tickWorld at fixed dt; tiers sync from the server-side
 * ShipRecord on spawn/upgrade (M6) via syncShipTiers. Pure + deterministic.
 */

import { sealPortal, unsealPortal } from '../doors.js';
import { type DockLink, SHIP_FAR_ORIGIN, SHIP_ORIGIN, VESSEL_CRUISE_PX_S } from '../schedule.js';
import { FIXED_DT, type Vec2, type VesselSchedulePhase, type World } from '../types.js';
import { chartNodeFor, plotChartCourse } from './chart.js';
import { FUEL_PER_CELL, fuelMaxForTier } from './engine.js';
import {
  DOCKED_NAV,
  hailForRescue,
  type NavState,
  type PlotChecks,
  type PlotReject,
  resetLegTo,
  tickNavLeg,
} from './navTransit.js';
import { HUB_PORTS, isHubId } from './ports.js';
import type { ReactorState } from './reactor.js';
import { coldReactor, restartReactor, tickReactor } from './reactor.js';
import type { EngineTier, ReactorTier } from './shipRecord.js';

export const SCRAM_DAMAGE_GRACE_S = 30;
export const SCRAM_DAMAGE_PER_S = 2;
export const FULL_CONDITION = 100;

export interface ShipSystems {
  readonly vesselId: string;
  readonly reactorTier: ReactorTier;
  readonly engineTier: EngineTier;
  readonly reactor: ReactorState;
  readonly nav: NavState;
  /** Hull condition 0-100; the host mirrors it into the ShipRecord. */
  readonly condition: number;
  /** Flyable fuel-value in the engine bunker; synced with the ShipRecord. */
  readonly engineFuel: number;
  /** @deprecated mirror of engineFuel in legacy cell units; do not use. */
  readonly fuelCells?: number;
  /** Surveyed POI ids (fog-of-war discovery); hubs are known by default. */
  readonly surveyed: readonly string[];
}

export function defaultShipSystems(vesselId: string): ShipSystems {
  return {
    vesselId,
    reactorTier: 0,
    engineTier: 0,
    reactor: coldReactor(hashSeed(vesselId)),
    nav: { ...DOCKED_NAV },
    condition: FULL_CONDITION,
    engineFuel: 0,
    surveyed: [],
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
  return syncEngineFuel(world, vesselId, Math.floor(fuelCells * 1000));
}

/** Sync the engine bunker fuel-value (preferred; syncShipStores is legacy). */
export function syncEngineFuel(world: World, vesselId: string, engineFuel: number): World {
  if (!Number.isFinite(engineFuel) || engineFuel < 0) return world;
  const current = world.ships[vesselId];
  if (current === undefined || current.engineFuel === engineFuel) return world;
  return updateSystems(world, vesselId, (systems) => ({ ...systems, engineFuel }));
}

function loadFuelCellSafe(
  looseCells: number,
  engineFuel: number,
  tier: EngineTier
): { looseCells: number; engineFuel: number } | undefined {
  if (!Number.isInteger(looseCells) || looseCells < 1) return undefined;
  if (!Number.isFinite(engineFuel) || engineFuel < 0) return undefined;
  if (engineFuel + FUEL_PER_CELL > fuelMaxForTier(tier)) return undefined;
  return { looseCells: looseCells - 1, engineFuel: engineFuel + FUEL_PER_CELL };
}

function unloadFuelCellSafe(
  looseCells: number,
  engineFuel: number
): { looseCells: number; engineFuel: number } | undefined {
  if (!Number.isInteger(looseCells) || looseCells < 0) return undefined;
  if (!Number.isFinite(engineFuel) || engineFuel < FUEL_PER_CELL) return undefined;
  return { looseCells: looseCells + 1, engineFuel: engineFuel - FUEL_PER_CELL };
}

export type FuelTransfer =
  | { readonly ok: true; readonly looseCells: number; readonly engineFuel: number }
  | { readonly ok: false; readonly reason: 'no-cell' | 'no-room' | 'no-fuel' };

/** Pure load: one loose cell -> +FUEL_PER_CELL bunker (docked, engine console). */
export function transferFuelToEngine(
  looseCells: number,
  engineFuel: number,
  engineTier: EngineTier
): FuelTransfer {
  const out = loadFuelCellSafe(looseCells, engineFuel, engineTier);
  if (out === undefined) return { ok: false, reason: looseCells < 1 ? 'no-cell' : 'no-room' };
  return { ok: true, looseCells: out.looseCells, engineFuel: out.engineFuel };
}

/** Pure unload: -FUEL_PER_CELL bunker -> one loose cell. */
export function transferFuelFromEngine(looseCells: number, engineFuel: number): FuelTransfer {
  const out = unloadFuelCellSafe(looseCells, engineFuel);
  if (out === undefined) return { ok: false, reason: 'no-fuel' };
  return { ok: true, looseCells: out.looseCells, engineFuel: out.engineFuel };
}

/**
 * Commit a multi-stop voyage (chart path). New chart rejects surface
 * verbatim; the single-hub wrapper below remaps them to legacy names.
 */
export function plotChartVoyage(
  world: World,
  vesselId: string,
  stops: readonly string[],
  checks: PlotChecks,
  thrust01 = 1
): { world: World; reject?: PlotReject } {
  const ensured = ensureShipSystems(world, vesselId);
  const current = ensured.ships[vesselId];
  if (current === undefined) return { world: ensured };
  const plotted = plotChartCourse(
    current.nav,
    stops,
    checks,
    thrust01,
    current.engineTier,
    ensured.tick * FIXED_DT
  );
  if (!('nav' in plotted)) return { world: ensured, reject: plotted.reject };
  const sailed = { ...current, nav: plotted.nav };
  const committed = {
    ...ensured,
    ships: { ...ensured.ships, [vesselId]: sailed },
  };
  return { world: departVoyage(committed, vesselId, sailed) };
}

export function plotVoyage(
  world: World,
  vesselId: string,
  destHubId: string,
  checks: PlotChecks,
  thrust01 = 1
): { world: World; reject?: PlotReject } {
  const charted = plotChartVoyage(world, vesselId, [destHubId], checks, thrust01);
  if (charted.reject === undefined) return charted;
  if (charted.reject === 'unknown-node') return { ...charted, reject: 'unknown-hub' };
  if (charted.reject === 'same-stop') return { ...charted, reject: 'same-hub' };
  return charted;
}

/** HAIL rescue: start the drone countdown on a flamed-out leg (no-op otherwise). */
export function hailRescueVoyage(world: World, vesselId: string): World {
  return updateSystems(world, vesselId, (systems) => ({
    ...systems,
    nav: hailForRescue(systems.nav),
  }));
}

export function restartShipReactor(world: World, vesselId: string): World {
  return updateSystems(world, vesselId, (systems) => ({
    ...systems,
    reactor: restartReactor(systems.reactor, systems.reactorTier),
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
    next = surveyReachedStop(next, systems.nav, ticked);
  }
  return tickNavVesselMotion(next, dtSeconds);
}

function tickOneVessel(systems: ShipSystems, dtSeconds: number, tick: number): ShipSystems {
  const reactor = tickReactor(systems.reactor, systems.reactorTier, dtSeconds, tick);
  const leg = tickNavLeg(
    systems.nav,
    { hot: reactor.hot, scrammed: reactor.scrammed },
    systems.engineTier,
    systems.engineFuel,
    dtSeconds,
    tick * FIXED_DT
  );
  const condition = applyScramDamage(systems.condition, leg.nav, reactor, dtSeconds);
  if (
    reactor === systems.reactor &&
    leg.nav === systems.nav &&
    leg.engineFuel === systems.engineFuel &&
    condition === systems.condition
  ) {
    return systems;
  }
  return { ...systems, reactor, nav: leg.nav, engineFuel: leg.engineFuel, condition };
}

function applyScramDamage(
  condition: number,
  nav: NavState,
  reactor: ReactorState,
  dtSeconds: number
): number {
  if (!reactor.scrammed || nav.phase !== 'in_transit') return condition;
  if (reactor.scramS <= SCRAM_DAMAGE_GRACE_S) return condition;
  return Math.max(0, condition - SCRAM_DAMAGE_PER_S * dtSeconds);
}

/**
 * Voyage side effects on phase edges: departure seals the dock and the hull
 * eases away (see tickNavVesselMotion, no teleport); arrival glides into the
 * destination mate before the dock unseals.
 */
function applyVoyage(world: World, prev: NavState, next: ShipSystems, vesselId: string): World {
  if (prev.phase === next.nav.phase) return world;
  if (prev.phase === 'docked' && next.nav.phase === 'in_transit') {
    return departVoyage(world, vesselId, next);
  }
  if (prev.phase === 'in_transit' && next.nav.phase === 'docking') {
    return setVesselFrame(world, vesselId, 'inbound', undefined);
  }
  if (prev.phase === 'docking' && next.nav.phase === 'docked') {
    return arriveVoyage(world, vesselId);
  }
  return world;
}

function departVoyage(world: World, vesselId: string, next: ShipSystems): World {
  const sealed = sealDock(world, next.nav.portHubId, false);
  return setVesselFrame(sealed, vesselId, 'in_transit', undefined);
}

function arriveVoyage(world: World, vesselId: string): World {
  return setVesselFrame(world, vesselId, 'docked', undefined);
}

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
 * Station-keeping target for nav-driven vessels: the origin mate while
 * docked/spooling, far holding in transit, and the destination mate on
 * the docking approach. POI stops have no dock, so the hull holds.
 */
function navOriginTarget(world: World, vesselId: string, nav: NavState): Vec2 {
  if (nav.phase === 'in_transit') return { ...SHIP_FAR_ORIGIN };
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

function dockSealed(world: World, dock: DockLink): boolean {
  const leaves = [dock.stationPortal, dock.tubePortal, dock.vesselPortal];
  return leaves.some((id) => world.portals[id]?.state === 'sealed');
}

/** Unseal the current-port dock once the hull sits in the mate. */
function unsealMatedDock(world: World, vesselId: string): World {
  const systems = world.ships[vesselId];
  if (systems === undefined) return world;
  const port = HUB_PORTS[systems.nav.portHubId];
  const dock = port === undefined ? undefined : world.docks[port.dockId];
  if (dock === undefined || !dockSealed(world, dock)) return world;
  return sealDock(world, systems.nav.portHubId, true);
}

function easeNavVessel(world: World, vesselId: string, dtSeconds: number): World {
  if (world.transit[vesselId] !== undefined) return world;
  const systems = world.ships[vesselId];
  const vessel = world.vessels[vesselId];
  if (systems === undefined || vessel === undefined) return world;
  const target = navOriginTarget(world, vesselId, systems.nav);
  const stepped = stepToward(vessel.origin, target, VESSEL_CRUISE_PX_S * dtSeconds);
  let next = setVesselOrigin(world, vesselId, stepped);
  const mated = stepped.x === target.x && stepped.y === target.y;
  if (mated && vessel.schedule === 'docked') next = unsealMatedDock(next, vesselId);
  return next;
}

/**
 * Fly nav-driven boats: ease each solo vessel toward station-keeping so
 * departures pull away and arrivals swing into the mate instead of
 * teleporting. Hire-loop vessels (transit record) keep schedule motion.
 */
export function tickNavVesselMotion(world: World, dtSeconds: number): World {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return world;
  let next = world;
  for (const systems of Object.values(world.ships)) {
    next = easeNavVessel(next, systems.vesselId, dtSeconds);
  }
  return next;
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

/**
 * Fog-of-war discovery: entering a hop surveys its POI stop. Hubs are
 * known by default and repeats are ignored. Survives tows and dockings
 * because only the leg state resets, never the survey list.
 */
function surveyReachedStop(world: World, prev: NavState, ticked: ShipSystems): World {
  if (ticked.nav.legIndex <= prev.legIndex) return world;
  const reached = ticked.nav.stops[ticked.nav.legIndex - 1];
  const node = reached === undefined ? undefined : chartNodeFor(reached);
  if (node === undefined || node.kind !== 'poi') return world;
  if (ticked.surveyed.includes(node.id)) return world;
  return updateSystems(world, ticked.vesselId, (systems) => ({
    ...systems,
    surveyed: [...systems.surveyed, node.id],
  }));
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

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  }
  return hash + 1;
}
