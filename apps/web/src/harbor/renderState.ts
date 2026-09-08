/**
 * Pure v2-to-render-state mapping for the frozen viewport. No React, no DOM,
 * no WebGL: every function is a total mapping covered by renderState.test.ts.
 * Stateful session tracking (flashes, notices, impact dedupe) stays in
 * HarborViewport; everything here is snapshot-in, render-state-out.
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
import { SHIP_ORIGIN } from '@kybernetes/sim-core';
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

export function mapAtmos(
  telemetry: TelemetryBroadcast | null
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
      activeBreaches: 0,
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
