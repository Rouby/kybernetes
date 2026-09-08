import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import {
  breachEdgesOf,
  breachFlowAxis,
  breachFlows,
  breachFlowVector,
  breachModelOf,
  breachModelsOf,
  carveWallsAtBreachSegments,
  roomRectCenter,
  samePortalGeometry,
  snapshotBreachFields,
} from './breachView.js';
import { diffPortals, snapshotPortalsOf } from './channels.js';
import { fireWeapon } from './combat.js';
import type { HullSpec } from './hullCompiler.js';
import { tickWorld } from './tickWorld.js';
import type { PortalEdge, World } from './types.js';

const SOLO_SPEC: HullSpec = {
  frameId: 'solo',
  rooms: [{ id: 'cabin', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 100 }],
  portals: [],
};

function holeEdge(over: Partial<PortalEdge> = {}): PortalEdge {
  return {
    id: 'breach.solo.cabin.1.0',
    roomA: 'solo.cabin',
    roomB: 'space',
    kind: 'hole',
    state: 'destroyed',
    cooldownUntilTick: 10,
    areaM2: 0.05,
    segment: { x1: 40, y1: 0, x2: 60, y2: 0 },
    clearance: 0,
    integrity: 0,
    ...over,
  };
}

function shootNorth(world: World): World {
  const fired = fireWeapon(world, 'p1', -Math.PI / 2, 'kinetic_carbine');
  if (fired.result.kind !== 'fired') return world;
  let next = fired.world;
  for (let i = 0; i < 22; i += 1) next = tickWorld(next, 0.05, []);
  return next;
}

function soloWithShooter(): World {
  let world = assembleWorld([{ frameId: 'solo', hull: SOLO_SPEC }]);
  world = spawnPawn(world, {
    id: 'p1',
    owner: 'p1',
    frameId: 'solo',
    roomId: 'solo.cabin',
    x: 50,
    y: 50,
    color: '#fff',
  });
  return world;
}

describe('breach flow axis', () => {
  it('orients the normal from room A toward the segment', () => {
    const axis = breachFlowAxis({ x1: 0, y1: 0, x2: 10, y2: 0 }, { x: 5, y: 10 }, null);
    expect(axis.x).toBeCloseTo(0);
    expect(axis.y).toBeCloseTo(-1);
  });

  it('orients A->B for interior holes', () => {
    const axis = breachFlowAxis(
      { x1: 100, y1: 40, x2: 100, y2: 60 },
      { x: 50, y: 50 },
      { x: 150, y: 50 }
    );
    expect(axis.x).toBeCloseTo(1);
    expect(axis.y).toBeCloseTo(0);
  });

  it('resolves signed velocity onto the axis', () => {
    const vec = breachFlowVector({ x1: 0, y1: 0, x2: 10, y2: 0 }, { x: 5, y: 10 }, null, 12);
    expect(vec.x).toBeCloseTo(0);
    expect(vec.y).toBeCloseTo(-12);
  });

  it('centers room rects for orientation', () => {
    expect(roomRectCenter({ x: 0, y: 0, w: 100, h: 50 })).toEqual({ x: 50, y: 25 });
  });
});

describe('breach models', () => {
  it('classifies punctures below the carve threshold', () => {
    const model = breachModelOf(holeEdge(), 'solo', 12, { x: 50, y: 50 });
    expect(model.sizeClass).toBe('puncture');
    expect(model.isHull).toBe(true);
    expect(model.ageTicks).toBe(2);
    expect(model.cx).toBe(50);
    expect(model.lenPx).toBe(20);
  });

  it('classifies grown holes as breaches', () => {
    const model = breachModelOf(holeEdge({ areaM2: 1.5 }), 'solo', 40, { x: 50, y: 50 });
    expect(model.sizeClass).toBe('breach');
  });

  it('copies wire fields for channels', () => {
    expect(snapshotBreachFields(holeEdge())).toMatchObject({
      areaM2: 0.05,
      bornTick: 10,
      roomA: 'solo.cabin',
      x1: 40,
    });
  });

  it('detects area growth as a geometry change', () => {
    const a = { id: 'b', open: false as const, state: 'destroyed' as const, areaM2: 0.05 };
    expect(samePortalGeometry(a, { ...a })).toBe(true);
    expect(samePortalGeometry(a, { ...a, areaM2: 0.15 })).toBe(false);
  });

  it('joins flows with still-air defaults', () => {
    const models = [breachModelOf(holeEdge(), 'solo', 12)];
    const flows = breachFlows(models, [{ portalId: models[0]?.id ?? '', velocityMps: 9.5 }]);
    expect(flows.get('breach.solo.cabin.1.0')).toBe(9.5);
    expect(breachFlows(models, []).get('breach.solo.cabin.1.0')).toBe(0);
  });
});

describe('segment carve', () => {
  const wall = { id: 'w', x1: 0, y1: 0, x2: 100, y2: 0 };

  it('cuts an exact gap where the breach lies', () => {
    const carved = carveWallsAtBreachSegments([wall], [{ x1: 40, y1: 0, x2: 60, y2: 0 }]);
    expect(carved).toHaveLength(2);
    expect(carved[0]).toMatchObject({ x1: 0, x2: 40 });
    expect(carved[1]).toMatchObject({ x1: 60, x2: 100 });
  });

  it('ignores perpendicular segments', () => {
    const carved = carveWallsAtBreachSegments([wall], [{ x1: 50, y1: -10, x2: 50, y2: 10 }]);
    expect(carved).toHaveLength(1);
  });

  it('returns a copy when nothing breaches', () => {
    const carved = carveWallsAtBreachSegments([wall], []);
    expect(carved).toEqual([wall]);
    expect(carved).not.toBe([wall]);
  });
});

describe('live combat breaches', () => {
  it('exposes segment geometry on the snapshot', () => {
    const world = shootNorth(soloWithShooter());
    expect(breachEdgesOf(world)).toHaveLength(1);
    const portals = snapshotPortalsOf(world);
    const hole = portals.find((portal) => portal.id.startsWith('breach.'));
    expect(hole?.areaM2).toBeCloseTo(0.05);
    expect(hole?.bornTick).toBeDefined();
    expect(hole?.x1).toBeDefined();
    expect(hole?.roomA).toBe('solo.cabin');
  });

  it('models the live breach as a puncture first', () => {
    const world = shootNorth(soloWithShooter());
    const models = breachModelsOf(world);
    expect(models).toHaveLength(1);
    expect(models[0]?.sizeClass).toBe('puncture');
  });

  it('flags breach growth as a portal delta', () => {
    const before = snapshotPortalsOf(shootNorth(soloWithShooter()));
    let world = shootNorth(soloWithShooter());
    for (let i = 0; i < 12; i += 1) world = shootNorth(world);
    const after = snapshotPortalsOf(world);
    const hole = after.find((portal) => portal.id.startsWith('breach.'));
    expect(hole?.areaM2 ?? 0).toBeGreaterThan(0.05);
    expect(diffPortals(before, after).changed.length).toBeGreaterThan(0);
  });
});
