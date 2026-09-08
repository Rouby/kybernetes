/**
 * HarborViewport: drives the frozen WebGL2Renderer from protocol v2 snapshots.
 * All v2-to-render-state translation lives here (new code). The renderer,
 * passes, HUD, StationHub models, shaders, and audio engine are consumed
 * untouched: pawns + doors + atmos + vitals are mapped onto the render state
 * the viewport has always spoken.
 */

import type {
  DoorState,
  ManifestBroadcast,
  PawnState,
  PlayerVitals,
  RoomAtmosphereSummary,
  SnapshotBroadcast,
  SnapshotPawn,
  TelemetryBroadcast,
  TelemetryDeltaBroadcast,
  VitalsBroadcast,
} from '@kybernetes/protocol';
import { createInitialDoors, SHIP_ORIGIN } from '@kybernetes/sim-core';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { WebGL2Renderer } from '../webgl/WebGL2Renderer';
import type { PredictedPawn } from './useHarborMovement';
import { remotePawns } from './useHarborSocket';

const VIEW_MIN_H = 480;
const CAMERA_LERP = 0.12;
const VIEW_ZOOM = 1.15;

export interface HarborViewportProps {
  snapshot: SnapshotBroadcast | null;
  pawnId: string | null;
  predicted: PredictedPawn | null;
  telemetry: TelemetryBroadcast | null;
  vitals: VitalsBroadcast | null;
  manifest: ManifestBroadcast | null;
  facingRef: RefObject<number>;
}

type OverlayMode = 'off' | 'o2' | 'temp' | 'pressure';
const OVERLAY_CYCLE: OverlayMode[] = ['off', 'o2', 'temp', 'pressure'];

interface ViewportSession {
  renderer: WebGL2Renderer | null;
  camera: { x: number; y: number };
  doors: DoorState[];
  lastAudioMs: number;
}

const AUDIO_MS = 500;

export function HarborViewport(props: HarborViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<ViewportSession>({
    renderer: null,
    camera: { x: 650, y: 200 },
    doors: createInitialDoors(),
    lastAudioMs: 0,
  });
  const viewRef = useRef(props);
  viewRef.current = props;
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('pressure');
  const overlayRef = useRef(overlayMode);
  overlayRef.current = overlayMode;

  useEffect(() => {
    const onDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'o') return;
      ShipAudioEngine.getInstance().playUiClick();
      setOverlayMode(
        (mode) => OVERLAY_CYCLE[(OVERLAY_CYCLE.indexOf(mode) + 1) % OVERLAY_CYCLE.length] ?? 'off'
      );
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, []);

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
    let raf = 0;
    const frame = (): void => {
      if (canvas.width > 0 && canvas.height > 0) {
        renderViewport(session, viewRef.current, overlayRef.current, canvas);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 250px)', minHeight: VIEW_MIN_H }}>
      <canvas
        ref={canvasRef}
        data-testid="harbor-canvas"
        style={{ border: '1px solid #2a3340', marginTop: 8, width: '100%', height: '100%' }}
      />
    </div>
  );
}

