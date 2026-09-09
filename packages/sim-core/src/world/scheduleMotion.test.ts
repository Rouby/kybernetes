import { describe, expect, it } from 'vitest';
import { spawnPawn } from './assemble.js';
import { collidersForFrame } from './movement.js';
import { buildHarborWorld, HARBOR_DOCK } from './scenarios.js';
import {
  dockLinkForPortal,
  isDockGateWalkable,
  originTargetFor,
  SHIP_ORIGIN,
  tickVesselMotion,
  VESSEL_CRUISE_PX_S,
} from './schedule.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function stationPawn(world: World, x: number, y: number): World {
  const pawn = world.pawns.p1;
  if (pawn === undefined) throw new Error('missing pawn');
  return { ...world, pawns: { ...world.pawns, p1: { ...pawn, pos: { x, y } } } };
}

function shipScheduled(
  world: ReturnType<typeof buildHarborWorld>,
  schedule: 'docked' | 'departing' | 'in_transit' | 'inbound'
) {
  const vessel = world.vessels.ship;
  if (vessel === undefined) throw new Error('missing ship');
  return { ...world, vessels: { ...world.vessels, ship: { ...vessel, schedule } } };
}

describe('vessel docking motion', () => {
  it('holds the docked origin while docked', () => {
    const world = buildHarborWorld();
    expect(world.vessels.ship?.origin).toEqual({ ...SHIP_ORIGIN });
    expect(originTargetFor('docked')).toEqual({ ...SHIP_ORIGIN });
    expect(originTargetFor('boarding_closing')).toEqual({ ...SHIP_ORIGIN });
    expect(tickVesselMotion(world, 1)).toBe(world);
  });

  it('parks far off-station while in transit', () => {
    expect(originTargetFor('in_transit').x).toBeGreaterThan(SHIP_ORIGIN.x + 1000);
    expect(originTargetFor('departing').x).toBeGreaterThan(SHIP_ORIGIN.x);
    expect(originTargetFor('inbound')).toEqual({ ...SHIP_ORIGIN });
  });

  it('eases toward the phase target at cruise speed', () => {
    const world = shipScheduled(buildHarborWorld(), 'in_transit');
    const before = world.vessels.ship?.origin ?? { x: 0, y: 0 };
    const moved = tickVesselMotion(world, 1);
    const after = moved.vessels.ship?.origin ?? { x: 0, y: 0 };
    const sailed = Math.hypot(after.x - before.x, after.y - before.y);
    expect(sailed).toBeCloseTo(VESSEL_CRUISE_PX_S, 0);
    expect(after.x).toBeGreaterThan(before.x);
    // Snaps instead of orbiting once inside a pixel.
    const docked = tickVesselMotion(shipScheduled(buildHarborWorld(), 'docked'), 1);
    expect(docked.vessels.ship?.origin).toEqual({ ...SHIP_ORIGIN });
  });

  it('flips frames at the mated mouth with world position preserved', () => {
    let world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.andock_a',
      x: 1060,
      y: 260,
      color: '#fff',
    });
    // Mid-spine and tube strolls never flip before the mouth line.
    world = tickWorld(stationPawn(world, 970, 260), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('station');
    world = tickWorld(stationPawn(world, 1125, 260), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('station');
    world = tickWorld(stationPawn(world, 1205, 260), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('station');
    expect(world.pawns.p1?.roomHint).toBe('station.andock_tube');
    // A stride past the mouth (world x >= 1210) re-bases the same world
    // point into the ship: world position never jumps.
    world = tickWorld(stationPawn(world, 1215, 260), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('ship');
    expect(world.pawns.p1?.pos).toEqual({ x: 5, y: 340 });
    expect(world.pawns.p1?.roomHint).toBe('ship.korridor_schiff');
  });

  it('holds shut colliders off walkable dock leaves', () => {
    const world = buildHarborWorld();
    expect(dockLinkForPortal(world, 'ship.schiff_mund')?.id).toBe('harbor');
    expect(dockLinkForPortal(world, 'ship.bruecke_korridor')).toBeUndefined();
    expect(isDockGateWalkable(world, 'ship.schiff_mund')).toBe(true);
    expect(isDockGateWalkable(world, 'station.korridor_ost_andock')).toBe(true);
    const colliders = collidersForFrame(world, 'ship');
    expect(colliders.some((wall) => wall.id === 'portal-shut.ship.schiff_mund')).toBe(false);
    expect(colliders.some((wall) => wall.id === 'portal-shut.ship.bruecke_korridor')).toBe(true);
  });

  it('mates the corridor mouth with the tube at the docked origin', () => {
    // Mouth local (0, 340) rides to world (1210, 260): flush with the tube
    // east face, level with its axis for a seamless walk.
    const mouthWorld = { x: SHIP_ORIGIN.x + 0, y: SHIP_ORIGIN.y + 340 };
    expect(mouthWorld.x).toBe(1210);
    expect(mouthWorld.y).toBe(260);
    expect(HARBOR_DOCK.mouthWorld).toEqual({ x1: 1210, y1: 240, x2: 1210, y2: 280 });
    expect(HARBOR_DOCK.tubeRoom).toBe('station.andock_tube');
  });
});
