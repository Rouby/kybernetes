/**
 * Solo-ship registry (TRANSFORM M1). userId -> owned ShipRecord.
 * Replaces beacon-seat caps for the solo loop: one persistent ship per
 * player, resume by userId, hard wipe on loss. Pure logic; the host owns
 * persistence timing. No DOM/Node imports.
 */

import {
  createStarterSkiff,
  isShipLost,
  restartSkiff,
  type ShipRecord,
} from '@kybernetes/sim-core';

export interface SoloShipEntry {
  readonly userId: string;
  readonly ship: ShipRecord;
  readonly pawnId: string;
  readonly frameId: string;
}

export type ShipRegistry = Map<string, ShipRecord>;

export function createShipRegistry(): ShipRegistry {
  return new Map();
}

/** Ensure a live owned ship; restarts fresh after a hard loss. */
export function ensureSoloShip(registry: ShipRegistry, userId: string): ShipRecord {
  const current = registry.get(userId);
  if (current !== undefined && !isShipLost(current)) return current;
  const fresh = current === undefined ? createStarterSkiff(userId) : restartSkiff(userId);
  registry.set(userId, fresh);
  return fresh;
}

export function getSoloShip(registry: ShipRegistry, userId: string): ShipRecord | undefined {
  return registry.get(userId);
}

export function saveSoloShip(registry: ShipRegistry, ship: ShipRecord): void {
  registry.set(ship.ownerId, ship);
}

export function soloPawnIdFor(userId: string): string {
  return `pawn:${userId}`;
}

export function soloEntryFor(
  registry: ShipRegistry,
  userId: string,
  frameId: string
): SoloShipEntry {
  const ship = ensureSoloShip(registry, userId);
  return { userId, ship, pawnId: soloPawnIdFor(userId), frameId };
}
