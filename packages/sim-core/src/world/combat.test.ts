import { describe, expect, it } from 'vitest';
import {
  addPuncture,
  bindAirFrame,
  createAirAuthority,
  readAllAir,
  stepAirAuthority,
  ventedRooms,
} from './airAuthority.js';
import { assembleWorld, spawnPawn } from './assemble.js';
import {
  applyDamage,
  BREACH_AREA_M2,
  BREACH_GROWTH_M2,
  BULLET_BREACH_M2,
  breachHalfLength,
  fireBlock,
  fireWeapon,
  MAX_BREACH_PORTALS,
  OWNER_GRACE_TICKS,
  PROJECTILE_LIFE_TICKS,
  PROJECTILE_SPEED,
  resolveImpactStyle,
  SPREAD_MAX,
  SPREAD_PER_SHOT,
  tickSpread,
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

/** One round straight up; 22 ticks land it and cool the barrel for the next. */
function shootNorthWall(world?: World): World {
  const unpacked =
    world ??
    spawnAt(
      assembleWorld([{ frameId: 'solo', hull: SOLO_SPEC }]),
      'p1',
      'solo',
      'solo.cabin',
      50,
      50
    );
  const fired = fireWeapon(unpacked, 'p1', -Math.PI / 2, 'kinetic_carbine');
  if (fired.result.kind !== 'fired') return unpacked;
  let next = fired.world;
  for (let i = 0; i < 22; i += 1) next = tickWorld(next, 0.05, []);
  return next;
}

function soloAir(): { auth: ReturnType<typeof createAirAuthority>; world: World } {
  const world = spawnAt(
    assembleWorld([{ frameId: 'solo', hull: SOLO_SPEC }]),
    'p1',
    'solo',
    'solo.cabin',
    50,
    50
  );
  const auth = createAirAuthority();
  bindAirFrame(auth, 'solo', Object.values(world.rooms), Object.values(world.portals));
  return { auth, world };
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
    expect(shot).toMatchObject({
      damage: 25,
      weapon: 'kinetic_carbine',
      lifeTicks: PROJECTILE_LIFE_TICKS,
      graceTicks: OWNER_GRACE_TICKS,
    });
    // First shot leaves with one increment of bloom off the aim axis.
    expect(shot?.vel.x ?? 0).toBeCloseTo(Math.cos(SPREAD_PER_SHOT) * PROJECTILE_SPEED, 6);
    expect(shot?.vel.y ?? 0).toBeCloseTo(Math.sin(SPREAD_PER_SHOT) * PROJECTILE_SPEED, 6);
    expect(fired.world.vitals.p1?.mags?.[0]).toBe(29);
    expect(fired.world.vitals.p1?.mags).toHaveLength(5);
    expect(fired.world.spread.p1).toBeCloseTo(SPREAD_PER_SHOT, 10);
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

  it('stamps impact pressure from the room atmosphere', () => {
    let world = spawnAt(
      assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]),
      'p1',
      'box',
      'box.a',
      30,
      20
    );
    world = {
      ...world,
      atmos: {
        ...world.atmos,
        'box.a': {
          roomId: 'box.a',
          pressureKpa: 12,
          tempCelsius: 21,
          o2Percent: 20.9,
          co2Ppm: 600,
          repressurizing: false,
        },
      },
    };
    const fired = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
    expect(fired.result.kind).toBe('fired');
    world = fired.world;
    for (let i = 0; i < 4; i += 1) world = tickWorld(world, 0.05, []);
    expect(world.impacts.length).toBeGreaterThan(0);
    for (const impact of world.impacts) expect(impact.pressureKpa).toBe(12);
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

  it('shares one gate between server enforcement and client mirrors', () => {
    const ready = { mags: [30, 30], reloadingS: 0, down: false };
    expect(fireBlock(ready)).toBeNull();
    expect(fireBlock({ ...ready, down: true })).toBe('down');
    expect(fireBlock({ ...ready, reloadingS: 1 })).toBe('reloading');
    expect(fireBlock({ ...ready, mags: [0] })).toBe('empty');
  });

  it('refuses downed pawns without spawning or spending', () => {
    let world = boxDuel();
    const pawn = world.pawns.p1;
    if (pawn === undefined) throw new Error('missing shooter');
    world = {
      ...world,
      pawns: {
        ...world.pawns,
        p1: { ...pawn, health: { ...pawn.health, hp: 0, incapacitated: true } },
      },
    };
    const downed = fireWeapon(world, 'p1', 0, 'rifle');
    expect(downed.result).toEqual({ kind: 'down' });
    expect(Object.keys(downed.world.projectiles)).toHaveLength(0);
    expect(downed.world.vitals.p1?.mags?.[0] ?? 30).toBe(30);
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
    expect(dry.world.spread.p1 ?? 0).toBe(0);
    const busy = {
      ...world,
      vitals: {
        ...world.vitals,
        p1: { ...defaultVitals(false), mags: [10, 10], reloadingS: 1 },
      },
    };
    expect(fireWeapon(busy, 'p1', 0, 'rifle').result).toEqual({ kind: 'empty' });
    expect(Object.keys(busy.projectiles)).toHaveLength(0);
  });

  it('fires a full magazine with no heat gate, refusing only when dry', () => {
    let world = boxDuel();
    for (let i = 0; i < 30; i += 1) {
      const fired = fireWeapon(world, 'p1', 0, 'rifle');
      expect(fired.result.kind).toBe('fired');
      world = fired.world;
    }
    expect(world.vitals.p1?.mags?.[0]).toBe(0);
    expect(world.spread.p1).toBeCloseTo(SPREAD_MAX, 10);
    expect(fireWeapon(world, 'p1', 0, 'rifle').result).toEqual({ kind: 'empty' });
  });

  it('widens aim bloom with sustained fire and bleeds it off over time', () => {
    let world = boxDuel();
    for (let i = 0; i < 5; i += 1) world = fireWeapon(world, 'p1', 0, 'rifle').world;
    expect(world.spread.p1).toBeCloseTo(5 * SPREAD_PER_SHOT, 10);
    world = tickSpread(world, 0.1);
    expect(world.spread.p1 ?? 0).toBeLessThan(5 * SPREAD_PER_SHOT);
    expect(world.spread.p1 ?? 0).toBeGreaterThan(0);
    world = tickSpread(world, 10);
    expect(world.spread.p1).toBeUndefined();
  });

  it('widens breach cuts progressively instead of popping', () => {
    let world = shootNorthWall();
    for (let shot = 0; shot < 4; shot += 1) world = shootNorthWall(world);
    const holes = Object.values(world.portals).filter((portal) => portal.kind === 'hole');
    expect(holes).toHaveLength(1);
    const seg = holes[0]?.segment;
    if (seg === undefined) throw new Error('missing breach');
    const half = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) / 2;
    expect(half).toBeGreaterThanOrEqual(12);
    expect(half).toBeLessThanOrEqual(30);
    expect(breachHalfLength(0)).toBeLessThan(breachHalfLength(BREACH_AREA_M2));
    expect(breachHalfLength(999)).toBeCloseTo(15.6, 5);
  });

  it('vents exterior rooms through shot walls once air reconciles', () => {
    let world = shootNorthWall();
    for (let shot = 0; shot < 25; shot += 1) world = shootNorthWall(world);
    const holes = Object.values(world.portals).filter((portal) => portal.kind === 'hole');
    expect(holes).toHaveLength(1);
    expect(holes[0]?.roomB).toBe('space');
    expect(holes[0]?.areaM2).toBe(BREACH_AREA_M2);
    const auth = createAirAuthority();
    bindAirFrame(auth, 'solo', Object.values(world.rooms), Object.values(world.portals));
    for (let i = 0; i < 60; i += 1) stepAirAuthority(auth, world, 0.05);
    expect(ventedRooms(readAllAir(auth))).toContain('solo.cabin');
  });

  it('cuts a small puncture on the first wall hit, not a full breach', () => {
    const world = shootNorthWall();
    const holes = Object.values(world.portals).filter((portal) => portal.kind === 'hole');
    expect(holes).toHaveLength(1);
    expect(holes[0]?.roomB).toBe('space');
    expect(holes[0]?.areaM2).toBe(BULLET_BREACH_M2);
  });

  it('widens a live breach instead of cutting a second hole nearby', () => {
    const world = shootNorthWall(shootNorthWall());
    const holes = Object.values(world.portals).filter((portal) => portal.kind === 'hole');
    expect(holes).toHaveLength(1);
    expect(holes[0]?.areaM2).toBeCloseTo(BULLET_BREACH_M2 + BREACH_GROWTH_M2, 10);
  });

  it('leaks slowly through one round but blows out through a full breach', () => {
    const bullet = shootNorthWall();
    const bulletAuth = createAirAuthority();
    bindAirFrame(bulletAuth, 'solo', Object.values(bullet.rooms), Object.values(bullet.portals));
    let slow = bullet;
    for (let i = 0; i < 100; i += 1) slow = tickWorld(slow, 0.05, [], bulletAuth);
    const slowKpa = slow.atmos['solo.cabin']?.pressureKpa ?? 0;
    expect(slowKpa).toBeLessThan(101.3);
    expect(slowKpa).toBeGreaterThan(50);

    const { auth: tornAuth, world: tornWorld } = soloAir();
    addPuncture(tornAuth, 'solo', 'solo.cabin', BREACH_AREA_M2);
    let torn = tornWorld;
    for (let i = 0; i < 100; i += 1) torn = tickWorld(torn, 0.05, [], tornAuth);
    expect(torn.atmos['solo.cabin']?.pressureKpa ?? 101.3).toBeLessThan(10);
  });

  it('caps wall breaches so sustained fire cannot bloat the portal table', () => {
    const bigSpec: HullSpec = {
      frameId: 'hall',
      rooms: [{ id: 'atrium', rect: { x: 0, y: 0, w: 400, h: 400 }, volumeM3: 400 }],
      portals: [],
    };
    let world = spawnAt(
      assembleWorld([{ frameId: 'hall', hull: bigSpec }]),
      'p1',
      'hall',
      'hall.atrium',
      200,
      200
    );
    for (let shot = 0; shot < 40; shot += 1) {
      const angle = (shot / 40) * Math.PI * 2;
      const fired = fireWeapon(world, 'p1', angle, 'kinetic_carbine');
      if (fired.result.kind !== 'fired') continue;
      world = fired.world;
      for (let i = 0; i < 22; i += 1) world = tickWorld(world, 0.05, []);
    }
    const breaches = Object.values(world.portals).filter((portal) =>
      portal.id.startsWith('breach.')
    );
    expect(breaches.length).toBe(MAX_BREACH_PORTALS);
    expect(world.tick).toBeGreaterThan(0);
  });

  it('resolves simultaneous rounds in one tick from the shared collider build', () => {
    let world = boxDuel();
    const first = fireWeapon(world, 'p1', 0, 'kinetic_carbine');
    expect(first.result.kind).toBe('fired');
    const second = fireWeapon(first.world, 'p1', 0, 'kinetic_carbine');
    expect(second.result.kind).toBe('fired');
    world = tickWorld(second.world, 0.05, []);
    expect(world.pawns.p2?.health.hp).toBeLessThan(100);
    expect(world.impacts.length).toBeGreaterThan(0);
  });

  it('resolves impact style with carbine defaults', () => {
    expect(resolveImpactStyle(undefined, 'pawn')).toEqual({
      angle: 0,
      weapon: 'kinetic_carbine',
      energy: 0.5,
      surface: 'pawn',
    });
    expect(resolveImpactStyle(undefined, 'miss')).toMatchObject({ surface: 'wall' });
    expect(
      resolveImpactStyle({ angle: 1, weapon: 'pulse_laser', energy: 2, surface: 'hull' }, 'breach')
    ).toMatchObject({ angle: 1, weapon: 'pulse_laser', energy: 1, surface: 'hull' });
  });
});
