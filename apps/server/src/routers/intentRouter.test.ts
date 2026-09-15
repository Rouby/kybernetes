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

describe('console tune intents', () => {
  async function consoleWorld(pawnId: string, x: number, y: number) {
    const core = await import('@kybernetes/sim-core');
    return core.spawnPawn(core.buildHarborWorld(), {
      id: pawnId,
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.reaktor_antrieb',
      x,
      y,
      color: '#fff',
    });
  }

  it('tunes the reactor at the reactor console', async () => {
    const world = await consoleWorld('pawn:op', 120, 500);
    const result = routeIntent(
      world,
      'pawn:op',
      { type: 'REACTOR_TUNE', seq: 1, rodsDelta: 0.1, coolantDelta: 0 },
      []
    );
    expect(result.notice).toBe('REACTOR_ok');
    expect(result.world.ships.ship?.reactor.rods).toBeCloseTo(0.4, 6);
  });

  it('refuses console verbs from across the map or without a pawn', async () => {
    const core = await import('@kybernetes/sim-core');
    const world = core.spawnPawn(core.buildHarborWorld(), {
      id: 'pawn:away',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.habitat',
      x: 160,
      y: 100,
      color: '#fff',
    });
    const far = routeIntent(world, 'pawn:away', { type: 'ENGINE_TUNE', seq: 1, spoolCmd: 1 }, []);
    expect(far.notice).toBe('ENGINE_too-far');
    const ghost = routeIntent(world, 'pawn:ghost', { type: 'REACTOR_RESTART', seq: 2 }, []);
    expect(ghost.notice).toBe('REACTOR_no-pawn');
  });

  it('restarts a cold reactor and latches engine spool at the consoles', async () => {
    const world = await consoleWorld('pawn:op', 140, 500);
    const lit = routeIntent(world, 'pawn:op', { type: 'REACTOR_RESTART', seq: 1 }, []);
    expect(lit.notice).toBe('REACTOR_ok');
    expect(lit.world.ships.ship?.reactor.hot).toBe(true);
    const spooled = routeIntent(
      lit.world,
      'pawn:op',
      { type: 'ENGINE_TUNE', seq: 2, spoolCmd: 1, tuneSet: 0.8 },
      []
    );
    expect(spooled.notice).toBe('ENGINE_ok');
    expect(spooled.world.ships.ship?.engine.spoolCmd).toBe(1);
    expect(spooled.world.ships.ship?.engine.tune).toBe(0.8);
  });
});

