/**
 * HarborApp: the v2 client slice served at `?harbor=1`. Static harbor geometry
 * compiled locally, all dynamic state from v2 snapshots: predicted own pawn
 * with authoritative reconcile, snapshot remotes/doors, HUD from channels.
 */

import type { Role } from '@kybernetes/protocol';
import {
  buildHarborWorld,
  collidersForFrame,
  type World,
  withSnapshotStates,
} from '@kybernetes/sim-core';
import type { RefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { type PredictedPawn, useHarborMovement } from './useHarborMovement';
import { remotePawns, useHarborSocket } from './useHarborSocket';

const CANVAS_W = 980;
const CANVAS_H = 640;
const MARGIN = 40;

function storedIdentity(): { callsign: string; color: string; userId: string } {
  let userId = window.localStorage.getItem('harbor.userId');
  if (userId === null) {
    userId = `u-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem('harbor.userId', userId);
  }
  const callsign = window.localStorage.getItem('harbor.callsign') ?? 'Rook';
  return { callsign, color: '#ffd166', userId };
}

export function HarborApp() {
  const identity = useMemo(() => {
    const stored = storedIdentity();
    const params = new URLSearchParams(window.location.search);
    const beacon = params.get('beacon') ?? 'HESP01';
    const callsign = params.get('callsign') ?? stored.callsign;
    return { ...stored, callsign, beacon };
  }, []);
  const staticWorld = useMemo(() => buildHarborWorld(), []);
  const socket = useHarborSocket(identity);
  const ownPawn = socket.snapshot?.pawns.find((pawn) => pawn.id === socket.pawnId);
  const ownFrameId = ownPawn?.frameId ?? 'station';
  const predictionView = useMemo(
    () => withSnapshotStates(staticWorld, socket.snapshot?.portals ?? []),
    [staticWorld, socket.snapshot]
  );
  const colliders = useMemo(
    () => collidersForFrame(predictionView, ownFrameId),
    [predictionView, ownFrameId]
  );
  const movement = useHarborMovement(ownPawn, socket.sendIntent, colliders);

  const predictedRef = useRef(movement.predicted);
  predictedRef.current = movement.predicted;
  useActions(
    socket.sendIntent,
    staticWorld,
    socket.snapshot,
    socket.pawnId,
    movement.facingRef,
    socket.offer,
    movement.toggleSeal,
    predictedRef
  );

  return (
    <div style={{ background: '#07090d', minHeight: '100vh', padding: 16, color: '#cfd8e3' }}>
      <h1 style={{ fontSize: 16, margin: '0 0 8px' }}>
        Harbor Loop (WASD move, E door, H talk, J hire, T suit, F fire)
      </h1>
      <HarborHud socket={socket} predicted={movement.predicted} />
      <HarborCanvas
        staticWorld={staticWorld}
        snapshot={socket.snapshot}
        pawnId={socket.pawnId}
        predicted={movement.predicted}
      />
    </div>
  );
}

type SendIntent = ReturnType<typeof useHarborSocket>['sendIntent'];
type Snapshot = ReturnType<typeof useHarborSocket>['snapshot'];
type Offer = ReturnType<typeof useHarborSocket>['offer'];

function useActions(
  sendIntent: SendIntent,
  statics: World,
  snapshot: Snapshot,
  pawnId: string | null,
  facingRef: RefObject<number>,
  offer: Offer,
  toggleSeal: () => void,
  predictedRef: RefObject<{ x: number; y: number; facing: number } | null>
): void {
  useEffect(() => {
    const onDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === 'e') pressDoor(sendIntent, statics, snapshot, pawnId, predictedRef.current);
      else if (key === 'h') pressTalk(sendIntent, snapshot);
      else if (key === 'j' && offer !== null) {
        const job = offer.jobs[0];
        if (job !== undefined) pressHire(sendIntent, offer.offerId, job);
      } else if (key === 't') {
        toggleSeal();
      } else if (key === 'f') {
        sendIntent({
          type: 'FIRE',
          seq: 0,
          originAngle: facingRef.current,
          weapon: 'kinetic_carbine',
        });
      }
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [sendIntent, statics, snapshot, pawnId, facingRef, offer, toggleSeal, predictedRef]);
}

function pressDoor(
  sendIntent: SendIntent,
  statics: World,
  snapshot: Snapshot,
  pawnId: string | null,
  predicted: { x: number; y: number } | null
): void {
  if (snapshot === null || pawnId === null) return;
  const pawn = snapshot.pawns.find((entry) => entry.id === pawnId);
  if (pawn === undefined) return;
  const atX = predicted?.x ?? pawn.x;
  const atY = predicted?.y ?? pawn.y;
  const states = new Map(snapshot.portals.map((portal) => [portal.id, portal.open]));
  let bestId: string | null = null;
  let bestOpen = false;
  let bestDist = 90;
  for (const edge of Object.values(statics.portals)) {
    const room = statics.rooms[edge.roomA];
    if (room === undefined || room.frameId !== pawn.frameId) continue;
    const midX = (edge.segment.x1 + edge.segment.x2) / 2;
    const midY = (edge.segment.y1 + edge.segment.y2) / 2;
    const dist = Math.hypot(atX - midX, atY - midY);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = edge.id;
      bestOpen = states.get(edge.id) ?? false;
    }
  }
  if (bestId !== null) sendIntent({ type: 'DOOR', seq: 0, portalId: bestId, wantOpen: !bestOpen });
}

function pressTalk(sendIntent: SendIntent, snapshot: Snapshot): void {
  if (snapshot === null) return;
  const captain = snapshot.pawns.find((pawn) => pawn.id.startsWith('captain:'));
  if (captain === undefined) return;
  sendIntent({ type: 'TALK', seq: 0, npcId: captain.id });
}

function pressHire(sendIntent: SendIntent, offerId: string, job: Role): void {
  sendIntent({ type: 'HIRE', seq: 0, offerId, job });
}

type HarborSocket = ReturnType<typeof useHarborSocket>;
type Predicted = PredictedPawn | null;

function HarborHud({ socket, predicted }: { socket: HarborSocket; predicted: Predicted }) {
  const pawn = socket.snapshot?.pawns.find((entry) => entry.id === socket.pawnId);
  const room = pawn === undefined ? '-' : shortId(pawn.roomHint);
  const vitals = socket.vitals?.vitals;
  const watch = socket.watch;
  const checklist = watch === null ? null : watch.checklist;
  const done = checklist === null ? 0 : checklist.filter((task) => task.done).length;
  return (
    <>
      <div data-testid="harbor-pawn">{socket.pawnId ?? '-'}</div>
      <div data-testid="harbor-status">
        {socket.connected
          ? `tick:${socket.snapshot?.tick ?? '-'} room:${room} sx:${pawn === undefined ? '?' : Math.round(pawn.x)}`
          : 'offline'}
      </div>
      <div data-testid="harbor-pos">
        {predicted ? `x:${Math.round(predicted.x)} y:${Math.round(predicted.y)}` : 'x:? y:?'}
      </div>
      <div data-testid="harbor-vitals">
        {vitals === undefined
          ? 'vitals:-'
          : `hp:${Math.round(vitals.health)} hyp:${Math.round(vitals.hypoxia)} suit:${vitals.suitSealed ? 'sealed' : 'open'} hunger:${Math.round(vitals.hunger)} heat:${Math.round(vitals.heat)} credits:${socket.vitals?.credits ?? 0}`}
      </div>
      <div data-testid="harbor-watch">
        {watch === null
          ? 'watch:none'
          : `watch#${watch.watchNo} ${watch.remainingS}s ${watch.grade} tasks:${done}/${watch.checklist.length}`}
      </div>
      <div data-testid="harbor-manifest">
        {socket.manifest === null
          ? 'crew:-'
          : `beacon:${socket.manifest.beacon} crew:${socket.manifest.crew.map((entry) => `${entry.callsign}:${entry.role}`).join(',')}`}
      </div>
      <div data-testid="harbor-offer">
        {socket.offer === null ? 'offer:-' : `offer:${socket.offer.jobs.join('/')}`}
      </div>
      <div data-testid="harbor-notices">
        {socket.notices.length === 0
          ? 'notices:-'
          : socket.notices.map((notice) => `${notice.title}:${notice.message}`).join(' | ')}
      </div>
    </>
  );
}

function shortId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}

