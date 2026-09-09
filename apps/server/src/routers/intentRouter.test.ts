import { buildHarborWorld } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { routeIntent } from './intentRouter.js';

describe('dock gate door discipline', () => {
  it('refuses dock leaf toggles while the cycle holds them', () => {
    const world = buildHarborWorld();
    const refused = routeIntent(
      world,
      'pawn:u1',
      { type: 'DOOR', seq: 1, portalId: 'ship.schiff_mund', wantOpen: true },
      []
    );
    expect(refused.notice).toBe('DOOR_dock-cycle');
    expect(refused.world.portals['ship.schiff_mund']?.state).toBe(
      world.portals['ship.schiff_mund']?.state
    );
  });

  it('still toggles ordinary doors while docked', () => {
    const world = buildHarborWorld();
    const result = routeIntent(
      world,
      'pawn:u1',
      { type: 'DOOR', seq: 1, portalId: 'station.habitat_korridor', wantOpen: true },
      []
    );
    expect(result.notice).toMatch(/^DOOR_/);
    expect(result.notice).not.toBe('DOOR_dock-cycle');
  });
});

describe('living intents', () => {
  it('claims a bunk when standing next to it', async () => {
    const core = await import('@kybernetes/sim-core');
    let world = core.buildHarborWorld();
    world = core.spawnPawn(world, {
      id: 'pawn:u1',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.kajute_sued',
      x: 120,
      y: 380,
      color: '#fff',
    });
    const result = routeIntent(
      world,
      'pawn:u1',
      { type: 'CLAIM', seq: 1, fixtureId: 'ship.bunk_a' },
      []
    );
    expect(result.notice).toBe('CLAIM_ok');
    expect(result.world.fixtures['ship.bunk_a']?.claimedBy).toBe('pawn:u1');
  });

  it('refuses living verbs from across the map', async () => {
    const core = await import('@kybernetes/sim-core');
    let world = core.buildHarborWorld();
    world = core.spawnPawn(world, {
      id: 'pawn:far',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.habitat',
      x: 160,
      y: 100,
      color: '#fff',
    });
    const result = routeIntent(
      world,
      'pawn:far',
      { type: 'COOK', seq: 1, stoveId: 'ship.stove' },
      []
    );
    expect(result.notice).toBe('COOK_too-far');
  });

  it('repairs a damaged stove', async () => {
    const core = await import('@kybernetes/sim-core');
    let world = core.buildHarborWorld();
    world = core.spawnPawn(world, {
      id: 'pawn:eng',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.kajute_nord',
      x: 110,
      y: 180,
      color: '#fff',
    });
    world = core.damageFixture(world, 'ship.stove', 60);
    const result = routeIntent(
      world,
      'pawn:eng',
      { type: 'REPAIR', seq: 1, fixtureId: 'ship.stove' },
      []
    );
    expect(result.notice).toBe('REPAIR_ok');
    expect(result.world.fixtures['ship.stove']?.integrity ?? 0).toBeGreaterThan(40);
  });
});
