import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { tryToggleDoor } from './doors.js';
import { collidersForFrame } from './movement.js';
import { dropIncapacitatedCrates, pickupCrate, spawnCrate } from './ship/cargo.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function shipWorld(): World {
  const assembled = assembleWorld([
    { frameId: 'ship', hull: HesperiaV2Spec, vessel: { name: 'Hesperia', beacon: 'HESP' } },
  ]);
  return spawnPawn(assembled, {
    id: 'p1',
    owner: 'u1',
    frameId: 'ship',
    roomId: 'ship.korridor_schiff',
    x: 30,
    y: 350,
    color: '#fff',
  });
}

describe('tick allocation trims', () => {
  it('reuses cached frame colliders until portals change', () => {
    const world = shipWorld();
    expect(collidersForFrame(world, 'ship')).toBe(collidersForFrame(world, 'ship'));
    const toggled = tryToggleDoor(world, 'ship.kajute_nord_korridor', true, 0);
    if (!toggled.ok) throw new Error('door should open');
    const opened: World = {
      ...world,
      portals: { ...world.portals, [toggled.portal.id]: toggled.portal },
    };
    expect(collidersForFrame(opened, 'ship')).not.toBe(collidersForFrame(world, 'ship'));
  });

  it('drops newly downed crates without a full resync', () => {
    let world = shipWorld();
    const seeded = spawnCrate(world.cargo, {
      id: 'c1',
      items: [{ goodId: 'scrap', qty: 2 }],
      where: 'shipFloor',
      frameId: 'ship',
      x: 32,
      y: 350,
    });
    if (!seeded.ok) throw new Error('seed failed');
    world = { ...world, cargo: seeded.hold };
    const lifted = pickupCrate(world.cargo, 'c1', 'p1', 'ship', { x: 30, y: 350 });
    if (!lifted.ok) throw new Error('pickup failed');
    world = { ...world, cargo: lifted.hold };
    const pawn = world.pawns.p1;
    if (pawn === undefined) throw new Error('missing pawn');
    const down: World = {
      ...world,
      pawns: { ...world.pawns, p1: { ...pawn, health: { ...pawn.health, incapacitated: true } } },
    };
    const dropped = dropIncapacitatedCrates(down);
    expect(dropped.cargo.crates.c1?.where).toBe('shipFloor');
    expect(dropIncapacitatedCrates(world)).toBe(world);
  });

  it('tracks explored memory for players but not crowds', () => {
    let world = shipWorld();
    const npc = world.pawns.p1;
    if (npc === undefined) throw new Error('missing pawn');
    world = spawnPawn(world, {
      id: 'npc:scout',
      owner: 'npc:scout',
      frameId: 'ship',
      roomId: 'ship.korridor_schiff',
      x: 30,
      y: 350,
      color: '#fff',
    });
    const next = tickWorld(world, 0.05, []);
    expect(next.memory.p1).toContain('ship.korridor_schiff');
    expect(next.memory['npc:scout']).toBeUndefined();
  });
});