function renderViewport(
  session: ViewportSession,
  view: HarborViewportProps,
  overlayMode: OverlayMode,
  canvas: HTMLCanvasElement
): void {
  const renderer = session.renderer;
  const snapshot = view.snapshot;
  if (renderer === null || snapshot === null) return;
  const own = snapshot.pawns.find((pawn) => pawn.id === view.pawnId);
  if (own === undefined) return;
  const origins = frameOrigins(snapshot);
  const at = pawnWorld(own, origins, view.predicted);
  session.camera.x += (at.x - session.camera.x) * CAMERA_LERP;
  session.camera.y += (at.y - session.camera.y) * CAMERA_LERP;
  session.doors = syncDoors(session.doors, snapshot);
  ShipAudioEngine.getInstance().updateListener(at.x, at.y, session.doors);
  const roomAtmos = mapAtmos(view.telemetry);
  const delta = mapTelemetry(view, roomAtmos);
  const mappedVitals = mapVitals(view.vitals);
  const now = performance.now();
  if (now - session.lastAudioMs >= AUDIO_MS) {
    session.lastAudioMs = now;
    ShipAudioEngine.getInstance().updateTelemetry(delta, mappedVitals, bareId(own.roomHint));
  }
  renderer.render(
    {
      pawn: mapPawn(own, callsignFor(view, own.id), at, view.facingRef.current),
      remotePawns: remotePawns(snapshot, view.pawnId).map((pawn) =>
        mapPawn(pawn, callsignFor(view, pawn.id), pawnWorld(pawn, origins, null), pawn.facing)
      ),
      vitals: mappedVitals,
      telemetry: delta,
      boarding: {
        intruders: [],
        boardingPods: [],
        sentries: [],
        lockedBulkheads: [],
        ventedRooms: ventedBareIds(view.telemetry),
        doors: session.doors,
        projectiles: [],
        roomO2: roomO2(roomAtmos),
      },
      credits: view.vitals?.credits,
      clearanceLevel: view.vitals?.clearance,
      beaconCode: view.manifest?.beacon,
      crewCount: view.manifest?.crew.length,
      currentRoomId: bareId(own.roomHint),
      welderThermal:
        view.vitals === null
          ? undefined
          : {
              heat: view.vitals.vitals.heat,
              isOverheated: view.vitals.vitals.heat >= 100,
            },
      overlayMode,
      camera: { ...session.camera },
      zoom: VIEW_ZOOM,
      mouseWorld: { x: at.x + 50, y: at.y },
      timeMs: performance.now(),
      shipOffset: origins.get('ship') ?? { ...SHIP_ORIGIN },
      screenWidth: canvas.clientWidth,
      screenHeight: canvas.clientHeight,
    },
    canvas.width,
    canvas.height
  );
}

function frameOrigins(snapshot: SnapshotBroadcast): Map<string, { x: number; y: number }> {
  const origins = new Map<string, { x: number; y: number }>();
  origins.set('station', { x: 0, y: 0 });
  origins.set('ship', { ...SHIP_ORIGIN });
  for (const frame of snapshot.frames) {
    origins.set(frame.id, { x: frame.originX, y: frame.originY });
  }
  return origins;
}

function pawnWorld(
  pawn: SnapshotPawn,
  origins: Map<string, { x: number; y: number }>,
  predicted: PredictedPawn | null
): { x: number; y: number } {
  const origin = origins.get(pawn.frameId) ?? { x: 0, y: 0 };
  if (predicted !== null) return { x: predicted.x + origin.x, y: predicted.y + origin.y };
  return { x: pawn.x + origin.x, y: pawn.y + origin.y };
}

function mapPawn(
  pawn: SnapshotPawn,
  callsign: string,
  at: { x: number; y: number },
  facing: number
): PawnState {
  return {
    id: pawn.id,
    callsign,
    role: 'wiper',
    x: at.x,
    y: at.y,
    vx: pawn.vx,
    vy: pawn.vy,
    facingAngle: facing,
    currentDeck: pawn.roomHint,
    isOperating: false,
    isResting: false,
    color: pawn.color,
    isBot: pawn.id.startsWith('npc:') || pawn.id.startsWith('captain:'),
    ...(pawn.say === undefined || pawn.say === ''
      ? {}
      : { speechBubble: { text: pawn.say, expiresAt: Date.now() + 3000 } }),
  };
}

function callsignFor(view: HarborViewportProps, pawnId: string): string {
  const entry = view.manifest?.crew.find((member) => member.id === pawnId);
  if (entry !== undefined) return entry.callsign;
  const dot = pawnId.indexOf(':');
  return dot < 0 ? pawnId : pawnId.slice(dot + 1);
}

function syncDoors(base: DoorState[], snapshot: SnapshotBroadcast): DoorState[] {
  const states = new Map(snapshot.portals.map((portal) => [portal.id, portal]));
  let changed = false;
  const doors = base.map((door) => {
    const live = states.get(door.id);
    if (live === undefined) return door;
    const open = live.open || live.state === 'destroyed';
    if (open === door.isOpen) return door;
    changed = true;
    return { ...door, isOpen: open };
  });
  return changed ? doors : base;
}

