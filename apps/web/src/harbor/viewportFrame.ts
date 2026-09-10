/**
 * viewportFrame: framework-free WebGL viewport state and frame assembly.
 * Split out of HarborViewport so ViewportDriver (and its vanilla successor)
 * can drive frames without React. Pure v2-to-render-state mapping plus the
 * per-frame session assembly the driver loop calls.
 */

import type {
  ClientIntent,
  DeathCause,
  DockStatusBroadcast,
  DoorState,
  ManifestBroadcast,
  NavStateBroadcast,
  PlayerVitals,
  RoomAtmosphereSummary,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
  SnapshotBroadcast,
  SnapshotPawn,
  TelemetryBroadcast,
  TelemetryDeltaBroadcast,
  VitalsBroadcast,
} from '@kybernetes/protocol';
import { createInitialDoors, type World } from '@kybernetes/sim-core';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import type { PredictedPose } from '../client/stores/MovementController';
import type { PackScreenModel } from '../pack/packModel';
import type { LivingView } from '../webgl/LivingFixtures';
import {
  cargoConsoleIntent,
  engineConsoleIntent,
  type GlAudioState,
  marketConsoleIntent,
  navConsoleIntent,
  reactorConsoleIntent,
  type SessionOverlayId,
  selectSessionOverlayId,
} from '../webgl/ui/UiPass';
import {
  type CargoScreenModel,
  layoutCargoScreen,
  layoutDeathScreen,
  layoutEngineScreen,
  layoutMarketScreen,
  layoutNavScreen,
  layoutPackScreen,
  layoutPauseScreen,
  layoutReactorScreen,
  layoutSettingsScreen,
  type UiScreenLayout,
} from '../webgl/ui/UiScreens';
import { packBenchTransform, packPlace, publishUiZones } from '../webgl/ui/UiToolkit';
import type { WebGL2Renderer, WebGLRenderState } from '../webgl/WebGL2Renderer';
import {
  doorSpotsOf,
  type InteractTarget,
  selectInteractTarget,
  sightBlockers,
  targetPromptWithCarry,
} from './interactTarget';
import type { MarketScreenModel } from './marketModel';
import type { PredictedShot } from './predictedShots';
import { advanceShots, confirmShots } from './predictedShots';
import type { FocusOrigin, FrameMotion, ImpactRenderModel } from './renderState';
import {
  aimPoint,
  applyDockGates,
  attachCarriedCrates,
  bareId,
  breachCountsByRoom,
  callsignFor,
  frameOrigins,
  interpolateFocusOrigin,
  mapAtmos,
  mapBreaches,
  mapCargoCrates,
  mapDecals,
  mapKineticAmmo,
  mapLivingFixtures,
  mapLivingSummary,
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
  toImpactRenderModel as toFreshImpact,
  ventedBareIds,
} from './renderState';
import type { ConsoleKind } from './sessionActions';

const VIEW_MIN_H = 480;
const CAMERA_LERP = 0.12;
const VIEW_ZOOM = 1.3;
const LOOKAHEAD_PX = 120;

export interface HarborNoticed {
  readonly severity: string;
  readonly title: string;
  readonly message: string;
}

declare global {
  interface Window {
    __uiZones?: { id: string; x: number; y: number; w: number; h: number }[];
  }
}

export interface GlConsoleState {
  readonly kind: ConsoleKind;
  readonly systems: ShipSystemsBroadcast;
}

export interface CargoWiring {
  readonly screen: CargoScreenModel;
  readonly unpackIds: readonly string[];
  readonly seal: Readonly<Record<string, number>>;
}

export interface MarketWiring {
  readonly hubId: string;
  readonly screen: MarketScreenModel;
  readonly buys: Readonly<Record<string, number>>;
  readonly sellIds: readonly string[];
}

export interface PackSceneBody {
  readonly id: number;
  readonly goodId: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly w: number;
  readonly h: number;
  readonly held: boolean;
  readonly inside: boolean;
  readonly settled: boolean;
}

export interface PackWiring {
  readonly screen: PackScreenModel;
  readonly scene: {
    readonly bodies: readonly PackSceneBody[];
    readonly walls: readonly { x: number; y: number; w: number; h: number }[];
    readonly crate: { x: number; y: number; w: number; h: number };
    readonly sealReady: boolean;
  };
  readonly onAdd: (goodId: string) => void;
  readonly onSeal: () => void;
  readonly onAuto: () => void;
  readonly onClear: () => void;
}

