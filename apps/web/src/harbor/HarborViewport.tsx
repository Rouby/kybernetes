/**
 * HarborViewport: drives the WebGL2Renderer from protocol v2 snapshots.
 * All v2-to-render-state translation lives here. The renderer, passes,
 * HUD, StationHub models, shaders, and audio engine are consumed
 * as-is: pawns + doors + atmos + vitals are mapped onto the render state
 * the viewport has always spoken.
 */

import type {
  DockStatusBroadcast,
  DoorState,
  ManifestBroadcast,
  PlayerVitals,
  RoomAtmosphereSummary,
  SnapshotBroadcast,
  TelemetryBroadcast,
  TelemetryDeltaBroadcast,
  VitalsBroadcast,
} from '@kybernetes/protocol';
import { createInitialDoors } from '@kybernetes/sim-core';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { WebGL2Renderer } from '../webgl/WebGL2Renderer';
import type { PredictedShot } from './predictedShots';
import { advanceShots, confirmShots } from './predictedShots';
import type { FocusOrigin, FrameMotion } from './renderState';
import {
  aimPoint,
  applyDockGates,
  bareId,
  breachCountsByRoom,
  callsignFor,
  frameOrigins,
  interpolateFocusOrigin,
  mapAtmos,
  mapBreaches,
  mapDecals,
  mapKineticAmmo,
  mapPawn,
  mapPredictedProjectiles,
  mapRemotePawns,
  mapServerProjectiles,
  mapTelemetry,
  mapVitals,
  pawnWorld,
  roomO2,
  roomWindVectors,
  shipOffsetOf,
  smoothedOrigins,
  snapshotAgeS,
  stepFrameMotion,
  syncDoors,
  ventedBareIds,
} from './renderState';
import type { PredictedPawn } from './useHarborMovement';

const VIEW_MIN_H = 480;
const CAMERA_LERP = 0.12;
const VIEW_ZOOM = 1.3;
const LOOKAHEAD_PX = 120;

export interface HarborNoticed {
  readonly severity: string;
  readonly title: string;
  readonly message: string;
}

export interface HarborViewportProps {
  snapshot: SnapshotBroadcast | null;
  pawnId: string | null;
  predicted: PredictedPawn | null;
  telemetry: TelemetryBroadcast | null;
  vitals: VitalsBroadcast | null;
  manifest: ManifestBroadcast | null;
  dock: DockStatusBroadcast | null;
  notices: readonly HarborNoticed[];
  facingRef: RefObject<number>;
  aimLockedRef: RefObject<boolean>;
  fireSignalRef: RefObject<number>;
  shotsRef: RefObject<PredictedShot[]>;
  shipUnderway: boolean;
  onFireDown: () => void;
  onFireUp: () => void;
}

interface MuzzleFlash {
  x: number;
  y: number;
  until: number;
}

interface ViewportSession {
  renderer: WebGL2Renderer | null;
  camera: { x: number; y: number };
  frameMotion: FrameMotion | null;
  shipInterp: FocusOrigin | null;
  doors: DoorState[];
  seenImpacts: Set<string>;
  lastFrameMs: number;
  lastAudioMs: number;
  mouse: { x: number; y: number; moved: boolean };
  flashes: MuzzleFlash[];
  trauma: number;
  lastTraumaMs: number;
  lastSnapshotTick: number;
  snapshotAtMs: number;
  notice: { text: string; until: number } | null;
  lastNotice: string;
  lastSignal: number;
  shakeUntil: number;
  telemetryKey: string;
  cachedRooms: Record<string, RoomAtmosphereSummary>;
  cachedDelta: TelemetryDeltaBroadcast | null;
  cachedBreaches: ReturnType<typeof mapBreaches>;
  cachedFlows: TelemetryBroadcast['flows'];
}

const FLASH_MS = 120;
const NOTICE_MS = 4000;

const AUDIO_MS = 500;

