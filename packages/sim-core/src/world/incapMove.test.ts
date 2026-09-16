import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import { ensureBot, tickBots } from './bots.js';
import type { HullSpec } from './hullCompiler.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

const SPEC: HullSpec = {
  frameId: 'box',
  rooms: [{ id: 'cabin', rect: { x: 0, y: 0, w: 200, h: 200 }, volumeM3: 500 }],
  portals: [],
};

function liveWorld(): World {
  const assembled = assembleWorld([{ frameId: 'box', hull: SPEC }]);
  return spawnPawn(assembled, {
    id: 'p1',
    owner: 'p1',
    frameId: 'box',
    roomId: 'box.cabin',
    x: 100,
    y: 100,
    color: '#fff',
  });
}

function downWorld(hp: number, incapacitated: boolean): World {
  const world = liveWorld();
  const pawn = world.pawns.p1;
  if (pawn === undefined) throw new Error('missing pawn');
  return {
    ...world,
    pawns: { ...world.pawns, p1: { ...pawn, health: { ...pawn.health, hp, incapacitated } } },
  };
}

describe('downed pawns hold position', () => {
  it('ignores drive input when dead', () => {
    const start = downWorld(0, true).pawns.p1?.pos;
    const next = tickWorld(downWorld(0, true), 0.05, [
      { pawnId: 'p1', moveX: 1, moveY: 0, sprint: false },
    ]);
    expect(next.pawns.p1?.pos).toEqual(start);
    expect(next.pawns.p1?.vel).toEqual({ x: 0, y: 0 });
  });

  it('ignores drive input when incapacitated', () => {
    const start = downWorld(50, true).pawns.p1?.pos;
    const next = tickWorld(downWorld(50, true), 0.05, [
      { pawnId: 'p1', moveX: 0, moveY: 1, sprint: true },
    ]);
    expect(next.pawns.p1?.pos).toEqual(start);
    expect(next.pawns.p1?.vel).toEqual({ x: 0, y: 0 });
  });

  it('emits no bot inputs when down', () => {
    let world = ensureBot(liveWorld(), 'p1');
    const pawn = world.pawns.p1;
    if (pawn === undefined) throw new Error('missing pawn');
    world = {
      ...world,
      pawns: {
        ...world.pawns,
        p1: { ...pawn, health: { ...pawn.health, hp: 0, incapacitated: true } },
      },
    };
    expect(tickBots(world).inputs).toEqual([]);
    const start = world.pawns.p1?.pos;
    expect(tickWorld(world, 0.05, []).pawns.p1?.pos).toEqual(start);
  });
});
