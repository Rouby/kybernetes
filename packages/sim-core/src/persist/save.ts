/**
 * Strike 4 world codec: serialize/deserialize a World with deep-equal
 * fidelity (frames, topology ids, docks, ships/nav, cargo, market) plus
 * validateWorldSave for explicit typed rejection of corrupt input.
 * Validation never throws on corrupt input; serializeWorld throws only on
 * programmer misuse (non-object world). Pure; no DOM/Node imports.
 */

import type { CargoState } from '../world/ship/cargo.js';
import type { MarketLedger } from '../world/ship/market.js';
import type { World } from '../world/types.js';
import {
  isSaveRecord,
  type PersistResult,
  persistFailure,
  UNIVERSE_REV,
  WORLD_SAVE_VERSION,
  type WorldSaveV3,
} from './schema.js';

const VESSEL_PHASES: ReadonlySet<string> = new Set([
  'docked',
  'departing',
  'in_transit',
  'inbound',
]);

const NAV_PHASES: ReadonlySet<string> = new Set(['docked', 'in_transit', 'docking']);

const CRATE_PLACES: ReadonlySet<string> = new Set(['bayFloor', 'carriedBy', 'shipFloor']);

const PORTAL_KINDS: ReadonlySet<string> = new Set(['door', 'hole', 'open', 'airlock', 'window']);

const PORTAL_STATES: ReadonlySet<string> = new Set(['open', 'closed', 'destroyed', 'sealed']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVec(value: unknown): boolean {
  if (!isSaveRecord(value)) return false;
  return isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

/** Deep clone through JSON so saves detach from live sim state. */
function cloneWorld(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}

export function serializeWorld(world: World, savedAtMs = 0): WorldSaveV3 {
  if (typeof world !== 'object' || world === null) {
    throw new TypeError('serializeWorld expects a World object');
  }
  const atMs = isFiniteNumber(savedAtMs) ? savedAtMs : 0;
  return {
    version: WORLD_SAVE_VERSION,
    universeRev: UNIVERSE_REV,
    savedAtMs: atMs,
    world: cloneWorld(world),
  };
}

export function serializeWorldJson(world: World, savedAtMs = 0): string {
  return JSON.stringify(serializeWorld(world, savedAtMs));
}

/** Validate a parsed v3 envelope and return its World on success. */
export function deserializeWorld(input: unknown): PersistResult<World> {
  const checked = validateWorldSave(input);
  if (!checked.ok) return checked;
  return { ok: true, value: cloneWorld(checked.value.world) };
}

/** Parse JSON then validate; corrupt text becomes a typed bad-json error. */
export function deserializeWorldJson(json: string): PersistResult<World> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return persistFailure('bad-json', 'save is not valid JSON', detail);
  }
  return deserializeWorld(parsed);
}

/** Strict v3 envelope check with deep world-shape validation. */
export function validateWorldSave(input: unknown): PersistResult<WorldSaveV3> {
  if (!isSaveRecord(input)) return persistFailure('not-object', 'save must be an object');
  if (input.version !== WORLD_SAVE_VERSION) {
    return input.version === 2
      ? persistFailure('unsupported-version', 'v2 saves need migrateWorldSave', 'version 2')
      : persistFailure('bad-version', 'unknown save version', String(input.version));
  }
  if (input.universeRev !== UNIVERSE_REV) {
    return persistFailure(
      'universe-mismatch',
      'save pins a different universe revision',
      'universeRev ' + String(input.universeRev)
    );
  }
  if (!isFiniteNumber(input.savedAtMs)) {
    return persistFailure('bad-world', 'save needs a numeric savedAtMs');
  }
  const shape = checkWorldShape(input.world);
  if (shape !== undefined)
    return persistFailure('bad-world', 'save world failed validation', shape);
  return { ok: true, value: input as unknown as WorldSaveV3 };
}

function checkWorldShape(world: unknown): string | undefined {
  if (!isSaveRecord(world)) return 'world must be an object';
  const top = checkTopLevel(world);
  if (top !== undefined) return top;
  return (
    checkFrames(world) ??
    checkTopology(world) ??
    checkDocks(world) ??
    checkShips(world) ??
    checkCargo(world) ??
    checkMarket(world)
  );
}

