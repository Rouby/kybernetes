/**
 * Pure debug-world mapping: static hull geometry plus live v2 snapshots into
 * top-down render primitives. No React, no DOM, no canvas: the 2D debug
 * canvas in DebugWorldView draws exactly what these helpers return, so every
 * transform here is unit-covered. World space is snapshot frame origins
 * applied to frame-local hull rects and portal segments.
 */

import type { SnapshotBroadcast, TelemetryBroadcast } from '@kybernetes/protocol';
import { SHIP_ORIGIN, type World } from '@kybernetes/sim-core';

export type DebugOverlayMode = 'pressure' | 'o2' | 'temp';

export interface DebugRoom {
  readonly id: string;
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly pressureKpa: number;
  readonly tempCelsius: number;
  readonly o2Percent: number;
  readonly co2Ppm: number;
  readonly repressurizing: boolean;
  readonly venting: boolean;
}

export interface DebugPortal {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly midX: number;
  readonly midY: number;
  readonly axisX: number;
  readonly axisY: number;
  readonly state: 'open' | 'closed' | 'destroyed' | 'sealed';
  readonly open: boolean;
  readonly velocityMps: number;
}

export interface DebugPawn {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly color: string;
  readonly roomHint: string;
  readonly isOwn: boolean;
}

export interface DebugBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function debugOrigins(
  snapshot: SnapshotBroadcast | null
): Map<string, { x: number; y: number }> {
  const origins = new Map<string, { x: number; y: number }>();
  origins.set('station', { x: 0, y: 0 });
  origins.set('ship', { ...SHIP_ORIGIN });
  for (const frame of snapshot?.frames ?? []) {
    origins.set(frame.id, { x: frame.originX, y: frame.originY });
  }
  return origins;
}

function originFor(
  origins: Map<string, { x: number; y: number }>,
  frameId: string
): { x: number; y: number } {
  return origins.get(frameId) ?? { x: 0, y: 0 };
}

function atmosFor(telemetry: TelemetryBroadcast | null, roomId: string) {
  return telemetry?.atmos.find((room) => room.roomId === roomId);
}

export function buildDebugRooms(
  world: World,
  snapshot: SnapshotBroadcast | null,
  telemetry: TelemetryBroadcast | null
): DebugRoom[] {
  const origins = debugOrigins(snapshot);
  return Object.values(world.rooms).map((room) => {
    const origin = originFor(origins, room.frameId);
    const atmos = atmosFor(telemetry, room.id);
    const pressureKpa = atmos?.pressureKpa ?? 101.3;
    return {
      id: room.id,
      frameId: room.frameId,
      x: room.rect.x + origin.x,
      y: room.rect.y + origin.y,
      w: room.rect.w,
      h: room.rect.h,
      pressureKpa,
      tempCelsius: atmos?.tempCelsius ?? 21,
      o2Percent: atmos?.o2Percent ?? 20.9,
      co2Ppm: atmos?.co2Ppm ?? 600,
      repressurizing: atmos?.repressurizing ?? false,
      venting: pressureKpa < 20,
    };
  });
}

export function flowFor(telemetry: TelemetryBroadcast | null, portalId: string): number {
  return telemetry?.flows?.find((flow) => flow.portalId === portalId)?.velocityMps ?? 0;
}

function portalLiveState(
  snapshot: SnapshotBroadcast | null,
  portalId: string
): { open: boolean; state: DebugPortal['state'] } {
  const live = snapshot?.portals.find((portal) => portal.id === portalId);
  if (live === undefined) return { open: false, state: 'closed' };
  return { open: live.open, state: live.state };
}

function roomCenterWorld(
  world: World,
  roomId: string,
  origins: Map<string, { x: number; y: number }>
): { x: number; y: number } | undefined {
  const room = world.rooms[roomId];
  if (room === undefined) return undefined;
  const origin = originFor(origins, room.frameId);
  return {
    x: room.rect.x + origin.x + room.rect.w / 2,
    y: room.rect.y + origin.y + room.rect.h / 2,
  };
}

export function portalAxis(
  world: World,
  portalId: string,
  origins: Map<string, { x: number; y: number }>
): { x: number; y: number } {
  const edge = world.portals[portalId];
  if (edge === undefined) return { x: 1, y: 0 };
  const from = roomCenterWorld(world, edge.roomA, origins);
  const to = roomCenterWorld(world, edge.roomB, origins);
  if (from === undefined) return { x: 1, y: 0 };
  if (to === undefined) return wallNormal(edge.segment);
  return normalized(to.x - from.x, to.y - from.y);
}

function wallNormal(segment: { x1: number; y1: number; x2: number; y2: number }): {
  x: number;
  y: number;
} {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  return normalized(-dy, dx);
}

function normalized(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (!(len > 0)) return { x: 1, y: 0 };
  return { x: x / len, y: y / len };
}

