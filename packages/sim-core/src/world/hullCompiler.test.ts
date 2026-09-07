import { describe, expect, it } from 'vitest';
import { HESPERIA_V2_FRAME_ID, HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { STATION_HUB_FRAME_ID, StationHubSpec } from './content/StationHub.hull.js';
import { compileHull, toLegacyWalls } from './hullCompiler.js';

describe('hullCompiler scaffold', () => {
  it('frame ids match specs', () => {
    expect(StationHubSpec.frameId).toBe(STATION_HUB_FRAME_ID);
    expect(HesperiaV2Spec.frameId).toBe(HESPERIA_V2_FRAME_ID);
  });

  it('compiles station hub with no errors', () => {
    const compiled = compileHull(StationHubSpec);
    expect(compiled.errors).toEqual([]);
    expect(compiled.rooms).toHaveLength(3);
    expect(compiled.airRooms).toHaveLength(3);
    expect(compiled.spawns.fresh_spawn).toBeDefined();
  });

  it('compiles hesperia v2 with no errors', () => {
    const compiled = compileHull(HesperiaV2Spec);
    expect(compiled.errors).toEqual([]);
    expect(compiled.rooms).toHaveLength(9);
    expect(compiled.portals).toHaveLength(9);
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