const TOP_TABLES: ReadonlyArray<readonly [string, 'record' | 'array']> = [
  ['vessels', 'record'],
  ['stations', 'record'],
  ['rooms', 'record'],
  ['portals', 'record'],
  ['fixtures', 'record'],
  ['pawns', 'record'],
  ['projectiles', 'record'],
  ['wallsByFrame', 'record'],
  ['ships', 'record'],
  ['docks', 'record'],
  ['cargo', 'record'],
  ['market', 'record'],
  ['impacts', 'array'],
  ['decals', 'array'],
];

function checkTopLevel(world: Record<string, unknown>): string | undefined {
  if (!isFiniteNumber(world.tick)) return 'world.tick must be a finite number';
  if (!isFiniteNumber(world.timeMs)) return 'world.timeMs must be a finite number';
  for (const [key, kind] of TOP_TABLES) {
    const value = world[key];
    const valid = kind === 'array' ? Array.isArray(value) : isSaveRecord(value);
    if (!valid) return 'world.' + key + ' must be ' + (kind === 'array' ? 'an array' : 'an object');
  }
  return undefined;
}

type EntryChecker = (id: string, entry: unknown) => string | undefined;

function checkEntries(table: unknown, check: EntryChecker): string | undefined {
  const rows = table as Record<string, unknown>;
  for (const [id, entry] of Object.entries(rows)) {
    const problem = check(id, entry);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

function isPhase(value: unknown, phases: ReadonlySet<string>): value is string {
  return typeof value === 'string' && phases.has(value);
}

function checkFrames(world: Record<string, unknown>): string | undefined {
  return (
    checkEntries(world.vessels, checkVesselEntry) ?? checkEntries(world.stations, checkStationEntry)
  );
}

function checkVesselEntry(id: string, entry: unknown): string | undefined {
  if (!isSaveRecord(entry)) return `vessel ${id} must be an object`;
  if (!isVec(entry.origin)) return `vessel ${id} needs a finite origin`;
  if (!isFiniteNumber(entry.angle)) return `vessel ${id} needs a finite angle`;
  if (!isVec(entry.vel)) return `vessel ${id} needs a finite vel`;
  if (!isPhase(entry.schedule, VESSEL_PHASES)) return `vessel ${id} has an unknown schedule phase`;
  return undefined;
}

function checkStationEntry(id: string, entry: unknown): string | undefined {
  if (!isSaveRecord(entry)) return `station ${id} must be an object`;
  if (!isVec(entry.origin)) return `station ${id} needs a finite origin`;
  return undefined;
}

function checkTopology(world: Record<string, unknown>): string | undefined {
  return checkEntries(world.rooms, checkRoomEntry) ?? checkEntries(world.portals, checkPortalEntry);
}

function checkRoomEntry(id: string, entry: unknown): string | undefined {
  if (!isSaveRecord(entry)) return `room ${id} must be an object`;
  if (typeof entry.frameId !== 'string' || entry.frameId.length === 0) {
    return `room ${id} needs a frame id`;
  }
  return undefined;
}

function checkPortalEntry(id: string, entry: unknown): string | undefined {
  if (!isSaveRecord(entry)) return `portal ${id} must be an object`;
  if (typeof entry.roomA !== 'string' || typeof entry.roomB !== 'string') {
    return `portal ${id} needs room endpoints`;
  }
  return checkPortalKindState(id, entry);
}

function checkPortalKindState(id: string, entry: Record<string, unknown>): string | undefined {
  if (!isPhase(entry.kind, PORTAL_KINDS)) return `portal ${id} has an unknown kind`;
  if (!isPhase(entry.state, PORTAL_STATES)) return `portal ${id} has an unknown state`;
  return undefined;
}

function checkDocks(world: Record<string, unknown>): string | undefined {
  return checkEntries(world.docks, checkDockEntry);
}

function checkDockEntry(id: string, entry: unknown): string | undefined {
  if (!isSaveRecord(entry)) return `dock ${id} must be an object`;
  if (typeof entry.stationFrame !== 'string' || typeof entry.vesselFrame !== 'string') {
    return `dock ${id} needs station and vessel frames`;
  }
  if (typeof entry.stationPortal !== 'string' || typeof entry.vesselPortal !== 'string') {
    return `dock ${id} needs gate portal ids`;
  }
  return checkMouth(id, entry.mouthWorld);
}

function checkMouth(id: string, mouth: unknown): string | undefined {
  if (!isSaveRecord(mouth)) return `dock ${id} needs a mouth segment`;
  if (!isFiniteNumber(mouth.x1) || !isFiniteNumber(mouth.y1)) {
    return `dock ${id} mouth needs finite coordinates`;
  }
  if (!isFiniteNumber(mouth.x2) || !isFiniteNumber(mouth.y2)) {
    return `dock ${id} mouth needs finite coordinates`;
  }
  return undefined;
}

function checkShips(world: Record<string, unknown>): string | undefined {
  return checkEntries(world.ships, checkSystemsEntry);
}

function isShipTier(value: unknown): boolean {
  return value === 0 || value === 1 || value === 2;
}

function checkSystemsEntry(id: string, entry: unknown): string | undefined {
  if (!isSaveRecord(entry)) return `ship ${id} must be an object`;
  if (entry.vesselId !== id) return `ship ${id} vessel id mismatch`;
  const tiers = checkTiers(id, entry);
  if (tiers !== undefined) return tiers;
  const nav = checkNav(id, entry.nav);
  if (nav !== undefined) return nav;
  if (!isFiniteNumber(entry.condition)) return `ship ${id} needs finite condition`;
  if (!isFiniteNumber(entry.engineFuel)) return `ship ${id} needs finite engineFuel`;
  return undefined;
}

function checkTiers(id: string, systems: Record<string, unknown>): string | undefined {
  if (!isShipTier(systems.reactorTier)) return `ship ${id} has an unknown reactor tier`;
  if (!isShipTier(systems.engineTier)) return `ship ${id} has an unknown engine tier`;
  return undefined;
}

function checkNav(id: string, nav: unknown): string | undefined {
  if (!isSaveRecord(nav)) return 'ship ' + id + ' needs a nav state';
  if (typeof nav.phase !== 'string' || !NAV_PHASES.has(nav.phase)) {
    return 'ship ' + id + ' has an unknown nav phase';
  }
  if (!isFiniteNumber(nav.remainingS)) return 'ship ' + id + ' needs finite nav remainingS';
  if (typeof nav.portHubId !== 'string') return 'ship ' + id + ' needs a port hub id';
  if (!Array.isArray(nav.stops)) return 'ship ' + id + ' needs a nav stops array';
  if (!isFiniteNumber(nav.legIndex)) return 'ship ' + id + ' needs a numeric nav legIndex';
  return undefined;
}

function checkCargo(world: Record<string, unknown>): string | undefined {
  const cargo = world.cargo as CargoState;
  if (!isSaveRecord(cargo.crates)) return 'cargo.crates must be an object';
  for (const [id, crate] of Object.entries(cargo.crates)) {
    if (!isSaveRecord(crate)) return 'crate ' + id + ' must be an object';
    if (!Array.isArray(crate.items)) return 'crate ' + id + ' needs an items array';
    if (typeof crate.where !== 'string' || !CRATE_PLACES.has(crate.where)) {
      return 'crate ' + id + ' has an unknown location';
    }
    if (typeof crate.frameId !== 'string') return 'crate ' + id + ' needs a frame id';
  }
  if (!isSaveRecord(cargo.secured)) return 'cargo.secured must be an object';
  return undefined;
}

function checkMarket(world: Record<string, unknown>): string | undefined {
  const market = world.market as MarketLedger;
  if (!isSaveRecord(market.stock)) return 'market.stock must be an object';
  for (const [hub, table] of Object.entries(market.stock)) {
    if (!isSaveRecord(table)) return 'market stock for ' + hub + ' must be an object';
    for (const [good, qty] of Object.entries(table)) {
      if (!isFiniteNumber(qty)) return 'market stock ' + hub + '/' + good + ' must be numeric';
    }
  }
  if (!isFiniteNumber(market.lastRestockMs)) return 'market.lastRestockMs must be numeric';
  return undefined;
}
