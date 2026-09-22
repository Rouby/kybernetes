import { describe, expect, it } from 'vitest';
import { spawnPawn } from './assemble.js';
import { pawnWorldPos, stepCrossFrame, tryCrossDock } from './dockCrossing.js';
import { buildHarborWorld, buildSoloShipWorld } from './scenarios.js';
import { FUEL_PER_CELL } from './ship/engine.js';
import {
  ensureShipSystems,
  plotVoyage,
  restartShipReactor,
  syncEngineFuel,
} from './ship/systems.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function stationPawnAt(world: World, x: number, y: number): World {
  const pawn = world.pawns.p1;
  if (pawn === undefined) throw new Error('missing pawn');
  return { ...world, pawns: { ...world.pawns, p1: { ...pawn, pos: { x, y } } } };
}

function arriveHubB(): World {
  let world = ensureShipSystems(buildSoloShipWorld(), 'ship');
  world = restartShipReactor(world, 'ship');
  world = syncEngineFuel(world, 'ship', 2 * FUEL_PER_CELL);
  const plotted = plotVoyage(world, 'ship', 'hub_b', {
    hot: true,
    powered: true,
    engineFuel: 2 * FUEL_PER_CELL,
  });
  if (plotted.reject !== undefined) throw new Error('plot rejected: ' + plotted.reject);
  world = plotted.world;
  let guard = 0;
  while (world.ships.ship?.nav.phase !== 'docked' && guard < 600) {
    for (let i = 0; i < 20; i += 1) world = tickWorld(world, 0.05, []);
    guard += 1;
  }
  return world;
}

function spawnWalker(world: World): World {
  return spawnPawn(world, {
    id: 'walker',
    owner: 'u1',
    frameId: 'ship',
    roomId: 'ship.korridor_schiff',
    x: 30,
    y: 340,
    color: '#fff',
  });
}

describe('seamless dock crossing', () => {
  it('preserves world position across the mouth', () => {
    let world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.andock_tube',
      x: 1205,
      y: 260,
      color: '#fff',
    });
    const before = pawnWorldPos(world, world.pawns.p1 as NonNullable<World['pawns'][string]>);
    world = tickWorld(stationPawnAt(world, 1215, 260), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('ship');
    const after = pawnWorldPos(world, world.pawns.p1 as NonNullable<World['pawns'][string]>);
    expect(after.x).toBeCloseTo(before.x + 10, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(world.pawns.p1?.pos).toEqual({ x: 5, y: 340 });
  });

  it('walks back ashore with world position preserved', () => {
    const world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.korridor_schiff',
      x: 5,
      y: 340,
      color: '#fff',
    });
    const shipPawn = world.pawns.p1;
    if (shipPawn === undefined) throw new Error('missing pawn');
    const shipWorld = {
      ...world,
      pawns: { ...world.pawns, p1: { ...shipPawn, pos: { x: 2, y: 340 } } },
    };
    const crossed = tryCrossDock(
      { ...shipWorld, pawns: { ...shipWorld.pawns, p1: { ...shipPawn, pos: { x: -3, y: 340 } } } },
      { ...shipPawn, pos: { x: -3, y: 340 } }
    );
    expect(crossed.frameId).toBe('station');
    expect(crossed.roomHint).toBe('station.andock_tube');
  });

  it('refuses crossing while sealed', () => {
    let world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.andock_tube',
      x: 1205,
      y: 260,
      color: '#fff',
    });
    const vessel = world.vessels.ship;
    if (vessel === undefined) throw new Error('missing ship');
    world = {
      ...world,
      vessels: { ...world.vessels, ship: { ...vessel, schedule: 'departing' } },
    };
    world = tickWorld(stationPawnAt(world, 1215, 260), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('station');
  });

  it('opens the tube leaves on arrival', () => {
    const world = arriveHubB();
    expect(world.ships.ship?.nav.phase).toBe('docked');
    expect(world.portals['hub_b.korridor_ost_andock']?.state).toBe('open');
    expect(world.portals['hub_b.andock_tube_mund']?.state).toBe('open');
    expect(world.portals['ship.schiff_mund']?.state).toBe('open');
  });

  it('walks the crew ashore with no world jump', () => {
    let world = spawnWalker(arriveHubB());
    const input = { pawnId: 'walker', moveX: -1, moveY: 0, sprint: false };
    let prev: { x: number; y: number } | null = null;
    let maxJump = 0;
    for (let t = 0; t < 400; t += 1) {
      world = tickWorld(world, 0.05, [input]);
      const pawn = world.pawns.walker;
      if (pawn === undefined) throw new Error('walker gone');
      const at = pawnWorldPos(world, pawn);
      if (prev !== null) maxJump = Math.max(maxJump, Math.hypot(at.x - prev.x, at.y - prev.y));
      prev = at;
    }
    expect(world.pawns.walker?.frameId).toBe('hub_b');
    expect(maxJump).toBeLessThan(10);
  });

  it('is a no-op without docks', () => {
    const world = buildHarborWorld();
    const empty = { ...world, docks: {} };
    expect(stepCrossFrame(empty)).toBe(empty);
  });

  it('holds vessel pawns outside the mouth aperture', () => {
    const world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.korridor_schiff',
      x: -5,
      y: 305,
      color: '#fff',
    });
    const pawn = world.pawns.p1;
    if (pawn === undefined) throw new Error('missing pawn');
    expect(tryCrossDock(world, pawn).frameId).toBe('ship');
  });
});
