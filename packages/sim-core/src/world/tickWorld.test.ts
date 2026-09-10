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
    roomId: 'ship.kajute_nord',
    x: 140,
    y: 200,
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
    expect(a.pawns.p1?.pos.x ?? 0).toBeGreaterThan(140);
  });

  it('drags a carried crate along a walking pawn and drops it at the hands', async () => {
    const cargo = await import('./ship/cargo.js');
    let world = shipWorld();
    const seeded = cargo.spawnCrate(cargo.emptyCargo(), {
      id: 'c1',
      goodId: 'scrap',
      qty: 2,
      where: 'shipFloor',
      frameId: 'ship',
      x: 150,
      y: 200,
    });
    if (!seeded.ok) throw new Error('seed failed');
    world = { ...world, cargo: seeded.hold };
    const lifted = cargo.pickupCrate(world.cargo, 'c1', 'p1', 'ship', { x: 140, y: 200 });
    if (!lifted.ok) throw new Error('pickup failed');
    world = { ...world, cargo: lifted.hold };
    const walked = drive(world, 40, { pawnId: 'p1', moveX: 1, moveY: 0, sprint: false });
    const pawn = walked.pawns.p1;
    const crate = walked.cargo.crates.c1;
    if (pawn === undefined || crate === undefined) throw new Error('missing pawn/crate');
    expect(pawn.pos.x).toBeGreaterThan(200);
    const hands = cargo.handsPosFor(pawn.pos, pawn.facing);
    expect(crate.x).toBeCloseTo(hands.x, 6);
    expect(crate.y).toBeCloseTo(hands.y, 6);
    const dropped = cargo.dropCrate(walked.cargo, 'p1', 'ship', crate.x, crate.y, 'shipFloor');
    if (!dropped.ok) throw new Error('drop failed');
    expect(dropped.hold.crates.c1?.x).toBeCloseTo(hands.x, 6);
    expect(dropped.hold.crates.c1?.where).toBe('shipFloor');
  });

  it('stops the pawn on the first tick without input', () => {
    const input: WorldInput = { pawnId: 'p1', moveX: 1, moveY: 0, sprint: false };
    const cruising = drive(shipWorld(), 20, input);
    expect(cruising.pawns.p1?.vel.x ?? 0).toBeGreaterThan(0);
    const stopped = tickWorld(cruising, 1 / 20, []);
    expect(stopped.pawns.p1?.vel).toEqual({ x: 0, y: 0 });
    expect(stopped.pawns.p1?.pos).toEqual(cruising.pawns.p1?.pos);
    const settled = tickWorld(stopped, 1 / 20, []);
    expect(settled.pawns.p1?.pos).toEqual(cruising.pawns.p1?.pos);
  });
});

describe('tickWorld collision', () => {
  it('stops pawns at compiled walls', () => {
    const world = shipWorld();
    const end = drive(world, 90, { pawnId: 'p1', moveX: -1, moveY: 0, sprint: false });
    expect(end.pawns.p1?.pos.x ?? 0).toBeGreaterThanOrEqual(60 + 12 - 1);
  });

  it('blocks crossing through closed doors', () => {
    const world = shipWorld();
    let minX = Number.POSITIVE_INFINITY;
    let current = world;
    for (let tick = 0; tick < 90; tick += 1) {
      current = tickWorld(current, 1 / 20, [{ pawnId: 'p1', moveX: -1, moveY: 0, sprint: false }]);
      minX = Math.min(minX, current.pawns.p1?.pos.x ?? minX);
    }
    expect(minX).toBeGreaterThan(60 + 12 - 1);
    expect(current.pawns.p1?.roomHint).toBe('ship.kajute_nord');
  });

  it('lets pawns cross opened doors and updates the room hint', () => {
    const world = withPortal(shipWorld(), 'ship.kajute_nord_korridor', true);
    const end = drive(world, 90, { pawnId: 'p1', moveX: -1, moveY: 0, sprint: false });
    expect(end.pawns.p1?.pos.x ?? 100).toBeLessThan(60);
    expect(end.pawns.p1?.roomHint).toBe('ship.korridor_schiff');
  });

  it('lets pawns cross destroyed-to-hole portals', () => {
    const world = shipWorld();
    const portal = world.portals['ship.kajute_nord_korridor'];
    if (portal === undefined) throw new Error('missing kajute_nord_korridor');
    const destroyed = destroyPortal(portal, world.tick);
    expect(isPortalConnecting(destroyed)).toBe(true);
    const breached = { ...world, portals: { ...world.portals, [destroyed.id]: destroyed } };
    const end = drive(breached, 90, { pawnId: 'p1', moveX: -1, moveY: 0, sprint: false });
    expect(end.pawns.p1?.roomHint).toBe('ship.korridor_schiff');
  });
});

describe('tickWorld doors and cooldown', () => {
  it('enforces the toggle cooldown across ticks', () => {
    const world = shipWorld();
    const openedWorld = withPortal(world, 'ship.kajute_nord_korridor', true);
    expect(openedWorld.portals['ship.kajute_nord_korridor']?.state).toBe('open');
    const repeat = tryToggleDoor(openedWorld, 'ship.kajute_nord_korridor', false, 0);
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.reason).toBe('cooldown');
    const aged = drive(openedWorld, 24, {
      pawnId: 'nobody',
      moveX: 0,
      moveY: 0,
      sprint: false,
    });
    expect(tryToggleDoor(aged, 'ship.kajute_nord_korridor', false, 0).ok).toBe(true);
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