export interface GlSessionWiring {
  readonly paused: boolean;
  readonly dead: boolean;
  readonly cause: DeathCause | undefined;
  readonly settingsOpen: boolean;
  readonly audio: GlAudioState;
  readonly console: GlConsoleState | null;
  readonly navState: NavStateBroadcast | null;
  readonly cargo: CargoWiring | null;
  readonly market: MarketWiring | null;
  readonly pack: PackWiring | null;
  readonly shipStatus: ShipStatusBroadcast | null;
  readonly sendIntent: (intent: ClientIntent) => void;
  readonly onPackOpen: (ctx: import('../pack/PackStore').PackContext) => void;
  readonly onCloseConsole: () => void;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onQuit: () => void;
  readonly onOpenSettings: () => void;
  readonly onCloseSettings: () => void;
  readonly onEnableAudio: () => void;
  readonly onVolumeDown: () => void;
  readonly onVolumeUp: () => void;
  readonly onToggleMute: () => void;
}

/** Framework-free mutable cell (replaces React RefObject post-removal). */
export interface MutableRef<T> {
  current: T;
}

export interface HarborViewportProps {
  statics: World;
  snapshot: SnapshotBroadcast | null;
  pawnId: string | null;
  beacon: string;
  userId: string;
  predicted: PredictedPose | null;
  telemetry: TelemetryBroadcast | null;
  vitals: VitalsBroadcast | null;
  manifest: ManifestBroadcast | null;
  dock: DockStatusBroadcast | null;
  notices: readonly HarborNoticed[];
  facingRef: MutableRef<number>;
  aimLockedRef: MutableRef<boolean>;
  fireSignalRef: MutableRef<number>;
  shotsRef: MutableRef<PredictedShot[]>;
  shipUnderway: boolean;
  onFireDown: () => void;
  onFireUp: () => void;
  targetRef: { current: InteractTarget | null };
  /** Pause/death/settings/console actions rendered as a GL overlay. */
  glOverlay?: GlSessionWiring | null;
}

interface MuzzleFlash {
  x: number;
  y: number;
  until: number;
}

