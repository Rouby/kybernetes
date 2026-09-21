/**
 * debugCanvas: framework-free 2D paint for the pawn-less observer view.
 * Moved verbatim out of DebugWorldView.tsx so the vanilla DebugView (and its
 * Playwright twin) can paint without React. Pure mappers stay in debugWorld;
 * canvas layering and status-line wording live here and are pinned by tests.
 */

import type {
  DockStatusBroadcast,
  ServerStatsBroadcast,
  SnapshotBroadcast,
  TelemetryBroadcast,
} from '@kybernetes/protocol';
import type { World } from '@kybernetes/sim-core';
import {
  type Camera,
  cameraFor,
  nearestPawn,
  paintDecals,
  paintImpacts,
  paintRoomLabel,
  paintShipMarker,
  toScreen,
} from './debugPaint';
import {
  buildDebugPawns,
  buildDebugPortals,
  buildDebugRooms,
  type DebugOverlayMode,
  type DebugPawn,
  type DebugPortal,
  type DebugRoom,
  portalColor,
  roomOverlayColor,
} from './debugWorld';
import { dockChipText, formatPawnLink, formatServerStats } from './renderState';

export const DEBUG_OVERLAY_ORDER: readonly DebugOverlayMode[] = ['pressure', 'o2', 'temp'];

export function nextOverlay(mode: DebugOverlayMode): DebugOverlayMode {
  const index = DEBUG_OVERLAY_ORDER.indexOf(mode);
  return DEBUG_OVERLAY_ORDER[(index + 1) % DEBUG_OVERLAY_ORDER.length] ?? 'pressure';
}

export interface DockMouthLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface DebugModels {
  readonly rooms: readonly DebugRoom[];
  readonly portals: readonly DebugPortal[];
  readonly pawns: readonly DebugPawn[];
  readonly docks: readonly DockMouthLine[];
}

export function buildDebugModels(
  staticWorld: World,
  snapshot: SnapshotBroadcast | null,
  telemetry: TelemetryBroadcast | null
): DebugModels {
  return {
    rooms: buildDebugRooms(staticWorld, snapshot, telemetry),
    portals: buildDebugPortals(staticWorld, snapshot, telemetry),
    pawns: buildDebugPawns(snapshot, null),
    docks: Object.values(staticWorld.docks).map((dock) => ({ ...dock.mouthWorld })),
  };
}

export interface DebugScene extends DebugModels {
  readonly snapshot: SnapshotBroadcast | null;
  readonly overlay: DebugOverlayMode;
  readonly followId: string | null;
}

/** Camera for a click in screen pixels: overview or pawn follow. */
export function debugCameraForClick(
  canvas: HTMLCanvasElement,
  models: DebugModels,
  followId: string | null,
  sx: number,
  sy: number
): string | null {
  const camera = cameraFor(canvas, models.rooms, models.pawns, followId);
  return nearestPawn(models.pawns, (pawn) => toScreen(canvas, camera, pawn.x, pawn.y), sx, sy);
}

export function paintDebugScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scene: DebugScene
): void {
  const camera = cameraFor(canvas, scene.rooms, scene.pawns, scene.followId);
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  paintRooms(ctx, canvas, camera, scene.rooms, scene.overlay);
  paintPortals(ctx, canvas, camera, scene.portals);
  paintWind(ctx, canvas, camera, scene.portals);
  paintImpacts(ctx, canvas, camera, scene.snapshot);
  paintDecals(ctx, canvas, camera, scene.snapshot);
  paintDockLink(ctx, canvas, camera, scene.docks);
  paintPawns(ctx, canvas, camera, scene.pawns, scene.followId);
  paintShipMarker(ctx, canvas, scene.rooms, scene.followId);
}