export function HarborViewport(props: HarborViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<ViewportSession>({
    renderer: null,
    camera: { x: 650, y: 200 },
    frameMotion: null,
    shipInterp: null,
    doors: createInitialDoors(),
    seenImpacts: new Set<string>(),
    lastFrameMs: 0,
    lastAudioMs: 0,
    mouse: { x: 0, y: 0, moved: false },
    flashes: [],
    trauma: 0,
    lastTraumaMs: 0,
    lastSnapshotTick: -1,
    snapshotAtMs: 0,
    notice: null,
    lastNotice: '',
    lastSignal: 0,
    shakeUntil: 0,
    telemetryKey: '',
    cachedRooms: {},
    cachedDelta: null,
    cachedBreaches: [],
    cachedFlows: undefined,
  });
  const viewRef = useRef(props);
  viewRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const parent = canvas.parentElement;
    if (parent === null) return;
    const fitCanvas = (): void => {
      const w = Math.max(320, Math.floor(parent.clientWidth));
      const h = Math.max(VIEW_MIN_H, Math.floor(parent.clientHeight));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    fitCanvas();
    const observer = new ResizeObserver(fitCanvas);
    observer.observe(parent);
    const session = sessionRef.current;
    if (session.renderer === null) {
      try {
        session.renderer = new WebGL2Renderer(canvas);
      } catch (err) {
        console.error('HarborViewport: WebGL2 unavailable, viewport dark.', err);
        return;
      }
    }
    const onMove = (event: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      session.mouse.x = (event.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1));
      session.mouse.y = (event.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1));
      session.mouse.moved = true;
      viewRef.current.aimLockedRef.current = true;
    };
    const onDown = (): void => {
      const renderer = session.renderer;
      if (renderer !== null) {
        const tester = renderer.getHitTester();
        if (tester.handleClick(session.mouse.x, session.mouse.y, canvas.width, canvas.height))
          return;
      }
      viewRef.current.onFireDown();
    };
    const onUp = (): void => {
      viewRef.current.onFireUp();
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    let raf = 0;
    const frame = (): void => {
      if (canvas.width > 0 && canvas.height > 0) {
        renderViewport(session, viewRef.current, canvas);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <canvas
        ref={canvasRef}
        data-testid="harbor-canvas"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

function renderViewport(
  session: ViewportSession,
  view: HarborViewportProps,
  canvas: HTMLCanvasElement
): void {
  const renderer = session.renderer;
  const snapshot = view.snapshot;
  if (renderer === null || snapshot === null) return;
  const own = snapshot.pawns.find((pawn) => pawn.id === view.pawnId);
  if (own === undefined) return;
  const origins = frameOrigins(snapshot);
  const now = performance.now();
  // Glide the 10Hz ship origin to render rate; the camera follow then
  // transposes the world smoothly instead of stair-stepping each delta.
  session.shipInterp = interpolateFocusOrigin(session.shipInterp, shipOffsetOf(origins), now);
  const viewOrigins = smoothedOrigins(origins, session.shipInterp);
  const at = pawnWorld(own, viewOrigins, view.predicted);
  stampSnapshotArrival(session, snapshot, now);
  const aim = trackAim(session, view, canvas, at);
  const motion = stepFrameMotion(
    session.frameMotion ?? null,
    session.shipInterp.x,
    session.shipInterp.y,
    now
  );
  session.frameMotion = motion;
  const look = leadLookTarget(at, aim, motion, own.frameId);
  stepCamera(session, look);
  trackShots(session, view, at, now);
  stepShots(session, view, snapshot, now);
  session.lastFrameMs = now;
  trackNotices(session, view, now);
  session.doors = applyDockGates(syncDoors(session.doors, snapshot), view.dock?.walkable === true);
  ShipAudioEngine.getInstance().updateListener(at.x, at.y, session.doors);
  const { rooms: roomAtmos, delta, breaches, flows } = telemetryView(session, view, snapshot);
  const mappedVitals = mapVitals(view.vitals);
  pollAudioTelemetry(session, delta, mappedVitals, bareId(own.roomHint), now);
  renderer.render(
    {
      pawn: mapPawn(own, callsignFor(view.manifest, own.id), at, view.facingRef.current),
      remotePawns: mapRemotePawns(snapshot, view.pawnId, view.manifest, viewOrigins),
      vitals: mappedVitals,
      telemetry: delta,
      boarding: {
        intruders: [],
        boardingPods: [],
        sentries: [],
        lockedBulkheads: [],
        ventedRooms: ventedBareIds(view.telemetry),
        doors: session.doors,
        projectiles: [
          ...mapServerProjectiles(
            snapshot.projectiles,
            viewOrigins,
            snapshotAgeS(session.snapshotAtMs, now)
          ),
          ...mapPredictedProjectiles(view.shotsRef.current, viewOrigins),
        ],
        roomO2: roomO2(roomAtmos),
      },
      credits: view.vitals?.credits,
      clearanceLevel: view.vitals?.clearance,
      beaconCode: view.manifest?.beacon,
      crewCount: view.manifest?.crew.length,
      currentRoomId: bareId(own.roomHint),
      kineticAmmo: mapKineticAmmo(view.vitals),
      breaches,
      breachFlows: flows,
      decals: mapDecals(snapshot, viewOrigins),
      dock:
        view.dock === null
          ? undefined
          : {
              walkable: view.dock.walkable,
              phase: view.dock.phase,
              secondsToSeal: view.dock.secondsToSeal,
            },
      impacts: freshImpacts(session, snapshot, viewOrigins),
      camera: shakenCamera(session, now),
      zoom: VIEW_ZOOM,
      mouseWorld: aimPoint(aim, at),
      muzzleFlashes: session.flashes.map((flash) => ({
        x: flash.x,
        y: flash.y,
        weaponType: 'kinetic_carbine' as const,
      })),
      inGameNotice: session.notice?.text,
      timeMs: now,
      shipOffset: shipOffsetOf(viewOrigins),
      shipUnderway: view.shipUnderway,
      screenWidth: canvas.clientWidth,
      screenHeight: canvas.clientHeight,
    },
    canvas.width,
    canvas.height
  );
}

/** Rebuild atmos/telemetry mappings only when a channel tick actually moved. */
function telemetryView(
  session: ViewportSession,
  view: HarborViewportProps,
  snapshot: SnapshotBroadcast
): {
  rooms: Record<string, RoomAtmosphereSummary>;
  delta: TelemetryDeltaBroadcast;
  breaches: ReturnType<typeof mapBreaches>;
  flows: TelemetryBroadcast['flows'];
} {
  const key = telemetryKey(view, snapshot);
  if (session.telemetryKey === key && session.cachedDelta !== null) {
    return {
      rooms: session.cachedRooms,
      delta: session.cachedDelta,
      breaches: session.cachedBreaches,
      flows: session.cachedFlows,
    };
  }
  const breaches = mapBreaches(snapshot);
  const flows = view.telemetry?.flows;
  const winds = roomWindVectors(breaches, flows);
  const rooms = mapAtmos(view.telemetry, winds, breachCountsByRoom(breaches));
  const delta = mapTelemetry(snapshot, view.telemetry, view.manifest, rooms);
  session.telemetryKey = key;
  session.cachedRooms = rooms;
  session.cachedDelta = delta;
  session.cachedBreaches = breaches;
  session.cachedFlows = flows;
  return { rooms, delta, breaches, flows };
}

function telemetryKey(view: HarborViewportProps, snapshot: SnapshotBroadcast): string {
  const teleTick = view.telemetry?.tick ?? -1;
  const manifestRev = view.manifest?.rev ?? view.manifest?.shipName ?? '?';
  const portalRev = snapshot.portalRev ?? snapshot.tick;
  return `${snapshot.tick}:${teleTick}:${manifestRev}:${portalRev}`;
}

function screenToWorld(
  sx: number,
  sy: number,
  canvas: HTMLCanvasElement,
  camera: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: (sx - canvas.width / 2) / VIEW_ZOOM + camera.x,
    y: (sy - canvas.height / 2) / VIEW_ZOOM + camera.y,
  };
}

function aimWorld(
  session: ViewportSession,
  canvas: HTMLCanvasElement
): { x: number; y: number } | null {
  if (!session.mouse.moved) return null;
  return screenToWorld(session.mouse.x, session.mouse.y, canvas, session.camera);
}

/** Stamp snapshot arrival on the client clock for projectile extrapolation. */
function stampSnapshotArrival(
  session: ViewportSession,
  snapshot: SnapshotBroadcast,
  now: number
): void {
  if (snapshot.tick !== session.lastSnapshotTick) {
    session.lastSnapshotTick = snapshot.tick;
    session.snapshotAtMs = now;
  }
}

/** Aim from the mouse ray; also steers the facing the server will apply. */
function trackAim(
  session: ViewportSession,
  view: HarborViewportProps,
  canvas: HTMLCanvasElement,
  at: { x: number; y: number }
): { x: number; y: number } | null {
  const aim = aimWorld(session, canvas);
  if (aim !== null) view.facingRef.current = Math.atan2(aim.y - at.y, aim.x - at.x);
  return aim;
}

/** Throttled ambience update; the render path never blocks on audio. */
function pollAudioTelemetry(
  session: ViewportSession,
  delta: TelemetryDeltaBroadcast,
  mappedVitals: PlayerVitals | undefined,
  roomId: string,
  now: number
): void {
  if (now - session.lastAudioMs < AUDIO_MS) return;
  session.lastAudioMs = now;
  ShipAudioEngine.getInstance().updateTelemetry(delta, mappedVitals, roomId);
}

function lookTarget(
  at: { x: number; y: number },
  aim: { x: number; y: number } | null
): { x: number; y: number } {
  if (aim === null) return at;
  const dx = aim.x - at.x;
  const dy = aim.y - at.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return at;
  const pull = Math.min(dist, LOOKAHEAD_PX) * 0.35;
  return { x: at.x + (dx / dist) * pull, y: at.y + (dy / dist) * pull };
}

/**
 * Lead the look target along frame motion while embarked so a vessel
 * underway pans smoothly instead of juddering behind each snapshot delta.
 */
function leadLookTarget(
  at: { x: number; y: number },
  aim: { x: number; y: number } | null,
  motion: FrameMotion,
  frameId: string
): { x: number; y: number } {
  const look = lookTarget(at, aim);
  if (frameId === 'station') return look;
  return { x: look.x + motion.velX * 0.15, y: look.y + motion.velY * 0.15 };
}

function stepCamera(session: ViewportSession, look: { x: number; y: number }): void {
  const dist = Math.hypot(look.x - session.camera.x, look.y - session.camera.y);
  const rate = dist > 200 ? CAMERA_LERP : 0.25;
  session.camera.x += (look.x - session.camera.x) * rate;
  session.camera.y += (look.y - session.camera.y) * rate;
}

function trackShots(
  session: ViewportSession,
  view: HarborViewportProps,
  at: { x: number; y: number },
  now: number
): void {
  decayTrauma(session, now);
  if (view.fireSignalRef.current !== session.lastSignal) {
    session.lastSignal = view.fireSignalRef.current;
    session.flashes = [...session.flashes.slice(-3), { x: at.x, y: at.y, until: now + FLASH_MS }];
    session.trauma = Math.min(1, session.trauma + TRAUMA_PER_SHOT);
    session.shakeUntil = now + SHAKE_MS;
  }
  session.flashes = session.flashes.filter((flash) => flash.until > now);
}

const SHAKE_MS = 170;
const SHAKE_BASE_PX = 5;
const SHAKE_BLOOM_PX = 7;
const TRAUMA_PER_SHOT = 0.25;
const TRAUMA_DECAY_PER_S = 1.1;

/** Trauma from recent shots, decayed by wall clock; visual only, never sim state. */
function decayTrauma(session: ViewportSession, now: number): void {
  if (session.lastTraumaMs <= 0) {
    session.lastTraumaMs = now;
    return;
  }
  const dt = Math.max(0, (now - session.lastTraumaMs) / 1000);
  session.lastTraumaMs = now;
  session.trauma = Math.max(0, session.trauma - TRAUMA_DECAY_PER_S * dt);
}

/** Kick on firing that grows with accumulated trauma and decays to zero; visual only. */
function shakenCamera(session: ViewportSession, now: number): { x: number; y: number } {
  const remaining = session.shakeUntil - now;
  if (remaining <= 0) return { ...session.camera };
  const mag = (SHAKE_BASE_PX + SHAKE_BLOOM_PX * session.trauma) * (remaining / SHAKE_MS);
  return {
    x: session.camera.x + (Math.random() * 2 - 1) * mag,
    y: session.camera.y + (Math.random() * 2 - 1) * mag,
  };
}

/** Advance local rounds and drop the ones authority has taken over. */
function stepShots(
  session: ViewportSession,
  view: HarborViewportProps,
  snapshot: SnapshotBroadcast,
  now: number
): void {
  const dt = Math.min(Math.max((now - session.lastFrameMs) / 1000, 0), 0.05);
  view.shotsRef.current = confirmShots(
    advanceShots(view.shotsRef.current, now, dt),
    snapshot.projectiles ?? []
  );
}

function impactKey(frameId: string, x: number, y: number, kind: string, weapon?: string): string {
  return `${frameId}:${Math.round(x)}:${Math.round(y)}:${kind}:${weapon ?? ''}`;
}

interface FreshImpact {
  readonly x: number;
  readonly y: number;
  readonly type: 'kinetic' | 'breach';
  readonly angle: number;
  readonly weapon: string;
  readonly energy: number;
  readonly breachAreaM2: number;
  readonly pressureKpa: number;
}

function toFreshImpact(
  impact: SnapshotBroadcast['impacts'][number],
  origins: Map<string, { x: number; y: number }>,
  areas: Map<string, number | undefined>
): FreshImpact | undefined {
  if (impact.kind === 'miss') return undefined;
  const origin = origins.get(impact.frameId) ?? { x: 0, y: 0 };
  return {
    x: impact.x + origin.x,
    y: impact.y + origin.y,
    type: impact.kind === 'breach' ? 'breach' : 'kinetic',
    angle: impact.angle ?? 0,
    weapon: impact.weapon ?? 'kinetic_carbine',
    energy: impact.energy ?? 0.5,
    breachAreaM2: (impact.breachId === undefined ? undefined : areas.get(impact.breachId)) ?? 0.05,
    pressureKpa: impact.pressureKpa ?? 101.3,
  };
}

function pruneSeen(seen: Set<string>, live: Set<string>): void {
  for (const key of [...seen]) {
    if (!live.has(key)) seen.delete(key);
  }
}

function freshImpacts(
  session: ViewportSession,
  snapshot: SnapshotBroadcast,
  origins: Map<string, { x: number; y: number }>
): FreshImpact[] {
  const live = new Set<string>();
  const fresh: FreshImpact[] = [];
  const areas = new Map(snapshot.portals.map((portal) => [portal.id, portal.areaM2] as const));
  const impacts = Array.isArray(snapshot.impacts) ? snapshot.impacts : [];
  for (const impact of impacts) {
    const key = impactKey(impact.frameId, impact.x, impact.y, impact.kind, impact.weapon);
    live.add(key);
    if (session.seenImpacts.has(key)) continue;
    session.seenImpacts.add(key);
    const mapped = toFreshImpact(impact, origins, areas);
    if (mapped !== undefined) fresh.push(mapped);
  }
  pruneSeen(session.seenImpacts, live);
  return fresh;
}

function trackNotices(session: ViewportSession, view: HarborViewportProps, now: number): void {
  const latest = view.notices[view.notices.length - 1];
  const key = latest === undefined ? '' : `${latest.title}:${latest.message}`;
  if (key !== '' && key !== session.lastNotice) {
    session.lastNotice = key;
    session.notice = { text: key.slice(0, 72), until: now + NOTICE_MS };
  }
  if (session.notice !== null && session.notice.until <= now) session.notice = null;
}
