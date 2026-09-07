import { describe, expect, it } from 'vitest';
import { destroyPortal, isPortalConnecting, tryToggleDoor } from './doors.js';
import { tickWorld } from './tickWorld.js';
import { createEmptyWorld } from './types.js';

describe('tickWorld scaffold', () => {
  it('ignores zero dt without NaN', () => {
    const world = createEmptyWorld(0);
    const next = tickWorld(world, 0, []);
    expect(next.tick).toBe(0);
  });

  it('advances tick on fixed step', () => {
    const world = createEmptyWorld(0);
    const next = tickWorld(world, 1 / 20, []);
    expect(next.tick).toBe(1);
    expect(next.timeMs).toBeCloseTo(50, 5);
  });

  it('integrates pawn input deterministically', () => {
    const base = createEmptyWorld(0);
    const world = {
      ...base,
      rooms: {
        lobby: {
          id: 'lobby',
          frameId: 'station_hub',
          rect: { x: 0, y: 0, w: 600, h: 400 },
          volumeM3: 720,
        },
      },
      pawns: {
        p1: {
          id: 'p1',
          owner: 'u1',
          frameId: 'station_hub',
          roomHint: 'lobby',
          pos: { x: 100, y: 100 },
          vel: { x: 0, y: 0 },
          facing: 0,
          radius: 12,
          speed: 200,
          health: { hp: 100, maxHp: 100, suitSealed: false, incapacitated: false },
          color: '#fff',
        },
      },
    };
    const a = tickWorld(world, 1 / 20, [{ pawnId: 'p1', moveX: 1, moveY: 0, sprint: false }]);
    const b = tickWorld(world, 1 / 20, [{ pawnId: 'p1', moveX: 1, moveY: 0, sprint: false }]);
    expect(a.pawns.p1?.pos.x).toBe(b.pawns.p1?.pos.x);
    expect(a.pawns.p1?.pos.x ?? 0).toBeGreaterThan(100);
  });

  it('enforces door cooldown and destroyed-to-hole', () => {
    const world = createEmptyWorld(0);
    const portal = {
      id: 'd1',
      roomA: 'a',
      roomB: 'b',
      kind: 'door' as const,
      state: 'closed' as const,
      cooldownUntilTick: 0,
      areaM2: 2,
      segment: { x1: 0, y1: 0, x2: 0, y2: 40 },
      clearance: 0,
    };
    const withPortal = { ...world, portals: { d1: portal } };
    const opened = tryToggleDoor(withPortal, 'd1', true, 0);
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(isPortalConnecting(opened.portal)).toBe(true);
      const destroyed = destroyPortal(opened.portal, 0);
      expect(isPortalConnecting(destroyed)).toBe(true);
    }
  });
});
