/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { bassSwap, crossfadeLevels, DJ_OUTPUT_LEVEL, tempoGlide } from '../djTransition';
import {
  FREAKY_MAIN_TRACK,
  IRON_CHAPEL_TRACK,
  RAVE_99_TRACK,
  TECHNO_TRACKS,
  trackById,
} from './technoTracks';

describe('technoTracks registry', () => {
  it('saves three songs with distinct identities', () => {
    expect(TECHNO_TRACKS).toHaveLength(3);
    expect(FREAKY_MAIN_TRACK.id).toBe('freaky-main');
    expect(IRON_CHAPEL_TRACK.id).toBe('iron-chapel');
    expect(RAVE_99_TRACK.id).toBe('rave-99');
    expect(FREAKY_MAIN_TRACK.bpm).toBe(144);
    expect(IRON_CHAPEL_TRACK.bpm).toBe(140);
    expect(RAVE_99_TRACK.bpm).toBe(138);
    expect(RAVE_99_TRACK.bassStride).toBe(4);
    expect(RAVE_99_TRACK.bassPhase).toBe(2);
  });

  it('keeps every pattern array at loop shape', () => {
    for (const track of TECHNO_TRACKS) {
      expect(track.bassOffsets).toHaveLength(32);
      expect(track.leadOffsets).toHaveLength(16);
      expect(track.stabMidis.length).toBeGreaterThan(0);
      expect(track.chops.length).toBeGreaterThan(0);
    }
  });

  it('falls back to the main track for unknown ids', () => {
    expect(trackById('iron-chapel')).toBe(IRON_CHAPEL_TRACK);
    expect(trackById('nope')).toBe(FREAKY_MAIN_TRACK);
  });
});

describe('djTransition curves', () => {
  it('crossfades equal-power between full deck levels', () => {
    expect(crossfadeLevels(0)[0]).toBeCloseTo(DJ_OUTPUT_LEVEL, 9);
    expect(crossfadeLevels(1)[1]).toBeCloseTo(DJ_OUTPUT_LEVEL, 9);
    expect(crossfadeLevels(0)[1]).toBe(0);
    expect(crossfadeLevels(1)[0]).toBeCloseTo(0, 9);
    const [out, incoming] = crossfadeLevels(0.5);
    expect(out).toBeCloseTo(incoming, 9);
    expect(out * out + incoming * incoming).toBeCloseTo(DJ_OUTPUT_LEVEL * DJ_OUTPUT_LEVEL, 9);
  });

  it('swaps basslines at the phrase midpoint', () => {
    expect(bassSwap(0)).toEqual([0, 1]);
    expect(bassSwap(0.4)).toEqual([0, 1]);
    const mid = bassSwap(0.575);
    expect(mid[0]).toBeCloseTo(0.5, 9);
    expect(mid[1]).toBeCloseTo(0.5, 9);
    expect(bassSwap(0.7)).toEqual([1, 0]);
    expect(bassSwap(1)).toEqual([1, 0]);
  });

  it('clamps outside the blend and glides tempo home', () => {
    expect(crossfadeLevels(-1)).toEqual(crossfadeLevels(0));
    expect(crossfadeLevels(2)).toEqual(crossfadeLevels(1));
    expect(tempoGlide(144 / 140, 0)).toBeCloseTo(144 / 140, 9);
    expect(tempoGlide(144 / 140, 1)).toBe(1);
  });
});
