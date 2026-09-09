import type { WallSegment } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { distanceToSegment } from '../spatial/collision.js';
import { portalEffectiveArea } from './airAuthority.js';
import { HESPERIA_V2_FRAME_ID, HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { STATION_HUB_FRAME_ID, StationHubSpec } from './content/StationHub.hull.js';
import { isPortalConnecting } from './doors.js';
import type { HullSpec } from './hullCompiler.js';
import { compileHull, toLegacyWalls, wallBlocksMovement, wallBlocksSight } from './hullCompiler.js';

function minWallDistance(walls: readonly WallSegment[], x: number, y: number): number {
  let min = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    const distance = distanceToSegment(
      { x, y },
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    );
    if (distance < min) min = distance;
  }
  return min;
}

describe('hullCompiler scaffold', () => {
  it('frame ids match specs', () => {
    expect(StationHubSpec.frameId).toBe(STATION_HUB_FRAME_ID);
    expect(HesperiaV2Spec.frameId).toBe(HESPERIA_V2_FRAME_ID);
  });

  it('compiles station hub with no errors', () => {
    const compiled = compileHull(StationHubSpec);
    expect(compiled.errors).toEqual([]);
    expect(compiled.rooms).toHaveLength(12);
    expect(compiled.airRooms).toHaveLength(12);
    expect(compiled.spawns.fresh_spawn).toBeDefined();
  });

  it('compiles hesperia v2 with no errors', () => {
    const compiled = compileHull(HesperiaV2Spec);
    expect(compiled.errors).toEqual([]);
    expect(compiled.rooms).toHaveLength(5);
    expect(compiled.portals).toHaveLength(5);
  });

  it('flags unreachable rooms', () => {
    const compiled = compileHull({
      frameId: 'test',
      rooms: [
        { id: 'a', rect: { x: 0, y: 0, w: 10, h: 10 }, volumeM3: 10 },
        { id: 'b', rect: { x: 20, y: 0, w: 10, h: 10 }, volumeM3: 10 },
      ],
      portals: [],
    });
    expect(compiled.errors.join(' ')).toContain('b');
  });

  it('emits legacy walls for renderer', () => {
    const compiled = compileHull(StationHubSpec);
    const walls = toLegacyWalls(compiled);
    expect(walls.length).toBeGreaterThan(0);
    expect(walls[0]?.id).toContain('station_hub');
  });
});

describe('hullCompiler door gaps', () => {
  it('cuts exact gaps on both sides of a shared-edge door', () => {
    const walls = toLegacyWalls(compileHull(HesperiaV2Spec));
    expect(minWallDistance(walls, 60, 70)).toBeGreaterThan(10);
    expect(minWallDistance(walls, 60, 30)).toBeLessThan(1);
    expect(minWallDistance(walls, 60, 110)).toBeLessThan(1);
  });

  it('cuts cabin gaps on the ship corridor east edge', () => {
    const walls = toLegacyWalls(compileHull(HesperiaV2Spec));
    expect(minWallDistance(walls, 60, 200)).toBeGreaterThan(10);
    expect(minWallDistance(walls, 60, 150)).toBeLessThan(1);
  });

  it('flags portals that touch no wall of their rooms', () => {
    const spec: HullSpec = {
      frameId: 'test',
      rooms: [{ id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 100 }],
      portals: [
        {
          id: 'floating',
          roomA: 'a',
          roomB: 'space',
          kind: 'door',
          segment: { x1: 40, y1: 40, x2: 60, y2: 40 },
          areaM2: 2,
        },
      ],
    };
    expect(compileHull(spec).errors.join(' ')).toContain('touches no wall');
  });
});

describe('hullCompiler windows', () => {
  it('emits transparent movement-blocking panes', () => {
    const walls = toLegacyWalls(compileHull(StationHubSpec));
    const pane = walls.find((wall) => wall.id === 'portal.habitat_window');
    expect(pane?.isWindow).toBe(true);
    expect(pane?.isOpaque).toBe(false);
    expect(pane?.isTraversable).toBe(false);
    if (pane !== undefined) {
      expect(wallBlocksSight(pane)).toBe(false);
      expect(wallBlocksMovement(pane)).toBe(true);
    }
  });

  it('keeps solid walls sight- and movement-blocking', () => {
    const walls = toLegacyWalls(compileHull(HesperiaV2Spec));
    const solid = walls.find((wall) => wall.id === 'hesperia_v2.bruecke.n');
    expect(solid).toBeDefined();
    if (solid !== undefined) {
      expect(wallBlocksSight(solid)).toBe(true);
      expect(wallBlocksMovement(solid)).toBe(true);
    }
  });

  it('compiles window portals to sealed non-connecting edges', () => {
    const compiled = compileHull(StationHubSpec);
    const window = compiled.portals.find((portal) => portal.id === 'habitat_window');
    expect(window?.kind).toBe('window');
    expect(window?.state).toBe('closed');
    if (window !== undefined) {
      expect(isPortalConnecting(window)).toBe(false);
      expect(portalEffectiveArea(window)).toBe(0);
    }
  });

  it('excludes windows from movement reachability', () => {
    const spec: HullSpec = {
      frameId: 'test',
      rooms: [
        { id: 'a', rect: { x: 0, y: 0, w: 10, h: 10 }, volumeM3: 10 },
        { id: 'b', rect: { x: 10, y: 0, w: 10, h: 10 }, volumeM3: 10 },
      ],
      portals: [
        {
          id: 'glass',
          roomA: 'a',
          roomB: 'b',
          kind: 'window',
          segment: { x1: 10, y1: 2, x2: 10, y2: 8 },
          areaM2: 0,
        },
      ],
    };
    expect(compileHull(spec).errors.join(' ')).toContain('unreachable');
  });
});

describe('hullCompiler sealed hull', () => {
  it('rejects exterior holes and unsealed openings', () => {
    const rooms = [{ id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 100 }] as const;
    const hole: HullSpec = {
      frameId: 'test',
      rooms: [...rooms],
      portals: [
        {
          id: 'breach',
          roomA: 'a',
          roomB: 'space',
          kind: 'hole',
          segment: { x1: 0, y1: 40, x2: 0, y2: 60 },
          areaM2: 2,
        },
      ],
    };
    expect(compileHull(hole).errors.join(' ')).toContain('open hole');
    const open: HullSpec = {
      frameId: 'test',
      rooms: [...rooms],
      portals: [
        {
          id: 'gap',
          roomA: 'a',
          roomB: 'vacuum',
          kind: 'open',
          segment: { x1: 0, y1: 40, x2: 0, y2: 60 },
          areaM2: 2,
        },
      ],
    };
    expect(compileHull(open).errors.join(' ')).toContain('unsealed opening');
  });
});

describe('hullCompiler round trip', () => {
  it('preserves rooms, portals, and air rooms one-to-one', () => {
    const compiled = compileHull(HesperiaV2Spec);
    expect(compiled.airRooms.map((room) => room.id).sort()).toEqual(
      compiled.rooms.map((room) => room.id).sort()
    );
    expect(compiled.portals.map((portal) => portal.id).sort()).toEqual(
      HesperiaV2Spec.portals.map((portal) => portal.id).sort()
    );
    for (const room of compiled.rooms) {
      expect(compiled.airRooms.find((air) => air.id === room.id)?.volumeM3).toBe(room.volumeM3);
    }
  });

  it('compiles deterministically', () => {
    expect(compileHull(HesperiaV2Spec)).toEqual(compileHull(HesperiaV2Spec));
    expect(compileHull(StationHubSpec)).toEqual(compileHull(StationHubSpec));
  });
});
