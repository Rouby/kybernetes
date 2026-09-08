import type { VitalsBroadcast } from '@kybernetes/protocol';
import { describe, expect, it } from 'vitest';
import { shouldFireShot } from './fireGate';

function vitals(over: Partial<VitalsBroadcast['vitals']>): VitalsBroadcast {
  return {
    type: 'VITALS',
    v: 2,
    tick: 1,
    serverTimeMs: 1,
    vitals: {
      hunger: 100,
      thirst: 100,
      fatigue: 0,
      health: 100,
      hypoxia: 0,
      suitSealed: false,
      ammo: 30,
      reserve: 120,
      mags: [30, 30, 30, 30],
      reloading: false,
      ...over,
    },
    credits: 0,
    clearance: 1,
  };
}

describe('client fire mirror', () => {
  it('fires when loaded and standing', () => {
    expect(shouldFireShot(vitals({}), true)).toBe(true);
  });

  it('withholds intents without a pawn or vitals', () => {
    expect(shouldFireShot(vitals({}), false)).toBe(false);
    expect(shouldFireShot(null, true)).toBe(false);
    expect(shouldFireShot(undefined, true)).toBe(false);
  });

  it('mirrors every server gate', () => {
    expect(shouldFireShot(vitals({ ammo: 0, mags: [] }), true)).toBe(false);
    expect(shouldFireShot(vitals({ reloading: true }), true)).toBe(false);
    expect(shouldFireShot(vitals({ health: 0 }), true)).toBe(false);
    expect(shouldFireShot(vitals({ ammo: 1 }), true)).toBe(true);
  });
});
