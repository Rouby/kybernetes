/***
 * Channel builders: every v2 server snapshot derived from kernel views.
 * No sim mutation during broadcast. One consumer per channel: SNAPSHOT to
 * viewport/LOS, TELEMETRY to gauges/atmos, VITALS to visor vitals, NOTICE to
 * the notice feed, HIRE_OFFER to the hire modal, MANIFEST to the crew card,
 * WATCH to the checklist/grade/timer cluster.
 *
 * Bandwidth rules: floats are quantized (q2 positions, q1 temps, q0 ppm) so
 * JSON is byte-stable while idle; portals/frames ship as deltas against the
 * last full SNAPSHOT (1Hz full + 10Hz SNAPSHOT_DELTA); TELEMETRY ships
 * changed atmos rooms with a periodic full; MANIFEST/WATCH carry a content
 * rev so the daemon can send them event-driven instead of ticked.
 */

import type {
  AirFlow,
  HireOfferBroadcast,
  ManifestBroadcast,
  NoticeBroadcast,
  Role,
  SnapshotBroadcast,
  SnapshotDeltaBroadcast,
  SnapshotFrame,
  SnapshotPortal,
  TelemetryBroadcast,
  VitalsBroadcast,
  WatchBroadcast,
} from '@kybernetes/protocol';
import { digestStrings, q0, q1, q2 } from '@kybernetes/protocol';
import { NOMINAL_PRESSURE_KPA } from './airAuthority.js';
import { samePortalGeometry, snapshotBreachFields } from './breachView.js';
import { snapshotDecalsOf } from './decals.js';
import { spareRounds } from './survival.js';
import type { World } from './types.js';
import { projectGrade, type WatchState } from './watch.js';

export type AtmosRoom = TelemetryBroadcast['atmos'][number];

export function buildSnapshot(world: World, nowMs: number): SnapshotBroadcast {
  const portals = snapshotPortalsOf(world);
  const frames = snapshotFramesOf(world);
  return {
    type: 'SNAPSHOT',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    pawns: snapshotPawnsOf(world),
    impacts: snapshotImpactsOf(world),
    portals,
    projectiles: snapshotShotsOf(world),
    frames,
    decals: snapshotDecalsOf(world),
    full: true,
    portalRev: portalRevOf(portals),
    frameRev: frameRevOf(frames),
  };
}

export function snapshotPawnsOf(world: World): SnapshotBroadcast['pawns'] {
  return Object.values(world.pawns).map((pawn) => ({
    id: pawn.id,
    x: q2(pawn.pos.x),
    y: q2(pawn.pos.y),
    vx: q2(pawn.vel.x),
    vy: q2(pawn.vel.y),
    facing: q2(pawn.facing),
    frameId: pawn.frameId,
    roomHint: pawn.roomHint,
    color: pawn.color,
    ...(pawn.say !== '' && world.tick <= pawn.sayUntilTick ? { say: pawn.say } : {}),
  }));
}

export function snapshotPortalsOf(world: World): SnapshotPortal[] {
  return Object.values(world.portals).map((portal) => ({
    id: portal.id,
    open: portal.state === 'open',
    state: portal.state,
    ...(portal.kind === 'hole' && portal.state === 'destroyed' ? snapshotBreachFields(portal) : {}),
  }));
}

export function snapshotImpactsOf(world: World): SnapshotBroadcast['impacts'] {
  return world.impacts.map((impact) => ({
    frameId: impact.frameId,
    x: q1(impact.x),
    y: q1(impact.y),
    kind: impact.kind,
    angle: q2(impact.angle),
    weapon: impact.weapon,
    energy: q2(impact.energy),
    surface: impact.surface,
    ...(impact.breachId === undefined ? {} : { breachId: impact.breachId }),
    pressureKpa: q1(impact.pressureKpa),
  }));
}

export function snapshotShotsOf(world: World): SnapshotBroadcast['projectiles'] {
  return Object.values(world.projectiles).map((shot) => ({
    id: shot.id,
    frameId: shot.frameId,
    x: q2(shot.pos.x),
    y: q2(shot.pos.y),
    vx: q2(shot.vel.x),
    vy: q2(shot.vel.y),
    weapon: shot.weapon,
  }));
}

export function snapshotFramesOf(world: World): SnapshotFrame[] {
  return Object.values(world.vessels).map((frame) => ({
    id: frame.id,
    originX: q2(frame.origin.x),
    originY: q2(frame.origin.y),
    angle: q2(frame.angle),
  }));
}