function HarborCanvas({
  staticWorld,
  snapshot,
  pawnId,
  predicted,
}: {
  staticWorld: World;
  snapshot: Snapshot;
  pawnId: string | null;
  predicted: Predicted;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef({ staticWorld, snapshot, pawnId, predicted });
  viewRef.current = { staticWorld, snapshot, pawnId, predicted };
  useEffect(() => {
    let raf = 0;
    const frame = (): void => {
      const canvas = canvasRef.current;
      const view = viewRef.current;
      if (canvas !== null) {
        const ctx = canvas.getContext('2d');
        if (ctx !== null)
          drawHarbor(ctx, view.staticWorld, view.snapshot, view.pawnId, view.predicted);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={canvasRef}
      data-testid="harbor-canvas"
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ border: '1px solid #2a3340', marginTop: 8 }}
    />
  );
}

function drawHarbor(
  ctx: CanvasRenderingContext2D,
  world: World,
  snapshot: Snapshot,
  pawnId: string | null,
  predicted: Predicted
): void {
  const originOf = (frameId: string): { x: number; y: number } =>
    world.vessels[frameId]?.origin ?? world.stations[frameId]?.origin ?? { x: 0, y: 0 };
  const rooms = Object.values(world.rooms);
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
  const scale = Math.min(
    (CANVAS_W - MARGIN * 2) / Math.max(maxX - minX, 1),
    (CANVAS_H - MARGIN * 2) / Math.max(maxY - minY, 1)
  );
  const toX = (x: number): number => MARGIN + (x - minX) * scale;
  const toY = (y: number): number => MARGIN + (y - minY) * scale;
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.font = '11px monospace';
  for (const room of rooms) {
    const origin = originOf(room.frameId);
    const x = toX(room.rect.x + origin.x);
    const y = toY(room.rect.y + origin.y);
    ctx.fillStyle = '#14161c';
    ctx.fillRect(
      x,
      y,
      toX(room.rect.x + room.rect.w + origin.x) - x,
      toY(room.rect.y + room.rect.h + origin.y) - y
    );
    ctx.fillStyle = '#5b6b7f';
    ctx.fillText(shortId(room.id), x + 4, y + 14);
  }
  const states = new Map((snapshot?.portals ?? []).map((portal) => [portal.id, portal]));
  drawFrameWalls(ctx, world, toX, toY);
  drawDoorMarkers(ctx, world, states, toX, toY);
  drawPawns(ctx, world, snapshot, pawnId, predicted, toX, toY, scale);
}

function drawFrameWalls(
  ctx: CanvasRenderingContext2D,
  world: World,
  toX: (x: number) => number,
  toY: (y: number) => number
): void {
  ctx.lineWidth = 3;
  for (const [frameId, frameWalls] of Object.entries(world.wallsByFrame)) {
    const origin = world.vessels[frameId]?.origin ??
      world.stations[frameId]?.origin ?? { x: 0, y: 0 };
    for (const wall of frameWalls) {
      ctx.strokeStyle = wall.isOpaque === false ? '#00e5ff' : '#9fb4c8';
      ctx.beginPath();
      ctx.moveTo(toX(wall.x1 + origin.x), toY(wall.y1 + origin.y));
      ctx.lineTo(toX(wall.x2 + origin.x), toY(wall.y2 + origin.y));
      ctx.stroke();
    }
  }
}

function drawDoorMarkers(
  ctx: CanvasRenderingContext2D,
  world: World,
  states: Map<string, { open: boolean }>,
  toX: (x: number) => number,
  toY: (y: number) => number
): void {
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.85;
  for (const edge of Object.values(world.portals)) {
    const room = world.rooms[edge.roomA];
    const origin = world.vessels[room?.frameId ?? '']?.origin ??
      world.stations[room?.frameId ?? '']?.origin ?? { x: 0, y: 0 };
    const open = states.get(edge.id)?.open ?? edge.state === 'open';
    ctx.strokeStyle =
      edge.kind === 'window'
        ? '#00e5ff'
        : edge.kind === 'airlock'
          ? '#c77dff'
          : open
            ? '#35d07f'
            : '#ffb000';
    ctx.beginPath();
    ctx.moveTo(toX(edge.segment.x1 + origin.x), toY(edge.segment.y1 + origin.y));
    ctx.lineTo(toX(edge.segment.x2 + origin.x), toY(edge.segment.y2 + origin.y));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPawns(
  ctx: CanvasRenderingContext2D,
  world: World,
  snapshot: Snapshot,
  pawnId: string | null,
  predicted: Predicted,
  toX: (x: number) => number,
  toY: (y: number) => number,
  scale: number
): void {
  for (const pawn of remotePawns(snapshot, pawnId)) {
    drawPawn(ctx, world, pawn, pawn.x, pawn.y, false, toX, toY, scale);
  }
  const self = snapshot?.pawns.find((pawn) => pawn.id === pawnId);
  if (self !== undefined) {
    drawPawn(
      ctx,
      world,
      self,
      predicted?.x ?? self.x,
      predicted?.y ?? self.y,
      true,
      toX,
      toY,
      scale
    );
  }
}

function drawPawn(
  ctx: CanvasRenderingContext2D,
  world: World,
  pawn: { id: string; frameId: string; color: string; say?: string },
  localX: number,
  localY: number,
  isSelf: boolean,
  toX: (x: number) => number,
  toY: (y: number) => number,
  scale: number
): void {
  const at = originOf(world, pawn.frameId);
  const x = localX + at.x;
  const y = localY + at.y;
  ctx.fillStyle = isSelf ? pawn.color : '#8fa3b8';
  ctx.beginPath();
  ctx.arc(toX(x), toY(y), Math.max(12 * scale, 4), 0, Math.PI * 2);
  ctx.fill();
  if (pawn.say !== undefined && pawn.say !== '') {
    ctx.fillStyle = '#ffe08a';
    ctx.font = '11px monospace';
    ctx.fillText(pawn.say, toX(x) + 10, toY(y) - 10);
  }
}

function originOf(world: World, frameId: string): { x: number; y: number } {
  return world.vessels[frameId]?.origin ?? world.stations[frameId]?.origin ?? { x: 0, y: 0 };
}
