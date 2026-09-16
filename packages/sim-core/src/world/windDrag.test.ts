import { describe, expect, it } from 'vitest';
import { addPuncture, bindAirFrame, createAirAuthority, sampleRoomWind } from './airAuthority.js';
import { assembleWorld, spawnPawn } from './assemble.js';
import type { HullSpec } from './hullCompiler.js';
import { pawnDragOffset } from './movement.js';
import { tickWorld } from './tickWorld.js';

const CABIN_SPEC: HullSpec = {
  frameId: 'box',
  rooms: [{ id: 'cabin', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 26000 }],
  portals: [],
};

const PAIR_SPEC: HullSpec = {
  frameId: 'box',
  rooms: [
    { id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 }, volumeM3: 500 },
    { id: 'b', rect: { x: 100, y: 0, w: 100, h: 100 }, volumeM3: 500 },
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

describe('room wind orientation', () => {
  it('inverts the contribution for the B side of a portal', () => {
    const world = assembleWorld([{ frameId: 'box', hull: PAIR_SPEC }]);
    const auth = createAirAuthority();
    bindAirFrame(
      auth,
      'box',
      Object.values(world.rooms).filter((r) => r.frameId === 'box'),
      Object.values(world.portals).filter((p) => p.id.startsWith('box.'))
    );
    const frame = auth.sims.get('box');
    const door = frame?.portals.get('box.door_ab');
    if (door === undefined) throw new Error('missing door');
    door.openRatio = 1;
    door.velocity = 5;
    const windA = sampleRoomWind(auth, 'box', 'box.a');
    const windB = sampleRoomWind(auth, 'box', 'box.b');
    expect(Math.hypot(windA.x, windA.y)).toBeGreaterThan(0.1);
    expect(windB.x).toBeCloseTo(-windA.x, 6);
    expect(windB.y).toBeCloseTo(-windA.y, 6);
  });
});

describe('breach wind drag', () => {
  it('drags a still pawn toward the breach aperture', () => {
    let world = assembleWorld([{ frameId: 'box', hull: CABIN_SPEC }]);
    const auth = createAirAuthority();
    bindAirFrame(
      auth,
      'box',
      Object.values(world.rooms).filter((r) => r.frameId === 'box'),
      Object.values(world.portals).filter((p) => p.id.startsWith('box.'))
    );
    expect(addPuncture(auth, 'box', 'box.cabin', 1.5)).toBeDefined();
    world = spawnPawn(world, {
      id: 'p1',
      owner: 'p1',
      frameId: 'box',
      roomId: 'box.cabin',
      x: 60,
      y: 50,
      color: '#fff',
    });
    const start = world.pawns.p1?.pos ?? { x: 60, y: 50 };
    for (let i = 0; i < 40; i += 1) world = tickWorld(world, 0.05, [], auth);
    const end = world.pawns.p1?.pos ?? start;
    expect(end.x).toBeLessThan(start.x - 0.5);
    expect(end.y).toBeLessThan(start.y);
    expect(Number.isFinite(end.x) && Number.isFinite(end.y)).toBe(true);
  });

  it('holds position in still air without a breach', () => {
    let world = assembleWorld([{ frameId: 'box', hull: CABIN_SPEC }]);
    const auth = createAirAuthority();
    bindAirFrame(
      auth,
      'box',
      Object.values(world.rooms).filter((r) => r.frameId === 'box'),
      Object.values(world.portals).filter((p) => p.id.startsWith('box.'))
    );
    world = spawnPawn(world, {
      id: 'p1',
      owner: 'p1',
      frameId: 'box',
      roomId: 'box.cabin',
      x: 60,
      y: 50,
      color: '#fff',
    });
    const start = world.pawns.p1?.pos ?? { x: 60, y: 50 };
    for (let i = 0; i < 20; i += 1) world = tickWorld(world, 0.05, [], auth);
    const end = world.pawns.p1?.pos ?? start;
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.y).toBeCloseTo(start.y, 6);
  });

  it('computes F = 1/2 rho v^2 Cd A as a finite offset', () => {
    const offset = pawnDragOffset({ x: 10, y: 0 }, 1.2, 0.05);
    expect(Number.isFinite(offset.x)).toBe(true);
    expect(offset.x).toBeGreaterThan(0);
    expect(pawnDragOffset({ x: 0, y: 0 }, 1.2, 0.05)).toEqual({ x: 0, y: 0 });
  });
});
