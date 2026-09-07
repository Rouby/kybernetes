/**
 * M3 playable slice: one compiled frame driven by the authoritative kernel.
 * Fixed-step tickWorld with server-side collision, door cooldowns, LOS room
 * visibility, and remembered fog - the same code the SimHost runs in M5.
 * Reached via `/?hull=station&play=1`. WASD/arrows move, E toggles the near door.
 */

import {
  assembleWorld,
  FIXED_DT,
  type HullSpec,
  nearestPortal,
  spawnPawn,
  tickWorld,
  tryToggleDoor,
  visibleRooms,
  type World,
} from '@kybernetes/sim-core';
import { useEffect, useRef, useState } from 'react';
import { SPECS } from './HullPreview';

const FRAME_ID = 'preview';
const HERO_ID = 'hero';
const CANVAS_W = 980;
const CANVAS_H = 640;
const MARGIN = 50;
const INTERACT_RADIUS = 90;

export function PlayPreview({ specName }: { specName: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [stats, setStats] = useState('boot');
  const [notice, setNotice] = useState('');
  const entry = SPECS[specName];

  useEffect(() => {
    if (entry === undefined) return;
    worldRef.current = makePlayWorld(entry.spec);
    const canvas = canvasRef.current;
    const ctx = canvas === null ? null : canvas.getContext('2d');
    const pressDoor = (): void => {
      const world = worldRef.current;
      if (world === null) return;
      const near = nearestPortal(world, HERO_ID, INTERACT_RADIUS);
      if (near === undefined) {
        setNotice('no door in range');
        return;
      }
      const wantOpen = near.state !== 'open';
      const result = tryToggleDoor(world, near.id, wantOpen, 0);
      if (!result.ok) {
        setNotice(`door ${result.reason}`);
        return;
      }
      worldRef.current = { ...world, portals: { ...world.portals, [near.id]: result.portal } };
      setNotice(wantOpen ? 'door open' : 'door closed');
    };
    const onDown = (event: KeyboardEvent): void => {
      if (event.key === 'e' || event.key === 'E') pressDoor();
      else keysRef.current.add(event.key.toLowerCase());
    };
    const onUp = (event: KeyboardEvent): void => {
      keysRef.current.delete(event.key.toLowerCase());
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let statClock = 1;
    const frame = (now: number): void => {
      acc += Math.min((now - last) / 1000, 0.25);
      last = now;
      const input = readKeys(keysRef.current);
      while (acc >= FIXED_DT) {
        const world = worldRef.current;
        if (world !== null) {
          const intents =
            input === null
              ? []
              : [{ pawnId: HERO_ID, moveX: input.x, moveY: input.y, sprint: false }];
          worldRef.current = tickWorld(world, FIXED_DT, intents);
        }
        acc -= FIXED_DT;
      }
      const live = worldRef.current;
      if (ctx !== null && live !== null) drawPlayWorld(ctx, live);
      statClock += FIXED_DT;
      if (statClock > 0.2 && live !== null) {
        statClock = 0;
        setStats(describeWorld(live));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [entry]);

  if (entry === undefined) {
    return <div data-testid="play-error">unknown hull: {specName}</div>;
  }
  return (
    <div style={{ background: '#07090d', minHeight: '100vh', padding: 16, color: '#cfd8e3' }}>
      <h1 style={{ fontSize: 16, margin: '0 0 8px' }}>
        Play slice: {entry.label} (WASD move, E door)
      </h1>
      <div data-testid="play-stats">{stats}</div>
      <div data-testid="play-notice">{notice}</div>
      <canvas
        ref={canvasRef}
        data-testid="play-canvas"
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ border: '1px solid #2a3340', marginTop: 8 }}
      />
    </div>
  );
}

function makePlayWorld(spec: HullSpec): World {
  const assembled = assembleWorld([{ frameId: FRAME_ID, hull: spec }]);
  const door = Object.values(assembled.portals)
    .filter((portal) => portal.kind === 'door' || portal.kind === 'airlock')
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (door === undefined) {
    const fallback = Object.keys(assembled.rooms)[0] ?? '';
    return spawnPawn(assembled, {
      id: HERO_ID,
      owner: 'hero',
      frameId: FRAME_ID,
      roomId: fallback,
      x: 0,
      y: 0,
      color: '#ffd166',
    });
  }
  const room = assembled.rooms[door.roomA];
  const midX = (door.segment.x1 + door.segment.x2) / 2;
  const midY = (door.segment.y1 + door.segment.y2) / 2;
  const centerX = (room?.rect.x ?? midX) + (room?.rect.w ?? 0) / 2;
  const centerY = (room?.rect.y ?? midY) + (room?.rect.h ?? 0) / 2;
  const len = Math.hypot(centerX - midX, centerY - midY) || 1;
  return spawnPawn(assembled, {
    id: HERO_ID,
    owner: 'hero',
    frameId: FRAME_ID,
    roomId: door.roomA,
    x: midX + ((centerX - midX) / len) * 35,
    y: midY + ((centerY - midY) / len) * 35,
    color: '#ffd166',
  });
}

function readKeys(keys: Set<string>): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  if (x === 0 && y === 0) return null;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

function describeWorld(world: World): string {
  const pawn = world.pawns[HERO_ID];
  if (pawn === undefined) return 'missing hero';
  const near = nearestPortal(world, HERO_ID, INTERACT_RADIUS);
  const explored = world.memory[HERO_ID]?.length ?? 0;
  const room = pawn.roomHint.startsWith(`${FRAME_ID}.`)
    ? pawn.roomHint.slice(FRAME_ID.length + 1)
    : pawn.roomHint;
  const door = near === undefined ? 'none' : `${shortId(near.id)}:${near.state}`;
  return `x:${Math.round(pawn.pos.x)} y:${Math.round(pawn.pos.y)} room:${room} explored:${explored} door:${door}`;
}

function shortId(id: string): string {
  return id.startsWith(`${FRAME_ID}.`) ? id.slice(FRAME_ID.length + 1) : id;
}

function drawPlayWorld(ctx: CanvasRenderingContext2D, world: World): void {
  const rooms = Object.values(world.rooms).filter((room) => room.frameId === FRAME_ID);
  const walls = world.wallsByFrame[FRAME_ID] ?? [];
  const portals = Object.values(world.portals).filter((portal) =>
    portal.id.startsWith(`${FRAME_ID}.`)
  );
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const room of rooms) {
    minX = Math.min(minX, room.rect.x);
    minY = Math.min(minY, room.rect.y);
    maxX = Math.max(maxX, room.rect.x + room.rect.w);
    maxY = Math.max(maxY, room.rect.y + room.rect.h);
  }
  const spanW = Math.max(maxX - minX, 1);
  const spanH = Math.max(maxY - minY, 1);
  const scale = Math.min((CANVAS_W - MARGIN * 2) / spanW, (CANVAS_H - MARGIN * 2) / spanH);
  const toX = (x: number): number => MARGIN + (x - minX) * scale;
  const toY = (y: number): number => MARGIN + (y - minY) * scale;
  const visible = new Set(visibleRooms(world, HERO_ID));
  const remembered = new Set(world.memory[HERO_ID] ?? []);
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.font = '11px monospace';
  for (const room of rooms) {
    const x = toX(room.rect.x);
    const y = toY(room.rect.y);
    ctx.fillStyle = '#14161c';
    ctx.fillRect(x, y, toX(room.rect.x + room.rect.w) - x, toY(room.rect.y + room.rect.h) - y);
    ctx.fillStyle = '#5b6b7f';
    ctx.fillText(shortId(room.id), x + 4, y + 14);
  }
  ctx.lineWidth = 3;
  for (const wall of walls) {
    ctx.strokeStyle = wall.isOpaque === false ? '#00e5ff' : '#9fb4c8';
    ctx.beginPath();
    ctx.moveTo(toX(wall.x1), toY(wall.y1));
    ctx.lineTo(toX(wall.x2), toY(wall.y2));
    ctx.stroke();
  }
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.85;
  for (const portal of portals) {
    if (portal.kind === 'window') ctx.strokeStyle = '#00e5ff';
    else if (portal.kind === 'airlock') ctx.strokeStyle = '#c77dff';
    else ctx.strokeStyle = '#ffb000';
    ctx.beginPath();
    ctx.moveTo(toX(portal.segment.x1), toY(portal.segment.y1));
    ctx.lineTo(toX(portal.segment.x2), toY(portal.segment.y2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const room of rooms) {
    if (visible.has(room.id)) continue;
    const x = toX(room.rect.x);
    const y = toY(room.rect.y);
    ctx.fillStyle = remembered.has(room.id) ? 'rgba(4, 6, 10, 0.55)' : 'rgba(2, 3, 6, 0.85)';
    ctx.fillRect(x, y, toX(room.rect.x + room.rect.w) - x, toY(room.rect.y + room.rect.h) - y);
  }
  const hero = world.pawns[HERO_ID];
  if (hero !== undefined) {
    ctx.fillStyle = hero.color;
    ctx.beginPath();
    ctx.arc(toX(hero.pos.x), toY(hero.pos.y), Math.max(hero.radius * scale, 4), 0, Math.PI * 2);
    ctx.fill();
  }
}
