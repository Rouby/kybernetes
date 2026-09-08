import { describe, expect, it } from 'vitest';
import { assembleWorld } from './assemble.js';
import { tryToggleDoor } from './doors.js';
import type { HullSpec } from './hullCompiler.js';
import { collidePawn, collidersForFrame, predictStep, withSnapshotStates } from './movement.js';
import type { World } from './types.js';

const DOUBLE_SPEC: HullSpec = {
  frameId: 'box',
  rooms: [
    { id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 100 },
    { id: 'b', rect: { x: 100, y: 0, w: 100, h: 100 }, volumeM3: 100 },
  ],
  portals: [
    {
      id: 'door_ab',
      roomA: 'a',
      roomB: 'b',
      kind: 'door',
      segment: { x1: 100, y1: 40, x2: 100, y2: 60 },
      areaM2: 2,
    },
  ],
};

function boxWorld(): World {
  return assembleWorld([{ frameId: 'box', hull: DOUBLE_SPEC }]);
}

describe('client prediction parity', () => {
  it('moves freely with no colliders', () => {
    expect(predictStep({ x: 30, y: 50 }, 12, { x: 40, y: 50 }, [])).toEqual({ x: 40, y: 50 });
  });

  it('stops at walls while preserving slide', () => {
    const wall = { id: 'w', x1: 50, y1: 0, x2: 50, y2: 100, isOpaque: true as const };
    const stopped = predictStep({ x: 30, y: 50 }, 12, { x: 70, y: 60 }, [wall]);
    expect(stopped.x).toBeCloseTo(38, 0);
    expect(stopped.y).toBeGreaterThan(50);
  });

  it('matches collidePawn from the pawn pose', () => {
    const world = boxWorld();
    const pawnId = 'p1';
    const spawned = {
      ...world,
      pawns: {
        ...world.pawns,
        [pawnId]: {
          id: pawnId,
          owner: pawnId,
          frameId: 'box',
          roomHint: 'box.a',
          pos: { x: 30, y: 50 },
          vel: { x: 0, y: 0 },
          facing: 0,
          radius: 12,
          speed: 200,
          health: { hp: 100, maxHp: 100, suitSealed: false, incapacitated: false },
          color: '#fff',
          transferCooldownUntilTick: 0,
          say: '',
          sayUntilTick: 0,
        },
      },
    };
    const pawn = spawned.pawns[pawnId];
    if (pawn === undefined) throw new Error('missing pawn');
    const wall = { id: 'w', x1: 50, y1: 0, x2: 50, y2: 100, isOpaque: true as const };
    expect(collidePawn(pawn, { x: 70, y: 60 }, [wall])).toEqual(
      predictStep(pawn.pos, pawn.radius, { x: 70, y: 60 }, [wall])
    );
  });

  it('adds shut-door segments to frame colliders until opened', () => {
    const world = boxWorld();
    const shut = collidersForFrame(world, 'box');
    expect(shut.filter((wall) => wall.id === 'portal-shut.box.door_ab')).toHaveLength(1);
    const toggled = tryToggleDoor(world, 'box.door_ab', true, 0);
    if (!toggled.ok) throw new Error('door should open');
    const opened: World = {
      ...world,
      portals: { ...world.portals, 'box.door_ab': toggled.portal },
    };
    expect(
      collidersForFrame(opened, 'box').filter((w) => w.id.startsWith('portal-shut'))
    ).toHaveLength(0);
    const stepped = predictStep(
      { x: 80, y: 50 },
      12,
      { x: 120, y: 50 },
      collidersForFrame(opened, 'box')
    );
    expect(stepped.x).toBeGreaterThan(100);
  });

  it('overlays snapshot states so open and destroyed doors connect', () => {
    const world = boxWorld();
    const openView = withSnapshotStates(world, [{ id: 'box.door_ab', open: true, state: 'open' }]);
    expect(
      collidersForFrame(openView, 'box').filter((w) => w.id.startsWith('portal-shut'))
    ).toHaveLength(0);
    const breachedView = withSnapshotStates(world, [
      { id: 'box.door_ab', open: false, state: 'destroyed' },
    ]);
    expect(breachedView.portals['box.door_ab']?.kind).toBe('hole');
    expect(
      collidersForFrame(breachedView, 'box').filter((w) => w.id.startsWith('portal-shut'))
    ).toHaveLength(0);
  });

  it('returns the same world when snapshots change nothing', () => {
    const world = boxWorld();
    expect(withSnapshotStates(world, [])).toBe(world);
    expect(withSnapshotStates(world, [{ id: 'box.nope', open: true, state: 'open' }])).toBe(world);
  });
});
