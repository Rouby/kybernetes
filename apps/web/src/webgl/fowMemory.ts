import {
  createExplorationGrid,
  deserializeExplorationGrid,
  type ExplorationGrid,
  serializeExplorationGrid,
} from '@kybernetes/sim-core';

/** World window shared with FramebufferManager's persistent FOW texture. */
const FOW_GRID_WIDTH = 2400;
const FOW_GRID_HEIGHT = 1000;
const FOW_GRID_OX = -200;
const FOW_GRID_OY = -200;
const FOW_GRID_CELL = 20;

/** Minimal storage surface so tests can inject an in-memory map. */
export interface FowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** CPU source of truth for explored ship regions (authoritative over the GPU mask). */
export function createFowGrid(): ExplorationGrid {
  return createExplorationGrid(
    FOW_GRID_WIDTH,
    FOW_GRID_HEIGHT,
    FOW_GRID_CELL,
    FOW_GRID_OX,
    FOW_GRID_OY
  );
}

export function fowStorageKey(beacon: string, userId: string): string {
  return `kybernetes.fow.v1:${beacon}:${userId}`;
}

/** Persist explored memory; quota/privacy failures are silent by design. */
export function saveFowGrid(
  storage: FowStorage,
  beacon: string,
  userId: string,
  grid: ExplorationGrid
): void {
  try {
    storage.setItem(fowStorageKey(beacon, userId), JSON.stringify(serializeExplorationGrid(grid)));
  } catch {
    // Exploration memory is best-effort: the GPU mask still holds this session.
  }
}

/** Restore explored memory; null on first run or any corrupt payload. */
export function loadFowGrid(
  storage: FowStorage,
  beacon: string,
  userId: string
): ExplorationGrid | null {
  try {
    const raw = storage.getItem(fowStorageKey(beacon, userId));
    if (raw === null) return null;
    return deserializeExplorationGrid(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function clearFowGrid(storage: FowStorage, beacon: string, userId: string): void {
  try {
    storage.removeItem?.(fowStorageKey(beacon, userId));
  } catch {
    // Clearing is best-effort.
  }
}
