/**
 * Snapshotter: builds the three v2 channels from kernel views.
 * No sim mutation during broadcast. One consumer per channel:
 * SNAPSHOT -> viewport/LOS, TELEMETRY -> gauges/atmos, VITALS -> visor vitals.
 */

import type {
  HireOfferBroadcast,
  ManifestBroadcast,
  Role,
  SnapshotBroadcast,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { projectGrade, type World } from '@kybernetes/sim-core';

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
    subsystems: {},
    atmos,
  };
}

export function buildVitals(
  world: World,
  nowMs: number,
  pawnId: string,
  credits: number,
  clearance: number
): VitalsBroadcast {
  const pawn = world.pawns[pawnId];
  return {
    type: 'VITALS',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    vitals: {
      hunger: 100,
      thirst: 100,
      fatigue: 0,
      health: pawn?.health.hp ?? 100,
      hypoxia: 0,
      suitSealed: pawn?.health.suitSealed ?? false,
    },
    credits,
    clearance,
  };
}

export function buildManifest(
  world: World,
  nowMs: number,
  crew: ManifestBroadcast['crew']
): ManifestBroadcast {
  return { type: 'MANIFEST', v: 2, tick: world.tick, serverTimeMs: nowMs, crew };
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
