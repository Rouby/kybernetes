/**
 * Strike 4 persistence schema: versioned world/universe save envelopes.
 * The save format is versioned independently of the wire protocol (v2
 * snapshots are untouched): WORLD_SAVE_VERSION bumps on shape changes,
 * UNIVERSE_REV pins the catalog revision the world was saved against so a
 * killed server never resumes at a drifted hub, dock, or lane.
 * Pure types + guards only; no DOM/Node imports.
 */

import type { ShipRecord } from '../world/ship/shipRecord.js';
import type { World } from '../world/types.js';

/** Current world-save format. Bump on any persisted World shape change. */
export const WORLD_SAVE_VERSION = 3 as const;

/** Oldest world-save format this build can read (via migrateWorldSave). */
export const WORLD_SAVE_MIN_VERSION = 2 as const;

/** Universe catalog revision pinned into every save. Bump with catalog.ts. */
export const UNIVERSE_REV = 1 as const;

/** Current (v3) envelope: explicit universe pin + save timestamp. */
export interface WorldSaveV3 {
  readonly version: typeof WORLD_SAVE_VERSION;
  readonly universeRev: number;
  readonly savedAtMs: number;
  readonly world: World;
}

/**
 * Legacy (v2) envelope: same World payload, no universe pin or timestamp.
 * Kept minimal on purpose; migrateV2ToV3 fills the v3 header fields.
 */
export interface WorldSaveV2 {
  readonly version: 2;
  readonly world: World;
}

export type VersionedWorldSave = WorldSaveV2 | WorldSaveV3;

/** Versioned owned-ship table (one ShipRecord per user id). */
export interface ShipStoreSave {
  readonly version: typeof WORLD_SAVE_VERSION;
  readonly universeRev: number;
  readonly savedAtMs: number;
  readonly ships: Readonly<Record<string, ShipRecord>>;
}

export type PersistErrorCode =
  | 'not-object'
  | 'bad-json'
  | 'bad-version'
  | 'unsupported-version'
  | 'universe-mismatch'
  | 'bad-world'
  | 'bad-ship';

export interface PersistError {
  readonly code: PersistErrorCode;
  readonly message: string;
  readonly detail?: string;
}

export type PersistResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PersistError };

export function persistError(
  code: PersistErrorCode,
  message: string,
  detail?: string
): PersistError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

export function persistFailure<T>(
  code: PersistErrorCode,
  message: string,
  detail?: string
): PersistResult<T> {
  return { ok: false, error: persistError(code, message, detail) };
}

/** Plain-object guard for unknown save input. Never throws. */
export function isSaveRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read the envelope version without throwing; undefined when absent. */
export function readSaveVersion(input: unknown): number | undefined {
  if (!isSaveRecord(input)) return undefined;
  return typeof input.version === 'number' ? input.version : undefined;
}

/** True when the envelope pins the running catalog revision. */
export function matchesUniverseRev(input: unknown): boolean {
  if (!isSaveRecord(input)) return false;
  return input.universeRev === UNIVERSE_REV;
}
