/**
 * Pure telemetry-to-audio mapping for ShipAudioEngine: snapshot derivation,
 * suffocation assessment, and heartbeat tempo. No DOM, no Web Audio, no
 * timers — Vitest pins every decision without a context.
 */
import type { PlayerVitals, TelemetryDeltaBroadcast } from '@kybernetes/protocol';

export interface TelemetryAudioSnapshot {
  readonly reactorLoad: number;
  readonly oxygen: number;
  readonly hullPct: number;
  readonly roomPressureKpa: number;
  readonly venting: boolean;
  readonly alertChanged: 'red' | 'yellow' | null;
}

function reactorLoadOf(telemetry: TelemetryDeltaBroadcast): number {
  return telemetry.reactorOutputMw ?? telemetry.reactor?.outputMw ?? 50;
}

function oxygenOf(telemetry: TelemetryDeltaBroadcast): number {
  return telemetry.oxygenLevelPercent ?? telemetry.lifeSupport?.o2LevelPercent ?? 100;
}

function hullPctOf(telemetry: TelemetryDeltaBroadcast): number {
  return telemetry.hullIntegrityPercent ?? telemetry.hull?.integrityPercent ?? 100;
}

function roomAtmosOf(
  telemetry: TelemetryDeltaBroadcast,
  currentRoomId: string | undefined
): {
  pressureKpa: number;
  venting: boolean;
} {
  const room = currentRoomId !== undefined ? telemetry.roomAtmospheres?.[currentRoomId] : undefined;
  return { pressureKpa: room?.pressureKpa ?? 101.3, venting: room?.isVenting ?? false };
}

function alertTransition(
  telemetry: TelemetryDeltaBroadcast,
  previousAlertLevel: 'nominal' | 'yellow' | 'red'
): { alertLevel: 'nominal' | 'yellow' | 'red'; alertChanged: 'red' | 'yellow' | null } {
  const level = telemetry.alertLevel ?? previousAlertLevel;
  const changed = telemetry.alertLevel !== undefined && telemetry.alertLevel !== previousAlertLevel;
  const signal = changed ? telemetry.alertLevel : undefined;
  return {
    alertLevel: level,
    alertChanged: signal === 'red' || signal === 'yellow' ? signal : null,
  };
}

export function mapperTelemetrySnapshot(
  telemetry: TelemetryDeltaBroadcast,
  currentRoomId: string | undefined,
  previousAlertLevel: 'nominal' | 'yellow' | 'red'
): { snapshot: TelemetryAudioSnapshot; alertLevel: 'nominal' | 'yellow' | 'red' } {
  const atmos = roomAtmosOf(telemetry, currentRoomId);
  const alert = alertTransition(telemetry, previousAlertLevel);
  return {
    snapshot: {
      reactorLoad: reactorLoadOf(telemetry),
      oxygen: oxygenOf(telemetry),
      hullPct: hullPctOf(telemetry),
      roomPressureKpa: atmos.pressureKpa,
      venting: atmos.venting,
      alertChanged: alert.alertChanged,
    },
    alertLevel: alert.alertLevel,
  };
}

export interface SuffocationAssessment {
  readonly severityRatio: number;
  readonly breathIntervalMs: number;
  readonly crisisCutoffHz: number;
}

export function assessSuffocation(
  vitals: PlayerVitals,
  oxygen: number,
  roomPressureKpa: number
): SuffocationAssessment | null {
  const vacuumUnsealed = !vitals.suit?.isSealed && roomPressureKpa < 50;
  const suffocating =
    vitals.hypoxiaPercent > 30 ||
    oxygen <= 25 ||
    vitals.health <= 20 ||
    vacuumUnsealed ||
    (vitals.suit?.isSealed === true && vitals.suit.o2RemainingSeconds < 60);
  if (!suffocating) return null;
  const pressureRatio = vacuumUnsealed ? Math.max(0.01, roomPressureKpa / 101.3) : 1.0;
  const severityRatio = Math.min(
    1.0,
    Math.max(
      vitals.hypoxiaPercent / 100,
      (25 - oxygen) / 25,
      (20 - vitals.health) / 20,
      1 - pressureRatio
    )
  );
  return {
    severityRatio,
    breathIntervalMs: vitals.hypoxiaPercent > 60 ? 900 : 1400,
    crisisCutoffHz: Math.max(220, 20000 * Math.max(0.01, 1 - severityRatio)),
  };
}

export interface HeartbeatTempo {
  readonly bpm: number;
  readonly intervalMs: number;
}

export function heartbeatTempo(vitals: PlayerVitals): HeartbeatTempo | null {
  if (vitals.fatigue < 75 && vitals.health > 25) return null;
  const bpm = vitals.health <= 25 ? 120 : 90;
  return { bpm, intervalMs: (60 / bpm) * 1000 };
}
