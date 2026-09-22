import { describe, expect, it } from 'vitest';
import { checkVariantSpine, compileHull, type HullSpec } from '../hullCompiler.js';
import { StationHubSpec } from './StationHub.hull.js';
import { stationHullFor } from './StationVariants.hull.js';
import {
  DOCK_SPINE_PORTALS,
  DOCK_SPINE_ROOMS,
  HULL_SCHEMA_VERSION,
  hullSpecFromJson,
  hullSpecToJson,
  validateDockSpine,
  validateHullJson,
  validateVariant,
} from './schema.js';

function movedMouth(spec: HullSpec): HullSpec {
  return {
    ...spec,
    portals: spec.portals.map((portal) =>
      portal.id === 'andock_tube_mund'
        ? { ...portal, segment: { x1: 1220, y1: 240, x2: 1220, y2: 280 } }
        : portal
    ),
  };
}

function movedSpineRoom(spec: HullSpec): HullSpec {
  return {
    ...spec,
    rooms: spec.rooms.map((room) =>
      room.id === 'andock_tube' ? { ...room, rect: { ...room.rect, x: 1150 } } : room
    ),
  };
}

describe('hull content schema', () => {
  it('keeps the canonical spine in sync with StationHubSpec', () => {
    const byRoom = new Map(StationHubSpec.rooms.map((room) => [room.id, room] as const));
    for (const [id, rect] of Object.entries(DOCK_SPINE_ROOMS)) {
      expect(byRoom.get(id)?.rect).toEqual(rect);
    }
    const byPortal = new Map(StationHubSpec.portals.map((portal) => [portal.id, portal] as const));
    for (const [id, canonical] of Object.entries(DOCK_SPINE_PORTALS)) {
      const portal = byPortal.get(id);
      expect(portal?.segment).toEqual(canonical.segment);
      expect(portal?.roomA).toBe(canonical.roomA);
      expect(portal?.roomB).toBe(canonical.roomB);
    }
  });

  it('validates the classic harbor as versioned JSON', () => {
    const json = hullSpecToJson(StationHubSpec);
    expect(json.version).toBe(HULL_SCHEMA_VERSION);
    expect(validateHullJson(json)).toEqual([]);
    expect(validateHullJson({ ...json, version: 999 }).join(' ')).toContain(
      'unsupported hull version'
    );
    expect(validateHullJson({ ...json, frameId: '' }).join(' ')).toContain('frameId');
  });

  it('round-trips versioned JSON back onto the same spec shape', () => {
    const json = hullSpecToJson(StationHubSpec);
    const spec = hullSpecFromJson(JSON.parse(JSON.stringify(json)) as typeof json);
    expect(spec).toEqual({ ...StationHubSpec, spawns: { ...StationHubSpec.spawns } });
    expect(compileHull(spec).errors).toEqual([]);
  });

  it('fails compile when a variant moves the dock mouth', () => {
    const mutated = movedMouth({ ...StationHubSpec, frameId: 'hub_b' });
    expect(compileHull(mutated).errors.join(' ')).toContain('dock spine');
    expect(validateDockSpine(mutated).join(' ')).toContain('andock_tube_mund');
  });

  it('fails compile when a variant moves a spine room', () => {
    const mutated = movedSpineRoom({ ...StationHubSpec, frameId: 'hub_c' });
    expect(compileHull(mutated).errors.join(' ')).toContain('dock spine');
    expect(validateDockSpine(mutated).join(' ')).toContain('andock_tube');
  });

  it('flags missing spine rooms and portals', () => {
    const dropped: HullSpec = {
      ...StationHubSpec,
      rooms: StationHubSpec.rooms.filter((room) => room.id !== 'andock_tube'),
      portals: StationHubSpec.portals.filter((portal) => portal.id !== 'andock_tube_mund'),
    };
    expect(validateDockSpine(dropped).join(' ')).toContain('missing');
  });

  it('checks variants against the base across the spine', () => {
    for (const hub of ['hub_b', 'hub_c', 'hub_d'] as const) {
      expect(validateVariant(StationHubSpec, stationHullFor(hub))).toEqual([]);
      expect(checkVariantSpine(StationHubSpec, stationHullFor(hub))).toEqual([]);
    }
    const mutated = movedMouth(stationHullFor('hub_b'));
    expect(validateVariant(StationHubSpec, mutated).join(' ')).toContain('andock_tube_mund');
  });

  it('lets ship hulls without a spine pass through', () => {
    expect(
      validateDockSpine({
        rooms: [{ id: 'a', rect: { x: 0, y: 0, w: 10, h: 10 }, volumeM3: 1 }],
        portals: [],
      })
    ).toEqual([]);
  });
});
