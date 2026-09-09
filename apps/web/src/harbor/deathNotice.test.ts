import type { VitalsBroadcast } from '@kybernetes/protocol';
import { describe, expect, it, vi } from 'vitest';
import { deathHint, deathTitle, isDeathVitals } from './deathNotice';
import { createHarborCaches, handleMessage } from './useHarborSocket';

function vitals(dead: boolean, tick = 10): VitalsBroadcast {
  return {
    type: 'VITALS',
    v: 2,
    tick,
    serverTimeMs: tick * 100,
    vitals: {
      hunger: 100,
      thirst: 100,
      fatigue: 0,
      health: dead ? 0 : 100,
      hypoxia: 0,
      suitSealed: false,
      ammo: 30,
      reserve: 120,
      mags: [30, 30, 30],
      reloading: false,
      dead,
      ...(dead ? { deathCause: 'vacuum' as const } : {}),
    },
    credits: 0,
    clearance: 1,
  };
}

describe('death copy', () => {
  it('detects server-declared death from vitals', () => {
    expect(isDeathVitals(vitals(true))).toBe(true);
    expect(isDeathVitals(vitals(false))).toBe(false);
    expect(isDeathVitals(null)).toBe(false);
  });

  it('labels every death cause for the terminal', () => {
    expect(deathTitle('vacuum')).toBe('SIGNAL LOST // VACUUM EXPOSURE');
    expect(deathTitle('bleedout')).toBe('SIGNAL LOST // BLEEDOUT');
    expect(deathTitle(undefined)).toBe('SIGNAL LOST // SIGNAL LOST');
    expect(deathHint('vacuum')).toContain('Seal suit');
    expect(deathHint('starvation')).toContain('mess');
    expect(deathHint(undefined)).toContain('Restart');
  });

  it('routes DEATH broadcasts to state and the notice feed', () => {
    const caches = createHarborCaches();
    const seen: unknown[] = [];
    const setters = {
      setSnapshot: vi.fn(),
      setTelemetry: vi.fn(),
      setVitals: vi.fn(),
      setWatch: vi.fn(),
      setManifest: vi.fn(),
      setOffer: vi.fn(),
      setPawnId: vi.fn(),
      setNotices: vi.fn(),
      setDeath: vi.fn((d: unknown) => seen.push(d)),
    };
    handleMessage(
      JSON.stringify({
        type: 'DEATH',
        v: 2,
        tick: 99,
        serverTimeMs: 9900,
        pawnId: 'pawn:u1',
        cause: 'vacuum',
      }),
      caches,
      setters
    );
    expect(seen).toHaveLength(1);
    expect(setters.setNotices).toHaveBeenCalled();
  });

  it('retires the death flag when vitals report alive again', () => {
    const caches = createHarborCaches();
    const seen: unknown[] = [];
    const setters = {
      setSnapshot: vi.fn(),
      setTelemetry: vi.fn(),
      setVitals: vi.fn(),
      setWatch: vi.fn(),
      setManifest: vi.fn(),
      setOffer: vi.fn(),
      setPawnId: vi.fn(),
      setNotices: vi.fn(),
      setDeath: vi.fn((d: unknown) => seen.push(d)),
    };
    handleMessage(JSON.stringify(vitals(true, 30)), caches, setters);
    handleMessage(
      JSON.stringify({
        type: 'DEATH',
        v: 2,
        tick: 31,
        serverTimeMs: 3100,
        pawnId: 'pawn:u1',
        cause: 'vacuum',
      }),
      caches,
      setters
    );
    expect(seen).toHaveLength(1);
    handleMessage(JSON.stringify(vitals(false, 32)), caches, setters);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeNull();
  });
});
