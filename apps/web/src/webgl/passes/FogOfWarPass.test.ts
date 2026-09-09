import { createExplorationGrid, updateExplorationGrid } from '@kybernetes/sim-core';
import { describe, expect, it } from 'vitest';
import { buildExploredCellQuads, buildPolygonFanVertices, fanShortEdge } from './FogOfWarPass';

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

describe('explored-cell restore quads', () => {
  it('emits nothing for a fresh grid', () => {
    const grid = createExplorationGrid(100, 100, 20);
    expect(buildExploredCellQuads(grid).length).toBe(0);
  });

  it('emits one quad per explored cell', () => {
    const grid = createExplorationGrid(100, 100, 20);
    updateExplorationGrid(
      grid,
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ],
      { x: 20, y: 20 },
      0
    );
    const quads = buildExploredCellQuads(grid);
    expect(quads.length % 12).toBe(0);
    expect(quads.length).toBeGreaterThan(0);
  });
});
