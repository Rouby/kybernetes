import { describe, expect, it } from 'vitest';
import { dockWalkable } from '../dockStatus.js';
import { buildSoloShipWorld } from '../scenarios.js';
import { SHIP_FAR_ORIGIN, SHIP_ORIGIN } from '../schedule.js';
import { createEmptyWorld, type VesselFrame, type World } from '../types.js';
import {
  defaultShipSystems,
  ensureShipSystems,
  plotVoyage,
  restartShipReactor,
  syncShipStores,
  syncShipTiers,
  tickShipSystems,
  tuneShipEngine,
  tuneShipReactor,
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

  it('syncs tiers and applies console actions', () => {
    let world = ensureShipSystems(vesselWorld(), 'ship');
    world = syncShipTiers(world, 'ship', 1, 1);
    expect(world.ships.ship?.reactorTier).toBe(1);
    expect(world.ships.ship?.engineTier).toBe(1);
    world = tuneShipReactor(world, 'ship', 0.2, -0.1);
    expect(world.ships.ship?.reactor.rods).toBeCloseTo(0.5, 6);
    world = restartShipReactor(world, 'ship');
    expect(world.ships.ship?.reactor.hot).toBe(true);
    world = tuneShipEngine(world, 'ship', 1, 0.8);
    expect(world.ships.ship?.engine.spoolCmd).toBe(1);
    expect(world.ships.ship?.engine.tune).toBe(0.8);
    expect(tuneShipEngine(world, 'ghost', 1)).toBe(world);
  });

  it('leaves cold docked ships alone across long ticks', () => {
    const world = tickMany(ensureShipSystems(vesselWorld(), 'ship'), 120);
    expect(world.ships.ship?.reactor.warned).toBe(false);
    expect(world.ships.ship?.reactor.scrammed).toBe(false);
    expect(world.ships.ship?.condition).toBe(100);
  });

  it('spoils a hot spool into brownout-free cruise, then scrams to blackout', () => {
    let world = ensureShipSystems(vesselWorld(), 'ship');
    world = restartShipReactor(world, 'ship');
    world = tuneShipEngine(world, 'ship', 1);
    world = tickMany(world, 10);
    expect(world.ships.ship?.engine.spool ?? 0).toBeGreaterThan(0.9);
    expect(world.ships.ship?.engine.brownout).toBe(false);
    world = tuneShipReactor(world, 'ship', -1, -1);
    world = tickMany(world, 30);
    expect(world.ships.ship?.reactor.scrammed).toBe(true);
    const stalled = tickMany(world, 10);
    expect(stalled.ships.ship?.engine.spool ?? 1).toBeLessThan(0.5);
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
        extraBurned: true,
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
    return tuneShipEngine(world, 'ship', 1, 1);
  }

  function steadyTrim(world: World): World {
    const tempK = world.ships.ship?.reactor.tempK ?? 660;
    if (tempK > 690) return tuneShipReactor(world, 'ship', 0.1, 0.1);
    if (tempK < 630) return tuneShipReactor(world, 'ship', -0.1, -0.1);
    return world;
  }

  function driveAttentive(world: World, seconds: number): World {
    let current = world;
    const ticks = Math.round(seconds / DT);
    for (let i = 0; i < ticks; i += 1) {
      if (i % 20 === 0) {
        current = steadyTrim(current);
        current = tuneShipEngine(current, 'ship', 1, 1);
      }
      current = tickShipSystems(current, DT);
    }
    return current;
  }

  function plotToHubB(world: World): World {
    const plotted = plotVoyage(world, 'ship', 'hub_b', { hot: true, powered: true, fuelCells: 1 });
    if (plotted.reject !== undefined) throw new Error(`plot rejected: ${plotted.reject}`);
    return plotted.world;
  }

  it('rejects plots with named reasons through the world wrapper', () => {
    const world = hotBoat();
    expect(
      plotVoyage(world, 'ship', 'nowhere', { hot: true, powered: true, fuelCells: 1 }).reject
    ).toBe('unknown-hub');
    const ghost = plotVoyage(world, 'ghost', 'hub_b', { hot: true, powered: true, fuelCells: 1 });
    expect(ghost.world).toBe(world);
    expect(ghost.reject).toBeUndefined();
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
    expect(world.ships.ship?.engine.wear).toBeCloseTo(0.15, 6);
    expect(world.ships.ship?.fuelCells).toBe(0);
  });

  it('flies straight back: two consecutive legs end home', () => {
    let world = driveAttentive(plotToHubB(hotBoat()), 212);
    expect(world.ships.ship?.nav.portHubId).toBe('hub_b');
    world = syncShipStores(world, 'ship', 1);
    const back = plotVoyage(world, 'ship', 'hub_a', { hot: true, powered: true, fuelCells: 1 });
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
    world = tuneShipReactor(world, 'ship', -1, -1);
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
