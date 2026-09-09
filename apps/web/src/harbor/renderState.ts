/**
 * Pure v2-to-render-state mapping for the viewport. No React, no DOM,
 * no WebGL: every function is a total mapping covered by renderState.test.ts.
 * Stateful session tracking (flashes, notices, impact dedupe) stays in
 * HarborViewport; everything here is snapshot-in, render-state-out.
 */

import type {
  AirFlow,
  DockStatusBroadcast,
  DoorState,
  ManifestBroadcast,
  PawnState,
  PlayerVitals,
  ProjectileState,
  RoomAtmosphereSummary,
  ScorchDecal,
  ServerStatsBroadcast,
  SnapshotBroadcast,
  SnapshotDeltaBroadcast,
  SnapshotImpact,
  SnapshotPawn,
  SnapshotPortal,
  SnapshotProjectile,
  TelemetryBroadcast,
  TelemetryDeltaBroadcast,
  VitalsBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import {
  type BreachRenderModel,
  breachFlowAxis,
  HARBOR_DOCK,
  HESPERIA_ROOMS,
  isShipSideRoom,
  MAG_SIZE,
  mergeAtmos,
  mergeFrames,
  mergePortals,
  PUNCTURE_MAX_M2,
  SHIP_ORIGIN,
  type World,
} from '@kybernetes/sim-core';
import type { PredictedShot } from './predictedShots';
import type { PredictedPawn } from './useHarborMovement';

export function bareId(id: string): string {
  const dot = id.indexOf('.');
  return dot < 0 ? id : id.slice(dot + 1);
}

export function frameOrigins(snapshot: SnapshotBroadcast): Map<string, { x: number; y: number }> {
  const origins = new Map<string, { x: number; y: number }>();
  origins.set('station', { x: 0, y: 0 });
  origins.set('ship', { ...SHIP_ORIGIN });
  for (const frame of snapshot.frames) {
    origins.set(frame.id, { x: frame.originX, y: frame.originY });
  }
  return origins;
}

export function pawnWorld(
  pawn: SnapshotPawn,
  origins: Map<string, { x: number; y: number }>,
  predicted: PredictedPawn | null
): { x: number; y: number } {
  const origin = origins.get(pawn.frameId) ?? { x: 0, y: 0 };
  if (predicted !== null) return { x: predicted.x + origin.x, y: predicted.y + origin.y };
  return { x: pawn.x + origin.x, y: pawn.y + origin.y };
}

export function mapPawn(
  pawn: SnapshotPawn,
  callsign: string,
  at: { x: number; y: number },
  facing: number,
  nowMs: number = Date.now()
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
      : { speechBubble: { text: pawn.say, expiresAt: nowMs + 3000 } }),
  };
}

export function callsignFor(manifest: ManifestBroadcast | null, pawnId: string): string {
  const entry = manifest?.crew.find((member) => member.id === pawnId);
  if (entry !== undefined) return entry.callsign;
  const dot = pawnId.indexOf(':');
  return dot < 0 ? pawnId : pawnId.slice(dot + 1);
}

/** Max forward extrapolation for authoritative projectiles between 10Hz deltas. */
const PROJECTILE_EXTRAPOLATE_S = 0.15;

/**
 * Seconds since a snapshot arrived, for projectile extrapolation.
 * The arrival stamp must come from the client's monotonic clock:
 * snapshot serverTimeMs is server wall clock and must never be subtracted
 * from performance.now() (the difference is always negative, which pins
 * extrapolation to zero and makes bullets step discretely per delta).
 */
export function snapshotAgeS(arrivedMs: number, nowMs: number): number {
  if (!Number.isFinite(arrivedMs) || !Number.isFinite(nowMs)) return 0;
  return Math.min(Math.max((nowMs - arrivedMs) / 1000, 0), PROJECTILE_EXTRAPOLATE_S);
}

