import { describe, expect, it } from 'vitest';
import { buildSoloShipWorld } from '../world/scenarios.js';
import { ensureShipSystems } from '../world/ship/systems.js';
import { isV2Save, migrateV2ToV3, migrateWorldSave } from './migrate.js';
import { serializeWorld } from './save.js';
import { UNIVERSE_REV } from './schema.js';

describe('world save migration (Strike 4)', () => {
  it('upgrades a minimal v2 envelope to v3', () => {
    const world = buildSoloShipWorld();
    const migrated = migrateWorldSave({ version: 2, world });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.version).toBe(3);
    expect(migrated.value.universeRev).toBe(UNIVERSE_REV);
    expect(migrated.value.savedAtMs).toBe(world.timeMs);
    expect(migrated.value.world).toEqual(world);
  });

  it('backfills ship-system fields added since v2', () => {
    const world = ensureShipSystems(buildSoloShipWorld(), 'ship');
    const systems = world.ships.ship;
    if (systems === undefined) throw new Error('missing ship systems');
    const stripped = {
      ...world,
      ships: { ship: { ...systems, surveyed: undefined, engineFuel: undefined } },
    };
    const value = migrateV2ToV3({ version: 2, world: stripped });
    expect(value.world.ships.ship?.surveyed).toEqual([]);
    expect(value.world.ships.ship?.engineFuel).toBe(0);
  });

  it('passes v3 saves through untouched', () => {
    const world = buildSoloShipWorld();
    const save = serializeWorld(world, 42);
    const result = migrateWorldSave(JSON.parse(JSON.stringify(save)) as unknown);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(save);
  });

  it('rejects corrupt and unknown versions with typed errors', () => {
    expect(isV2Save({ version: 2 })).toBe(false);
    expect(isV2Save({ version: 2, world: {} }).valueOf()).toBe(true);
    for (const input of [undefined, { version: 1 }, { version: 99 }, { version: 2 }]) {
      const result = migrateWorldSave(input);
      expect(result.ok).toBe(false);
    }
    const v2bad = migrateWorldSave({ version: 2, world: { tick: 'x' } });
    expect(v2bad.ok).toBe(false);
  });
});
