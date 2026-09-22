import { describe, expect, it } from 'vitest';
import { dockWalkable } from '../dockStatus.js';
import { buildSoloShipWorld } from '../scenarios.js';
import { SHIP_FAR_ORIGIN, SHIP_ORIGIN } from '../schedule.js';
import { createEmptyWorld, type VesselFrame, type World } from '../types.js';
import { FUEL_PER_CELL } from './engine.js';
import {
  defaultShipSystems,
  ensureShipSystems,
  plotChartVoyage,
  plotVoyage,
  restartShipReactor,
  syncEngineFuel,
  syncShipTiers,
  tickShipSystems,
} from './systems.js';

const DT = 0.05;

function vesselWorld(): World {
  const frame: VesselFrame = {
    id: 'ship',
    name: 'Skiff',
    beacon: 'SKIFF',
    origin: { x: 0, y: 0 },
    angle: 0,
    vel: { x: 0, y: 0 },
    angVel: 0,
    schedule: 'docked',
  };
  return { ...createEmptyWorld(0), vessels: { ship: frame } };
}

function tickMany(world: World, seconds: number): World {
  let current = world;
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i += 1) {
    current = tickShipSystems(current, DT);
  }
  return current;
}

describe('ship systems (M2 container tick)', () => {
  it('ensures cold T0 docked systems idempotently', () => {
    const world = ensureShipSystems(vesselWorld(), 'ship');
    const systems = world.ships.ship;
    expect(systems?.reactor.hot).toBe(false);
    expect(systems?.condition).toBe(100);
    expect(systems?.nav.phase).toBe('docked');
    expect(ensureShipSystems(world, 'ship')).toBe(world);
    expect(ensureShipSystems(world, 'ghost')).toBe(world);
  });

  it('syncs tiers and lights the reactor', () => {
    let world = ensureShipSystems(vesselWorld(), 'ship');
    world = syncShipTiers(world, 'ship', 1, 1);
    expect(world.ships.ship?.reactorTier).toBe(1);
    expect(world.ships.ship?.engineTier).toBe(1);
    world = restartShipReactor(world, 'ship');
    expect(world.ships.ship?.reactor.hot).toBe(true);
    expect(restartShipReactor(world, 'ghost')).toBe(world);
  });

  it('leaves cold docked ships alone across long ticks', () => {
    const world = tickMany(ensureShipSystems(vesselWorld(), 'ship'), 120);
    expect(world.ships.ship?.reactor.warned).toBe(false);
    expect(world.ships.ship?.reactor.scrammed).toBe(false);
    expect(world.ships.ship?.condition).toBe(100);
  });

  it('runs a lit reactor hot without operator trims', () => {
    let world = ensureShipSystems(vesselWorld(), 'ship');
    world = restartShipReactor(world, 'ship');
    world = tickMany(world, 10);
    expect(world.ships.ship?.reactor.hot).toBe(true);
    expect(world.ships.ship?.reactor.scrammed).toBe(false);
    expect(world.ships.ship?.condition).toBe(100);
  });

  it('damages the hull only for scrammed transit past grace, floored at zero', () => {
    let world = ensureShipSystems(vesselWorld(), 'ship');
    world = restartShipReactor(world, 'ship');
    const base = world.ships.ship;
    if (base === undefined) throw new Error('missing ship systems');
    const scrammed = {
      ...base,
      reactor: { ...base.reactor, scrammed: true, scramS: 31 },
      nav: {
        phase: 'in_transit' as const,
        destHubId: 'hub_b',
        remainingS: 90,
        legId: 1,
        portHubId: 'hub_a',
        flameout: false,
        hailS: 0,
        stops: ['hub_b'],
        legIndex: 0,
      },
    };
    const underway = { ...world, ships: { ...world.ships, ship: scrammed } };
    expect(tickMany(underway, 20).ships.ship?.condition).toBeCloseTo(60, 0);
    const dockedScram = {
      ...underway,
      ships: {
        ...underway.ships,
        ship: {
          ...scrammed,
          nav: { ...scrammed.nav, phase: 'docked' as const, destHubId: undefined, remainingS: 0 },
        },
      },
    };
    expect(tickMany(dockedScram, 20).ships.ship?.condition).toBe(100);
    const fresh = tickMany(underway, 400);
    expect(fresh.ships.ship?.condition).toBe(0);
  });

  it('ignores invalid ticks and keeps the default record shape', () => {
    const world = ensureShipSystems(vesselWorld(), 'ship');
    expect(tickShipSystems(world, 0)).toBe(world);
    expect(defaultShipSystems('ship').vesselId).toBe('ship');
  });
});

