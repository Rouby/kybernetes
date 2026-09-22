/**
 * Strike 4 file adapters: JSON persistence for owned-ship tables and world
 * saves. All validation runs through the sim-core persist codec; missing or
 * corrupt files resolve to empty/fresh state (the hard-wipe-on-loss path)
 * and never throw on boot. The SimHost owns persistence timing; this module
 * only reads and writes files.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  createMemoryShipStore,
  decodeShipStoreJson,
  deserializeWorld,
  encodeShipStore,
  migrateWorldSave,
  type ShipRecord,
  serializeWorldJson,
  type World,
} from '@kybernetes/sim-core';
import { createShipRegistry, type ShipRegistry } from './shipRegistry.js';

function readText(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function writeText(filePath: string, text: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

/** Parse owned ships from JSON; corrupt input wipes to an empty registry. */
export function loadShipRegistryFromJson(json: string): ShipRegistry {
  const decoded = decodeShipStoreJson(json);
  if (!decoded.ok) return createShipRegistry();
  const registry = createShipRegistry();
  for (const id of decoded.value.ids()) {
    const record = decoded.value.get(id);
    if (record !== undefined) registry.set(id, record);
  }
  return registry;
}

/** Load owned ships from a JSON file; missing/corrupt files start empty. */
export function loadShipRegistryFromFile(filePath: string): ShipRegistry {
  const text = readText(filePath);
  if (text === undefined) return createShipRegistry();
  return loadShipRegistryFromJson(text);
}

/** Save owned ships to a JSON file (versioned ShipStoreSave envelope). */
export function saveShipRegistryToFile(filePath: string, registry: ShipRegistry, nowMs = 0): void {
  const records: ShipRecord[] = [...registry.values()];
  writeText(filePath, JSON.stringify(encodeShipStore(createMemoryShipStore(records), nowMs)));
}

/** Parse a world from JSON; v2 envelopes migrate forward, corrupt fails. */
export function loadWorldFromJson(json: string): World | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
  const migrated = migrateWorldSave(parsed);
  if (!migrated.ok) return undefined;
  const world = deserializeWorld(migrated.value);
  return world.ok ? world.value : undefined;
}

/** Save the live world to a JSON file (versioned v3 envelope). */
export function saveWorldToFile(filePath: string, world: World, nowMs = 0): void {
  writeText(filePath, serializeWorldJson(world, nowMs));
}

/** Load a world from a JSON file; missing/corrupt files return undefined. */
export function loadWorldFromFile(filePath: string): World | undefined {
  const text = readText(filePath);
  if (text === undefined) return undefined;
  return loadWorldFromJson(text);
}