/** Merge a SNAPSHOT_DELTA onto the last full SNAPSHOT (pure, total). */
export function mergeSnapshotDelta(
  base: SnapshotBroadcast,
  delta: SnapshotDeltaBroadcast
): SnapshotBroadcast {
  if (delta.full) {
    return {
      type: 'SNAPSHOT',
      v: 2,
      tick: delta.tick,
      serverTimeMs: delta.serverTimeMs,
      pawns: [...delta.pawns],
      impacts: [...delta.impacts],
      portals: [...delta.portals],
      projectiles: [...delta.projectiles],
      frames: [...delta.frames],
      decals:
        delta.decals !== undefined
          ? [...delta.decals]
          : base.decals !== undefined
            ? [...base.decals]
            : [],
      full: true,
      portalRev: delta.portalRev,
      frameRev: delta.frameRev,
    };
  }
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: delta.tick,
    serverTimeMs: delta.serverTimeMs,
    pawns: [...delta.pawns],
    impacts: [...delta.impacts],
    portals: mergePortals(base.portals, delta.portals, delta.removedPortalIds),
    projectiles: [...delta.projectiles],
    frames: mergeFrames(base.frames, delta.frames),
    decals:
      delta.decals !== undefined
        ? [...delta.decals]
        : base.decals !== undefined
          ? [...base.decals]
          : [],
    full: false,
    portalRev: delta.portalRev,
    frameRev: delta.frameRev,
  };
}

/** Merge a delta TELEMETRY (full:false) onto the last full one (pure, total). */
export function mergeTelemetry(
  base: TelemetryBroadcast | null,
  msg: TelemetryBroadcast
): TelemetryBroadcast {
  if (msg.full !== false || base === null) return msg;
  return {
    ...msg,
    full: false,
    atmos: mergeAtmos(base.atmos, msg.atmos),
    flows: msg.flows ?? base.flows ?? [],
  };
}

/** Dock gate leaves by portal id for the walkable overlay below. */
export function dockGateIds(): readonly string[] {
  return [HARBOR_DOCK.stationPortal, HARBOR_DOCK.tubePortal, HARBOR_DOCK.vesselPortal];
}

/**
 * Paint dock gates open while the cycle holds them walkable. Snapshots keep
 * the sealed-safe states for the air graph; feet, eyes, and prediction
 * read the overlaid doors.
 */
export function applyDockGates(doors: DoorState[], walkable: boolean): DoorState[] {
  if (!walkable) return doors;
  const gates = new Set(dockGateIds());
  let changed = false;
  const next = doors.map((door) => {
    if (!gates.has(door.id) || door.isOpen) return door;
    changed = true;
    return { ...door, isOpen: true };
  });
  return changed ? next : doors;
}

/** Vessel schedule implied by a dock broadcast for prediction colliders. */
export function dockVesselSchedule(
  dock: DockStatusBroadcast | null
): 'docked' | 'departing' | 'in_transit' | 'inbound' {
  if (dock === null) return 'docked';
  if (dock.phase === 'boarding_closing') return 'docked';
  return dock.phase;
}

export interface FrameMotion {
  readonly velX: number;
  readonly velY: number;
  readonly x: number;
  readonly y: number;
  readonly ms: number;
}

/** Cruise ceiling px/s for frame-motion feedforward (docking burns). */
export const FRAME_VEL_MAX = 600;

/**
 * Smooth frame-origin velocity from snapshot arrivals so the camera can
 * lead a vessel underway instead of juddering behind each 10Hz delta.
 */
export function stepFrameMotion(
  prev: FrameMotion | null,
  x: number,
  y: number,
  ms: number
): FrameMotion {
  if (prev === null) return { velX: 0, velY: 0, x, y, ms };
  const dt = (ms - prev.ms) / 1000;
  if (!(dt > 0.02)) return { ...prev, x, y, ms };
  const clampVel = (v: number): number => Math.min(FRAME_VEL_MAX, Math.max(-FRAME_VEL_MAX, v));
  const instX = clampVel((x - prev.x) / dt);
  const instY = clampVel((y - prev.y) / dt);
  return {
    velX: prev.velX + (instX - prev.velX) * 0.2,
    velY: prev.velY + (instY - prev.velY) * 0.2,
    x,
    y,
    ms,
  };
}

/**
 * Prediction-world dock overlay: real vessel phase for colliders plus
 * open leaves while walkable, mirroring the server movement exception.
 */
export function withDockWalkable(world: World, dock: DockStatusBroadcast | null): World {
  const schedule = dockVesselSchedule(dock);
  let next = world;
  const vessel = next.vessels[HARBOR_DOCK.vesselFrame];
  if (vessel !== undefined && vessel.schedule !== schedule) {
    next = {
      ...next,
      vessels: { ...next.vessels, [HARBOR_DOCK.vesselFrame]: { ...vessel, schedule } },
    };
  }
  if (dock?.walkable !== true) return next;
  const gates = new Set(dockGateIds());
  let changed = false;
  const portals = { ...next.portals };
  for (const id of gates) {
    const portal = portals[id];
    if (portal === undefined || portal.state === 'open') continue;
    portals[id] = { ...portal, state: 'open' };
    changed = true;
  }
  return changed ? { ...next, portals } : next;
}

