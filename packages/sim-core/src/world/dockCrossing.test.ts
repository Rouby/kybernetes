import { describe, expect, it } from 'vitest';
import { spawnPawn } from './assemble.js';
import { pawnWorldPos, stepCrossFrame, tryCrossDock } from './dockCrossing.js';
import { buildHarborWorld } from './scenarios.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function stationPawnAt(world: World, x: number, y: number): World {
  const pawn = world.pawns.p1;
  if (pawn === undefined) throw new Error('missing pawn');
  return { ...world, pawns: { ...world.pawns, p1: { ...pawn, pos: { x, y } } } };
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

  it('is a no-op without docks', () => {
    const world = buildHarborWorld();
    const empty = { ...world, docks: {} };
    expect(stepCrossFrame(empty)).toBe(empty);
  });
});
