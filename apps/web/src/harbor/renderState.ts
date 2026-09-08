/**
 * Pure v2-to-render-state mapping for the viewport. No React, no DOM,
 * no WebGL: every function is a total mapping covered by renderState.test.ts.
 * Stateful session tracking (flashes, notices, impact dedupe) stays in
 * HarborViewport; everything here is snapshot-in, render-state-out.
 */

import type {
  AirFlow,
  DoorState,
  ManifestBroadcast,
  PawnState,
  PlayerVitals,
  RoomAtmosphereSummary,
  SnapshotBroadcast,
  SnapshotDeltaBroadcast,
  SnapshotPawn,
  SnapshotPortal,
  TelemetryBroadcast,
  TelemetryDeltaBroadcast,
  VitalsBroadcast,
} from '@kybernetes/protocol';
import {
  type BreachRenderModel,
  breachFlowAxis,
  HESPERIA_ROOMS,
  isShipSideRoom,
  mergeAtmos,
  mergeFrames,
  mergePortals,
  PUNCTURE_MAX_M2,
  SHIP_ORIGIN,
} from '@kybernetes/sim-core';
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
export const PROJECTILE_EXTRAPOLATE_S = 0.15;

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