describe('nav console intents', () => {
  async function bridgeWorld() {
    const core = await import('@kybernetes/sim-core');
    let world = core.buildHarborWorld();
    world = core.spawnPawn(world, {
      id: 'pawn:nav',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.bruecke',
      x: 110,
      y: 70,
      color: '#fff',
    });
    world = core.ensureShipSystems(world, 'ship');
    world = core.restartShipReactor(world, 'ship');
    return core.tuneShipEngine(world, 'ship', 1, 1);
  }

  it('plots and cancels a leg at the nav console', async () => {
    const world = await bridgeWorld();
    const plotted = routeIntent(
      world,
      'pawn:nav',
      { type: 'NAV_PLOT', seq: 1, destHubId: 'hub_b', waypointIds: [] },
      []
    );
    expect(plotted.notice).toBe('NAV_ok');
    expect(plotted.world.ships.ship?.nav.phase).toBe('spooling');
    const cancelled = routeIntent(plotted.world, 'pawn:nav', { type: 'NAV_CANCEL', seq: 2 }, []);
    expect(cancelled.notice).toBe('NAV_ok');
    expect(cancelled.world.ships.ship?.nav.phase).toBe('docked');
    const throttled = routeIntent(
      cancelled.world,
      'pawn:nav',
      { type: 'NAV_PLOT', seq: 4, destHubId: 'hub_b', waypointIds: [], thrust01: 0.5 },
      []
    );
    expect(throttled.notice).toBe('NAV_ok');
    expect(throttled.world.ships.ship?.nav.thrust01).toBe(0.5);
    const idle = routeIntent(cancelled.world, 'pawn:nav', { type: 'NAV_CANCEL', seq: 3 }, []);
    expect(idle.notice).toBe('NAV_denied');
  });

  it('hails rescue drones only while flamed-out adrift', async () => {
    const core = await import('@kybernetes/sim-core');
    const world = await bridgeWorld();
    const systems = world.ships.ship;
    if (systems === undefined) throw new Error('missing ship systems');
    const flamed = {
      ...world,
      ships: {
        ...world.ships,
        ship: {
          ...systems,
          nav: {
            ...systems.nav,
            phase: 'in_transit' as const,
            destHubId: 'hub_b',
            remainingS: 60,
            flameout: true,
            hailS: 0,
            stops: ['hub_b'],
            legIndex: 0,
          },
        },
      },
    };
    const hailed = routeIntent(flamed, 'pawn:nav', { type: 'HAIL', seq: 1 }, []);
    expect(hailed.notice).toBe('HAIL_ok');
    expect(hailed.world.ships.ship?.nav.hailS).toBe(core.HAIL_WAIT_S);
    const again = routeIntent(hailed.world, 'pawn:nav', { type: 'HAIL', seq: 2 }, []);
    expect(again.notice).toBe('HAIL_denied');
    expect(routeIntent(world, 'pawn:nav', { type: 'HAIL', seq: 3 }, []).notice).toBe('HAIL_denied');
  });

  it('refuses plots without power, fuel, or proximity', async () => {
    const core = await import('@kybernetes/sim-core');
    const world = await bridgeWorld();
    const dry = core.syncShipStores(world, 'ship', 0);
    expect(
      routeIntent(
        dry,
        'pawn:nav',
        { type: 'NAV_PLOT', seq: 1, destHubId: 'hub_b', waypointIds: [] },
        []
      ).notice
    ).toBe('NAV_no-fuel');
    expect(
      routeIntent(
        world,
        'pawn:nav',
        { type: 'NAV_PLOT', seq: 2, destHubId: 'hub_a', waypointIds: [] },
        []
      ).notice
    ).toBe('NAV_same-hub');
    expect(
      routeIntent(
        world,
        'pawn:nav',
        { type: 'NAV_PLOT', seq: 3, destHubId: 'nowhere', waypointIds: [] },
        []
      ).notice
    ).toBe('NAV_unknown-hub');
    const via = routeIntent(
      world,
      'pawn:nav',
      { type: 'NAV_PLOT', seq: 5, destHubId: 'hub_b', waypointIds: ['poi_kestrel'] },
      []
    );
    expect(via.notice).toBe('NAV_ok');
    expect(via.world.ships.ship?.nav.stops).toEqual(['poi_kestrel', 'hub_b']);
    expect(
      routeIntent(
        world,
        'pawn:nav',
        { type: 'NAV_PLOT', seq: 6, destHubId: 'hub_b', waypointIds: ['nowhere'] },
        []
      ).notice
    ).toBe('NAV_unknown-node');
    const far = core.spawnPawn(world, {
      id: 'pawn:away',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.habitat',
      x: 160,
      y: 100,
      color: '#fff',
    });
    expect(
      routeIntent(
        far,
        'pawn:away',
        { type: 'NAV_PLOT', seq: 4, destHubId: 'hub_b', waypointIds: [] },
        []
      ).notice
    ).toBe('NAV_too-far');
  });
});

describe('cargo hauling intents (M4)', () => {
  async function bayWorld() {
    const core = await import('@kybernetes/sim-core');
    let world = core.buildSoloShipWorld();
    world = core.spawnPawn(world, {
      id: 'pawn:haul',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.frachthalle',
      x: 430,
      y: 410,
      color: '#fff',
    });
    return world;
  }

  it('picks up a seeded bay crate and blocks consoles while carrying', async () => {
    const world = await bayWorld();
    const picked = routeIntent(
      world,
      'pawn:haul',
      { type: 'CARGO_PICKUP', seq: 1, crateId: 'bay:scrap-a' },
      []
    );
    expect(picked.notice).toBe('CARGO_ok');
    const blocked = routeIntent(
      picked.world,
      'pawn:haul',
      { type: 'ENGINE_TUNE', seq: 2, spoolCmd: 1 },
      []
    );
    expect(blocked.notice).toBe('ENGINE_hands-full');
    const dropped = routeIntent(picked.world, 'pawn:haul', { type: 'CARGO_DROP', seq: 3 }, []);
    expect(dropped.notice).toBe('CARGO_ok');
  });

  it('rejects far pickup and empty drop', async () => {
    const core = await import('@kybernetes/sim-core');
    const world = core.spawnPawn(core.buildSoloShipWorld(), {
      id: 'pawn:far',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.habitat',
      x: 160,
      y: 100,
      color: '#fff',
    });
    const far = routeIntent(
      world,
      'pawn:far',
      { type: 'CARGO_PICKUP', seq: 1, crateId: 'bay:scrap-a' },
      []
    );
    expect(far.notice).toBe('CARGO_too-far');
    const empty = routeIntent(world, 'pawn:far', { type: 'CARGO_DROP', seq: 2 }, []);
    expect(empty.notice).toBe('CARGO_not-carrying');
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