export interface ViewportSession {
  renderer: WebGL2Renderer | null;
  camera: { x: number; y: number };
  frameMotion: FrameMotion | null;
  shipInterp: FocusOrigin | null;
  doors: DoorState[];
  seenImpacts: Set<string>;
  lastFrameMs: number;
  lastAudioMs: number;
  mouse: { x: number; y: number; moved: boolean; lastMs: number };
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

export function fitCanvasToParent(canvas: HTMLCanvasElement, parent: HTMLElement): void {
  const w = Math.max(320, Math.floor(parent.clientWidth));
  const h = Math.max(VIEW_MIN_H, Math.floor(parent.clientHeight));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function createViewportSession(): ViewportSession {
  return {
    renderer: null,
    camera: { x: 650, y: 200 },
    frameMotion: null,
    shipInterp: null,
    doors: createInitialDoors(),
    seenImpacts: new Set<string>(),
    lastFrameMs: 0,
    lastAudioMs: 0,
    mouse: { x: 0, y: 0, moved: false, lastMs: 0 },
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
  };
}

function frameDoors(
  session: ViewportSession,
  view: HarborViewportProps,
  snapshot: SnapshotBroadcast
): void {
  session.doors = applyDockGates(syncDoors(session.doors, snapshot), view.dock?.walkable === true);
}

export function renderViewport(
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
  const cursorWorld = cursorWorldOf(session, canvas, now);
  const { livingViews, cargoViews, target } = targetFrameState(
    snapshot,
    view.statics,
    viewOrigins,
    own,
    view.facingRef.current,
    view.predicted,
    cursorWorld
  );
  view.targetRef.current = target;
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
  frameDoors(session, view, snapshot);
  renderer.setFowIdentity(view.beacon, view.userId);
  ShipAudioEngine.getInstance().updateListener(at.x, at.y, session.doors);
  const { rooms: roomAtmos, delta, breaches, flows } = telemetryView(session, view, snapshot);
  const mappedVitals = mapVitals(view.vitals);
  pollAudioTelemetry(session, delta, mappedVitals, bareId(own.roomHint), now);
  renderer.render(
    viewportRenderState({
      session,
      view,
      snapshot,
      viewOrigins,
      at,
      aim,
      own,
      roomAtmos,
      delta,
      breaches,
      flows,
      mappedVitals,
      livingViews,
      cargoViews,
      target,
      now,
      canvas,
    }),
    canvas.width,
    canvas.height
  );
}

/** Pure render-state assembly for one viewport frame (single args object). */
function boardingRenderSection(args: {
  session: ViewportSession;
  view: HarborViewportProps;
  snapshot: SnapshotBroadcast;
  viewOrigins: Map<string, { x: number; y: number }>;
  roomAtmos: Record<string, RoomAtmosphereSummary>;
  now: number;
}) {
  const { session, view, snapshot, viewOrigins, roomAtmos, now } = args;
  return {
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
  };
}

function packSceneOf(
  view: HarborViewportProps,
  canvas: HTMLCanvasElement
): import('../webgl/PackScene').PackSceneView | null {
  const pack = view.glOverlay?.pack;
  if (pack === undefined || pack === null) return null;
  const bench = packBenchTransform(canvas.width, canvas.height);
  const rect = bench.rect;
  const crate = pack.scene.crate;
  const place = (x: number, y: number) => packPlace(bench, x, y);
  const placeRect = (r: { x: number; y: number; w: number; h: number }) => {
    const at = place(r.x, r.y);
    return { x: at.x, y: at.y, w: r.w * bench.scale, h: r.h * bench.scale };
  };
  return {
    rect,
    walls: pack.scene.walls.map((wall) => placeRect(wall)),
    crate: placeRect(crate),
    bodies: pack.scene.bodies.map((body) => {
      const at = place(body.x, body.y);
      return { ...body, x: at.x, y: at.y, w: body.w * bench.scale, h: body.h * bench.scale };
    }),
    sealReady: pack.scene.sealReady,
  };
}

function targetRenderFields(
  target: InteractTarget | null,
  snapshot: SnapshotBroadcast,
  pawnId: string | null
): {
  nearestLivingId: string | null;
  nearestCargoId: string | null;
  promptActionName: string | undefined;
} {
  const carrying =
    pawnId !== null &&
    (snapshot.crates ?? []).some(
      (crate) => crate.where === 'carriedBy' && crate.carrierId === pawnId
    );
  return {
    nearestLivingId: target?.kind === 'fixture' ? target.contact.id : null,
    nearestCargoId: target?.kind === 'crate' ? target.id : null,
    promptActionName: target === null ? undefined : targetPromptWithCarry(target, carrying),
  };
}

function vitalsRenderFields(
  view: HarborViewportProps,
  mappedVitals: PlayerVitals | undefined,
  own: SnapshotPawn
): {
  vitals: PlayerVitals | undefined;
  mealBuffS: number;
  credits: number | undefined;
  clearanceLevel: number | undefined;
  currentRoomId: string;
  kineticAmmo: ReturnType<typeof mapKineticAmmo>;
} {
  return {
    vitals: mappedVitals,
    mealBuffS: view.vitals?.vitals.mealBuffS ?? 0,
    credits: view.vitals?.credits,
    clearanceLevel: view.vitals?.clearance,
    currentRoomId: bareId(own.roomHint),
    kineticAmmo: mapKineticAmmo(view.vitals),
  };
}

function manifestRenderFields(view: HarborViewportProps): {
  beaconCode: string | undefined;
  crewCount: number | undefined;
} {
  return {
    beaconCode: view.manifest?.beacon,
    crewCount: view.manifest?.crew.length,
  };
}

type OverlayHandler = (wiring: GlSessionWiring) => void;

const PAUSE_ACTIONS: Record<string, OverlayHandler> = {
  resume: (wiring) => wiring.onResume(),
  restart: (wiring) => wiring.onRestart(),
  quit: (wiring) => wiring.onQuit(),
  audio: (wiring) => wiring.onOpenSettings(),
};

const SETTINGS_ACTIONS: Record<string, OverlayHandler> = {
  close: (wiring) => wiring.onCloseSettings(),
  voldn: (wiring) => wiring.onVolumeDown(),
  volup: (wiring) => wiring.onVolumeUp(),
  mute: (wiring) => wiring.onToggleMute(),
  enable: (wiring) => wiring.onEnableAudio(),
};

/** Session overlay: death, audio, pause, consoles; sized to the live canvas. */
function glSessionOverlay(
  view: HarborViewportProps,
  canvas: HTMLCanvasElement
): Pick<WebGLRenderState, 'uiOverlay'> | Record<string, never> {
  const wiring = view.glOverlay;
  if (wiring === undefined || wiring === null) return {};
  const selected = selectSessionOverlayId({
    paused: wiring.paused,
    dead: wiring.dead,
    settingsOpen: wiring.settingsOpen,
    console: wiring.console?.kind ?? null,
  });
  if (selected === null) return {};
  const layout = overlayLayoutFor(selected, wiring, canvas.width, canvas.height);
  if (layout === null) return {};
  publishUiZones(window, layout.buttons);
  return {
    uiOverlay: {
      layout,
      onAction: (id: string) => dispatchOverlayAction(selected, wiring, id),
    },
  };
}

function overlayLayoutFor(
  selected: SessionOverlayId,
  wiring: GlSessionWiring,
  width: number,
  height: number
): UiScreenLayout | null {
  if (selected === 'death') return layoutDeathScreen(width, height, wiring.cause);
  if (selected === 'settings') {
    return layoutSettingsScreen(
      width,
      height,
      wiring.audio.masterPct,
      wiring.audio.muted,
      wiring.audio.ready
    );
  }
  if (selected === 'pause') return layoutPauseScreen(width, height);
  return consoleLayoutFor(selected, wiring, width, height);
}

function consoleLayoutFor(
  kind: ConsoleKind,
  wiring: GlSessionWiring,
  width: number,
  height: number
): UiScreenLayout | null {
  if (kind === 'cargo') {
    const cargo = wiring.cargo;
    if (cargo === null) return null;
    return layoutCargoScreen(width, height, cargo.screen);
  }
  if (kind === 'market') {
    const market = wiring.market;
    if (market === null) return null;
    return layoutMarketScreen(width, height, market.screen);
  }
  if (kind === 'pack') {
    const pack = wiring.pack;
    if (pack === null) return null;
    return layoutPackScreen(width, height, pack.screen);
  }
  return shipConsoleLayoutFor(kind, wiring, width, height);
}

function shipConsoleLayoutFor(
  kind: ConsoleKind,
  wiring: GlSessionWiring,
  width: number,
  height: number
): UiScreenLayout | null {
  const systems = wiring.console?.systems;
  if (systems === undefined) return null;
  if (kind === 'reactor_console') return layoutReactorScreen(width, height, systems);
  if (kind === 'engine_console') return layoutEngineScreen(width, height, systems);
  return layoutNavScreen(width, height, wiring.navState, systems, wiring.shipStatus);
}

function dispatchOverlayAction(
  selected: SessionOverlayId,
  wiring: GlSessionWiring,
  id: string
): void {
  if (selected === 'settings') dispatchTableAction(SETTINGS_ACTIONS, wiring, id);
  else if (selected === 'death') dispatchDeathAction(wiring, id);
  else if (selected === 'pause') dispatchTableAction(PAUSE_ACTIONS, wiring, id);
  else dispatchConsoleAction(selected, wiring, id);
}

function dispatchConsoleAction(kind: ConsoleKind, wiring: GlSessionWiring, id: string): void {
  if (id === 'close') {
    wiring.onCloseConsole();
    return;
  }
  if (dispatchLocalConsoleAction(kind, wiring, id)) return;
  const intent = consoleIntentFor(kind, id, wiring);
  if (intent === null) return;
  wiring.sendIntent(intent);
  ShipAudioEngine.getInstance().playUiClick();
}

function consoleIntentFor(
  kind: ConsoleKind,
  id: string,
  wiring: GlSessionWiring
): ClientIntent | null {
  if (kind === 'cargo') {
    const cargo = wiring.cargo;
    if (cargo === null) return null;
    return cargoConsoleIntent(id, { unpackIds: cargo.unpackIds, seal: cargo.seal });
  }
  if (kind === 'market') {
    const market = wiring.market;
    if (market === null) return null;
    return marketConsoleIntent(id, {
      hubId: market.hubId,
      buys: market.buys,
      sellIds: market.sellIds,
    });
  }
  if (kind === 'reactor_console') return reactorConsoleIntent(id);
  const systems = wiring.console?.systems;
  if (systems === undefined) return null;
  if (kind === 'engine_console') return engineConsoleIntent(id, systems);
  return navConsoleIntent(id, wiring.navState, systems, wiring.shipStatus);
}

/** Pack bench and its entries are local (no intents); true when handled. */
function dispatchLocalConsoleAction(
  kind: ConsoleKind,
  wiring: GlSessionWiring,
  id: string
): boolean {
  if (kind === 'market' && id === 'packBuy' && wiring.market !== null) {
    wiring.onPackOpen({ mode: 'buy', hubId: wiring.market.hubId });
    ShipAudioEngine.getInstance().playUiClick();
    return true;
  }
  if (kind === 'cargo' && id === 'packHold') {
    wiring.onPackOpen({ mode: 'repack' });
    ShipAudioEngine.getInstance().playUiClick();
    return true;
  }
  if (kind === 'pack' && wiring.pack !== null) {
    dispatchPackAction(wiring.pack, id);
    return true;
  }
  return false;
}

function dispatchPackAction(pack: PackWiring, id: string): void {
  if (id.startsWith('add:')) pack.onAdd(id.slice('add:'.length));
  else if (id === 'seal') pack.onSeal();
  else if (id === 'auto') pack.onAuto();
  else if (id === 'clear') pack.onClear();
  else return;
  ShipAudioEngine.getInstance().playUiClick();
}

function dispatchTableAction(
  table: Record<string, OverlayHandler>,
  wiring: GlSessionWiring,
  id: string
): void {
  const handler = table[id];
  if (handler !== undefined) handler(wiring);
}

function dispatchDeathAction(wiring: GlSessionWiring, id: string): void {
  if (id === 'restart') wiring.onRestart();
  else if (id === 'quit') wiring.onQuit();
}

function dockRenderView(dock: HarborViewportProps['dock']): WebGLRenderState['dock'] {
  if (dock === null) return undefined;
  return {
    walkable: dock.walkable,
    phase: dock.phase,
    secondsToSeal: dock.secondsToSeal,
  };
}

function viewportRenderState(args: {
  session: ViewportSession;
  view: HarborViewportProps;
  snapshot: SnapshotBroadcast;
  viewOrigins: Map<string, { x: number; y: number }>;
  at: { x: number; y: number };
  aim: { x: number; y: number } | null;
  own: SnapshotPawn;
  roomAtmos: Record<string, RoomAtmosphereSummary>;
  delta: TelemetryDeltaBroadcast;
  breaches: ReturnType<typeof mapBreaches>;
  flows: TelemetryBroadcast['flows'];
  mappedVitals: PlayerVitals | undefined;
  livingViews: LivingView[];
  cargoViews: import('./renderState').CargoCrateView[];
  target: InteractTarget | null;
  now: number;
  canvas: HTMLCanvasElement;
}) {
  const {
    session,
    view,
    snapshot,
    viewOrigins,
    at,
    aim,
    own,
    roomAtmos,
    delta,
    breaches,
    flows,
    mappedVitals,
    livingViews,
    cargoViews,
    target,
    now,
  } = args;
  const packScene = packSceneOf(view, args.canvas);
  return {
    pawn: mapPawn(own, callsignFor(view.manifest, own.id), at, view.facingRef.current),
    remotePawns: mapRemotePawns(snapshot, view.pawnId, view.manifest, viewOrigins),
    ...vitalsRenderFields(view, mappedVitals, own),
    telemetry: delta,
    boarding: boardingRenderSection({ session, view, snapshot, viewOrigins, roomAtmos, now }),
    livingFixtures: livingViews,
    cargoCrates: attachCarriedCrates(cargoViews, view.pawnId, at, view.facingRef.current),
    pack: packScene,
    packOpen: packScene !== null,
    livingSummary: mapLivingSummary(view.telemetry),
    ...targetRenderFields(target, snapshot, view.pawnId),
    ...manifestRenderFields(view),
    breaches,
    breachFlows: flows,
    decals: mapDecals(snapshot, viewOrigins),
    dock: dockRenderView(view.dock),
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
    ...glSessionOverlay(view, args.canvas),
    timeMs: now,
    shipOffset: shipOffsetOf(viewOrigins),
    shipUnderway: view.shipUnderway,
    screenWidth: args.canvas.clientWidth,
    screenHeight: args.canvas.clientHeight,
  };
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

export function telemetryKey(view: HarborViewportProps, snapshot: SnapshotBroadcast): string {
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

/** Stale cursors stop voting so keyboard-only play keeps facing-only picks. */
const CURSOR_FRESH_MS = 4000;

function cursorWorldOf(
  session: ViewportSession,
  canvas: HTMLCanvasElement,
  now: number
): { x: number; y: number } | null {
  if (!session.mouse.moved || now - session.mouse.lastMs > CURSOR_FRESH_MS) return null;
  return screenToWorld(session.mouse.x, session.mouse.y, canvas, session.camera);
}

/** Living fixture views plus the shared [E] target (prompt and action agree). */
function targetFrameState(
  snapshot: SnapshotBroadcast,
  statics: World,
  origins: Map<string, { x: number; y: number }>,
  own: SnapshotPawn,
  facing: number,
  predicted: PredictedPose | null,
  cursorWorld: { x: number; y: number } | null
) {
  const origin = origins.get(own.frameId) ?? { x: 0, y: 0 };
  const at = predicted === null ? { x: own.x, y: own.y } : { x: predicted.x, y: predicted.y };
  const cursor =
    cursorWorld === null ? null : { x: cursorWorld.x - origin.x, y: cursorWorld.y - origin.y };
  return {
    livingViews: mapLivingFixtures(snapshot, origins),
    cargoViews: mapCargoCrates(snapshot, origins),
    target: selectInteractTarget({
      fixtures: snapshot.fixtures,
      doors: doorSpotsOf(statics, own.frameId),
      openById: new Map(snapshot.portals.map((portal) => [portal.id, portal.open] as const)),
      frameId: own.frameId,
      at,
      facing,
      cursor,
      blockers: sightBlockers(statics, own.frameId, snapshot.portals),
      crates: (snapshot.crates ?? [])
        .filter((crate) => crate.where !== 'carriedBy')
        .map((crate) => ({ id: crate.id, x: crate.x, y: crate.y, frameId: crate.frameId })),
    }),
  };
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

type FreshImpact = ImpactRenderModel;

function pruneSeen(seen: Set<string>, live: Set<string>): void {
  for (const key of [...seen]) {
    if (!live.has(key)) seen.delete(key);
  }
}

function collectFreshImpact(
  session: ViewportSession,
  origins: Map<string, { x: number; y: number }>,
  areas: Map<string, number | undefined>,
  impact: SnapshotBroadcast['impacts'][number],
  live: Set<string>,
  fresh: FreshImpact[]
): void {
  const key = impactKey(impact.frameId, impact.x, impact.y, impact.kind, impact.weapon);
  live.add(key);
  if (session.seenImpacts.has(key)) return;
  session.seenImpacts.add(key);
  const mapped = toFreshImpact(impact, origins, areas);
  if (mapped !== undefined) fresh.push(mapped);
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
  for (const impact of impacts) collectFreshImpact(session, origins, areas, impact, live, fresh);
  pruneSeen(session.seenImpacts, live);
  return fresh;
}

function latestNoticeKey(notices: HarborViewportProps['notices']): string {
  const latest = notices[notices.length - 1];
  if (latest === undefined) return '';
  return `${latest.title}:${latest.message}`;
}

function retireNotice(session: ViewportSession, now: number): void {
  if (session.notice !== null && session.notice.until <= now) session.notice = null;
}

function trackNotices(session: ViewportSession, view: HarborViewportProps, now: number): void {
  const key = latestNoticeKey(view.notices);
  if (key !== '' && key !== session.lastNotice) {
    session.lastNotice = key;
    session.notice = { text: key.slice(0, 72), until: now + NOTICE_MS };
  }
  retireNotice(session, now);
}
