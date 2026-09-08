/**
 * Beacon -> vessel registry + station hub session.
 * Join/leave/resume by userId persistence (position/role/credits/clearance
 * restored, never client-supplied). Per-beacon caps + join cooldown from day one.
 */

export interface PersistedPawn {
  userId: string;
  callsign: string;
  color: string;
  role: string;
  frameId: string;
  x: number;
  y: number;
  credits: number;
  clearance: number;
}

export interface BeaconEntry {
  beacon: string;
  frameId: string;
  cap: number;
  members: Set<string>;
  lastJoinMs: Map<string, number>;
}

const DEFAULT_BEACON_CAP = 8;
const JOIN_COOLDOWN_MS = 2000;

export function createBeaconEntry(
  beacon: string,
  frameId: string,
  cap = DEFAULT_BEACON_CAP
): BeaconEntry {
  return { beacon, frameId, cap, members: new Set(), lastJoinMs: new Map() };
}

export function canJoinBeacon(entry: BeaconEntry, userId: string, nowMs: number): boolean {
  if (entry.members.has(userId)) return true;
  if (entry.members.size >= entry.cap) return false;
  return !isOnCooldown(entry, userId, nowMs);
}

function isOnCooldown(entry: BeaconEntry, userId: string, nowMs: number): boolean {
  const last = entry.lastJoinMs.get(userId) ?? Number.NEGATIVE_INFINITY;
  return nowMs - last < JOIN_COOLDOWN_MS;
}

export function joinBeacon(entry: BeaconEntry, userId: string, nowMs: number): BeaconEntry {
  const members = new Set(entry.members);
  members.add(userId);
  const lastJoinMs = new Map(entry.lastJoinMs);
  lastJoinMs.set(userId, nowMs);
  return { ...entry, members, lastJoinMs };
}

export function leaveBeacon(entry: BeaconEntry, userId: string): BeaconEntry {
  const members = new Set(entry.members);
  members.delete(userId);
  return { ...entry, members };
}

export function restorePersistedPawn(
  store: ReadonlyMap<string, PersistedPawn>,
  userId: string
): PersistedPawn | undefined {
  return store.get(userId);
}

export function persistPawn(
  store: Map<string, PersistedPawn>,
  pawn: PersistedPawn
): Map<string, PersistedPawn> {
  store.set(pawn.userId, pawn);
  return store;
}
