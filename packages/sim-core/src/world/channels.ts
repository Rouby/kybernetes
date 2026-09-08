/**
 * Channel builders: every v2 server snapshot derived from kernel views.
 * No sim mutation during broadcast. One consumer per channel: SNAPSHOT to
 * viewport/LOS, TELEMETRY to gauges/atmos, VITALS to visor vitals, NOTICE to
 * the notice feed, HIRE_OFFER to the hire modal, MANIFEST to the crew card,
 * WATCH to the checklist/grade/timer cluster.
 */

import type {
  HireOfferBroadcast,
  ManifestBroadcast,
  NoticeBroadcast,
  Role,
  SnapshotBroadcast,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { NOMINAL_PRESSURE_KPA } from './airAuthority.js';
import type { World } from './types.js';
import { projectGrade, type WatchState } from './watch.js';

export function buildSnapshot(world: World, nowMs: number): SnapshotBroadcast {
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    pawns: Object.values(world.pawns).map((pawn) => ({
      id: pawn.id,
      x: pawn.pos.x,
      y: pawn.pos.y,
      vx: pawn.vel.x,
      vy: pawn.vel.y,
      facing: pawn.facing,
      frameId: pawn.frameId,
      roomHint: pawn.roomHint,
      color: pawn.color,
      ...(pawn.say !== '' && world.tick <= pawn.sayUntilTick ? { say: pawn.say } : {}),
    })),
    portals: Object.values(world.portals).map((portal) => ({
      id: portal.id,
      open: portal.state === 'open',
      state: portal.state,
    })),
    projectiles: Object.values(world.projectiles).map((shot) => ({
      id: shot.id,
      x: shot.pos.x,
      y: shot.pos.y,
      vx: shot.vel.x,
      vy: shot.vel.y,
    })),
    frames: Object.values(world.vessels).map((frame) => ({
      id: frame.id,
      originX: frame.origin.x,
      originY: frame.origin.y,
      angle: frame.angle,
    })),
  };
}

export function buildTelemetry(
  world: World,
  nowMs: number,
  atmos: TelemetryBroadcast['atmos']
): TelemetryBroadcast {
  return {
    type: 'TELEMETRY',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    subsystems: {
      hull: hullGauge(world),
      atmos: atmosGauge(world),
      watch: watchGauge(world),
      crew: crewGauge(world),
    },
    atmos,
  };
}

function hullGauge(world: World): number {
  const destroyed = Object.values(world.portals).filter(
    (portal) => portal.state === 'destroyed'
  ).length;
  return Math.max(0, 100 - destroyed * 5);
}

function atmosGauge(world: World): number {
  const rooms = Object.values(world.atmos);
  if (rooms.length === 0) return 100;
  const mean = rooms.reduce((sum, room) => sum + room.pressureKpa, 0) / rooms.length;
  return Math.round((mean / NOMINAL_PRESSURE_KPA) * 100);
}

function watchGauge(world: World): number {
  const watches = Object.values(world.watches);
  if (watches.length === 0) return 100;
  const mean = watches.reduce((sum, watch) => sum + watchProgress(watch), 0) / watches.length;
  return Math.round(mean * 100);
}

function watchProgress(watch: WatchState): number {
  if (watch.tasks.length === 0) return 1;
  return watch.tasks.filter((task) => task.done).length / watch.tasks.length;
}

function crewGauge(world: World): number {
  return Object.values(world.pawns).filter((pawn) => world.vessels[pawn.frameId] !== undefined)
    .length;
}

export function buildVitals(
  world: World,
  nowMs: number,
  pawnId: string,
  credits: number,
  clearance: number
): VitalsBroadcast {
  const pawn = world.pawns[pawnId];
  const vitals = world.vitals[pawnId];
  return {
    type: 'VITALS',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    vitals: {
      hunger: vitals?.hunger ?? 100,
      thirst: vitals?.thirst ?? 100,
      fatigue: vitals?.fatigue ?? 0,
      health: pawn?.health.hp ?? 100,
      hypoxia: vitals?.hypoxia ?? 0,
      suitSealed: vitals?.suitSealed ?? pawn?.health.suitSealed ?? false,
      heat: world.heat[pawnId] ?? 0,
    },
    credits,
    clearance,
  };
}

export function buildNotice(
  tick: number,
  nowMs: number,
  severity: NoticeBroadcast['severity'],
  title: string,
  message: string
): NoticeBroadcast {
  return { type: 'NOTICE', v: 2, tick, serverTimeMs: nowMs, severity, title, message };
}

export function buildManifest(
  world: World,
  vesselId: string,
  nowMs: number,
  crew: ManifestBroadcast['crew']
): ManifestBroadcast {
  const vessel = world.vessels[vesselId];
  return {
    type: 'MANIFEST',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    beacon: vessel?.beacon ?? 'UNKNOWN',
    shipName: vessel?.name ?? 'Unknown Vessel',
    crew,
  };
}

export function buildWatch(
  world: World,
  vesselId: string,
  nowMs: number
): WatchBroadcast | undefined {
  const watch = world.watches[vesselId];
  const vessel = world.vessels[vesselId];
  if (watch === undefined || vessel === undefined) return undefined;
  return {
    type: 'WATCH',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    watchNo: watch.watchNo,
    section: watch.section,
    phase: vessel.schedule === 'in_transit' ? 'active_watch' : 'off_duty',
    remainingS: Math.max(0, Math.round(watch.remainingS)),
    checklist: watch.tasks.map((task) => ({ id: task.id, label: task.label, done: task.done })),
    grade: watch.grade === '' ? projectGrade(watch.tasks) : watch.grade,
  };
}

export function buildHireOffer(
  tick: number,
  nowMs: number,
  offer: { offerId: string; jobs: readonly Role[] }
): HireOfferBroadcast {
  return {
    type: 'HIRE_OFFER',
    v: 2,
    tick,
    serverTimeMs: nowMs,
    offerId: offer.offerId,
    jobs: [...offer.jobs],
  };
}