export function buildDebugPortals(
  world: World,
  snapshot: SnapshotBroadcast | null,
  telemetry: TelemetryBroadcast | null
): DebugPortal[] {
  const origins = debugOrigins(snapshot);
  return Object.values(world.portals).map((edge) => {
    const room = world.rooms[edge.roomA];
    const origin = originFor(origins, room?.frameId ?? 'station');
    const live = portalLiveState(snapshot, edge.id);
    const axis = portalAxis(world, edge.id, origins);
    const x1 = edge.segment.x1 + origin.x;
    const y1 = edge.segment.y1 + origin.y;
    return {
      id: edge.id,
      x1,
      y1,
      x2: edge.segment.x2 + origin.x,
      y2: edge.segment.y2 + origin.y,
      midX: (x1 + edge.segment.x2 + origin.x) / 2,
      midY: (y1 + edge.segment.y2 + origin.y) / 2,
      axisX: axis.x,
      axisY: axis.y,
      state: live.state,
      open: live.open,
      velocityMps: flowFor(telemetry, edge.id),
    };
  });
}

export function buildDebugPawns(
  snapshot: SnapshotBroadcast | null,
  pawnId: string | null
): DebugPawn[] {
  if (snapshot === null) return [];
  const origins = debugOrigins(snapshot);
  return snapshot.pawns.map((pawn) => {
    const origin = originFor(origins, pawn.frameId);
    return {
      id: pawn.id,
      x: pawn.x + origin.x,
      y: pawn.y + origin.y,
      facing: pawn.facing,
      color: pawn.color,
      roomHint: pawn.roomHint,
      isOwn: pawn.id === pawnId,
    };
  });
}

export function debugBounds(rooms: readonly DebugRoom[]): DebugBounds | undefined {
  if (rooms.length === 0) return undefined;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const room of rooms) {
    minX = Math.min(minX, room.x);
    minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x + room.w);
    maxY = Math.max(maxY, room.y + room.h);
  }
  return { minX, minY, maxX, maxY };
}

export interface OverviewFraming {
  readonly bounds: DebugBounds;
  /** Normalized station→ship direction while the vessel is off-screen. */
  readonly shipOffscreen: { x: number; y: number } | null;
}

/** Edge gap past which the ship stops stretching the overview. */
export const SHIP_OVERVIEW_LEASH_PX = 300;

/**
 * Stable debug framing: the station always fits; the ship joins the frame
 * only while moored against it (bounds nearly touching). Off-station legs
 * pin the camera on the harbor and report the vessel bearing instead of
 * shrinking the station to a dot beside empty transit void.
 */
export function overviewFraming(
  rooms: readonly DebugRoom[],
  leashPx = SHIP_OVERVIEW_LEASH_PX
): OverviewFraming | undefined {
  const station = debugBounds(rooms.filter((room) => room.frameId !== 'ship'));
  const ship = debugBounds(rooms.filter((room) => room.frameId === 'ship'));
  if (station === undefined) {
    if (ship === undefined) return undefined;
    return { bounds: ship, shipOffscreen: null };
  }
  if (ship === undefined) return { bounds: station, shipOffscreen: null };
  const gapX = Math.max(ship.minX - station.maxX, station.minX - ship.maxX);
  const gapY = Math.max(ship.minY - station.maxY, station.minY - ship.maxY);
  const gap = Math.max(gapX, gapY);
  if (gap <= leashPx) {
    return {
      bounds: {
        minX: Math.min(station.minX, ship.minX),
        minY: Math.min(station.minY, ship.minY),
        maxX: Math.max(station.maxX, ship.maxX),
        maxY: Math.max(station.maxY, ship.maxY),
      },
      shipOffscreen: null,
    };
  }
  const dx = (ship.minX + ship.maxX) / 2 - (station.minX + station.maxX) / 2;
  const dy = (ship.minY + ship.maxY) / 2 - (station.minY + station.maxY) / 2;
  const len = Math.hypot(dx, dy) || 1;
  return { bounds: station, shipOffscreen: { x: dx / len, y: dy / len } };
}

export function pressureColor(pressureKpa: number): string {
  if (!Number.isFinite(pressureKpa) || pressureKpa < 20) return '#f85149';
  if (pressureKpa < 90) return '#d29922';
  if (pressureKpa <= 112) return '#3fb950';
  return '#58a6ff';
}

export function o2Color(o2Percent: number): string {
  if (!Number.isFinite(o2Percent) || o2Percent < 16) return '#f85149';
  if (o2Percent < 19) return '#d29922';
  if (o2Percent <= 23.5) return '#3fb950';
  return '#58a6ff';
}

export function tempColor(tempCelsius: number): string {
  if (!Number.isFinite(tempCelsius) || tempCelsius < 0) return '#58a6ff';
  if (tempCelsius < 10) return '#79c0ff';
  if (tempCelsius <= 30) return '#3fb950';
  if (tempCelsius <= 45) return '#d29922';
  return '#f85149';
}

export function roomOverlayColor(room: DebugRoom, mode: DebugOverlayMode): string {
  if (mode === 'o2') return o2Color(room.o2Percent);
  if (mode === 'temp') return tempColor(room.tempCelsius);
  return pressureColor(room.pressureKpa);
}

export function portalColor(state: DebugPortal['state']): string {
  if (state === 'open') return '#3fb950';
  if (state === 'destroyed') return '#f85149';
  if (state === 'sealed') return '#58a6ff';
  return '#8b949e';
}

export function bareDebugId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}

export function formatKpa(pressureKpa: number): string {
  if (!Number.isFinite(pressureKpa)) return '--';
  return `${pressureKpa.toFixed(1)}kPa`;
}
