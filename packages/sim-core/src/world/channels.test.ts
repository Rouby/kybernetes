import { describe, expect, it } from 'vitest';
import { createAirAuthority } from './airAuthority.js';
import { spawnPawn } from './assemble.js';
import {
  buildHireOffer,
  buildManifest,
  buildNotice,
  buildSnapshot,
  buildTelemetry,
  buildVitals,
  buildWatch,
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
