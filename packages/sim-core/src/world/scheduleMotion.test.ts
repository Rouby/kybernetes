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

  it('flips frames at the gate leaves with stride-scale pops', () => {
    let world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.gauntlet',
      x: 950,
      y: 200,
      color: '#fff',
    });
    // Mid-bay strolls never trigger the leaves.
    world = tickWorld(stationPawn(world, 800, 200), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('station');
    // At the east leaf the flip lands a stride inside the ramp mouth.
    world = tickWorld(stationPawn(world, 1005, 200), 0.05, []);
    expect(world.pawns.p1?.frameId).toBe('ship');
    expect(world.pawns.p1?.pos).toEqual({ ...HARBOR_DOCK.vesselEgress });
  });

  it('holds shut colliders off walkable dock leaves', () => {
    const world = buildHarborWorld();
    expect(dockLinkForPortal(world, 'ship.ship_mouth')?.id).toBe('harbor');
    expect(dockLinkForPortal(world, 'ship.door_bridge')).toBeUndefined();
    expect(isDockGateWalkable(world, 'ship.ship_mouth')).toBe(true);
    expect(isDockGateWalkable(world, 'station.bay_gauntlet')).toBe(true);
    const colliders = collidersForFrame(world, 'ship');
    expect(colliders.some((wall) => wall.id === 'portal-shut.ship.ship_mouth')).toBe(false);
    expect(colliders.some((wall) => wall.id.startsWith('portal-shut.ship.door_'))).toBe(true);
  });

  it('mates the stern ramp with the gauntlet at the docked origin', () => {
    // Mouth local (100, 360) rides to world (1090, 200): a 70px umbilical
    // off the gauntlet east face, level with its axis.
    const mouthWorld = { x: SHIP_ORIGIN.x + 100, y: SHIP_ORIGIN.y + 360 };
    expect(mouthWorld.x).toBe(1090);
    expect(mouthWorld.y).toBe(200);
  });
});
