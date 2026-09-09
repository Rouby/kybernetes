import { describe, expect, it } from 'vitest';
import { roomContainingPoint } from './crew.js';
import { roomAt } from './schedule.js';
import { createEmptyWorld, type World } from './types.js';

function twoRoomWorld(): World {
  return {
    ...createEmptyWorld(0),
    rooms: {
      r1: { id: 'r1', frameId: 'ship', rect: { x: 0, y: 0, w: 10, h: 10 }, volumeM3: 10 },
      r2: { id: 'r2', frameId: 'station', rect: { x: 0, y: 0, w: 10, h: 10 }, volumeM3: 10 },
    },
  };
}

describe('roomAt', () => {
  it('finds the room containing a frame-local point', () => {
    expect(roomAt(twoRoomWorld(), 'ship', 5, 5)).toBe('r1');
  });

  it('scopes matches to the requested frame', () => {
    expect(roomAt(twoRoomWorld(), 'station', 5, 5)).toBe('r2');
    expect(roomAt(twoRoomWorld(), 'unknown', 5, 5)).toBeUndefined();
  });

  it('treats room bounds as edge-inclusive', () => {
    expect(roomAt(twoRoomWorld(), 'ship', 0, 0)).toBe('r1');
    expect(roomAt(twoRoomWorld(), 'ship', 10, 10)).toBe('r1');
  });

  it('returns undefined outside every room', () => {
    expect(roomAt(twoRoomWorld(), 'ship', 11, 5)).toBeUndefined();
  });

  it('roomContainingPoint delegates to the same lookup', () => {
    const world = twoRoomWorld();
    for (const [frameId, x, y] of [
      ['ship', 5, 5],
      ['station', 5, 5],
      ['ship', 11, 5],
    ] as const) {
      expect(roomContainingPoint(world, frameId, x, y)).toBe(roomAt(world, frameId, x, y));
    }
  });
});
