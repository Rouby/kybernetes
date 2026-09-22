/**
 * Strike 4 save migration: the v2 to v3 upgrade path. V2 envelopes carry
 * the same World payload without the universe pin or save timestamp; the
 * migration stamps the running UNIVERSE_REV, defaults savedAtMs to the
 * world clock, and backfills ship-system fields added since v2 (surveyed
 * discovery, engineFuel bunker value). Never throws on corrupt input.
 * Pure; no DOM/Node imports.
 */

import type { ShipSystems } from '../world/ship/systems.js';
import type { World } from '../world/types.js';
import { serializeWorld, validateWorldSave } from './save.js';
import {
  isSaveRecord,
  type PersistResult,
  persistFailure,
  UNIVERSE_REV,
  WORLD_SAVE_MIN_VERSION,
  WORLD_SAVE_VERSION,
  type WorldSaveV2,
  type WorldSaveV3,
} from './schema.js';

/** True for a legacy v2 envelope (version 2 + world payload). */
export function isV2Save(input: unknown): input is WorldSaveV2 {
  if (!isSaveRecord(input)) return false;
  return input.version === 2 && isSaveRecord(input.world);
}

/** Upgrade a validated v2 envelope to the current v3 shape. */
export function migrateV2ToV3(save: WorldSaveV2): WorldSaveV3 {
  const world = backfillShips(save.world);
  const stamped = serializeWorld(world, world.timeMs);
  return { ...stamped, universeRev: UNIVERSE_REV };
}

/**
 * Accept unknown save input: v3 validates in place, v2 migrates forward,
 * anything else becomes a typed error. Corrupt worlds stay errors even
 * when the envelope version matches.
 */
export function migrateWorldSave(input: unknown): PersistResult<WorldSaveV3> {
  if (!isSaveRecord(input)) return persistFailure('not-object', 'save must be an object');
  if (input.version === WORLD_SAVE_VERSION) return validateWorldSave(input);
  if (input.version === WORLD_SAVE_MIN_VERSION && isV2Save(input)) {
    return validateWorldSave(migrateV2ToV3(input));
  }
  if (input.version === WORLD_SAVE_MIN_VERSION) {
    return persistFailure('bad-world', 'v2 save world failed validation');
  }
  return persistFailure('bad-version', 'unknown save version', String(input.version));
}

function backfillShips(world: World): World {
  if (!isSaveRecord(world) || !isSaveRecord(world.ships)) return world;
  let ships: World['ships'] = world.ships;
  let changed = false;
  for (const [id, systems] of Object.entries(world.ships)) {
    const patched = backfillSystems(systems);
    if (patched !== systems) {
      ships = { ...ships, [id]: patched };
      changed = true;
    }
  }
  return changed ? { ...world, ships } : world;
}

function backfillSystems(systems: ShipSystems): ShipSystems {
  const surveyed = Array.isArray(systems.surveyed) ? systems.surveyed : [];
  const fuel = Number.isFinite(systems.engineFuel) ? systems.engineFuel : 0;
  if (surveyed === systems.surveyed && fuel === systems.engineFuel) return systems;
  return { ...systems, surveyed, engineFuel: fuel };
}
