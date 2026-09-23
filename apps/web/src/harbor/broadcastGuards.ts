/**
 * Broadcast guards: minimal runtime shape checks for S->C broadcasts.
 * P0 wiring fix: socketCore.handleMessage previously cast
 * `as unknown as XBroadcast` with no version/shape checks, so malformed
 * numerics could flow into WebGL/HUD. These guards run before cache commit;
 * failures drop + count, never throw.
 * Pure, no DOM.
 */

import { isV2Packet } from '@kybernetes/protocol';

export interface BroadcastDropStats {
  version: number;
  shape: number;
  staleDeltaBase: number;
  unknownType: number;
}

const drops: BroadcastDropStats = { version: 0, shape: 0, staleDeltaBase: 0, unknownType: 0 };

export function getBroadcastDropStats(): BroadcastDropStats {
  return { ...drops };
}

export function resetBroadcastDropStats(): void {
  drops.version = 0;
  drops.shape = 0;
  drops.staleDeltaBase = 0;
  drops.unknownType = 0;
}

function recordDrop(kind: keyof BroadcastDropStats): void {
  drops[kind] += 1;
}

export function recordBroadcastDrop(kind: keyof BroadcastDropStats): void {
  recordDrop(kind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Shared envelope check: v===2, finite tick + serverTimeMs, string type. */
function isTickedBroadcast(value: unknown): value is Record<string, unknown> {
  if (!isV2Packet(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return isFiniteNum(record.tick) && isFiniteNum(record.serverTimeMs);
}

function isArrayField(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function hasArrays(record: Record<string, unknown>, fields: readonly string[]): boolean {
  for (const field of fields) {
    const value = record[field];
    if (value === undefined) continue;
    if (!isArrayField(value)) return false;
  }
  for (const field of fields) {
    if (record[field] === undefined && (field === 'pawns' || field === 'portals')) return false;
  }
  return true;
}

function isSnapshotShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return hasArrays(msg, [
    'pawns',
    'impacts',
    'portals',
    'projectiles',
    'frames',
    'decals',
    'crates',
  ]);
}

function isSnapshotDeltaShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  if (!isFiniteNum(msg.baseTick)) return false;
  if (!isBool(msg.full)) return false;
  if (!isFiniteNum(msg.portalRev) || !isFiniteNum(msg.frameRev)) return false;
  return hasArrays(msg, [
    'pawns',
    'impacts',
    'portals',
    'projectiles',
    'frames',
    'decals',
    'crates',
  ]);
}

function isTelemetryShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  if (!isRecord(msg.subsystems)) return false;
  return isArrayField(msg.atmos);
}

function isVitalsShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  if (!isRecord(msg.vitals)) return false;
  const vitals = msg.vitals as Record<string, unknown>;
  if (!isBool(vitals.dead)) return false;
  for (const field of ['hunger', 'thirst', 'fatigue', 'health', 'hypoxia'] as const) {
    if (!isFiniteNum(vitals[field])) return false;
  }
  return true;
}

function isWatchShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isFiniteNum(msg.remainingS) && isArrayField(msg.checklist);
}

function isManifestShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.beacon) && isArrayField(msg.crew);
}

function isShipSystemsShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.vesselId) && isFiniteNum(msg.tempK) && isFiniteNum(msg.outputMW);
}

function isShipStatusShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.shipId) && isFiniteNum(msg.credits);
}

function isNavStateShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.vesselId) && isFiniteNum(msg.remainingS);
}

function isChartStateShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.vesselId) && isArrayField(msg.nodes);
}

function isCargoStateShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.vesselId) && isArrayField(msg.secured);
}

function isMarketStateShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.hubId) && isArrayField(msg.listings);
}

function isDockShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.vesselId) && isString(msg.dockId) && isBool(msg.walkable);
}

function isStatsShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isFiniteNum(msg.tpsActual) && isArrayField(msg.pawns);
}

function isDeathShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.pawnId) && isString(msg.cause);
}

function isNoticeShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.title) && isString(msg.message) && isString(msg.severity);
}

function isJoinedShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.pawnId);
}

function isHireOfferShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.offerId) && isArrayField(msg.jobs);
}

function isShipLostShape(msg: Record<string, unknown>): boolean {
  if (!isTickedBroadcast(msg)) return false;
  return isString(msg.shipId) && isString(msg.reason);
}

function isHelloMismatchShape(msg: Record<string, unknown>): boolean {
  if (!isRecord(msg)) return false;
  if (msg.v !== 2) return false;
  return typeof msg.message === 'string' || msg.message === undefined;
}

export const BROADCAST_GUARDS: Readonly<Record<string, (msg: Record<string, unknown>) => boolean>> =
  {
    SNAPSHOT: isSnapshotShape,
    SNAPSHOT_DELTA: isSnapshotDeltaShape,
    TELEMETRY: isTelemetryShape,
    VITALS: isVitalsShape,
    WATCH: isWatchShape,
    MANIFEST: isManifestShape,
    SHIP_SYSTEMS: isShipSystemsShape,
    SHIP_STATUS: isShipStatusShape,
    NAV_STATE: isNavStateShape,
    CHART_STATE: isChartStateShape,
    CARGO_STATE: isCargoStateShape,
    MARKET_STATE: isMarketStateShape,
    DOCK_STATUS: isDockShape,
    SERVER_STATS: isStatsShape,
    DEATH: isDeathShape,
    NOTICE: isNoticeShape,
    JOINED: isJoinedShape,
    HIRE_OFFER: isHireOfferShape,
    SHIP_LOST: isShipLostShape,
    HELLO_MISMATCH: isHelloMismatchShape,
  };
