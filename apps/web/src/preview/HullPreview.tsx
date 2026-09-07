/**
 * M2 dev preview: draws compiled hull specs (rooms, gap-cut walls, window panes,
 * portal markers) on a plain 2D canvas. Proves the compiler output renders
 * identical-in-spirit to the hand-placed legacy map without touching frozen passes.
 * Reached via `/?hull=station` or `/?hull=hesperia`. Not part of the game shell.
 */

import {
  compileHull,
  HesperiaV2Spec,
  type HullSpec,
  StationHubSpec,
  toLegacyWalls,
} from '@kybernetes/sim-core';
import { useEffect, useRef } from 'react';

const SPECS: Readonly<Record<string, { label: string; spec: HullSpec }>> = {
  station: { label: 'Station Hub', spec: StationHubSpec },
  hesperia: { label: 'Hesperia V2', spec: HesperiaV2Spec },
};

const CANVAS_W = 980;
const CANVAS_H = 640;
const MARGIN = 50;

export function HullPreview({ specName }: { specName: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const entry = SPECS[specName];

  useEffect(() => {
    if (entry === undefined) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    drawCompiledHull(ctx, entry.spec);
  }, [entry]);

  if (entry === undefined) {
    return <div data-testid="hull-error">unknown hull: {specName}</div>;
  }
  const compiled = compileHull(entry.spec);
  const walls = toLegacyWalls(compiled);
  return (
    <div style={{ background: '#07090d', minHeight: '100vh', padding: 16, color: '#cfd8e3' }}>
      <h1 style={{ fontSize: 16, margin: '0 0 8px' }}>Hull preview: {entry.label}</h1>
      <div data-testid="hull-stats">
        {`rooms:${compiled.rooms.length} walls:${walls.length} portals:${compiled.portals.length} errors:${compiled.errors.length}`}
      </div>
      {compiled.errors.length > 0 && (
        <div data-testid="hull-errors">{compiled.errors.join(' | ')}</div>
      )}
      <canvas
        ref={canvasRef}
        data-testid="hull-canvas"
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ border: '1px solid #2a3340', marginTop: 8 }}
      />
    </div>
  );
}

function drawCompiledHull(ctx: CanvasRenderingContext2D, spec: HullSpec): void {
  const compiled = compileHull(spec);
  const walls = toLegacyWalls(compiled);
  const bounds = hullBounds(compiled.rooms.map((room) => room.rect));
  const scale = Math.min(
    (CANVAS_W - MARGIN * 2) / Math.max(bounds.w, 1),
    (CANVAS_H - MARGIN * 2) / Math.max(bounds.h, 1)
  );
  const toX = (x: number): number => MARGIN + (x - bounds.x) * scale;
  const toY = (y: number): number => MARGIN + (y - bounds.y) * scale;
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawRooms(ctx, compiled.rooms, toX, toY);
  drawWalls(ctx, walls, toX, toY);
  drawPortals(ctx, compiled.portals, toX, toY);
}

function hullBounds(rects: readonly { x: number; y: number; w: number; h: number }[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function drawRooms(
  ctx: CanvasRenderingContext2D,
  rooms: readonly { id: string; rect: { x: number; y: number; w: number; h: number } }[],
  toX: (x: number) => number,
  toY: (y: number) => number
): void {
  ctx.font = '11px monospace';
  for (const room of rooms) {
    const x = toX(room.rect.x);
    const y = toY(room.rect.y);
    const w = toX(room.rect.x + room.rect.w) - x;
    const h = toY(room.rect.y + room.rect.h) - y;
    ctx.fillStyle = '#14161c';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#5b6b7f';
    ctx.fillText(room.id, x + 4, y + 14);
  }
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: readonly { x1: number; y1: number; x2: number; y2: number; isOpaque?: boolean }[],
  toX: (x: number) => number,
  toY: (y: number) => number
): void {
  ctx.lineWidth = 3;
  for (const wall of walls) {
    ctx.strokeStyle = wall.isOpaque === false ? '#00e5ff' : '#9fb4c8';
    ctx.beginPath();
    ctx.moveTo(toX(wall.x1), toY(wall.y1));
    ctx.lineTo(toX(wall.x2), toY(wall.y2));
    ctx.stroke();
  }
}

function drawPortals(
  ctx: CanvasRenderingContext2D,
  portals: readonly {
    id: string;
    kind: string;
    state: string;
    segment: { x1: number; y1: number; x2: number; y2: number };
  }[],
  toX: (x: number) => number,
  toY: (y: number) => number
): void {
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.85;
  for (const portal of portals) {
    ctx.strokeStyle =
      portal.kind === 'window' ? '#00e5ff' : portal.kind === 'airlock' ? '#c77dff' : '#ffb000';
    ctx.beginPath();
    ctx.moveTo(toX(portal.segment.x1), toY(portal.segment.y1));
    ctx.lineTo(toX(portal.segment.x2), toY(portal.segment.y2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