function paintRooms(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  rooms: readonly DebugRoom[],
  overlay: DebugOverlayMode
): void {
  ctx.font = '12px "Courier New", monospace';
  for (const room of rooms) {
    const top = toScreen(canvas, camera, room.x, room.y);
    const w = room.w * camera.scale;
    const h = room.h * camera.scale;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = roomOverlayColor(room, overlay);
    ctx.fillRect(top.x, top.y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = room.venting ? '#f85149' : '#2e415e';
    ctx.lineWidth = room.venting ? 2 : 1;
    ctx.strokeRect(top.x, top.y, w, h);
    paintRoomLabel(ctx, room, top.x, top.y, w);
  }
}

function paintPortals(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  portals: readonly DebugPortal[]
): void {
  ctx.lineWidth = 3;
  for (const portal of portals) {
    const a = toScreen(canvas, camera, portal.x1, portal.y1);
    const b = toScreen(canvas, camera, portal.x2, portal.y2);
    ctx.strokeStyle = portalColor(portal.state);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function paintWind(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  portals: readonly DebugPortal[]
): void {
  ctx.strokeStyle = '#00e5ff';
  ctx.fillStyle = '#00e5ff';
  ctx.lineWidth = 1.5;
  for (const portal of portals) {
    if (Math.abs(portal.velocityMps) < 0.5) continue;
    paintArrow(ctx, canvas, camera, portal);
  }
}

function paintArrow(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  portal: DebugPortal
): void {
  const mid = toScreen(canvas, camera, portal.midX, portal.midY);
  const length = Math.min(8 + Math.abs(portal.velocityMps) * 1.5, 44);
  const dir = portal.velocityMps >= 0 ? 1 : -1;
  const dx = portal.axisX * dir * length;
  const dy = portal.axisY * dir * length;
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y);
  ctx.lineTo(mid.x + dx, mid.y + dy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mid.x + dx, mid.y + dy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Solid seamless tubes: every station tube mouth to its ship mouth in world space. */
function paintDockLink(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  docks: readonly DockMouthLine[]
): void {
  for (const mouth of docks) paintDockMouth(ctx, canvas, camera, mouth);
}

function paintDockMouth(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  mouth: DockMouthLine
): void {
  const a = toScreen(canvas, camera, mouth.x1, mouth.y1);
  const b = toScreen(canvas, camera, mouth.x2, mouth.y2);
  ctx.save();
  ctx.strokeStyle = '#3a4a63';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#00e5ff';
  for (const pt of [a, b]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintPawns(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  pawns: readonly DebugPawn[],
  followId: string | null
): void {
  for (const pawn of pawns) {
    const at = toScreen(canvas, camera, pawn.x, pawn.y);
    const radius = Math.max(4, 12 * camera.scale);
    ctx.fillStyle = pawn.color;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();
    paintFacing(ctx, at, pawn.facing, radius);
    if (pawn.id === followId) ringFollowed(ctx, at, radius);
  }
}

function paintFacing(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  facing: number,
  radius: number
): void {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x + Math.cos(facing) * (radius + 8), at.y + Math.sin(facing) * (radius + 8));
  ctx.stroke();
}

function ringFollowed(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  radius: number
): void {
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius + 5, 0, Math.PI * 2);
  ctx.stroke();
}

export function debugTickLine(snapshot: SnapshotBroadcast | null): string {
  if (snapshot === null) return 'offline';
  return (
    'tick:' +
    snapshot.tick +
    ' pawns:' +
    snapshot.pawns.length +
    ' decals:' +
    (snapshot.decals?.length ?? 0)
  );
}

export function debugDockLine(dock: DockStatusBroadcast | null): string {
  if (dock === null) return 'dock:?';
  return `${dockChipText(dock)} phase:${dock.phase} seals:${dock.secondsToSeal}s`;
}

export function debugAirLine(
  rooms: readonly DebugRoom[],
  portals: readonly DebugPortal[],
  overlay: DebugOverlayMode,
  followId: string | null
): string {
  const vents = rooms.filter((room) => room.venting).length;
  const winds = portals.filter((portal) => Math.abs(portal.velocityMps) >= 0.5).length;
  const follow = followId === null ? 'overview' : `follow:${followId}`;
  return (
    'rooms:' +
    rooms.length +
    ' vents:' +
    vents +
    ' winds:' +
    winds +
    ' overlay:' +
    overlay +
    ' ' +
    follow
  );
}

export function debugLinksLine(links: ServerStatsBroadcast['pawns']): string {
  if (links.length === 0) return 'links:-';
  return links.map((link) => formatPawnLink(link)).join(' | ');
}

export function debugServerLine(stats: ServerStatsBroadcast | null): string {
  return formatServerStats(stats);
}