describe('voyage side effects (M3 abstract transit)', () => {
  function hotBoat(): World {
    let world = ensureShipSystems(buildSoloShipWorld(), 'ship');
    world = restartShipReactor(world, 'ship');
    return world;
  }

  function driveAttentive(world: World, seconds: number): World {
    let current = world;
    const ticks = Math.round(seconds / DT);
    for (let i = 0; i < ticks; i += 1) {
      current = tickShipSystems(current, DT);
    }
    return current;
  }

  function plotToHubB(world: World): World {
    const fueled = syncEngineFuel(world, 'ship', 2 * FUEL_PER_CELL);
    const plotted = plotVoyage(fueled, 'ship', 'hub_b', {
      hot: true,
      powered: true,
      engineFuel: 2 * FUEL_PER_CELL,
    });
    if (plotted.reject !== undefined) throw new Error(`plot rejected: ${plotted.reject}`);
    return plotted.world;
  }

  it('rejects plots with named reasons through the world wrapper', () => {
    const world = hotBoat();
    expect(
      plotVoyage(world, 'ship', 'nowhere', { hot: true, powered: true, engineFuel: FUEL_PER_CELL })
        .reject
    ).toBe('unknown-hub');
    const ghost = plotVoyage(world, 'ghost', 'hub_b', {
      hot: true,
      powered: true,
      engineFuel: FUEL_PER_CELL,
    });
    expect(ghost.world).toBe(world);
    expect(ghost.reject).toBeUndefined();
  });

  it('commits multi-stop chains and remaps legacy hub rejects', () => {
    const world = hotBoat();
    const checks = { hot: true, powered: true, engineFuel: 2 * FUEL_PER_CELL };
    const chain = plotChartVoyage(world, 'ship', ['poi_kestrel', 'hub_b'], checks);
    expect(chain.reject).toBeUndefined();
    expect(chain.world.ships.ship?.nav.stops).toEqual(['poi_kestrel', 'hub_b']);
    expect(chain.world.ships.ship?.nav.destHubId).toBe('hub_b');
    expect(plotChartVoyage(world, 'ship', [], checks).reject).toBe('empty-voyage');
    const visit = plotChartVoyage(world, 'ship', ['poi_kestrel'], checks);
    expect(visit.reject).toBeUndefined();
    expect(visit.world.ships.ship?.nav.destHubId).toBe('poi_kestrel');
    expect(visit.world.ships.ship?.nav.portHubId).toBe('hub_a');
  });

  it('flies a POI detour chain to hub_b on two cells', { timeout: 30000 }, () => {
    const fueled = syncEngineFuel(hotBoat(), 'ship', 2 * FUEL_PER_CELL);
    const chain = plotChartVoyage(fueled, 'ship', ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: 2 * FUEL_PER_CELL,
    });
    if (chain.reject !== undefined) throw new Error(`chain rejected: ${chain.reject}`);
    let world = driveAttentive(chain.world, 12);
    expect(world.ships.ship?.nav.phase).toBe('in_transit');
    expect(world.ships.ship?.nav.legIndex).toBe(0);
    world = driveAttentive(world, 260);
    expect(world.ships.ship?.nav.phase).toBe('docked');
    expect(world.ships.ship?.nav.portHubId).toBe('hub_b');
    expect(world.ships.ship?.nav.stops).toEqual([]);
  });

  it('surveys POI flybys and keeps them across the voyage', { timeout: 30000 }, () => {
    const fueled = syncEngineFuel(hotBoat(), 'ship', 2 * FUEL_PER_CELL);
    const chain = plotChartVoyage(fueled, 'ship', ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: 2 * FUEL_PER_CELL,
    });
    if (chain.reject !== undefined) throw new Error(`chain rejected: ${chain.reject}`);
    expect(chain.world.ships.ship?.surveyed).toEqual([]);
    const surveyed = driveAttentive(chain.world, 55);
    expect(surveyed.ships.ship?.nav.legIndex).toBe(1);
    expect(surveyed.ships.ship?.surveyed).toEqual(['poi_kestrel']);
    const arrived = driveAttentive(chain.world, 280);
    expect(arrived.ships.ship?.nav.phase).toBe('docked');
    expect(arrived.ships.ship?.surveyed).toEqual(['poi_kestrel']);
  });

  it('eases away on departure instead of teleporting', { timeout: 30000 }, () => {
    let world = plotToHubB(hotBoat());
    let guard = 0;
    while (world.ships.ship?.nav.phase !== 'in_transit' && guard < 60) {
      world = driveAttentive(world, 1);
      guard += 1;
    }
    expect(world.ships.ship?.nav.phase).toBe('in_transit');
    world = driveAttentive(world, 1);
    expect(world.vessels.ship?.schedule).toBe('in_transit');
    const origin = world.vessels.ship?.origin ?? { x: 0, y: 0 };
    expect(origin.x).toBeGreaterThan(SHIP_ORIGIN.x);
    expect(origin.x).toBeLessThan(SHIP_FAR_ORIGIN.x);
    expect(dockWalkable(world, 'harbor')).toBe(false);
  });

  it('glides into the destination mate before unsealing', { timeout: 30000 }, () => {
    let world = plotToHubB(hotBoat());
    let guard = 0;
    while (world.ships.ship?.nav.phase !== 'docked' && guard < 300) {
      world = driveAttentive(world, 1);
      guard += 1;
    }
    expect(world.ships.ship?.nav.phase).toBe('docked');
    expect(world.ships.ship?.nav.portHubId).toBe('hub_b');
    expect(dockWalkable(world, 'hub_b_harbor')).toBe(false);
    const enRoute = world.vessels.ship?.origin ?? { x: 0, y: 0 };
    expect(Math.hypot(enRoute.x - 1210, enRoute.y - 3920)).toBeGreaterThan(1);
    world = driveAttentive(world, 20);
    expect(world.vessels.ship?.origin).toEqual({ x: 1210, y: 3920 });
    expect(dockWalkable(world, 'hub_b_harbor')).toBe(true);
  });

  it('flies a full leg: seal, depart far, dock at hub_b', () => {
    let world = driveAttentive(plotToHubB(hotBoat()), 12);
    expect(world.ships.ship?.nav.phase).toBe('in_transit');
    expect(world.vessels.ship?.schedule).toBe('in_transit');
    expect(world.vessels.ship?.origin).toEqual({ ...SHIP_FAR_ORIGIN });
    expect(dockWalkable(world, 'harbor')).toBe(false);
    world = driveAttentive(world, 200);
    expect(world.ships.ship?.nav.phase).toBe('docked');
    expect(world.ships.ship?.nav.portHubId).toBe('hub_b');
    expect(world.vessels.ship?.schedule).toBe('docked');
    expect(world.vessels.ship?.origin).toEqual({ x: 1210, y: 3920 });
    expect(dockWalkable(world, 'hub_b_harbor')).toBe(true);
    expect(dockWalkable(world, 'harbor')).toBe(false);
    expect(world.ships.ship?.engineFuel ?? 0).toBeLessThan(2 * FUEL_PER_CELL);
  });

  it('flies straight back: two consecutive legs end home', () => {
    let world = driveAttentive(plotToHubB(hotBoat()), 212);
    expect(world.ships.ship?.nav.portHubId).toBe('hub_b');
    world = syncEngineFuel(world, 'ship', FUEL_PER_CELL);
    const back = plotVoyage(world, 'ship', 'hub_a', {
      hot: true,
      powered: true,
      engineFuel: FUEL_PER_CELL,
    });
    if (back.reject !== undefined) throw new Error(`return plot rejected: ${back.reject}`);
    world = driveAttentive(back.world, 212);
    expect(world.ships.ship?.nav.phase).toBe('docked');
    expect(world.ships.ship?.nav.portHubId).toBe('hub_a');
    expect(world.ships.ship?.nav.legId).toBe(2);
    expect(world.vessels.ship?.origin).toEqual({ ...SHIP_ORIGIN });
    expect(dockWalkable(world, 'harbor')).toBe(true);
    expect(dockWalkable(world, 'hub_b_harbor')).toBe(false);
  });

  it('kills a totally neglected transit through the scram ladder', () => {
    let world = driveAttentive(plotToHubB(hotBoat()), 12);
    expect(world.ships.ship?.nav.phase).toBe('in_transit');
    const ship = world.ships.ship;
    if (ship === undefined) throw new Error('missing ship systems');
    const scrammed = { ...ship, reactor: { ...ship.reactor, scrammed: true, scramS: 0 } };
    world = { ...world, ships: { ...world.ships, ship: scrammed } };
    let guard = 0;
    while ((world.ships.ship?.condition ?? 0) > 0 && guard < Math.round(400 / DT)) {
      world = tickShipSystems(world, DT);
      guard += 1;
    }
    expect(world.ships.ship?.condition).toBe(0);
    expect(world.ships.ship?.reactor.scrammed).toBe(true);
    expect(world.ships.ship?.nav.phase).toBe('in_transit');
  });
});
