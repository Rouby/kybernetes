import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import { fireWeapon, tickProjectiles } from './combat.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { StationHubSpec } from './content/StationHub.hull.js';
import {
  claimFixture,
  damageFixture,
  harvestTray,
  repairFixture,
  runRecycle,
  startCook,
  tickLiving,
} from './living.js';
import { buildHarborWorld } from './scenarios.js';
import { applyConsume, defaultVitals } from './survival.js';

function harbor() {
  return buildHarborWorld();
}

describe('living fixtures', () => {
  it('places the dense hub + workhorse fixtures', () => {
    const world = harbor();
    expect(world.fixtures['station.bar_counter']).toBeDefined();
    expect(world.fixtures['station.vending_wall']).toBeDefined();
    expect(world.fixtures['ship.stove']?.roomId).toBe('ship.kajute_nord');
    expect(world.fixtures['ship.hydro_tray']?.roomId).toBe('ship.kajute_sued');
    expect(world.fixtures['ship.breaker']?.kind).toBe('breaker_box');
  });

  it('claims lockers/bunks once, first claim wins', () => {
    let world = harbor();
    world = claimFixture(world, 'ship.bunk_a', 'pawn:a');
    expect(world.fixtures['ship.bunk_a']?.claimedBy).toBe('pawn:a');
    world = claimFixture(world, 'ship.bunk_a', 'pawn:b');
    expect(world.fixtures['ship.bunk_a']?.claimedBy).toBe('pawn:a');
    const stove = claimFixture(world, 'ship.stove', 'pawn:a');
    expect(stove.fixtures['ship.stove']?.claimedBy).toBeUndefined();
  });

  it('damages fixtures offline and repairs them back', () => {
    let world = harbor();
    world = damageFixture(world, 'ship.stove', 100);
    expect(world.fixtures['ship.stove']?.integrity).toBe(0);
    expect(world.fixtures['ship.stove']?.online).toBe(false);
    world = repairFixture(world, 'ship.stove');
    expect(world.fixtures['ship.stove']?.integrity).toBe(34);
    expect(world.fixtures['ship.stove']?.online).toBe(true);
  });

  it('cooks raw into meals over 8s', () => {
    let world = harbor();
    world = startCook(world, 'ship.stove');
    expect(world.fixtures['ship.stove']?.progress01 ?? 0).toBeGreaterThan(0);
    world = tickLiving(world, 8.5);
    expect(world.fixtures['ship.stove']?.progress01).toBe(0);
    expect(world.living['ship.kajute_nord']?.mealsReady).toBe(1);
  });

  it('grows greens and harvests 2 raw into the freezer', () => {
    let world = harbor();
    const before = Math.round((world.fixtures['ship.freezer']?.level01 ?? 0) * 10);
    world = tickLiving(world, 61);
    world = harvestTray(world, 'ship.hydro_tray');
    const after = Math.round((world.fixtures['ship.freezer']?.level01 ?? 0) * 10);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(world.living['ship.kajute_sued']?.growth01).toBe(0);
  });

  it('recycles 2L grey into clean', () => {
    let world = harbor();
    world = tickLiving(world, 0.05);
    const cleanBefore = world.living['ship.kajute_sued']?.waterCleanL ?? 8;
    const greyBefore = world.living['ship.kajute_sued']?.waterGreyL ?? 4;
    world = runRecycle(world, 'ship.recycler');
    expect(world.fixtures['ship.recycler']?.progress01).toBeGreaterThan(0);
    world = tickLiving(world, 6.5);
    const room = world.living['ship.kajute_sued'];
    expect(room).toBeDefined();
    expect(room?.waterCleanL ?? 0).toBeGreaterThan(cleanBefore - 0.5);
    expect(room?.waterGreyL ?? 0).toBeLessThan(greyBefore + 0.5);
    expect(world.fixtures['ship.recycler']?.progress01).toBe(0);
  });

  it('breaking the breaker trips the room until repaired', () => {
    let world = harbor();
    world = damageFixture(world, 'ship.breaker', 100);
    world = tickLiving(world, 0.5);
    expect(world.living['ship.korridor_schiff']?.breakerTripped).toBe(true);
    world = repairFixture(world, 'ship.breaker');
    world = repairFixture(world, 'ship.breaker');
    world = repairFixture(world, 'ship.breaker');
    world = tickLiving(world, 0.5);
    expect(world.living['ship.korridor_schiff']?.breakerTripped).toBe(false);
  });

  it('meal tiers feed hunger and grant a mess buff', () => {
    let world = harbor();
    world = spawnPawn(world, {
      id: 'pawn:cook',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.kajute_nord',
      x: 140,
      y: 200,
      color: '#fff',
    });
    const starved = {
      ...world,
      vitals: { ...world.vitals, 'pawn:cook': { ...defaultVitals(false), hunger: 10 } },
    };
    const fed = applyConsume(starved, 'pawn:cook', 'hot_meal');
    expect(fed.vitals['pawn:cook']?.hunger).toBe(45);
    expect(fed.vitals['pawn:cook']?.mealBuffS).toBe(60);
    const raw = applyConsume(starved, 'pawn:cook', 'raw_greens');
    expect(raw.vitals['pawn:cook']?.hunger).toBe(20);
  });

  it('shots pass through fixtures (destruction is a later feature run)', () => {
    let world = harbor();
    world = spawnPawn(world, {
      id: 'pawn:shooter',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.kajute_nord',
      x: 110,
      y: 210,
      color: '#fff',
    });
    const stove = world.fixtures['ship.stove'];
    expect(stove).toBeDefined();
    const angle = Math.atan2((stove?.pos.y ?? 0) - 210, (stove?.pos.x ?? 0) - 110);
    for (let i = 0; i < 5; i += 1) {
      const fired = fireWeapon(world, 'pawn:shooter', angle, 'kinetic_carbine');
      world = fired.world;
      world = tickProjectiles(world, 1 / 20);
    }
    expect(world.fixtures['ship.stove']?.integrity ?? 0).toBe(100);
  });

  it('assembles bare hulls without living rooms until ticked', () => {
    const world = assembleWorld([
      { frameId: 'station', hull: StationHubSpec },
      { frameId: 'ship', hull: HesperiaV2Spec, vessel: { name: 'T', beacon: 'B' } },
    ]);
    expect(world.living).toEqual({});
    expect(world.fixtures).toEqual({});
  });
});