export function syncDoors(base: DoorState[], snapshot: SnapshotBroadcast): DoorState[] {
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

/** Frame-local center of a room for breach normal orientation. */
function roomCenterFor(
  roomA: string,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  const room = HESPERIA_ROOMS.find((entry) => entry.id === bareId(roomA));
  if (room === undefined) return fallback;
  return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
}

function frameForRoom(roomA: string): string {
  const dot = roomA.indexOf('.');
  if (dot > 0) return roomA.slice(0, dot);
  return isShipSideRoom(roomA) ? 'ship' : 'station';
}

function breachFromPortal(portal: SnapshotPortal, nowTick: number): BreachRenderModel | undefined {
  if (portal.state !== 'destroyed' || portal.areaM2 === undefined) return undefined;
  if (
    portal.bornTick === undefined ||
    portal.x1 === undefined ||
    portal.y1 === undefined ||
    portal.x2 === undefined ||
    portal.y2 === undefined
  ) {
    return undefined;
  }
  const seg = { x1: portal.x1, y1: portal.y1, x2: portal.x2, y2: portal.y2 };
  const cx = (seg.x1 + seg.x2) / 2;
  const cy = (seg.y1 + seg.y2) / 2;
  const roomA = portal.roomA ?? '';
  const axis = breachFlowAxis(seg, roomCenterFor(roomA, { x: cx, y: cy - 1 }), null);
  return {
    id: portal.id,
    frameId: frameForRoom(roomA),
    roomA,
    roomB: '',
    areaM2: portal.areaM2,
    bornTick: portal.bornTick,
    ageTicks: Math.max(0, nowTick - portal.bornTick),
    ...seg,
    cx,
    cy,
    nx: axis.x,
    ny: axis.y,
    lenPx: Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1),
    isHull: true,
    sizeClass: portal.areaM2 < PUNCTURE_MAX_M2 ? 'puncture' : 'breach',
  };
}

/** Live breach models from snapshot portal geometry, oldest first. */
export function mapBreaches(snapshot: SnapshotBroadcast | null): BreachRenderModel[] {
  if (snapshot === null) return [];
  const models: BreachRenderModel[] = [];
  for (const portal of snapshot.portals) {
    const model = breachFromPortal(portal, snapshot.tick);
    if (model !== undefined) models.push(model);
  }
  models.sort((a, b) => a.bornTick - b.bornTick);
  return models;
}

/** Signed throat velocity (m/s) resolved onto each breach flow axis. */
export function breachFlowVectors(
  breaches: readonly BreachRenderModel[],
  flows: readonly AirFlow[] | undefined
): Map<string, { x: number; y: number }> {
  const table = new Map((flows ?? []).map((flow) => [flow.portalId, flow.velocityMps]));
  const out = new Map<string, { x: number; y: number }>();
  for (const breach of breaches) {
    const velocity = table.get(breach.id) ?? 0;
    out.set(breach.id, { x: breach.nx * velocity, y: breach.ny * velocity });
  }
  return out;
}

/** Mean flow vector per bare room id (px/s), from breaches touching the room. */
export function roomWindVectors(
  breaches: readonly BreachRenderModel[],
  flows: readonly AirFlow[] | undefined
): Record<string, { x: number; y: number }> {
  const vectors = breachFlowVectors(breaches, flows);
  const sums = new Map<string, { x: number; y: number; n: number }>();
  for (const breach of breaches) {
    const vec = vectors.get(breach.id) ?? { x: 0, y: 0 };
    const mag = Math.hypot(vec.x, vec.y);
    if (mag < 0.5) continue;
    const scale = Math.min(650, mag * 20) / mag;
    const id = bareId(breach.roomA);
    const prev = sums.get(id) ?? { x: 0, y: 0, n: 0 };
    sums.set(id, { x: prev.x + vec.x * scale, y: prev.y + vec.y * scale, n: prev.n + 1 });
  }
  const winds: Record<string, { x: number; y: number }> = {};
  for (const [id, sum] of sums) winds[id] = { x: sum.x / sum.n, y: sum.y / sum.n };
  return winds;
}

