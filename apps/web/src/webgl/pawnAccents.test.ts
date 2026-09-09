import { describe, expect, it } from 'vitest';
import { THRUSTER_PLUMES, TRIM_ACCENTS, thrusterPlume, trimAccent } from './pawnAccents';

describe('pawn accents', () => {
  it('maps every trim preset to a visible RGB', () => {
    for (const trim of ['ember', 'ion', 'verdant', 'mono'] as const) {
      const rgb = trimAccent(trim);
      expect(rgb).toEqual(TRIM_ACCENTS[trim]);
      expect(rgb?.every((channel) => channel >= 0 && channel <= 1)).toBe(true);
    }
  });

  it('keeps legacy role colors for unknown trims', () => {
    expect(trimAccent(undefined)).toBeUndefined();
    expect(trimAccent('neon')).toBeUndefined();
    expect(trimAccent(42)).toBeUndefined();
  });

  it('tints thruster plumes with a cyan fallback', () => {
    expect(thrusterPlume('amber')).toEqual(THRUSTER_PLUMES.amber);
    expect(thrusterPlume('violet')).toEqual(THRUSTER_PLUMES.violet);
    expect(thrusterPlume('white')).toEqual(THRUSTER_PLUMES.white);
    expect(thrusterPlume('cyan')).toEqual(THRUSTER_PLUMES.cyan);
    expect(thrusterPlume(undefined)).toEqual(THRUSTER_PLUMES.cyan);
    expect(thrusterPlume('red')).toEqual(THRUSTER_PLUMES.cyan);
  });
});
