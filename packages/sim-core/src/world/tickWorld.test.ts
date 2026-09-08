import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { destroyPortal, isPortalConnecting, tryToggleDoor } from './doors.js';
import { tickWorld, type WorldInput } from './tickWorld.js';
import { createEmptyWorld, type World } from './types.js';

function shipWorld(): World {
  const assembled = assembleWorld([
    { frameId: 'ship', hull: HesperiaV2Spec, vessel: { name: 'Hesperia', beacon: 'HESP' } },
  ]);
  return spawnPawn(assembled, {
    id: 'p1',
    owner: 'u1',
    frameId: 'ship',
    roomId: 'ship.corridor',
    x: 180,
    y: 360,
    color: '#fff',
  });
}

function drive(world: World, ticks: number, input: WorldInput): World {
  let current = world;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = tickWorld(current, 1 / 20, [input]);
  }
  return current;
}

function withPortal(world: World, portalId: string, opened: boolean): World {
  const toggled = tryToggleDoor(world, portalId, opened, 0);
  if (!toggled.ok) throw new Error(`door toggle failed: ${toggled.reason}`);
  return { ...world, portals: { ...world.portals, [portalId]: toggled.portal } };
}

describe('tickWorld scaffold', () => {
  it('ignores zero dt without NaN', () => {
    const world = createEmptyWorld(0);
    const next = tickWorld(world, 0, []);
    expect(next.tick).toBe(0);
  });

  it('rejects NaN and negative dt without touching state', () => {
    const world = shipWorld();
    expect(tickWorld(world, Number.NaN, []).tick).toBe(world.tick);
    expect(tickWorld(world, -1, []).tick).toBe(world.tick);
  });

  it('never produces NaN from degenerate inputs', () => {
    const world = shipWorld();
    const next = tickWorld(world, 1 / 20, [
      { pawnId: 'p1', moveX: Number.NaN, moveY: Number.NaN, sprint: false },
    ]);
    const pawn = next.pawns.p1;
    expect(Number.isFinite(pawn?.pos.x)).toBe(true);
    expect(Number.isFinite(pawn?.pos.y)).toBe(true);
    expect(Number.isFinite(pawn?.vel.x)).toBe(true);
    expect(Number.isFinite(pawn?.vel.y)).toBe(true);
  });

  it('advances tick on fixed step', () => {
    const world = createEmptyWorld(0);
    const next = tickWorld(world, 1 / 20, []);
    expect(next.tick).toBe(1);
    expect(next.timeMs).toBeCloseTo(50, 5);
  });

  it('integrates pawn input deterministically', () => {
    const world = shipWorld();
    const input: WorldInput = { pawnId: 'p1', moveX: 1, moveY: 0, sprint: false };
    const a = tickWorld(world, 1 / 20, [input]);
    const b = tickWorld(world, 1 / 20, [input]);
    expect(a.pawns.p1?.pos.x).toBe(b.pawns.p1?.pos.x);
    expect(a.pawns.p1?.pos.x ?? 0).toBeGreaterThan(180);
  });
});

describe('tickWorld collision', () => {
  it('stops pawns at compiled walls', () => {
    const world = shipWorld();
    const end = drive(world, 90, { pawnId: 'p1', moveX: -1, moveY: 0, sprint: false });
    expect(end.pawns.p1?.pos.x ?? 0).toBeGreaterThanOrEqual(100 + 12 - 1);
  });

  it('blocks crossing through closed doors', () => {
    const world = shipWorld();
    let minY = Number.POSITIVE_INFINITY;
    let current = world;
    for (let tick = 0; tick < 90; tick += 1) {
      current = tickWorld(current, 1 / 20, [{ pawnId: 'p1', moveX: 0, moveY: -1, sprint: false }]);
      minY = Math.min(minY, current.pawns.p1?.pos.y ?? minY);
    }
    expect(minY).toBeGreaterThan(320 + 12 - 1);
    expect(current.pawns.p1?.roomHint).toBe('ship.corridor');
  });

  it('lets pawns cross opened doors and updates the room hint', () => {
    const world = withPortal(shipWorld(), 'ship.door_bridge', true);
    const end = drive(world, 90, { pawnId: 'p1', moveX: 0, moveY: -1, sprint: false });
    expect(end.pawns.p1?.pos.y ?? 400).toBeLessThan(320);
    expect(end.pawns.p1?.roomHint).toBe('ship.bridge');
  });

  it('lets pawns cross destroyed-to-hole portals', () => {
    const world = shipWorld();
    const portal = world.portals['ship.door_bridge'];
    if (portal === undefined) throw new Error('missing door_bridge');
    const destroyed = destroyPortal(portal, world.tick);
    expect(isPortalConnecting(destroyed)).toBe(true);
    const breached = { ...world, portals: { ...world.portals, [destroyed.id]: destroyed } };
    const end = drive(breached, 90, { pawnId: 'p1', moveX: 0, moveY: -1, sprint: false });
    expect(end.pawns.p1?.roomHint).toBe('ship.bridge');
  });
});

describe('tickWorld doors and cooldown', () => {
  it('enforces the toggle cooldown across ticks', () => {
    const world = shipWorld();
    const openedWorld = withPortal(world, 'ship.door_bridge', true);
    expect(openedWorld.portals['ship.door_bridge']?.state).toBe('open');
    const repeat = tryToggleDoor(openedWorld, 'ship.door_bridge', false, 0);
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.reason).toBe('cooldown');
    const aged = drive(openedWorld, 24, {
      pawnId: 'nobody',
      moveX: 0,
      moveY: 0,
      sprint: false,
    });
    expect(tryToggleDoor(aged, 'ship.door_bridge', false, 0).ok).toBe(true);
  });
});

describe('tickWorld frame carry', () => {
  it('carries pawns with a moving vessel without drift', () => {
    const world = shipWorld();
    const vessel = world.vessels.ship;
    if (vessel === undefined) throw new Error('missing vessel');
    const moving: World = {
      ...world,
      vessels: { ...world.vessels, ship: { ...vessel, vel: { x: 50, y: 0 } } },
    };
    const before = moving.pawns.p1;
    const after = tickWorld(moving, 1 / 20, []);
    const afterVessel = after.vessels.ship;
    if (before === undefined || afterVessel === undefined)
      throw new Error('missing pawn or vessel');
    const pawnDx = (after.pawns.p1?.pos.x ?? 0) - before.pos.x;
    const frameDx = afterVessel.origin.x - vessel.origin.x;
    expect(pawnDx).toBe(frameDx);
    expect(pawnDx).toBeCloseTo(2.5, 5);
  });
});
