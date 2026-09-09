import type { ClientIntent } from '@kybernetes/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireOnce } from './sessionFire';

vi.mock('../audio/ShipAudioEngine', () => ({
  ShipAudioEngine: { getInstance: () => ({ playWeaponFire: vi.fn() }) },
}));

function refs() {
  return {
    shots: { current: [] as never[] },
    shotId: { current: 0 },
    fireSignal: { current: 0 },
  };
}

function liveSocket() {
  return {
    pawnId: 'pawn:u1',
    snapshot: { pawns: [{ id: 'pawn:u1', frameId: 'ship', x: 1, y: 2 }] },
    vitals: {
      credits: 0,
      vitals: {
        health: 100,
        hypoxia: 0,
        suitSealed: false,
        hunger: 100,
        ammo: 30,
        reserve: 120,
        mags: [30, 30, 30],
        reloading: false,
      },
    },
  } as never;
}

describe('fireOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores fire without a live pawn', () => {
    const sent: ClientIntent[] = [];
    const r = refs();
    fireOnce(
      { pawnId: 'pawn:u1', snapshot: { pawns: [] }, vitals: null } as never,
      null,
      0,
      (intent) => {
        sent.push(intent);
      },
      r.shots as never,
      r.shotId as never,
      r.fireSignal as never
    );
    expect(sent).toEqual([]);
    expect(r.fireSignal.current).toBe(0);
  });

  it('fires one predicted round and signals', () => {
    const sent: ClientIntent[] = [];
    const r = refs();
    fireOnce(
      liveSocket(),
      { x: 1, y: 2, facing: 0 },
      0.5,
      (intent) => {
        sent.push(intent);
      },
      r.shots as never,
      r.shotId as never,
      r.fireSignal as never
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'FIRE' });
    expect(r.fireSignal.current).toBe(1);
    expect(r.shotId.current).toBe(1);
    expect(r.shots.current).toHaveLength(1);
  });
});
