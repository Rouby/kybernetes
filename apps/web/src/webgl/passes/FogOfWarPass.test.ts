import { describe, expect, it } from 'vitest';
import { buildPolygonFanVertices, fanShortEdge } from './FogOfWarPass';

describe('fog-of-war fan builder', () => {
  it('skips degenerate slivers that read as GPU streaks', () => {
    const origin = { x: 100, y: 100 };
    expect(fanShortEdge(origin, { x: 100, y: 100 }, { x: 200, y: 100 })).toBe(0);
    expect(fanShortEdge(origin, { x: 200, y: 100 }, { x: 200, y: 200 })).toBe(100);
    const verts = buildPolygonFanVertices(origin, [
      origin,
      { x: 200, y: 100 },
      { x: 200.001, y: 100.001 },
      { x: 200, y: 200 },
    ]);
    // The sub-pixel sliver is skipped: 2 tris = 12 floats.
    expect(verts.length).toBe(12);
  });

  it('closes cone fans across the mouth chord', () => {
    const origin = { x: 0, y: 0 };
    const verts = buildPolygonFanVertices(origin, [
      origin,
      { x: 100, y: -10 },
      { x: 110, y: 0 },
      { x: 100, y: 10 },
    ]);
    // Two arc tris plus the mouth-closing tri: 3 tris = 18 floats.
    expect(verts.length).toBe(18);
    expect(Array.from(verts.slice(12))).toEqual([0, 0, 100, 10, 100, -10]);
  });

  it('fans closed 360-degree rings without the origin', () => {
    const origin = { x: 0, y: 0 };
    const verts = buildPolygonFanVertices(origin, [
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: -100, y: 0 },
      { x: 0, y: -100 },
    ]);
    expect(verts.length).toBe(24);
  });
});
