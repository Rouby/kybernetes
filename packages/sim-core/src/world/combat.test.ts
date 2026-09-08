import { describe, expect, it } from 'vitest';
import {
  bindAirFrame,
  createAirAuthority,
  readAllAir,
  stepAirAuthority,
  ventedRooms,
} from './airAuthority.js';
import { assembleWorld, spawnPawn } from './assemble.js';
import {
  applyDamage,
  fireWeapon,
  OWNER_GRACE_TICKS,
  PROJECTILE_LIFE_TICKS,
  PROJECTILE_SPEED,
  tickHeat,
  weaponDamage,
} from './combat.js';
import { isPortalConnecting } from './doors.js';
import type { HullSpec } from './hullCompiler.js';
import { defaultVitals } from './survival.js';
import { tickWorld } from './tickWorld.js';
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

function boxDuel(): World {
  let world = spawnAt(
    assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
    'p1',
    'box',
    'box.a',
    30,
    50
  );
  world = spawnAt(world, 'p2', 'box', 'box.a', 60, 50);
  return world;
}

describe('simulated projectiles', () => {
  it('misses with bad shooters and spawns nothing', () => {
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
    expect(Object.keys(world.projectiles)).toHaveLength(0);
    expect(weaponDamage('arc_welder')).toBe(15);
    expect(weaponDamage('kinetic_carbine')).toBe(25);
  });

  it('spawns a live round on fire and consumes one ammo', () => {
    const world = boxDuel();
    const fired = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
    expect(fired.result.kind).toBe('fired');
    if (fired.result.kind !== 'fired') throw new Error('expected spawn');
    const shot = fired.world.projectiles[fired.result.projectileId];
    expect(shot?.damage).toBe(25);
    expect(shot?.weapon).toBe('kinetic_carbine');
    expect(shot?.lifeTicks).toBe(PROJECTILE_LIFE_TICKS);
    expect(shot?.graceTicks).toBe(OWNER_GRACE_TICKS);
    expect(shot?.vel).toEqual({ x: PROJECTILE_SPEED, y: 0 });
    expect(fired.world.vitals.p1?.mags?.[0]).toBe(29);
    expect(fired.world.vitals.p1?.mags).toHaveLength(5);
    expect(fired.world.heat.p1).toBe(20);
  });

  it('wounds pawns on contact with hp-only resolution and bleeding', () => {
    const limbs = [{ limb: 'arm', hp: 50 }];
    const organs = [{ organ: 'heart', hp: 90 }];
    let world = boxDuel();
    const target = world.pawns.p2;
    if (target === undefined) throw new Error('missing target');
    world = {
      ...world,
      pawns: { ...world.pawns, p2: { ...target, health: { ...target.health, limbs, organs } } },
    };
    const fired = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
    world = tickWorld(fired.world, 0.05, []);
    expect(world.pawns.p2?.health.hp).toBe(75);
    expect(world.pawns.p2?.health.limbs).toEqual(limbs);
    expect(world.pawns.p2?.health.organs).toEqual(organs);
    expect(world.vitals.p2?.bleedoutS).toBe(20);
    expect(Object.keys(world.projectiles)).toHaveLength(0);
    expect(world.impacts.map((impact) => impact.kind)).toEqual(['pawn']);
  });

  it('ignores pawns in other frames', () => {
    const world = boxDuel();
    const target = world.pawns.p2;
    if (target === undefined) throw new Error('missing target');
    const moved: World = {
      ...world,
      pawns: {
        ...world.pawns,
        p2: { ...target, frameId: 'elsewhere', roomHint: 'elsewhere.x' },
      },
    };
    const fired = fireWeapon(moved, 'p1', 0, 'kinetic_carbine');
    const after = tickWorld(fired.world, 0.05, []);
    expect(after.pawns.p2?.health.hp).toBe(100);
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

  it('shoots doors into connecting holes over four delivered hits', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      50
    );
    for (let i = 0; i < 4; i += 1) {
      const fired = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
      expect(fired.result.kind).toBe('fired');
      world = fired.world;
    }
    expect(world.vitals.p1?.mags?.[0]).toBe(26);
    for (let i = 0; i < 4; i += 1) world = tickWorld(world, 0.05, []);
    const portal = world.portals['box.door_ab'];
    expect(portal?.kind).toBe('hole');
    expect(portal?.integrity).toBe(0);
    if (portal !== undefined) expect(isPortalConnecting(portal)).toBe(true);
    expect(world.impacts.map((impact) => impact.kind)).toEqual(['door', 'door', 'door', 'door']);
    for (let i = 0; i < 10; i += 1) world = tickWorld(world, 0.05, []);
    expect(world.impacts).toEqual([]);
  });

  it('breaches interior walls into the neighboring room', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      20
    );
    const fired = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
    expect(fired.result.kind).toBe('fired');
    world = fired.world;
    for (let i = 0; i < 4; i += 1) world = tickWorld(world, 0.05, []);
    const hole = Object.values(world.portals).find((portal) => portal.kind === 'hole');
    expect(hole?.roomA).toBe('box.a');
    expect(hole?.roomB).toBe('box.b');
    if (hole !== undefined) expect(isPortalConnecting(hole)).toBe(true);
  });

  it('expires rounds past their life without impacts', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      10,
      10
    );
    const spent = {
      id: 'shot:old',
      frameId: 'box',
      pos: { x: 10, y: 10 },
      vel: { x: 0, y: 0 },
      damage: 25,
      fromPawnId: 'p1',
      weapon: 'kinetic_carbine',
      lifeTicks: 1,
      graceTicks: 0,
    };
    world = { ...world, projectiles: { 'shot:old': spent } };
    world = tickWorld(world, 0.05, []);
    expect(Object.keys(world.projectiles)).toHaveLength(0);
    expect(world.impacts).toEqual([]);
  });

  it('refuses fire while reloading or dry', () => {
    let world = boxDuel();
    if (world.pawns.p1 === undefined) throw new Error('missing shooter');
    world = {
      ...world,
      vitals: {
        ...world.vitals,
        p1: { ...defaultVitals(false), mags: [0, 10, 10] },
      },
    };
    const dry = fireWeapon(world, 'p1', 0, 'rifle');
    expect(dry.result).toEqual({ kind: 'empty' });
    expect(Object.keys(dry.world.projectiles)).toHaveLength(0);
    expect(dry.world.heat.p1 ?? 0).toBe(0);
  });

  it('overheats after five shots and cools back to ready', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      50
    );
    for (let i = 0; i < 5; i += 1) world = fireWeapon(world, 'p1', 0, 'rifle').world;
    expect(world.heat.p1).toBe(100);
    expect(fireWeapon(world, 'p1', 0, 'rifle').result).toEqual({ kind: 'overheated' });
    world = tickHeat(world, 2);
    expect(world.heat.p1 ?? 0).toBeLessThan(100);
    world = tickHeat(world, 4);
    expect(world.heat.p1).toBeUndefined();
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
    expect(fired.result.kind).toBe('fired');
    world = fired.world;
    for (let i = 0; i < 4; i += 1) world = tickWorld(world, 0.05, []);
    const hole = Object.values(world.portals).find((portal) => portal.kind === 'hole');
    expect(hole?.roomB).toBe('space');
    const auth = createAirAuthority();
    bindAirFrame(auth, 'solo', Object.values(world.rooms), Object.values(world.portals));
    for (let i = 0; i < 60; i += 1) stepAirAuthority(auth, world, 0.05);
    expect(ventedRooms(readAllAir(auth))).toContain('solo.cabin');
  });
});
