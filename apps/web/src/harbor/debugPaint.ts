/**
 * Pure 2D debug-canvas painters: world-space debug primitives onto a
 * CanvasRenderingContext2D. No React, no StyleX, no WebGL: every painter
 * takes an explicit context so unit tests drive them with stubs.
 */

import type { SnapshotBroadcast } from '@kybernetes/protocol';
import {
  bareDebugId,
  type DebugPawn,
  type DebugRoom,
  debugOrigins,
  formatKpa,
  overviewFraming,
} from './debugWorld';

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export function cameraFor(
  canvas: HTMLCanvasElement,
  rooms: readonly DebugRoom[],
  pawns: readonly DebugPawn[],
  followId: string | null
): Camera {
  const target = followId === null ? undefined : pawns.find((pawn) => pawn.id === followId);
  if (target !== undefined) return { x: target.x, y: target.y, scale: 0.55 };
  const framing = overviewFraming(rooms);
  if (framing === undefined) return { x: 0, y: 0, scale: 0.5 };
  return fitCamera(canvas, framing.bounds);
}

function fitCamera(
  canvas: HTMLCanvasElement,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): Camera {
  const pad = 80;
  const worldW = Math.max(bounds.maxX - bounds.minX + pad * 2, 1);
  const worldH = Math.max(bounds.maxY - bounds.minY + pad * 2, 1);
  const scale = Math.min(canvas.width / worldW, canvas.height / worldH, 1);
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, scale };
}

export function toScreen(
  canvas: HTMLCanvasElement,
  camera: Camera,
  x: number,
  y: number
): { x: number; y: number } {
  return {
    x: (x - camera.x) * camera.scale + canvas.width / 2,
    y: (y - camera.y) * camera.scale + canvas.height / 2,
  };
}

export function paintRoomLabel(
  ctx: CanvasRenderingContext2D,
  room: DebugRoom,
  x: number,
  y: number,
  w: number
): void {
  const label = `${bareDebugId(room.id)} ${formatKpa(room.pressureKpa)}`;
  const maxChars = Math.max(0, Math.floor((w - 12) / 7.2));
  if (maxChars <= 0) return;
  const text = label.length > maxChars ? `${label.slice(0, Math.max(0, maxChars - 1))}…` : label;
  ctx.fillStyle = '#e0e8f5';
  ctx.fillText(text, x + 6, y + 16);
  const sub = `${room.o2Percent.toFixed(1)}% ${room.tempCelsius.toFixed(0)}C${room.repressurizing ? ' REPRESS' : ''}`;
  if (maxChars < 12) return;
  ctx.fillStyle = '#8a9bb5';
  ctx.fillText(sub.slice(0, maxChars), x + 6, y + 30);
}

export function paintImpacts(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  snapshot: SnapshotBroadcast | null
): void {
  if (snapshot === null) return;
  const origins = debugOrigins(snapshot);
  for (const impact of snapshot.impacts) {
    if (impact.kind === 'miss') continue;
    const origin = origins.get(impact.frameId) ?? { x: 0, y: 0 };
    const at = toScreen(canvas, camera, impact.x + origin.x, impact.y + origin.y);
    const angle = impact.angle ?? 0;
    const energy = Math.min(1, Math.max(0, impact.energy ?? 0.5));
    drawOrientedHit(ctx, at.x, at.y, angle, energy, impact.weapon ?? 'kinetic_carbine');
  }
}

function drawOrientedHit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  energy: number,
  weapon: string
): void {
  const len = 4 + energy * 6;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  ctx.lineWidth = 2;
  ctx.strokeStyle = weapon === 'pulse_laser' ? '#7fe7ff' : '#ffb000';
  ctx.beginPath();
  ctx.moveTo(x - dx * len, y - dy * len);
  ctx.lineTo(x + dx * len, y + dy * len);
  ctx.moveTo(x - px * len * 0.6, y - py * len * 0.6);
  ctx.lineTo(x + px * len * 0.6, y + py * len * 0.6);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 1.5 + energy, 0, Math.PI * 2);
  ctx.fill();
}

export function paintDecals(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  snapshot: SnapshotBroadcast | null
): void {
  if (snapshot?.decals === undefined) return;
  const origins = debugOrigins(snapshot);
  for (const decal of snapshot.decals) {
    const origin = origins.get(decal.frameId) ?? { x: 0, y: 0 };
    const at = toScreen(canvas, camera, decal.x + origin.x, decal.y + origin.y);
    const r = Math.max(2, decal.radius * camera.scale * 0.6);
    ctx.fillStyle = 'rgba(8,10,14,0.9)';
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a94a6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Bearing label while the vessel holds off-station (overview stays pinned). */
export function paintShipMarker(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  rooms: readonly DebugRoom[],
  followId: string | null
): void {
  if (followId !== null) return;
  const framing = overviewFraming(rooms);
  const bearing = framing?.shipOffscreen;
  if (bearing === undefined || bearing === null) return;
  const cx = canvas.width / 2 + bearing.x * (canvas.width / 2 - 90);
  const cy = canvas.height / 2 + bearing.y * (canvas.height / 2 - 60);
  ctx.font = '12px "Courier New", monospace';
  ctx.fillStyle = '#00e5ff';
  ctx.fillText(
    'SHIP ▸ IN TRANSIT',
    Math.min(Math.max(cx - 60, 8), canvas.width - 140),
    Math.min(Math.max(cy, 20), canvas.height - 12)
  );
}

/** Closest pawn id within pick radius of a screen point (hit-test core). */
export function nearestPawn(
  pawns: readonly DebugPawn[],
  screenOf: (pawn: DebugPawn) => { x: number; y: number },
  sx: number,
  sy: number
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const pawn of pawns) {
    const at = screenOf(pawn);
    const dist = Math.hypot(at.x - sx, at.y - sy);
    if (dist < 24 && (best === null || dist < best.dist)) best = { id: pawn.id, dist };
  }
  if (best === null) return null;
  return best.id;
}
