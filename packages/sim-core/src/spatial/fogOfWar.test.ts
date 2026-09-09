import { describe, expect, it } from 'vitest';
import {
  buildFowStampMatrix,
  createExplorationGrid,
  decodeGridCells,
  deserializeExplorationGrid,
  encodeGridCells,
  getExplorationPercentage,
  isPointInPolygon,
  isWorldPointExplored,
  isWorldPointVisible,
  resetExplorationGrid,
  revealAllGrid,
  serializeExplorationGrid,
  updateExplorationGrid,
} from './fogOfWar';
import { computeVisibilityPolygon } from './visibility';

describe('Fog of War & Line of Sight Math', () => {
  describe('isPointInPolygon', () => {
    const square = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 50 },
      { x: 10, y: 50 },
    ];

    it('identifies point inside polygon', () => {
      expect(isPointInPolygon({ x: 30, y: 30 }, square)).toBe(true);
      expect(isPointInPolygon({ x: 15, y: 45 }, square)).toBe(true);
    });

    it('identifies point outside polygon', () => {
      expect(isPointInPolygon({ x: 5, y: 30 }, square)).toBe(false);
      expect(isPointInPolygon({ x: 60, y: 30 }, square)).toBe(false);
      expect(isPointInPolygon({ x: 30, y: 100 }, square)).toBe(false);
    });

    it('handles degenerate polygons gracefully', () => {
      expect(isPointInPolygon({ x: 10, y: 10 }, [])).toBe(false);
      expect(
        isPointInPolygon({ x: 10, y: 10 }, [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ])
      ).toBe(false);
    });
  });

  describe('ExplorationGrid', () => {
    it('initializes grid with all cells unexplored', () => {
      const grid = createExplorationGrid(200, 100, 20);
      expect(grid.cols).toBe(10);
      expect(grid.rows).toBe(5);
      expect(grid.cells.length).toBe(50);
      expect(grid.exploredCount).toBe(0);
      expect(getExplorationPercentage(grid)).toBe(0);
      expect(isWorldPointExplored(grid, 50, 50)).toBe(false);
    });

    it('updates grid from line of sight polygon and retains explored memory', () => {
      const grid = createExplorationGrid(200, 200, 20);
      const poly1 = [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 80 },
        { x: 20, y: 80 },
      ];

      updateExplorationGrid(grid, poly1, { x: 50, y: 50 }, 10);
      expect(grid.exploredCount).toBeGreaterThan(0);
      expect(isWorldPointVisible(grid, 50, 50)).toBe(true);
      expect(isWorldPointExplored(grid, 50, 50)).toBe(true);

      // Now move player to a new location (poly2)
      const poly2 = [
        { x: 120, y: 120 },
        { x: 180, y: 120 },
        { x: 180, y: 180 },
        { x: 120, y: 180 },
      ];

      updateExplorationGrid(grid, poly2, { x: 150, y: 150 }, 10);

      // New area is visible
      expect(isWorldPointVisible(grid, 150, 150)).toBe(true);

      // Old area is no longer active visible, BUT remains explored in memory!
      expect(isWorldPointVisible(grid, 50, 50)).toBe(false);
      expect(isWorldPointExplored(grid, 50, 50)).toBe(true);

      // Unvisited corner is still unexplored
      expect(isWorldPointExplored(grid, 10, 180)).toBe(false);
    });

    it('covers off-origin harbors with an explicit grid origin', () => {
      const grid = createExplorationGrid(400, 200, 20, -200, -200);
      const poly = [
        { x: -150, y: -150 },
        { x: -50, y: -150 },
        { x: -50, y: -50 },
        { x: -150, y: -50 },
      ];
      updateExplorationGrid(grid, poly, { x: -100, y: -100 }, 10);
      expect(isWorldPointVisible(grid, -100, -100)).toBe(true);
      expect(isWorldPointExplored(grid, -100, -100)).toBe(true);
      expect(isWorldPointExplored(grid, 500, 500)).toBe(false);
    });

    it('reveals all and resets grid properly', () => {
      const grid = createExplorationGrid(100, 100, 20);
      revealAllGrid(grid);
      expect(getExplorationPercentage(grid)).toBe(100);
      expect(isWorldPointExplored(grid, 10, 10)).toBe(true);

      resetExplorationGrid(grid);
      expect(getExplorationPercentage(grid)).toBe(0);
      expect(isWorldPointExplored(grid, 10, 10)).toBe(false);
    });

    it('round-trips through storage with visible demoted to explored', () => {
      const grid = createExplorationGrid(200, 200, 20);
      updateExplorationGrid(
        grid,
        [
          { x: 20, y: 20 },
          { x: 80, y: 20 },
          { x: 80, y: 80 },
          { x: 20, y: 80 },
        ],
        { x: 50, y: 50 },
        0
      );
      expect(isWorldPointVisible(grid, 50, 50)).toBe(true);
      const saved = serializeExplorationGrid(grid);
      expect(saved.version).toBe(1);
      const restored = deserializeExplorationGrid(JSON.parse(JSON.stringify(saved)));
      if (restored === null) throw new Error('expected restored grid');
      expect(isWorldPointExplored(restored, 50, 50)).toBe(true);
      // Transient visibility is memory after reload, never an active sightline.
      expect(isWorldPointVisible(restored, 50, 50)).toBe(false);
      expect(isWorldPointExplored(restored, 150, 150)).toBe(false);
    });

    it('rejects corrupt persisted payloads', () => {
      const grid = createExplorationGrid(100, 100, 20);
      const saved = serializeExplorationGrid(grid);
      expect(deserializeExplorationGrid(null)).toBeNull();
      expect(deserializeExplorationGrid({ ...saved, version: 999 })).toBeNull();
      expect(deserializeExplorationGrid({ ...saved, cellsB64: '!!!' })).toBeNull();
      expect(
        deserializeExplorationGrid({ ...saved, cellsB64: saved.cellsB64.slice(0, 4) })
      ).toBeNull();
      expect(decodeGridCells('')).toBeNull();
      expect(encodeGridCells(new Uint8Array([1, 2, 3])).length).toBeGreaterThan(0);
    });
  });

  describe('fow stamp matrix', () => {
    it('maps the world window to NDC with the origin applied', () => {
      const m = buildFowStampMatrix(2400, 1000, -200, -200);
      const sx = m[0] ?? 0;
      const sy = m[4] ?? 0;
      const tx = m[6] ?? 0;
      const ty = m[7] ?? 0;
      const apply = (x: number, y: number): [number, number] => [sx * x + tx, sy * y + ty];
      const [x0, y0] = apply(-200, -200);
      const [x1, y1] = apply(2200, 800);
      expect(x0).toBeCloseTo(-1, 5);
      expect(y0).toBeCloseTo(-1, 5);
      expect(x1).toBeCloseTo(1, 5);
      expect(y1).toBeCloseTo(1, 5);
    });

    it('keeps zero-origin behavior identical to the legacy matrix', () => {
      const m = buildFowStampMatrix(1200, 800, 0, 0);
      expect(m[0]).toBeCloseTo(2 / 1200, 8);
      expect(m[4]).toBeCloseTo(2 / 800, 8);
      expect(m[6]).toBeCloseTo(-1, 8);
      expect(m[7]).toBeCloseTo(-1, 8);
    });
  });

  describe('160-degree Line of Sight Cone', () => {
    it('creates cone polygon that only encompasses forward arc and excludes rear points', () => {
      // Player facing east (0 radians) with 160 deg cone
      const fov = (160 * Math.PI) / 180;
      const origin = { x: 100, y: 100 };
      const conePoly = computeVisibilityPolygon(origin, 300, [], 32, {
        facingAngle: 0,
        fov,
      });

      expect(conePoly.length).toBeGreaterThan(3);

      // Point directly in front (east) within range should be inside
      expect(isPointInPolygon({ x: 200, y: 100 }, conePoly)).toBe(true);

      // Point within 160 cone (e.g. 45 degrees north-east) should be inside
      expect(isPointInPolygon({ x: 170, y: 170 }, conePoly)).toBe(true);

      // Point directly behind (west, 180 degrees opposite) should be strictly OUTSIDE
      expect(isPointInPolygon({ x: 50, y: 100 }, conePoly)).toBe(false);

      // Point slightly behind (e.g. 120 degrees away) should be OUTSIDE
      expect(isPointInPolygon({ x: 60, y: 150 }, conePoly)).toBe(false);

      // Point beyond range (> 300px) should be OUTSIDE
      expect(isPointInPolygon({ x: 450, y: 100 }, conePoly)).toBe(false);
    });

    it('encompasses small personal perception radius around player without clipping through walls', () => {
      // Player at (100, 100) facing East (0 rad) with 160 deg cone and 24px perception radius
      const fov = (160 * Math.PI) / 180;
      const origin = { x: 100, y: 100 };
      const perceptionRadius = 24;

      // 1. Without walls: rear point within 24px is inside, point beyond 24px is outside
      const openPoly = computeVisibilityPolygon(origin, 300, [], 36, {
        facingAngle: 0,
        fov,
        perceptionRadius,
      });

      // Forward point in cone (180, 100) is inside
      expect(isPointInPolygon({ x: 180, y: 100 }, openPoly)).toBe(true);

      // Rear point at 15px behind (85, 100) is within perception radius (24px) -> INSIDE
      expect(isPointInPolygon({ x: 85, y: 100 }, openPoly)).toBe(true);

      // Rear point at 35px behind (65, 100) is beyond perception radius -> OUTSIDE
      expect(isPointInPolygon({ x: 65, y: 100 }, openPoly)).toBe(false);

      // 2. With a solid bulkhead wall 10px behind player (x = 90)
      const wallBehind: WallSegment = {
        id: 'bulkhead_behind',
        x1: 90,
        y1: 70,
        x2: 90,
        y2: 130,
        isOpaque: true,
        isTraversable: false,
      };

      const occludedPoly = computeVisibilityPolygon(origin, 300, [wallBehind], 36, {
        facingAngle: 0,
        fov,
        perceptionRadius,
      });

      // Point at (95, 100) is 5px behind player (in front of the wall) -> INSIDE
      expect(isPointInPolygon({ x: 95, y: 100 }, occludedPoly)).toBe(true);

      // Point at (85, 100) is 15px behind player (on the OTHER SIDE of the wall) -> STRICTLY OUTSIDE!
      // This verifies ZERO CLIPPING THROUGH WALLS!
      expect(isPointInPolygon({ x: 85, y: 100 }, occludedPoly)).toBe(false);

      // Point at (70, 100) on the other side of the wall -> STRICTLY OUTSIDE!
      expect(isPointInPolygon({ x: 70, y: 100 }, occludedPoly)).toBe(false);
    });
  });
});