/** Live destroyed-hole count per bare room id (both punctures and breaches). */
export function breachCountsByRoom(breaches: readonly BreachRenderModel[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const breach of breaches) {
    const id = bareId(breach.roomA);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function mapAtmos(
  telemetry: TelemetryBroadcast | null,
  winds: Record<string, { x: number; y: number }> = {},
  breachCounts: Record<string, number> = {}
): Record<string, RoomAtmosphereSummary> {
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
      activeBreaches: breachCounts[id] ?? 0,
      windX: winds[id]?.x ?? 0,
      windY: winds[id]?.y ?? 0,
    };
  }
  return rooms;
}

function tracerWeapon(weapon: string): WeaponType {
  return (weapon === 'arc_welder' ? 'arc_welder' : 'kinetic_carbine') as WeaponType;
}

/** Authoritative rounds, forward-extrapolated by ageS over frame origins. */
export function mapServerProjectiles(
  shots: readonly SnapshotProjectile[] | undefined,
  origins: Map<string, { x: number; y: number }>,
  ageS: number
): ProjectileState[] {
  return (shots ?? []).map((shot) => {
    const origin = origins.get(shot.frameId) ?? { x: 0, y: 0 };
    return {
      id: shot.id,
      x: shot.x + origin.x + shot.vx * ageS,
      y: shot.y + origin.y + shot.vy * ageS,
      vx: shot.vx,
      vy: shot.vy,
      damage: 0,
      color: '#ffd27f',
      fromPlayer: true,
      lifeSeconds: 1,
      weaponType: tracerWeapon(shot.weapon),
    };
  });
}

/** Locally predicted rounds render at once; authority confirms or expires them. */
export function mapPredictedProjectiles(
  shots: readonly PredictedShot[],
  origins: Map<string, { x: number; y: number }>
): ProjectileState[] {
  return shots.map((shot) => {
    const origin = origins.get(shot.frameId) ?? { x: 0, y: 0 };
    return {
      id: `pred:${shot.id}`,
      x: shot.x + origin.x,
      y: shot.y + origin.y,
      vx: shot.vx,
      vy: shot.vy,
      damage: 0,
      color: '#ffd27f',
      fromPlayer: true,
      lifeSeconds: 1,
      weaponType: tracerWeapon(shot.weapon),
    };
  });
}

/** Remotes with callsigns and world-space positions for the renderer. */
export function mapRemotePawns(
  snapshot: SnapshotBroadcast,
  pawnId: string | null,
  manifest: ManifestBroadcast | null,
  origins: Map<string, { x: number; y: number }>
): PawnState[] {
  const remotes =
    pawnId === null ? snapshot.pawns : snapshot.pawns.filter((pawn) => pawn.id !== pawnId);
  return remotes.map((pawn) =>
    mapPawn(pawn, callsignFor(manifest, pawn.id), pawnWorld(pawn, origins, null), pawn.facing)
  );
}

/** Ship frame origin for render offsets; station space when unknown. */
export function shipOffsetOf(origins: Map<string, { x: number; y: number }>): {
  x: number;
  y: number;
} {
  return origins.get('ship') ?? { ...SHIP_ORIGIN };
}

/**
 * Focus-frame-relative view space for ship-centered rendering.
 * The focused frame (own pawn's vessel) stays fixed while other frames are
 * transposed around it: view = world - focusOrigin. Own-frame items are then
 * immune to 10Hz origin steps; only the interpolated focus drifts smoothly.
 */

/** Active focus frame; unknown frames lock to the vessel. */
export function focusFrameId(frameId: string): string {
  return frameId === 'station' ? 'station' : 'ship';
}

function fallbackOrigin(frameId: string): { x: number; y: number } {
  return frameId === 'station' ? { x: 0, y: 0 } : { ...SHIP_ORIGIN };
}

function originOf(
  origins: Map<string, { x: number; y: number }>,
  frameId: string
): { x: number; y: number } {
  return origins.get(frameId) ?? fallbackOrigin(frameId);
}

/** Interpolated origin the view subtracts; station space when unknown. */
export function focusOriginOf(
  origins: Map<string, { x: number; y: number }>,
  focusId: string
): { x: number; y: number } {
  return originOf(origins, focusFrameId(focusId));
}

