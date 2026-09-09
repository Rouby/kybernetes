import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  isHexColor,
  isPawnTrim,
  isThrusterTint,
  normalizeAppearance,
} from './appearance.js';
import { validateClientIntent } from './validate.js';

describe('pawn appearance', () => {
  it('accepts preset trims and thrusters', () => {
    expect(isPawnTrim('ember')).toBe(true);
    expect(isPawnTrim('neon')).toBe(false);
    expect(isThrusterTint('cyan')).toBe(true);
    expect(isThrusterTint('red')).toBe(false);
    expect(isHexColor('#ffd166')).toBe(true);
    expect(isHexColor('ffd166')).toBe(false);
  });

  it('normalizes unknown presets to defaults', () => {
    expect(normalizeAppearance({ trim: 'neon', thruster: 'red' })).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ trim: 'ion', thruster: 'violet' })).toEqual({
      trim: 'ion',
      thruster: 'violet',
    });
  });

  it('validates HELLO with optional appearance', () => {
    const ok = validateClientIntent({
      v: 2,
      type: 'HELLO',
      callsign: 'Rook',
      color: '#ffd166',
      clientVersion: 2,
      trim: 'ion',
      thruster: 'amber',
    });
    expect(ok.ok).toBe(true);
    const bad = validateClientIntent({
      v: 2,
      type: 'HELLO',
      callsign: 'Rook',
      color: '#ffd166',
      clientVersion: 2,
      trim: 'neon',
    });
    expect(bad.ok).toBe(false);
  });

  it('validates RESTART and round-trips death payloads', () => {
    const restart = validateClientIntent({ v: 2, type: 'RESTART', seq: 7 });
    expect(restart.ok).toBe(true);
    const refused = validateClientIntent({ v: 2, type: 'RESTART', seq: -1 });
    expect(refused.ok).toBe(false);
    const death = {
      type: 'DEATH',
      v: 2,
      tick: 120,
      serverTimeMs: 1000,
      pawnId: 'pawn:u-1',
      cause: 'vacuum',
    };
    expect(JSON.parse(JSON.stringify(death)).cause).toBe('vacuum');
  });
});
