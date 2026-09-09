import { describe, expect, it } from 'vitest';
import { createAirAuthority } from './airAuthority.js';
import { spawnPawn } from './assemble.js';
import {
  buildHireOffer,
  buildManifest,
  buildNotice,
  buildSnapshot,
  buildSnapshotDelta,
  buildTelemetry,
  buildVitals,
  buildWatch,
  diffAtmos,
  diffFrames,
  diffPortals,
  frameRevOf,
  manifestRevOf,
  mergeAtmos,
  mergeFrames,
  mergePortals,
  portalRevOf,
  quantizeAirFlow,
  quantizeAtmosRoom,
  significantFlows,
  snapshotFramesOf,
  snapshotPortalsOf,
  watchRevOf,
} from './channels.js';
import { hireAboard, talkToCaptain } from './crew.js';
import { bindWorldAir, buildHarborWorld } from './scenarios.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function liveWorld(): { world: World; offerId: string } {
  const auth = createAirAuthority();
  let world = buildHarborWorld();
  bindWorldAir(auth, world);
  world = spawnPawn(world, {
    id: 'hero',
    owner: 'hero',
    frameId: 'ship',
    roomId: 'ship.corridor',
    x: 480,
    y: 360,
    color: '#ffd166',
  });
  const talked = talkToCaptain(world, 'captain:ship', () => 0.1);
  world = talked.world;
  if (talked.offer === undefined) throw new Error('no offer');
  const hired = hireAboard(world, 'ship', 'hero', 'engineer', talked.offer.offerId);
  world = hired.world;
  for (let i = 0; i < 80; i += 1) world = tickWorld(world, 0.05, [], auth);
  return { world, offerId: talked.offer.offerId };
}

describe('channel coverage', () => {
  it('maps snapshots with pawns, portals, projectiles, frames, and voice', () => {
    const { world } = liveWorld();
    const snapshot = buildSnapshot(world, 1000);
    expect(snapshot.v).toBe(2);
    expect(snapshot.tick).toBe(world.tick);
    expect(snapshot.pawns.length).toBeGreaterThanOrEqual(5);
    expect(snapshot.portals.length).toBeGreaterThan(0);
    expect(snapshot.frames.map((frame) => frame.id)).toContain('ship');
    for (const pawn of snapshot.pawns) {
      expect(pawn.x).toBeDefined();
      expect(pawn.roomHint).toBeDefined();
    }
  });

  it('maps telemetry gauges and atmos rooms', () => {
    const { world } = liveWorld();
    const telemetry = buildTelemetry(world, 1000, [
      {
        roomId: 'ship.bridge',
        pressureKpa: 101.3,
        tempCelsius: 21,
        o2Percent: 20.9,
        co2Ppm: 600,
        repressurizing: false,
      },
    ]);
    expect(telemetry.subsystems.hull).toBe(100);
    expect(telemetry.subsystems.crew).toBeGreaterThanOrEqual(4);
    expect(telemetry.atmos[0]?.roomId).toBe('ship.bridge');
    expect(telemetry.atmos[0]?.repressurizing).toBe(false);
  });

  it('maps vitals from records with safe fallbacks', () => {
    const { world } = liveWorld();
    const vitals = buildVitals(world, 1000, 'hero', 200, 2);
    expect(vitals.vitals.hunger).toBeLessThanOrEqual(100);
    expect(vitals.vitals.health).toBe(100);
    expect(vitals.vitals.suitSealed).toBe(false);
    expect(vitals.credits).toBe(200);
    expect(vitals.clearance).toBe(2);
    const missing = buildVitals(world, 1000, 'ghost', 0, 1);
    expect(missing.vitals.hunger).toBe(100);
  });

  it('maps notices, manifests, offers, and watches', () => {
    const { world, offerId } = liveWorld();
    const notice = buildNotice(world.tick, 1000, 'warning', 'HULL', 'Breach sealed');
    expect(notice.severity).toBe('warning');
    const manifest = buildManifest(world, 'ship', 1000, [
      { id: 'hero', callsign: 'Rook', role: 'engineer', frameId: 'ship' },
    ]);
    expect(manifest.beacon).toBe('HESP01');
    expect(manifest.shipName).toBe('CSS Hesperia');
    expect(manifest.crew).toHaveLength(1);
    const offer = buildHireOffer(world.tick, 1000, { offerId, jobs: ['cook', 'security'] });
    expect(offer.jobs).toEqual(['cook', 'security']);
    const watch = buildWatch(world, 'ship', 1000);
    expect(watch?.watchNo).toBe(1);
    expect(watch?.checklist.length).toBe(4);
    expect(['S', 'A', 'B', 'C']).toContain(watch?.grade);
    expect(buildWatch(world, 'void', 1000)).toBeUndefined();
  });
});

