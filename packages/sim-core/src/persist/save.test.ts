import { describe, expect, it } from 'vitest';
import { buildSoloShipWorld } from '../world/scenarios.js';
import { FUEL_PER_CELL } from '../world/ship/engine.js';
import { tryBuy } from '../world/ship/market.js';
import {
  ensureShipSystems,
  plotVoyage,
  restartShipReactor,
  syncEngineFuel,
} from '../world/ship/systems.js';
import type { World } from '../world/types.js';
import { migrateWorldSave } from './migrate.js';
import {
  deserializeWorld,
  deserializeWorldJson,
  serializeWorld,
  serializeWorldJson,
  validateWorldSave,
} from './save.js';
import { UNIVERSE_REV, WORLD_SAVE_VERSION } from './schema.js';

function voyagingWorld(): World {
  let world = ensureShipSystems(buildSoloShipWorld(), 'ship');
  world = restartShipReactor(world, 'ship');
  world = syncEngineFuel(world, 'ship', 2 * FUEL_PER_CELL);
  const plotted = plotVoyage(world, 'ship', 'hub_b', {
    hot: true,
    powered: true,
    engineFuel: 2 * FUEL_PER_CELL,
  });
  if (plotted.reject !== undefined) throw new Error('plot rejected: ' + plotted.reject);
  world = plotted.world;
  const bought = tryBuy(world.market, 'hub_a', [{ goodId: 'scrap', qty: 2 }], 1000, world.timeMs);
  if (!bought.ok) throw new Error('buy rejected: ' + bought.reason);
  return { ...world, market: bought.ledger };
}

describe('world save round-trip (Strike 4)', () => {
  it('saves and loads a 4-hub solo world with a plotted nav leg', () => {
    const world = voyagingWorld();
    expect(Object.keys(world.stations)).toHaveLength(4);
    expect(world.ships.ship?.nav.phase).toBe('in_transit');

    const json = serializeWorldJson(world, 12345);
    const loaded = deserializeWorldJson(json);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toEqual(world);
  });

  it('preserves frames, docks, ships/nav, cargo, and market', () => {
    const world = voyagingWorld();
    const save = serializeWorld(world, 77);
    expect(save.version).toBe(WORLD_SAVE_VERSION);
    expect(save.universeRev).toBe(UNIVERSE_REV);

    const loaded = deserializeWorld(save);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.vessels).toEqual(world.vessels);
    expect(loaded.value.stations).toEqual(world.stations);
    expect(loaded.value.rooms).toEqual(world.rooms);
    expect(loaded.value.portals).toEqual(world.portals);
    expect(loaded.value.docks).toEqual(world.docks);
    expect(loaded.value.ships).toEqual(world.ships);
    expect(loaded.value.ships.ship?.nav.destHubId).toBe('hub_b');
    expect(loaded.value.cargo).toEqual(world.cargo);
    expect(loaded.value.market).toEqual(world.market);
  });

  it('detaches the save from live sim state', () => {
    const world = voyagingWorld();
    const save = serializeWorld(world, 1);
    expect(validateWorldSave(save).ok).toBe(true);
    if (save.world.ships.ship === undefined) throw new Error('missing ship systems');
    expect(save.world.ships.ship).not.toBe(world.ships.ship);
  });

  it('rejects corrupt input with typed errors, never throws', () => {
    expect(deserializeWorldJson('not-json {').ok).toBe(false);
    const badJson = deserializeWorldJson('not-json {');
    if (badJson.ok) throw new Error('expected failure');
    expect(badJson.error.code).toBe('bad-json');

    const cases: Array<[unknown, string]> = [
      [undefined, 'not-object'],
      [null, 'not-object'],
      [{}, 'bad-version'],
      [{ version: 99, universeRev: 1, savedAtMs: 0, world: {} }, 'bad-version'],
      [{ version: 2, world: {} }, 'unsupported-version'],
      [{ version: 3, universeRev: 999, savedAtMs: 0, world: {} }, 'universe-mismatch'],
      [{ version: 3, universeRev: 1, savedAtMs: 0, world: {} }, 'bad-world'],
      [{ version: 3, universeRev: 1, savedAtMs: 0, world: { tick: 1 } }, 'bad-world'],
    ];
    for (const [input, code] of cases) {
      const result = validateWorldSave(input);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe(code);
    }
  });

  it('rejects a world with an unknown nav phase', () => {
    const world = voyagingWorld();
    const save = serializeWorld(world, 1);
    const tampered = {
      ...save,
      world: {
        ...save.world,
        ships: {
          ship: { ...save.world.ships.ship, nav: { ...save.world.ships.ship?.nav, phase: 'warp' } },
        },
      },
    };
    const result = validateWorldSave(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-world');
  });

  it('routes v2 envelopes through migrateWorldSave', () => {
    const world = voyagingWorld();
    const v2 = { version: 2, world };
    expect(validateWorldSave(v2).ok).toBe(false);
    const migrated = migrateWorldSave(v2);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.version).toBe(3);
    expect(deserializeWorld(migrated.value).ok).toBe(true);
  });
});