function bareId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}

function mapAtmos(telemetry: TelemetryBroadcast | null): Record<string, RoomAtmosphereSummary> {
  const rooms: Record<string, RoomAtmosphereSummary> = {};
  for (const room of telemetry?.atmos ?? []) {
    const id = bareId(room.roomId);
    rooms[id] = {
      roomId: id,
      pressureKpa: room.pressureKpa,
      o2Percent: room.o2Percent,
      co2Ppm: room.co2Ppm,
      tempCelsius: room.tempCelsius,
      toxicSmokePercent: 0,
      isVenting: room.pressureKpa < 20,
      isRepressurizing: room.repressurizing,
      activeFires: 0,
      activeBreaches: 0,
    };
  }
  return rooms;
}

function ventedBareIds(telemetry: TelemetryBroadcast | null): string[] {
  return (telemetry?.atmos ?? [])
    .filter((room) => room.pressureKpa < 20)
    .map((room) => bareId(room.roomId));
}

function roomO2(rooms: Record<string, RoomAtmosphereSummary>): Record<string, number> {
  return Object.fromEntries(Object.values(rooms).map((room) => [room.roomId, room.o2Percent]));
}

function mapVitals(vitals: VitalsBroadcast | null): PlayerVitals | undefined {
  if (vitals === null) return undefined;
  const v = vitals.vitals;
  return {
    hunger: v.hunger,
    thirst: v.thirst,
    fatigue: v.fatigue,
    stamina: Math.max(0, 100 - v.fatigue),
    maxStamina: 100,
    health: v.health,
    suit: {
      isSealed: v.suitSealed,
      o2RemainingSeconds: 600,
      maxO2Seconds: 600,
      integrityPercent: 100,
      batteryPercent: 100,
    },
    incapacitated: {
      isIncapacitated: v.health <= 0,
      cause: 'hypoxia',
      bleedoutSecondsRemaining: 0,
    },
    bodyTempCelsius: 37,
    hypoxiaPercent: v.hypoxia,
  };
}

function mapTelemetry(
  view: HarborViewportProps,
  roomAtmospheres: Record<string, RoomAtmosphereSummary>
): TelemetryDeltaBroadcast {
  const subsystems = view.telemetry?.subsystems;
  const hullIntegrity = subsystems?.hull ?? 100;
  const atmosLevel = subsystems?.atmos ?? 100;
  return {
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    shipName: view.manifest?.shipName ?? 'CSS Hesperia',
    reactorTemp: 340,
    reactorMaxTemp: 1200,
    reactorOutputMw: 42,
    oxygenLevelPercent: atmosLevel,
    hullIntegrityPercent: hullIntegrity,
    shieldIntegrityPercent: 100,
    alertLevel: hullIntegrity < 70 ? 'yellow' : 'nominal',
    supplies: {
      rations: 100,
      waterLitres: 100,
      oxygenPercent: atmosLevel,
      morale: 80,
      mutinyRisk: 0,
    },
    reactor: {
      tempKelvin: 340,
      maxTempKelvin: 1200,
      outputMw: 42,
      coolantLevelPercent: 100,
      status: 'nominal',
    },
    lifeSupport: {
      o2LevelPercent: atmosLevel,
      co2LevelPercent: 0.04,
      scrubberEfficiencyPercent: 100,
      status: 'nominal',
    },
    hull: {
      integrityPercent: hullIntegrity,
      stressPercent: 0,
      breaches:
        view.snapshot?.portals
          .filter((portal) => portal.state === 'destroyed')
          .map((portal) => portal.id) ?? [],
      status: hullIntegrity < 70 ? 'degraded' : 'nominal',
    },
    shields: { integrityPercent: 100, chargeMw: 10, status: 'nominal' },
    defense: { pdtAmmo: 100, pdtReady: true, status: 'nominal' },
    activeEvents: [],
    activeFires: [],
    roomAtmospheres,
  };
}
