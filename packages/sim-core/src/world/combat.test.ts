import { describe, expect, it } from 'vitest';
import {
  bindAirFrame,
  createAirAuthority,
  readAllAir,
  stepAirAuthority,
  ventedRooms,
} from './airAuthority.js';
import { assembleWorld, spawnPawn } from './assemble.js';
import { applyDamage, fireWeapon, weaponDamage } from './combat.js';
import { isPortalConnecting } from './doors.js';
import type { HullSpec } from './hullCompiler.js';
import type { World } from './types.js';

const DOUBLE_SPEC: HullSpec = {
  frameId: 'box',
  rooms: [
    { id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 100 },
    { id: 'b', rect: { x: 100, y: 0, w: 100, h: 100 }, volumeM3: 100 },
  ],
  portals: [
    {
      id: 'door_ab',
      roomA: 'a',
      roomB: 'b',
      kind: 'door',
      segment: { x1: 100, y1: 40, x2: 100, y2: 60 },
      areaM2: 2,
    },
  ],
};

const SOLO_SPEC: HullSpec = {
  frameId: 'solo',
  rooms: [{ id: 'cabin', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 100 }],
  portals: [],
};

function spawnAt(
  world: World,
  id: string,
  frameId: string,
  roomId: string,
  x: number,
  y: number
): World {
  return spawnPawn(world, { id, owner: id, frameId, roomId, x, y, color: '#fff' });
}

describe('combat fire', () => {
  it('misses with bad shooters and empty sky', () => {
    const world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      50
    );
    expect(fireWeapon(world, 'ghost', 0, 'rifle').result).toEqual({ kind: 'miss' });
    expect(fireWeapon(world, 'p1', Number.NaN, 'rifle').result).toEqual({ kind: 'miss' });
    expect(weaponDamage('arc_welder')).toBe(15);
    expect(weaponDamage('kinetic_carbine')).toBe(25);
  });

  it('wounds pawns with hp-only resolution and bleeding', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      50
    );
    world = spawnAt(world, 'p2', 'box', 'box.a', 60, 50);
    const limbs = [{ limb: 'arm', hp: 50 }];
    const organs = [{ organ: 'heart', hp: 90 }];
    const target = world.pawns.p2;
    if (target === undefined) throw new Error('missing target');
    world = {
      ...world,
      pawns: { ...world.pawns, p2: { ...target, health: { ...target.health, limbs, organs } } },
    };
    const { world: after, result } = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
    expect(result).toEqual({ kind: 'pawn', targetId: 'p2' });
    expect(after.pawns.p2?.health.hp).toBe(75);
    expect(after.pawns.p2?.health.limbs).toEqual(limbs);
    expect(after.pawns.p2?.health.organs).toEqual(organs);
    expect(after.vitals.p2?.bleedoutS).toBe(20);
  });

  it('clamps damage without touching the limb seam', () => {
    const world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      50
    );
    const pawn = world.pawns.p1;
    if (pawn === undefined) throw new Error('missing shooter');
    expect(
      applyDamage(pawn, { force: 999, materialK: 1, materialE: 0, point: { x: 0, y: 0 } }).health.hp
    ).toBe(0);
    expect(
      applyDamage(pawn, { force: -5, materialK: 1, materialE: 0, point: { x: 0, y: 0 } }).health.hp
    ).toBe(100);
  });

  it('shoots doors into connecting holes over four hits', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      50
    );
    const kinds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const fired = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
      world = fired.world;
      kinds.push(fired.result.kind);
    }
    expect(kinds).toEqual(['door', 'door', 'door', 'breach']);
    const portal = world.portals['box.door_ab'];
    expect(portal?.kind).toBe('hole');
    expect(portal?.integrity).toBe(0);
    if (portal !== undefined) expect(isPortalConnecting(portal)).toBe(true);
  });

  it('breaches interior walls into the neighboring room', () => {
    const world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      20
    );
    const fired = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
    expect(fired.result.kind).toBe('breach');
    if (fired.result.kind !== 'breach') throw new Error('expected breach');
    const hole = fired.world.portals[fired.result.portalId];
    expect(hole?.roomA).toBe('box.a');
    expect(hole?.roomB).toBe('box.b');
    if (hole !== undefined) expect(isPortalConnecting(hole)).toBe(true);
  });

  it('vents exterior rooms through shot walls once air reconciles', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'solo', hull: SOLO_SPEC }]),
      'p1',
      'solo',
      'solo.cabin',
      50,
      50
    );
    const fired = fireWeapon(world, 'p1', -Math.PI / 2, 'kinetic_carbine');
    expect(fired.result.kind).toBe('breach');
    world = fired.world;
    if (fired.result.kind !== 'breach') throw new Error('expected breach');
    const hole = world.portals[fired.result.portalId];
    expect(hole?.roomB).toBe('space');
    const auth = createAirAuthority();
    bindAirFrame(auth, 'solo', Object.values(world.rooms), Object.values(world.portals));
    for (let i = 0; i < 60; i += 1) stepAirAuthority(auth, world, 0.05);
    expect(ventedRooms(readAllAir(auth))).toContain('solo.cabin');
  });
});