/** World -> view transpose around the interpolated focus origin. */
export function toView(
  pos: { x: number; y: number },
  focusOrigin: { x: number; y: number }
): { x: number; y: number } {
  return { x: pos.x - focusOrigin.x, y: pos.y - focusOrigin.y };
}

/** Frame offset relative to the focus (zero when on the focused frame). */
export function relativeOffsetOf(
  origins: Map<string, { x: number; y: number }>,
  frameId: string,
  focusOrigin: { x: number; y: number }
): { x: number; y: number } {
  const origin = originOf(origins, frameId);
  return { x: origin.x - focusOrigin.x, y: origin.y - focusOrigin.y };
}

function pawnLocal(pawn: SnapshotPawn, predicted: PredictedPawn | null): { x: number; y: number } {
  if (predicted !== null) return { x: predicted.x, y: predicted.y };
  return { x: pawn.x, y: pawn.y };
}

/** View-space pawn position; stable across origin steps on the focus frame. */
export function pawnView(
  pawn: SnapshotPawn,
  origins: Map<string, { x: number; y: number }>,
  focusOrigin: { x: number; y: number },
  predicted: PredictedPawn | null
): { x: number; y: number } {
  const local = pawnLocal(pawn, predicted);
  const offset = relativeOffsetOf(origins, pawn.frameId, focusOrigin);
  return { x: local.x + offset.x, y: local.y + offset.y };
}

/** Remotes transposed into view space for the renderer. */
export function mapRemotePawnsView(
  snapshot: SnapshotBroadcast,
  pawnId: string | null,
  manifest: ManifestBroadcast | null,
  origins: Map<string, { x: number; y: number }>,
  focusOrigin: { x: number; y: number }
): PawnState[] {
  return mapRemotePawns(snapshot, pawnId, manifest, origins).map((pawn) => ({
    ...pawn,
    x: pawn.x - focusOrigin.x,
    y: pawn.y - focusOrigin.y,
  }));
}

/** Authoritative rounds transposed into view space. */
export function mapServerProjectilesView(
  shots: readonly SnapshotProjectile[] | undefined,
  origins: Map<string, { x: number; y: number }>,
  focusOrigin: { x: number; y: number },
  ageS: number
): ProjectileState[] {
  return mapServerProjectiles(shots, origins, ageS).map((shot) => ({
    ...shot,
    x: shot.x - focusOrigin.x,
    y: shot.y - focusOrigin.y,
  }));
}

/** Locally predicted rounds transposed into view space. */
export function mapPredictedProjectilesView(
  shots: readonly PredictedShot[],
  origins: Map<string, { x: number; y: number }>,
  focusOrigin: { x: number; y: number }
): ProjectileState[] {
  return mapPredictedProjectiles(shots, origins).map((shot) => ({
    ...shot,
    x: shot.x - focusOrigin.x,
    y: shot.y - focusOrigin.y,
  }));
}

/** Scorch decals transposed into view space. */
export function mapDecalsView(
  snapshot: SnapshotBroadcast | null,
  origins: Map<string, { x: number; y: number }>,
  focusOrigin: { x: number; y: number }
): DecalRenderModel[] {
  return mapDecals(snapshot, origins).map((decal) => ({
    ...decal,
    x: decal.x - focusOrigin.x,
    y: decal.y - focusOrigin.y,
  }));
}

/** Fresh impacts transposed into view space. */
export function mapFreshImpactsView(
  snapshot: SnapshotBroadcast,
  origins: Map<string, { x: number; y: number }>,
  focusOrigin: { x: number; y: number }
): ImpactRenderModel[] {
  return mapFreshImpacts(snapshot, origins).map((impact) => ({
    ...impact,
    x: impact.x - focusOrigin.x,
    y: impact.y - focusOrigin.y,
  }));
}

export interface FocusOrigin {
  readonly x: number;
  readonly y: number;
  readonly ms: number;
}

/** Snap distance for phase-change teleports (docked <-> transit). */
export const FOCUS_SNAP_DIST = 1200;

const FOCUS_RATE_PER_S = 10;
const FOCUS_MAX_DT_S = 0.5;
const FOCUS_CLAMP_DT_S = 0.25;

function focusRate(dtS: number): number {
  return 1 - Math.exp(-dtS * FOCUS_RATE_PER_S);
}

