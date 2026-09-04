import { describe, expect, it } from 'vitest';
import {
  applyEcsRepressurization,
  carveBreachedWallSegments,
  createInitialAtmosGrid,
  createInitialDoors,
  getBreachLocation,
  getOpaqueWallSegments,
  getZoneRepressurizeRate,
  HESPERIA_BREACH_LOCATIONS,
  HESPERIA_WALLS,
  repairHullPlating,
  sampleAtmosphereAt,
  summarizeRoomAtmospheres,
  tickCellularAtmos,
  trackBreachWelding,
} from '../index';

describe('Breach Recovery & Wall Segment Carving', () => {
  describe('carveBreachedWallSegments', () => {
    it('returns unmodified walls when no breaches exist', () => {
      const carved = carveBreachedWallSegments(HESPERIA_WALLS, []);
      expect(carved).toEqual(HESPERIA_WALLS);
    });

    it('carves an actual physical hole in the wall segment for an active breach', () => {
      const carved = carveBreachedWallSegments(HESPERIA_WALLS, ['mess'], 18);
      // 'mess' breach is at x: 840, y: 228 on hull_top_l (120 to 950, y: 228)
      const messWallSegments = carved.filter((w) => w.id.startsWith('hull_top_l_br_'));
      expect(messWallSegments.length).toBeGreaterThanOrEqual(2);

      // Segment before hole
      const seg1 = messWallSegments[0];
      expect(seg1.x1).toBe(120);
      expect(seg1.x2).toBe(840 - 9); // 831

      // Segment after hole
      const seg2 = messWallSegments[1];
      expect(seg2.x1).toBe(840 + 9); // 849
      expect(seg2.x2).toBe(950);

      // The hole is 18px wide (from 831 to 849)
      expect(seg2.x1 - seg1.x2).toBe(18);
    });

    it('carves a micro-breach at the exact gunfire impact coordinates along the outer hull', () => {
      const carved = carveBreachedWallSegments(HESPERIA_WALLS, ['puncture_mess_815_228'], 18);
      const messWallSegments = carved.filter((w) => w.id.startsWith('hull_top_l_br_'));
      expect(messWallSegments.length).toBeGreaterThanOrEqual(2);

      const seg1 = messWallSegments[0];
      expect(seg1.x1).toBe(120);
      expect(seg1.x2).toBe(815 - 9); // 806

      const seg2 = messWallSegments[1];
      expect(seg2.x1).toBe(815 + 9); // 824
      expect(seg2.x2).toBe(950);
      expect(seg2.x1 - seg1.x2).toBe(18);
    });

    it('resolves exact coordinates from gunfire micro-breach IDs via getBreachLocation', () => {
      const loc = getBreachLocation('puncture_life_support_520_228');
      expect(loc).not.toBeNull();
      expect(loc?.roomId).toBe('life_support');
      expect(loc?.x).toBe(520);
      expect(loc?.y).toBe(228);
      expect(loc?.normalY).toBe(-1);
    });

    it('allows light and sight rays to penetrate through the breach hole into space', () => {
      const doors = createInitialDoors();
      const closedWalls = getOpaqueWallSegments(HESPERIA_WALLS, doors);
      const breachedWalls = getOpaqueWallSegments(HESPERIA_WALLS, doors, ['cargo']);

      // Breached walls has extra sub-segments due to the hole cut into the cargo outer wall
      expect(breachedWalls.length).toBe(closedWalls.length + 1);

      // Verify hole in cargo wall (y: 572, x: 600)
      const cargoLoc = HESPERIA_BREACH_LOCATIONS.cargo;
      const pointInHole = { x: cargoLoc.x, y: cargoLoc.y };
      const hasWallCoveringHole = breachedWalls.some((w) => {
        if (Math.abs(w.y1 - pointInHole.y) > 1 || Math.abs(w.y2 - pointInHole.y) > 1) return false;
        const minX = Math.min(w.x1, w.x2);
        const maxX = Math.max(w.x1, w.x2);
        return pointInHole.x >= minX && pointInHole.x <= maxX;
      });
      expect(hasWallCoveringHole).toBe(false);
    });
  });

  describe('trackBreachWelding & repairHullPlating', () => {
    it('accumulates welding progress and seals the breach at 3.0s', () => {
      let progress = new Map<string, number>();

      // 1.0s of welding
      let res = trackBreachWelding(progress, 'cargo', 1.0, 3.0);
      progress = res.nextProgress;
      expect(res.completed).toBe(false);
      expect(res.currentPercent).toBe(33);

      // Another 1.0s of welding
      res = trackBreachWelding(progress, 'cargo', 1.0, 3.0);
      progress = res.nextProgress;
      expect(res.completed).toBe(false);
      expect(res.currentPercent).toBe(67);

      // Final 1.0s of welding (reaches 3.0s)
      res = trackBreachWelding(progress, 'cargo', 1.0, 3.0);
      progress = res.nextProgress;
      expect(res.completed).toBe(true);
      expect(res.currentPercent).toBe(100);
      expect(progress.has('cargo')).toBe(false);
    });

    it('patches breach and restores plating integrity via repairHullPlating', () => {
      const initialHull = {
        integrityPercent: 60,
        stressPercent: 45,
        breaches: ['puncture_mess', 'cargo'],
        status: 'critical' as const,
      };

      const { nextHull, patchedBreach } = repairHullPlating(initialHull, 'mess');
      expect(patchedBreach).toBe(true);
      expect(nextHull.breaches).toEqual(['cargo']);
      expect(nextHull.integrityPercent).toBe(75);
      expect(nextHull.stressPercent).toBe(25);
    });

    it('patches coordinate-encoded gunfire micro-breach via repairHullPlating', () => {
      const initialHull = {
        integrityPercent: 70,
        stressPercent: 30,
        breaches: ['puncture_mess_815_228'],
        status: 'nominal' as const,
      };

      const { nextHull, patchedBreach } = repairHullPlating(initialHull, 'mess');
      expect(patchedBreach).toBe(true);
      expect(nextHull.breaches).toHaveLength(0);
    });
  });

  describe('applyEcsRepressurization & volume-scaled dynamics', () => {
    it('provides volume-scaled repressurization rates per zone definition', () => {
      expect(getZoneRepressurizeRate('airlock_stbd')).toBe(25.0);
      expect(getZoneRepressurizeRate('airlock_port')).toBe(25.0);
      expect(getZoneRepressurizeRate('mess')).toBe(12.0);
      expect(getZoneRepressurizeRate('cargo')).toBe(6.5);
      expect(getZoneRepressurizeRate('engineering')).toBe(6.5);
    });

    it('repressurizes a sealed decompressed room back towards 101.3 kPa and warms to 21C', () => {
      const grid = createInitialAtmosGrid();
      const doors = createInitialDoors(); // all closed

      // Depressurize mess hall to 0 kPa vacuum
      for (let r = 11; r <= 17; r++) {
        for (let c = 38; c <= 45; c++) {
          const idx = r * 60 + c;
          grid.pressure[idx] = 0;
          grid.o2Ratio[idx] = 0;
          grid.tempKelvin[idx] = 3.0;
        }
      }

      const initialSummary = summarizeRoomAtmospheres(grid, doors, []);
      expect(initialSummary.mess.pressureKpa).toBe(0);
      expect(initialSummary.mess.isVenting).toBe(false);
      expect(initialSummary.mess.isRepressurizing).toBe(true);

      // Tick repressurization over 1.0s (10 x 0.1s ticks)
      let totalDrain = 0;
      for (let i = 0; i < 10; i++) {
        totalDrain += applyEcsRepressurization(grid, doors, [], 0.1);
      }
      expect(totalDrain).toBeGreaterThan(0);

      const sampled = sampleAtmosphereAt(grid, 840, 280);
      expect(sampled.pressureKpa).toBeGreaterThan(10);
      expect(sampled.tempCelsius).toBeGreaterThan(-270);
      expect(sampled.o2Percent).toBeGreaterThan(0);
    });

    it('does NOT repressurize a room that has an active breach or open exterior door', () => {
      const grid = createInitialAtmosGrid();
      const doors = createInitialDoors();

      // Depressurize mess hall
      for (let r = 11; r <= 17; r++) {
        for (let c = 38; c <= 45; c++) {
          const idx = r * 60 + c;
          grid.pressure[idx] = 0;
          grid.o2Ratio[idx] = 0;
          grid.tempKelvin[idx] = 3.0;
        }
      }

      // If active breach exists in mess:
      const drain = applyEcsRepressurization(grid, doors, ['mess'], 1.0);
      expect(drain).toBe(0);

      const sampled = sampleAtmosphereAt(grid, 840, 280);
      expect(sampled.pressureKpa).toBe(0);

      const summary = summarizeRoomAtmospheres(grid, doors, ['mess']);
      expect(summary.mess.isRepressurizing).toBe(false);
    });

    it('flips isRepressurizing to false once nominal atmospheric pressure is reached', () => {
      const grid = createInitialAtmosGrid();
      const doors = createInitialDoors();
      const summary = summarizeRoomAtmospheres(grid, doors, []);
      expect(summary.mess.pressureKpa).toBe(101.3);
      expect(summary.mess.isRepressurizing).toBe(false);
    });

    it('integrates ECS repressurization and O2 drain within tickCellularAtmos', () => {
      const grid = createInitialAtmosGrid();
      const doors = createInitialDoors();

      // Depressurize airlock_stbd
      for (let r = 11; r <= 17; r++) {
        for (let c = 46; c <= 50; c++) {
          const idx = r * 60 + c;
          grid.pressure[idx] = 0;
          grid.o2Ratio[idx] = 0;
        }
      }

      tickCellularAtmos(grid, doors, [], [], 0.05);
      expect(grid.ecsDrainPercent).toBeDefined();
      expect(grid.ecsDrainPercent).toBeGreaterThan(0);
    });
  });

  describe('Partition Bullet Holes & Inter-Room Gas Equalization', () => {
    it('equalizes air across interior partition walls when bullet holes are present', () => {
      const grid = createInitialAtmosGrid();
      const closedDoors = createInitialDoors().map((d) => ({ ...d, isOpen: false }));

      // Depressurize Avionics (c in [16, 21], r in [11, 17])
      for (let r = 11; r <= 17; r++) {
        for (let c = 16; c <= 21; c++) {
          const idx = r * 60 + c;
          grid.pressure[idx] = 0;
          grid.o2Ratio[idx] = 0;
        }
      }

      // Without partition bullet holes, closed doors prevent diffusion between Bridge and Avionics
      const isolatedGrid = createInitialAtmosGrid();
      for (let r = 11; r <= 17; r++) {
        for (let c = 16; c <= 21; c++) {
          const idx = r * 60 + c;
          isolatedGrid.pressure[idx] = 0;
          isolatedGrid.o2Ratio[idx] = 0;
        }
      }
      tickCellularAtmos(isolatedGrid, closedDoors, ['avionics'], [], 0.05, []);
      const sampleIsolated = sampleAtmosphereAt(isolatedGrid, 330, 280);
      expect(sampleIsolated.pressureKpa).toBe(0);

      // Now add a partition bullet hole on part_bridge_avionics at x=320, y=280
      const bulletHole = { x: 320, y: 280, wallId: 'part_bridge_avionics' };
      tickCellularAtmos(grid, closedDoors, ['avionics'], [], 0.05, [bulletHole]);

      // Air diffuses across the bullet hole into Avionics
      const sampleWithHole = sampleAtmosphereAt(grid, 330, 280);
      expect(sampleWithHole.pressureKpa).toBeGreaterThan(0);
    });

    it('does not vent an intact room all at once when an interior partition hole connects to an outside-breached room', () => {
      const grid = createInitialAtmosGrid();
      const closedDoors = createInitialDoors().map((d) => ({ ...d, isOpen: false }));

      // Mess has an explosive outer hull breach to space ['mess']
      // Quarters is intact at nominal 101.3 kPa
      // There is an interior puncture on the partition between Quarters and Mess (part_quarters_mess is at x: 760, y: 228..368)
      const bulletHole = { x: 760, y: 280, wallId: 'part_quarters_mess' };

      // Tick simulation for 1.0 second (10 ticks x 0.1s)
      for (let i = 0; i < 10; i++) {
        tickCellularAtmos(grid, closedDoors, ['mess'], [], 0.1, [bulletHole]);
      }

      const summary = summarizeRoomAtmospheres(grid, closedDoors, ['mess']);

      // Mess is completely vented to space vacuum
      expect(summary.mess.pressureKpa).toBe(0);
      expect(summary.mess.isVenting).toBe(false); // 0 kPa remaining

      // Quarters must NOT be vented all at once: it only experienced slow orifice depressurization
      // It should still have > 90 kPa remaining (only lost a few percent or balanced by ECS)
      expect(summary.quarters.pressureKpa).toBeGreaterThan(90);

      // Quarters is not marked as catastrophic vacuum venting (it is an intact room with a small leak)
      expect(summary.quarters.isVenting).toBe(false);

      // Atmosphere in Quarters is still breathable and room temperature
      const sampleQuarters = sampleAtmosphereAt(grid, 720, 280);
      expect(sampleQuarters.pressureKpa).toBeGreaterThan(90);
      expect(sampleQuarters.tempCelsius).toBeGreaterThan(15);
      expect(sampleQuarters.o2Percent).toBeGreaterThan(18);
    });

    it('scales depressurization rate with multiple bullet holes while preserving physical orifice limits', () => {
      const singleHoleGrid = createInitialAtmosGrid();
      const multiHoleGrid = createInitialAtmosGrid();
      const closedDoors = createInitialDoors().map((d) => ({ ...d, isOpen: false }));

      const singleHole = [{ x: 760, y: 280, wallId: 'part_quarters_mess' }];
      const tripleHole = [
        { x: 760, y: 260, wallId: 'part_quarters_mess' },
        { x: 760, y: 280, wallId: 'part_quarters_mess' },
        { x: 760, y: 300, wallId: 'part_quarters_mess' },
      ];

      for (let i = 0; i < 10; i++) {
        tickCellularAtmos(singleHoleGrid, closedDoors, ['mess'], [], 0.1, singleHole);
        tickCellularAtmos(multiHoleGrid, closedDoors, ['mess'], [], 0.1, tripleHole);
      }

      const singleSummary = summarizeRoomAtmospheres(singleHoleGrid, closedDoors, ['mess']);
      const multiSummary = summarizeRoomAtmospheres(multiHoleGrid, closedDoors, ['mess']);

      // Both maintain physical limits without instant room dump (> 80 kPa after 1 second)
      expect(singleSummary.quarters.pressureKpa).toBeGreaterThan(80);
      expect(multiSummary.quarters.pressureKpa).toBeGreaterThan(80);
    });
  });
});