export function portalRevOf(portals: readonly SnapshotPortal[]): number {
  return digestStrings(
    portals.map(
      (portal) => `${portal.id}:${portal.state}:${portal.areaM2 ?? ''}:${portal.bornTick ?? ''}`
    )
  );
}

export function frameRevOf(frames: readonly SnapshotFrame[]): number {
  const parts = frames.map((f) => `${f.id}:${f.originX},${f.originY},${f.angle}`);
  return digestStrings(parts);
}

export function diffPortals(
  prev: readonly SnapshotPortal[],
  next: readonly SnapshotPortal[]
): { changed: SnapshotPortal[]; removed: string[] } {
  const before = new Map(prev.map((portal) => [portal.id, portal] as const));
  const changed: SnapshotPortal[] = [];
  for (const portal of next) {
    const old = before.get(portal.id);
    if (old === undefined || !samePortalGeometry(old, portal)) {
      changed.push(portal);
    }
    before.delete(portal.id);
  }
  return { changed, removed: [...before.keys()] };
}

export function diffFrames(
  prev: readonly SnapshotFrame[],
  next: readonly SnapshotFrame[]
): SnapshotFrame[] {
  const before = new Map(prev.map((frame) => [frame.id, frame] as const));
  return next.filter((frame) => {
    const old = before.get(frame.id);
    return (
      old === undefined ||
      old.originX !== frame.originX ||
      old.originY !== frame.originY ||
      old.angle !== frame.angle
    );
  });
}

/** Apply a delta onto the last full portal/frame tables (server + client share this). */
export function mergePortals(
  base: readonly SnapshotPortal[],
  changed: readonly SnapshotPortal[],
  removed: readonly string[]
): SnapshotPortal[] {
  if (changed.length === 0 && removed.length === 0) return [...base];
  const gone = new Set(removed);
  const table = new Map<string, SnapshotPortal>();
  for (const portal of base) {
    if (!gone.has(portal.id)) table.set(portal.id, portal);
  }
  for (const portal of changed) table.set(portal.id, portal);
  return [...table.values()];
}

export function mergeFrames(
  base: readonly SnapshotFrame[],
  changed: readonly SnapshotFrame[]
): SnapshotFrame[] {
  if (changed.length === 0) return [...base];
  const table = new Map(base.map((frame) => [frame.id, frame] as const));
  for (const frame of changed) table.set(frame.id, frame);
  return [...table.values()];
}

export function mergeAtmos(base: readonly AtmosRoom[], changed: readonly AtmosRoom[]): AtmosRoom[] {
  if (changed.length === 0) return [...base];
  const table = new Map(base.map((room) => [room.roomId, room] as const));
  for (const room of changed) table.set(room.roomId, room);
  return [...table.values()];
}

/** Delta against the last full SNAPSHOT; pawns/shots stay complete (they move). */
export function buildSnapshotDelta(
  prevPortals: readonly SnapshotPortal[],
  prevFrames: readonly SnapshotFrame[],
  baseTick: number,
  world: World,
  nowMs: number,
  prevDecalIds?: readonly string[]
): SnapshotDeltaBroadcast {
  const portals = snapshotPortalsOf(world);
  const frames = snapshotFramesOf(world);
  const portalDiff = diffPortals(prevPortals, portals);
  const decals = snapshotDecalsOf(world);
  const prevSet = new Set(prevDecalIds ?? []);
  const decalsChanged =
    prevDecalIds === undefined ||
    decals.length !== prevSet.size ||
    decals.some((decal) => !prevSet.has(decal.id));
  return {
    type: 'SNAPSHOT_DELTA',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    baseTick,
    full: false,
    portalRev: portalRevOf(portals),
    frameRev: frameRevOf(frames),
    pawns: snapshotPawnsOf(world),
    impacts: snapshotImpactsOf(world),
    portals: portalDiff.changed,
    removedPortalIds: portalDiff.removed,
    projectiles: snapshotShotsOf(world),
    frames: diffFrames(prevFrames, frames),
    ...(decalsChanged ? { decals } : {}),
  };
}

export function quantizeAtmosRoom(room: AtmosRoom): AtmosRoom {
  return {
    roomId: room.roomId,
    pressureKpa: q2(room.pressureKpa),
    tempCelsius: q1(room.tempCelsius),
    o2Percent: q2(room.o2Percent),
    co2Ppm: q0(room.co2Ppm),
    repressurizing: room.repressurizing,
  };
}