function isValidTarget(target: { x: number; y: number }): boolean {
  return Number.isFinite(target.x) && Number.isFinite(target.y);
}

function snapFocus(target: { x: number; y: number }, nowMs: number): FocusOrigin {
  return { x: target.x, y: target.y, ms: nowMs };
}

/**
 * Smooth the 10Hz focus origin to 60fps render time. Converges exponentially
 * so snapshot steps glide instead of stair-stepping; teleports snap.
 */
export function interpolateFocusOrigin(
  prev: FocusOrigin | null,
  target: { x: number; y: number },
  nowMs: number
): FocusOrigin {
  if (!Number.isFinite(nowMs)) return prev ?? { x: 0, y: 0, ms: 0 };
  if (!isValidTarget(target)) return prev ?? { x: 0, y: 0, ms: nowMs };
  if (prev === null) return snapFocus(target, nowMs);
  const dtS = (nowMs - prev.ms) / 1000;
  if (!(dtS > 0)) return prev;
  if (dtS > FOCUS_MAX_DT_S) return snapFocus(target, nowMs);
  const dist = Math.hypot(target.x - prev.x, target.y - prev.y);
  if (dist > FOCUS_SNAP_DIST) return snapFocus(target, nowMs);
  const rate = focusRate(Math.min(dtS, FOCUS_CLAMP_DT_S));
  return {
    x: prev.x + (target.x - prev.x) * rate,
    y: prev.y + (target.y - prev.y) * rate,
    ms: nowMs,
  };
}

/**
 * Frame origins for one render frame: snapshot table with the moving ship
 * origin replaced by its interpolated value. Station and static frames pass
 * through untouched; the input map is never mutated.
 */
export function smoothedOrigins(
  origins: Map<string, { x: number; y: number }>,
  ship: { x: number; y: number }
): Map<string, { x: number; y: number }> {
  const next = new Map(origins);
  next.set('ship', { x: ship.x, y: ship.y });
  return next;
}

/** Ammo readout for the visor combat card; absent without vitals. */
export function mapKineticAmmo(
  vitals: VitalsBroadcast | null
): { current: number; max: number; reserve: number; isReloading: boolean } | undefined {
  if (vitals === null) return undefined;
  return {
    current: vitals.vitals.ammo,
    max: MAG_SIZE,
    reserve: vitals.vitals.reserve,
    isReloading: vitals.vitals.reloading,
  };
}

/** Aim point or a short forward default when the mouse never moved. */
export function aimPoint(
  aim: { x: number; y: number } | null,
  at: { x: number; y: number }
): { x: number; y: number } {
  return aim ?? { x: at.x + 50, y: at.y };
}

export function ventedBareIds(telemetry: TelemetryBroadcast | null): string[] {
  return (telemetry?.atmos ?? [])
    .filter((room) => room.pressureKpa < 20)
    .map((room) => bareId(room.roomId));
}

export function roomO2(rooms: Record<string, RoomAtmosphereSummary>): Record<string, number> {
  return Object.fromEntries(Object.values(rooms).map((room) => [room.roomId, room.o2Percent]));
}

