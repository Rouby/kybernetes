import { describe, expect, it } from 'vitest';
import {
  coldReactor,
  DEFAULT_COOLANT,
  DEFAULT_RODS,
  type ReactorState,
  reactorBandFor,
  reactorOutputMw,
  reactorSpecFor,
  restartReactor,
  SCRAM_CRITICAL_MARGIN_K,
  tickReactor,
} from './reactor.js';

const DT = 0.05;

function hotTier0(seed = 7): ReactorState {
  return restartReactor(coldReactor(seed), 0);
}

function tickMany(state: ReactorState, seconds: number, tickBase = 0): ReactorState {
  let current = state;
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i += 1) {
    current = tickReactor(current, 0, DT, tickBase + i);
  }
  return current;
}

describe('reactor (M2 self-trimming)', () => {
  it('widens the nominal band per tier', () => {
    const t0 = reactorBandFor(0);
    const t2 = reactorBandFor(2);
    expect(t0.hi - t0.lo).toBeLessThan(t2.hi - t2.lo);
    expect(reactorSpecFor(1).maxOutputMw).toBeGreaterThan(reactorSpecFor(0).maxOutputMw);
  });

  it('sits cold and drift-free until lit', () => {
    const cold = coldReactor();
    expect(cold.hot).toBe(false);
    expect(tickMany(cold, 120)).toBe(cold);
    const lit = hotTier0();
    expect(lit.hot).toBe(true);
    const band = reactorBandFor(0);
    expect(lit.tempK).toBeGreaterThanOrEqual(band.lo);
    expect(lit.tempK).toBeLessThanOrEqual(band.hi);
  });

  it('relaxes disturbed trims back to the balanced defaults', () => {
    const disturbed: ReactorState = { ...hotTier0(), rods: 0.9, coolant: 0.9 };
    const settled = tickMany(disturbed, 30);
    expect(settled.rods).toBeCloseTo(DEFAULT_RODS, 1);
    expect(settled.coolant).toBeCloseTo(DEFAULT_COOLANT, 1);
  });

  it('rides out flux drift hands-off across seeds', () => {
    for (const seed of [1, 7, 42, 99]) {
      let current = hotTier0(seed);
      for (let i = 0; i < Math.round(400 / DT); i += 1) {
        current = tickReactor(current, 0, DT, i);
        expect(current.scrammed).toBe(false);
        expect(Number.isFinite(current.tempK)).toBe(true);
      }
    }
  });

  it('holds the band for a full leg on auto-trim alone', () => {
    let current = hotTier0();
    for (let i = 0; i < Math.round(300 / DT); i += 1) {
      current = tickReactor(current, 0, DT, i);
      expect(current.scrammed).toBe(false);
    }
    const band = reactorBandFor(0);
    expect(current.tempK).toBeGreaterThan(band.lo - 60);
    expect(current.tempK).toBeLessThan(band.hi + 60);
  });

  it('scrams past the critical line and restarts clean', () => {
    const band0 = reactorBandFor(0);
    let current: ReactorState = { ...hotTier0(), rods: 0, coolant: 0, tempK: band0.hi + 55 };
    let guard = 0;
    while (!current.scrammed && guard < Math.round(120 / DT)) {
      current = tickReactor(current, 0, DT, guard);
      guard += 1;
    }
    expect(current.scrammed).toBe(true);
    expect(reactorOutputMw(current, 0)).toBeGreaterThan(0);
    const back = restartReactor(current, 0);
    expect(back.scrammed).toBe(false);
    expect(back.warned).toBe(false);
    const band = reactorBandFor(0);
    expect(back.tempK).toBeGreaterThanOrEqual(band.lo);
    expect(back.tempK).toBeLessThanOrEqual(band.hi);
  });

  it('recovers a hot plant below the critical line without scramming', () => {
    const band = reactorBandFor(0);
    const hot: ReactorState = { ...hotTier0(), rods: 0, flux: 0.8, tempK: band.hi + 30 };
    const done = tickMany(hot, 30);
    expect(done.scrammed).toBe(false);
    expect(done.tempK).toBeLessThan(band.hi + SCRAM_CRITICAL_MARGIN_K);
  });

  it('ignores zero and invalid dt without NaN', () => {
    const state = hotTier0();
    expect(tickReactor(state, 0, 0, 0)).toBe(state);
    expect(tickReactor(state, 0, Number.NaN, 0)).toBe(state);
    const stepped = tickReactor(state, 0, DT, 0);
    expect(Number.isFinite(stepped.tempK)).toBe(true);
  });
});