/** Changed rooms only; prev entries are already quantized by the last send. */
export function diffAtmos(prev: readonly AtmosRoom[], next: readonly AtmosRoom[]): AtmosRoom[] {
  const before = new Map(prev.map((room) => [room.roomId, room] as const));
  const changed: AtmosRoom[] = [];
  for (const room of next) {
    const quantized = quantizeAtmosRoom(room);
    const old = before.get(room.roomId);
    if (old === undefined || !sameAtmosRoom(old, quantized)) changed.push(quantized);
  }
  return changed;
}

function sameAtmosRoom(a: AtmosRoom, b: AtmosRoom): boolean {
  return (
    a.pressureKpa === b.pressureKpa &&
    a.tempCelsius === b.tempCelsius &&
    a.o2Percent === b.o2Percent &&
    a.co2Ppm === b.co2Ppm &&
    a.repressurizing === b.repressurizing
  );
}

export function quantizeAirFlow(flow: AirFlow): AirFlow {
  return { portalId: flow.portalId, velocityMps: q1(flow.velocityMps) };
}

/** Drop still-air portals so idle TELEMETRY stays byte-stable and small. */
export function significantFlows(flows: readonly AirFlow[]): AirFlow[] {
  const kept: AirFlow[] = [];
  for (const flow of flows) {
    const quantized = quantizeAirFlow(flow);
    if (quantized.velocityMps !== 0) kept.push(quantized);
  }
  return kept;
}

export function buildTelemetry(
  world: World,
  nowMs: number,
  atmos: TelemetryBroadcast['atmos'],
  full = true,
  flows: readonly AirFlow[] = []
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
    full,
    atmos: atmos.map(quantizeAtmosRoom),
    flows: significantFlows(flows),
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
      hunger: q1(vitals?.hunger ?? 100),
      thirst: q1(vitals?.thirst ?? 100),
      fatigue: q1(vitals?.fatigue ?? 0),
      health: q1(pawn?.health.hp ?? 100),
      hypoxia: q1(vitals?.hypoxia ?? 0),
      suitSealed: vitals?.suitSealed ?? pawn?.health.suitSealed ?? false,
      ammo: vitals?.mags[0] ?? 30,
      reserve: vitals === undefined ? 120 : spareRounds(vitals),
      mags: vitals === undefined ? [30, 30, 30, 30] : [...vitals.mags.slice(1)],
      reloading: (vitals?.reloadingS ?? 0) > 0,
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

export function manifestRevOf(
  crew: ManifestBroadcast['crew'],
  beacon: string,
  shipName: string
): number {
  const parts = crew.map((e) => `${e.id}:${e.callsign}:${e.role}:${e.frameId}`);
  return digestStrings([beacon, shipName, ...parts]);
}

export function buildManifest(
  world: World,
  vesselId: string,
  nowMs: number,
  crew: ManifestBroadcast['crew']
): ManifestBroadcast {
  const vessel = world.vessels[vesselId];
  const beacon = vessel?.beacon ?? 'UNKNOWN';
  const shipName = vessel?.name ?? 'Unknown Vessel';
  return {
    type: 'MANIFEST',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    beacon,
    shipName,
    rev: manifestRevOf(crew, beacon, shipName),
    crew,
  };
}

export function watchRevOf(watch: WatchState, phase: WatchBroadcast['phase']): number {
  const head = `${watch.watchNo}:${watch.section}:${phase}:${watch.grade}`;
  const parts = watch.tasks.map((task) => `${task.id}:${task.done ? '1' : '0'}`);
  return digestStrings([head, ...parts]);
}

export function buildWatch(
  world: World,
  vesselId: string,
  nowMs: number
): WatchBroadcast | undefined {
  const watch = world.watches[vesselId];
  const vessel = world.vessels[vesselId];
  if (watch === undefined || vessel === undefined) return undefined;
  const phase = vessel.schedule === 'in_transit' ? 'active_watch' : 'off_duty';
  return {
    type: 'WATCH',
    v: 2,
    tick: world.tick,
    serverTimeMs: nowMs,
    watchNo: watch.watchNo,
    section: watch.section,
    phase,
    remainingS: Math.max(0, Math.round(watch.remainingS)),
    checklist: watch.tasks.map((task) => ({ id: task.id, label: task.label, done: task.done })),
    grade: watch.grade === '' ? projectGrade(watch.tasks) : watch.grade,
    rev: watchRevOf(watch, phase),
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
