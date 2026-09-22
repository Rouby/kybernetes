/**
 * Strike 4 ship-store codec: versioned owned-ship tables plus a pure
 * in-memory ShipStore. The store is logic only (get/set/remove/list);
 * file/database IO adapters live in apps/server and call encode/decode
 * here so sim-core stays free of fs. Pure; no DOM/Node imports.
 */

import type { EngineTier, ReactorTier, ShipRecord, ShipStores } from '../world/ship/shipRecord.js';
import {
  isSaveRecord,
  type PersistResult,
  persistFailure,
  type ShipStoreSave,
  UNIVERSE_REV,
  WORLD_SAVE_VERSION,
} from './schema.js';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Typed ShipRecord validation; corrupt records become PersistErrors. */
export function validateShipRecord(input: unknown): PersistResult<ShipRecord> {
  if (!isSaveRecord(input)) return persistFailure('bad-ship', 'ship must be an object');
  if (typeof input.ownerId !== 'string' || typeof input.shipId !== 'string') {
    return persistFailure('bad-ship', 'ship needs owner and ship ids');
  }
  if (typeof input.hullId !== 'string' || typeof input.locationHubId !== 'string') {
    return persistFailure('bad-ship', 'ship needs hull and hub ids', String(input.shipId));
  }
  if (!isTier(input.reactorTier) || !isTier(input.engineTier)) {
    return persistFailure('bad-ship', 'ship needs 0-2 tiers', String(input.shipId));
  }
  if (!isFiniteNumber(input.credits) || !isFiniteNumber(input.condition)) {
    return persistFailure('bad-ship', 'ship needs numeric credits/condition', String(input.shipId));
  }
  if (typeof input.alive !== 'boolean') {
    return persistFailure('bad-ship', 'ship needs an alive flag', String(input.shipId));
  }
  if (!isStores(input.stores)) {
    return persistFailure('bad-ship', 'ship needs numeric stores', String(input.shipId));
  }
  const engineFuel = parseEngineFuel(input.engineFuel);
  if (engineFuel === undefined) {
    return persistFailure('bad-ship', 'ship needs non-negative engineFuel', String(input.shipId));
  }
  const record = input as unknown as ShipRecord;
  return { ok: true, value: { ...record, engineFuel } };
}

function isTier(value: unknown): value is ReactorTier | EngineTier {
  return value === 0 || value === 1 || value === 2;
}

function isStores(value: unknown): value is ShipStores {
  if (!isSaveRecord(value)) return false;
  return (
    isFiniteNumber(value.rations) &&
    isFiniteNumber(value.waterL) &&
    isFiniteNumber(value.o2Cells) &&
    isFiniteNumber(value.fuelCells)
  );
}

function parseEngineFuel(value: unknown): number | undefined {
  if (value === undefined) return 0;
  if (!isFiniteNumber(value) || value < 0) return undefined;
  return Math.floor(value);
}

/** Pure owned-ship table: userId -> ShipRecord. */
export interface ShipStore {
  get(userId: string): ShipRecord | undefined;
  set(record: ShipRecord): void;
  remove(userId: string): boolean;
  ids(): string[];
  size(): number;
}

export function createMemoryShipStore(initial: readonly ShipRecord[] = []): ShipStore {
  const table = new Map<string, ShipRecord>();
  for (const record of initial) table.set(record.ownerId, record);
  return {
    get: (userId: string) => table.get(userId),
    set: (record: ShipRecord) => {
      table.set(record.ownerId, record);
    },
    remove: (userId: string) => table.delete(userId),
    ids: () => [...table.keys()].sort(),
    size: () => table.size,
  };
}

export function encodeShipStore(store: ShipStore, savedAtMs = 0): ShipStoreSave {
  const ships: Record<string, ShipRecord> = {};
  for (const id of store.ids()) {
    const record = store.get(id);
    if (record !== undefined) ships[id] = { ...record, stores: { ...record.stores } };
  }
  const atMs = isFiniteNumber(savedAtMs) ? savedAtMs : 0;
  return { version: WORLD_SAVE_VERSION, universeRev: UNIVERSE_REV, savedAtMs: atMs, ships };
}

export function encodeShipStoreJson(store: ShipStore, savedAtMs = 0): string {
  return JSON.stringify(encodeShipStore(store, savedAtMs));
}

/** Decode a ship table; every entry validates, wiped records stay wiped. */
export function decodeShipStore(input: unknown): PersistResult<ShipStore> {
  if (!isSaveRecord(input)) return persistFailure('not-object', 'ship store must be an object');
  if (input.version !== WORLD_SAVE_VERSION) {
    return persistFailure('bad-version', 'unknown ship store version', String(input.version));
  }
  if (input.universeRev !== UNIVERSE_REV) {
    return persistFailure(
      'universe-mismatch',
      'ship store pins a different universe revision',
      'universeRev ' + String(input.universeRev)
    );
  }
  if (!isSaveRecord(input.ships)) {
    return persistFailure('bad-ship', 'ship store needs a ships table');
  }
  const records: ShipRecord[] = [];
  for (const [userId, entry] of Object.entries(input.ships)) {
    const checked = validateShipRecord(entry);
    if (!checked.ok) return checked;
    if (checked.value.ownerId !== userId) {
      return persistFailure('bad-ship', 'ship owner key mismatch', userId);
    }
    records.push(checked.value);
  }
  return { ok: true, value: createMemoryShipStore(records) };
}

/** Parse JSON then decode; corrupt text becomes a typed bad-json error. */
export function decodeShipStoreJson(json: string): PersistResult<ShipStore> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return persistFailure('bad-json', 'ship store is not valid JSON', detail);
  }
  return decodeShipStore(parsed);
}