export function mapVitals(vitals: VitalsBroadcast | null): PlayerVitals | undefined {
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

export function mapTelemetry(
  snapshot: SnapshotBroadcast | null,
  telemetry: TelemetryBroadcast | null,
  manifest: ManifestBroadcast | null,
  roomAtmospheres: Record<string, RoomAtmosphereSummary>
): TelemetryDeltaBroadcast {
  const subsystems = telemetry?.subsystems;
  const hullIntegrity = subsystems?.hull ?? 100;
  const atmosLevel = subsystems?.atmos ?? 100;
  return {
    type: 'TELEMETRY_DELTA',
    timestamp: Date.now(),
    shipName: manifest?.shipName ?? 'CSS Hesperia',
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
        snapshot?.portals
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

export interface DecalRenderModel {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radius: number;
  readonly weapon: string;
  readonly ageTicks: number;
  /** 0 fresh .. 1 cooled. Drives emissive -> matte -> frost. */
  readonly cool: number;
}

/** Ticks to cool a fresh crater (matches BREACH_GLOW_S * 20). */
export const DECAL_COOL_TICKS = 200;

export function mapDecals(
  snapshot: SnapshotBroadcast | null,
  origins: Map<string, { x: number; y: number }>
): DecalRenderModel[] {
  if (snapshot === null) return [];
  return (snapshot.decals ?? []).map((decal) => mapDecal(decal, origins, snapshot.tick));
}

export function mapDecal(
  decal: ScorchDecal,
  origins: Map<string, { x: number; y: number }>,
  nowTick: number
): DecalRenderModel {
  const origin = origins.get(decal.frameId) ?? { x: 0, y: 0 };
  const ageTicks = Math.max(0, nowTick - decal.bornTick);
  return {
    id: decal.id,
    x: decal.x + origin.x,
    y: decal.y + origin.y,
    angle: decal.angle,
    radius: decal.radius,
    weapon: decal.weapon,
    ageTicks,
    cool: Math.min(1, ageTicks / DECAL_COOL_TICKS),
  };
}

export function weaponScorchTint(weapon: string): { core: string; rim: string; glow: string } {
  if (weapon === 'pulse_laser') {
    return { core: '#0a2b33', rim: '#7fe7ff', glow: '#c8fbff' };
  }
  if (weapon === 'arc_welder') {
    return { core: '#1c1a12', rim: '#ffd166', glow: '#fff3c4' };
  }
  if (weapon === 'railgun_pistol') {
    return { core: '#05070c', rim: '#e8eef7', glow: '#ffffff' };
  }
  return { core: '#0b0d12', rim: '#8a94a6', glow: '#ffb000' };
}

export interface ImpactRenderModel {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly weapon: string;
  readonly energy: number;
  readonly type: 'kinetic' | 'breach';
  /** Live breach area m2 when the hit cut or widened one (else puncture size). */
  readonly breachAreaM2: number;
  /** Room pressure kPa at the hit; vacuum damps the spark throw. */
  readonly pressureKpa: number;
}

export function mapFreshImpacts(
  snapshot: SnapshotBroadcast,
  origins: Map<string, { x: number; y: number }>
): ImpactRenderModel[] {
  const areas = new Map(snapshot.portals.map((portal) => [portal.id, portal.areaM2] as const));
  const out: ImpactRenderModel[] = [];
  for (const impact of snapshot.impacts) {
    if (impact.kind === 'miss') continue;
    const origin = origins.get(impact.frameId) ?? { x: 0, y: 0 };
    out.push({
      x: impact.x + origin.x,
      y: impact.y + origin.y,
      angle: impact.angle ?? 0,
      weapon: impact.weapon ?? 'kinetic_carbine',
      energy: impact.energy ?? 0.5,
      type: impact.kind === 'breach' ? 'breach' : 'kinetic',
      breachAreaM2:
        (impact.breachId === undefined ? undefined : areas.get(impact.breachId)) ?? 0.05,
      pressureKpa: impact.pressureKpa ?? 101.3,
    });
  }
  return out;
}

export function dockChipText(dock: DockStatusBroadcast | null): string {
  if (dock === null) return 'dock:?';
  if (dock.phase === 'docked' && dock.walkable) return 'DOCKED · walk aboard';
  if (dock.phase === 'boarding_closing')
    return `BOARDING · seals in ${dock.secondsToSeal.toFixed(0)}s`;
  if (dock.phase === 'departing') return 'SEALED · departing';
  if (dock.phase === 'in_transit') return 'SEALED · in transit';
  return 'INBOUND · stand by';
}

export function formatServerStats(stats: ServerStatsBroadcast | null): string {
  if (stats === null) return 'server: offline';
  return `tps:${stats.tpsActual.toFixed(1)}/${stats.tpsTarget} tick:${stats.tickMsLast.toFixed(1)}ms avg:${stats.tickMsAvg.toFixed(1)}ms dropped:${stats.droppedSteps} acc:${stats.accumulatorMs.toFixed(0)}ms obs:${stats.observers}`;
}

export function formatPawnLink(link: ServerStatsBroadcast['pawns'][number]): string {
  const age = link.lastInputAgeMs < 0 ? 'idle' : `${link.lastInputAgeMs}ms`;
  return `${link.callsign} ${link.frameId} ${link.roomHint} age:${age}${link.latched ? ' latch' : ''} ${link.msgsPerS.toFixed(1)}/s`;
}

export function snapshotImpactKey(impact: SnapshotImpact): string {
  return `${impact.frameId}:${Math.round(impact.x)}:${Math.round(impact.y)}:${impact.kind}:${impact.weapon ?? ''}`;
}