describe('snapshot deltas and quantization', () => {
  it('quantizes positions so idle snapshots are byte-stable', () => {
    const { world } = liveWorld();
    const first = JSON.stringify(buildSnapshot(world, 1000));
    expect(JSON.stringify(buildSnapshot(world, 1000))).toBe(first);
    const parsed = JSON.parse(first) as { pawns: { x: number }[] };
    for (const pawn of parsed.pawns) {
      expect(pawn.x).toBe(Math.round(pawn.x * 100) / 100);
    }
  });

  it('emits empty portal/frame deltas while nothing changes', () => {
    const { world } = liveWorld();
    const portals = snapshotPortalsOf(world);
    const frames = snapshotFramesOf(world);
    const delta = buildSnapshotDelta(portals, frames, world.tick, world, 1000);
    expect(delta.type).toBe('SNAPSHOT_DELTA');
    expect(delta.portals).toEqual([]);
    expect(delta.removedPortalIds).toEqual([]);
    expect(delta.frames).toEqual([]);
    expect(delta.pawns.length).toBeGreaterThan(0);
  });

  it('carries door toggles and merges back onto the full table', () => {
    const { world } = liveWorld();
    const before = snapshotPortalsOf(world);
    // Bots roam liveWorld and may already have opened the first portal:
    // flip a shut one so the state digest provably moves.
    const target = before.find((portal) => portal.state !== 'open') ?? before[0];
    if (target === undefined) throw new Error('no portals');
    const flipped = before.map((portal) =>
      portal.id === target.id
        ? {
            ...portal,
            open: !portal.open,
            state: (portal.state === 'open' ? 'closed' : 'open') as 'open' | 'closed',
          }
        : portal
    );
    const diff = diffPortals(before, flipped);
    expect(diff.changed).toHaveLength(1);
    expect(diff.removed).toEqual([]);
    expect(portalRevOf(flipped)).not.toBe(portalRevOf(before));
    const merged = mergePortals(before, diff.changed, diff.removed);
    expect(merged.find((portal) => portal.id === target.id)?.open).toBe(!target.open);
    expect(mergeFrames(snapshotFramesOf(world), diffFrames([], []))).toEqual(
      snapshotFramesOf(world)
    );
    expect(frameRevOf(snapshotFramesOf(world))).toBe(frameRevOf(snapshotFramesOf(world)));
  });

  it('diffs atmos rooms on quantized values only', () => {
    const rooms = [
      {
        roomId: 'ship.bridge',
        pressureKpa: 101.3,
        tempCelsius: 21,
        o2Percent: 20.9,
        co2Ppm: 600,
        repressurizing: false,
      },
    ];
    const prev = rooms.map(quantizeAtmosRoom);
    expect(diffAtmos(prev, rooms)).toEqual([]);
    const firstRoom = rooms[0];
    if (firstRoom === undefined) throw new Error('expected a room');
    const vented = [{ ...firstRoom, pressureKpa: 12.5 }];
    expect(diffAtmos(prev, vented)).toHaveLength(1);
    expect(mergeAtmos(prev, diffAtmos(prev, vented))).toHaveLength(1);
  });

  it('revs manifests and watches on content, not countdowns', () => {
    const { world } = liveWorld();
    const crew = [{ id: 'hero', callsign: 'Rook', role: 'engineer' as const, frameId: 'ship' }];
    const first = buildManifest(world, 'ship', 1000, crew);
    expect(first.rev).toBe(manifestRevOf(crew, first.beacon, first.shipName));
    expect(buildManifest(world, 'ship', 2000, crew).rev).toBe(first.rev);
    const watch = Object.values(world.watches)[0];
    if (watch !== undefined) {
      const phase = 'active_watch' as const;
      expect(watchRevOf({ ...watch, remainingS: 20 }, phase)).toBe(
        watchRevOf({ ...watch, remainingS: 5 }, phase)
      );
    }
  });

  it('quantizes portal wind and drops still air for byte-stable telemetry', () => {
    expect(quantizeAirFlow({ portalId: 'a', velocityMps: 12.345 })).toEqual({
      portalId: 'a',
      velocityMps: 12.3,
    });
    expect(
      significantFlows([
        { portalId: 'a', velocityMps: 0.02 },
        { portalId: 'b', velocityMps: 3.34 },
      ])
    ).toEqual([{ portalId: 'b', velocityMps: 3.3 }]);
  });

  it('carries debug flows on telemetry without breaking old callers', () => {
    const { world } = liveWorld();
    const plain = buildTelemetry(world, 1000, []);
    expect(plain.flows).toEqual([]);
    const windy = buildTelemetry(world, 1000, [], true, [
      { portalId: 'station.lobby_bay', velocityMps: 8.66 },
      { portalId: 'station.bay_gauntlet', velocityMps: 0 },
    ]);
    expect(windy.flows).toEqual([{ portalId: 'station.lobby_bay', velocityMps: 8.7 }]);
  });
});
