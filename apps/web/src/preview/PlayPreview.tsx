/**
 * M3 playable slice: one compiled frame driven by the authoritative kernel.
 * Fixed-step tickWorld with server-side collision, door cooldowns, LOS room
 * visibility, and remembered fog - the same code the SimHost runs in M5.
 * Reached via `/?hull=station&play=1`. WASD/arrows move, E toggles the near door.
 */

import {
  type AirAuthorityState,
  addPuncture,
  assembleWorld,
  bindAirFrame,
  bindWorldAir,
  buildHarborWorld,
  captainIdFor,
  createAirAuthority,
  FIXED_DT,
  type FireResult,
  fireWeapon,
  type HireOfferRecord,
  type HullSpec,
  hireAboard,
  NOMINAL_PRESSURE_KPA,
  nearestPortal,
  portalWind,
  roomContainingPoint,
  setSuitSealed,
  spawnPawn,
  talkToCaptain,
  tickWorld,
  tryToggleDoor,
  ventedRooms,
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
  const facingRef = useRef(0);
  const worldRef = useRef<World | null>(null);
  const airRef = useRef<AirAuthorityState | null>(null);
  const offerRef = useRef<HireOfferRecord | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [stats, setStats] = useState('boot');
  const [notice, setNotice] = useState('');
  const isHarbor = specName === 'harbor';
  const entry = isHarbor ? undefined : SPECS[specName];

  useEffect(() => {
    if (!isHarbor && entry === undefined) return;
    const start = isHarbor
      ? makeHarborPlayWorld()
      : entry === undefined
        ? null
        : makePlayWorld(entry.spec);
    if (start === null) return;
    worldRef.current = start;
    const air = createAirAuthority();
    if (isHarbor) bindWorldAir(air, start);
    else bindAirFrame(air, FRAME_ID, Object.values(start.rooms), Object.values(start.portals));
    airRef.current = air;
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
    const pressBreach = (): void => {
      const world = worldRef.current;
      const live = airRef.current;
      if (world === null || live === null) return;
      const pawn = world.pawns[HERO_ID];
      if (pawn === undefined) return;
      const id = addPuncture(live, pawn.frameId, pawn.roomHint, 1.5);
      setNotice(id === undefined ? 'puncture failed' : `puncture ${shortId(pawn.roomHint)}`);
    };
    const pressTalk = (): void => {
      const world = worldRef.current;
      if (world === null) return;
      const captain = Object.values(world.pawns).find((pawn) => pawn.id === captainIdFor('ship'));
      const talked = talkToCaptain(world, captain?.id ?? 'captain:ship', Math.random);
      worldRef.current = talked.world;
      offerRef.current = talked.offer ?? null;
      setNotice(
        talked.offer === undefined
          ? 'no captain aboard a docked ship'
          : `offer: ${talked.offer.jobs.join('/')}`
      );
    };
    const pressHire = (): void => {
      const world = worldRef.current;
      const offer = offerRef.current;
      if (world === null || offer === null) {
        setNotice('talk to the captain first');
        return;
      }
      const job = offer.jobs[0];
      if (job === undefined) {
        setNotice('empty offer');
        return;
      }
      const { world: hired, hired: ok } = hireAboard(
        world,
        offer.vesselId,
        HERO_ID,
        job,
        offer.offerId
      );
      worldRef.current = hired;
      offerRef.current = null;
      setNotice(ok ? `hired ${job}, departing` : 'hire refused');
    };
    const pressSuit = (): void => {
      const world = worldRef.current;
      if (world === null) return;
      const sealed = !(world.vitals[HERO_ID]?.suitSealed ?? false);
      worldRef.current = setSuitSealed(world, HERO_ID, sealed);
      setNotice(sealed ? 'suit sealed' : 'suit open');
    };
    const pressFire = (): void => {
      const world = worldRef.current;
      if (world === null) return;
      const fired = fireWeapon(world, HERO_ID, facingRef.current, 'kinetic_carbine');
      worldRef.current = fired.world;
      setNotice(fireNotice(fired.result));
    };
    const onDown = (event: KeyboardEvent): void => {
      if (event.key === 'e' || event.key === 'E') pressDoor();
      else if (event.key === 'b' || event.key === 'B') pressBreach();
      else if (event.key === 'h' || event.key === 'H') pressTalk();
      else if (event.key === 'j' || event.key === 'J') pressHire();
      else if (event.key === 't' || event.key === 'T') pressSuit();
      else if (event.key === 'f' || event.key === 'F') pressFire();
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
      if (input !== null) facingRef.current = Math.atan2(input.y, input.x);
      while (acc >= FIXED_DT) {
        const world = worldRef.current;
        if (world !== null) {
          const intents =
            input === null
              ? []
              : [
                  {
                    pawnId: HERO_ID,
                    moveX: input.x,
                    moveY: input.y,
                    sprint: false,
                    facing: facingRef.current,
                  },
                ];
          worldRef.current = tickWorld(world, FIXED_DT, intents, airRef.current ?? undefined);
        }
        acc -= FIXED_DT;
      }
      const live = worldRef.current;
      if (ctx !== null && live !== null) drawPlayWorld(ctx, live, airRef.current);
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
  }, [entry, isHarbor]);

  if (!isHarbor && entry === undefined) {
    return <div data-testid="play-error">unknown hull: {specName}</div>;
  }
  return (
    <div style={{ background: '#07090d', minHeight: '100vh', padding: 16, color: '#cfd8e3' }}>
      <h1 style={{ fontSize: 16, margin: '0 0 8px' }}>
        Play slice: {isHarbor ? 'Harbor Loop' : entry?.label} (WASD move, E door, H talk, J hire, T
        suit, F fire)
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

function makeHarborPlayWorld(): World {
  const harbor = buildHarborWorld();
  const spawn = harbor.spawns['station.fresh_spawn'];
  const x = spawn?.x ?? 300;
  const y = spawn?.y ?? 200;
  const roomId = roomContainingPoint(harbor, 'station', x, y) ?? 'station.lobby';
  return spawnPawn(harbor, {
    id: HERO_ID,
    owner: 'hero',
    frameId: 'station',
    roomId,
    x,
    y,
    color: '#ffd166',
  });
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
  const room = shortId(pawn.roomHint);
  const door = near === undefined ? 'none' : `${shortId(near.id)}:${near.state}`;
  const record = world.crew[HERO_ID];
  const watch = Object.values(world.watches)[0];
  const vessel = watch === undefined ? undefined : world.vessels[watch.vesselId];
  const loop = `role:${record?.role ?? 'none'} watch:${watch === undefined ? 'none' : `#${watch.watchNo} ${Math.max(0, Math.round(watch.remainingS))}s`} grade:${watch?.grade === '' || watch?.grade === undefined ? '-' : watch.grade} credits:${record?.credits ?? 0} sched:${vessel?.schedule ?? 'none'}`;
  const view = world.atmos[pawn.roomHint];
  const air =
    view === undefined
      ? 'p:? o2:? vent:0'
      : `p:${view.pressureKpa.toFixed(1)} o2:${view.o2Percent.toFixed(1)} vent:${ventedRooms(world.atmos).length}`;
  const vitals = world.vitals[HERO_ID];
  const body = `suit:${vitals?.suitSealed ? 'sealed' : 'open'} hyp:${(vitals?.hypoxia ?? 0).toFixed(0)} hp:${Math.round(pawn.health.hp)}`;
  return `x:${Math.round(pawn.pos.x)} y:${Math.round(pawn.pos.y)} room:${room} explored:${explored} door:${door} ${air} ${loop} ${body}`;
}

function fireNotice(result: FireResult): string {
  if (result.kind === 'miss') return 'fire clean miss';
  if (result.kind === 'pawn') return `fire hit pawn ${shortId(result.targetId)}`;
  return `fire ${result.kind} ${shortId(result.portalId)}`;
}

function shortId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}

function drawPlayWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  air: AirAuthorityState | null
): void {
  const rooms = Object.values(world.rooms);
  const walls = Object.entries(world.wallsByFrame);
  const portals = Object.values(world.portals);
  const originOf = (frameId: string): { x: number; y: number } =>
    world.vessels[frameId]?.origin ?? world.stations[frameId]?.origin ?? { x: 0, y: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const room of rooms) {
    const origin = originOf(room.frameId);
    minX = Math.min(minX, room.rect.x + origin.x);
    minY = Math.min(minY, room.rect.y + origin.y);
    maxX = Math.max(maxX, room.rect.x + room.rect.w + origin.x);
    maxY = Math.max(maxY, room.rect.y + room.rect.h + origin.y);
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
    const origin = originOf(room.frameId);
    const rx = room.rect.x + origin.x;
    const ry = room.rect.y + origin.y;
    const x = toX(rx);
    const y = toY(ry);
    ctx.fillStyle = '#14161c';
    ctx.fillRect(x, y, toX(rx + room.rect.w) - x, toY(ry + room.rect.h) - y);
    const view = world.atmos[room.id];
    const deficit =
      view === undefined
        ? 0
        : Math.min(
            1,
            Math.max(0, (NOMINAL_PRESSURE_KPA - view.pressureKpa) / NOMINAL_PRESSURE_KPA)
          );
    if (deficit > 0.02) {
      ctx.fillStyle = `rgba(255, 60, 40, ${(deficit * 0.45).toFixed(2)})`;
      ctx.fillRect(x, y, toX(rx + room.rect.w) - x, toY(ry + room.rect.h) - y);
    }
    ctx.fillStyle = '#5b6b7f';
    ctx.fillText(shortId(room.id), x + 4, y + 14);
  }
  ctx.lineWidth = 3;
  for (const [frameId, frameWalls] of walls) {
    const origin = originOf(frameId);
    for (const wall of frameWalls) {
      ctx.strokeStyle = wall.isOpaque === false ? '#00e5ff' : '#9fb4c8';
      ctx.beginPath();
      ctx.moveTo(toX(wall.x1 + origin.x), toY(wall.y1 + origin.y));
      ctx.lineTo(toX(wall.x2 + origin.x), toY(wall.y2 + origin.y));
      ctx.stroke();
    }
  }
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.85;
  const windPortals: {
    id: string;
    frameId: string;
    segment: { x1: number; y1: number; x2: number; y2: number };
  }[] = [];
  for (const portal of portals) {
    const room = world.rooms[portal.roomA];
    const origin = originOf(room?.frameId ?? '');
    const segment = {
      x1: portal.segment.x1 + origin.x,
      y1: portal.segment.y1 + origin.y,
      x2: portal.segment.x2 + origin.x,
      y2: portal.segment.y2 + origin.y,
    };
    windPortals.push({ id: portal.id, frameId: room?.frameId ?? '', segment });
    if (portal.kind === 'window') ctx.strokeStyle = '#00e5ff';
    else if (portal.kind === 'airlock') ctx.strokeStyle = '#c77dff';
    else ctx.strokeStyle = '#ffb000';
    ctx.beginPath();
    ctx.moveTo(toX(segment.x1), toY(segment.y1));
    ctx.lineTo(toX(segment.x2), toY(segment.y2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawWindArrows(ctx, air, windPortals, toX, toY);
  for (const room of rooms) {
    if (visible.has(room.id)) continue;
    const origin = originOf(room.frameId);
    const x = toX(room.rect.x + origin.x);
    const y = toY(room.rect.y + origin.y);
    ctx.fillStyle = remembered.has(room.id) ? 'rgba(4, 6, 10, 0.55)' : 'rgba(2, 3, 6, 0.85)';
    ctx.fillRect(
      x,
      y,
      toX(room.rect.x + room.rect.w + origin.x) - x,
      toY(room.rect.y + room.rect.h + origin.y) - y
    );
  }
  const vented = new Set(ventedRooms(world.atmos));
  if (vented.size > 0) {
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 12px monospace';
    for (const room of rooms) {
      if (!vented.has(room.id)) continue;
      const origin = originOf(room.frameId);
      ctx.fillText('VENT', toX(room.rect.x + origin.x) + 4, toY(room.rect.y + origin.y) + 28);
    }
  }
  for (const pawn of Object.values(world.pawns)) {
    const origin = originOf(pawn.frameId);
    ctx.fillStyle = pawn.id === HERO_ID ? pawn.color : '#8fa3b8';
    ctx.beginPath();
    ctx.arc(
      toX(pawn.pos.x + origin.x),
      toY(pawn.pos.y + origin.y),
      Math.max(pawn.radius * scale, 4),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawWindArrows(
  ctx: CanvasRenderingContext2D,
  air: AirAuthorityState | null,
  portals: readonly {
    id: string;
    frameId: string;
    segment: { x1: number; y1: number; x2: number; y2: number };
  }[],
  toX: (x: number) => number,
  toY: (y: number) => number
): void {
  if (air === null) return;
  ctx.strokeStyle = '#7df9ff';
  ctx.lineWidth = 2;
  for (const portal of portals) {
    const wind = portalWind(air, portal.frameId, portal.id);
    if (wind === undefined) continue;
    const speed = Math.hypot(wind.x, wind.y);
    if (speed < 0.5) continue;
    const mx = toX((portal.segment.x1 + portal.segment.x2) / 2);
    const my = toY((portal.segment.y1 + portal.segment.y2) / 2);
    const len = Math.min(speed * 2, 70);
    const nx = wind.x / speed;
    const ny = wind.y / speed;
    const hx = mx + nx * len;
    const hy = my + ny * len;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(hx, hy);
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - nx * 8 - ny * 4, hy - ny * 8 + nx * 4);
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - nx * 8 + ny * 4, hy - ny * 8 - nx * 4);
    ctx.stroke();
  }
}
