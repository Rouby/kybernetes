import { describe, expect, it } from 'vitest';
import { UNIVERSE_HUBS } from '../universe/catalog.js';
import { snapshotFramesOf } from './channels.js';
import { getFrame, getFrameOrigin, isStationFrame, isVesselFrame, listFrameIds } from './frames.js';
import { buildHarborWorld, buildSoloShipWorld, buildWorld } from './scenarios.js';

describe('unified frames (Strike 2)', () => {
  it('lists vessels and stations in one id space', () => {
    const harbor = buildHarborWorld();
    expect(listFrameIds(harbor)).toEqual(['ship', 'station']);
    const solo = buildSoloShipWorld();
    expect(listFrameIds(solo)).toEqual(['ship', 'hub_b', 'hub_c', 'hub_d', 'station']);
  });

  it('resolves origins for both kinds without a silent default', () => {
    const world = buildHarborWorld();
    expect(getFrameOrigin(world, 'ship')).toMatchObject({ x: 1210 });
    expect(getFrameOrigin(world, 'station')).toEqual({ x: 0, y: 0 });
    expect(getFrameOrigin(world, 'void')).toBeUndefined();
    expect(getFrame(world, 'ship')?.kind).toBe('vessel');
    expect(getFrame(world, 'station')?.kind).toBe('station');
    expect(getFrame(world, 'void')).toBeUndefined();
    expect(isVesselFrame(world, 'ship')).toBe(true);
    expect(isStationFrame(world, 'station')).toBe(true);
  });

  it('emits vessels and stations on the wire, sorted', () => {
    const frames = snapshotFramesOf(buildSoloShipWorld());
    expect(frames.map((f) => f.id)).toEqual(['hub_b', 'hub_c', 'hub_d', 'ship', 'station']);
    expect(frames.find((f) => f.id === 'station')).toMatchObject({
      originX: 0,
      originY: 0,
      angle: 0,
    });
  });

  it('builds harbor and solo from one canonical path', () => {
    const harbor = buildHarborWorld();
    const canonical = buildWorld({
      hubs: ['hub_a'],
      withTransit: true,
      withCaptain: true,
      withFixtures: true,
      withCrew: true,
      withCrowd: true,
    });
    expect(listFrameIds(canonical)).toEqual(listFrameIds(harbor));
    expect(Object.keys(canonical.docks).sort()).toEqual(Object.keys(harbor.docks).sort());
    expect(Object.keys(canonical.transit)).toEqual(Object.keys(harbor.transit));
  });

  it('covers every catalog hub frame so render statics never go blind', () => {
    const world = buildSoloShipWorld();
    for (const hub of Object.values(UNIVERSE_HUBS)) {
      expect(world.stations[hub.stationFrame as string]).toBeDefined();
      expect(world.docks[hub.dockId as string]).toBeDefined();
    }
  });

  it('throws on unknown hub ids instead of defaulting', () => {
    expect(() => buildWorld({ hubs: ['nowhere'] })).toThrow();
  });
});
