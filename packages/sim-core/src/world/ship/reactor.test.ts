import { describe, expect, it } from 'vitest';
import {
  coldReactor,
  type ReactorState,
  reactorBandFor,
  reactorOutputMw,
  reactorSpecFor,
  restartReactor,
  tickReactor,
  tuneReactor,
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

/** Scripted operator: nudge trims back toward band center once per second. */
function balancePolicy(state: ReactorState, tick: number): ReactorState {
  if (tick % 20 !== 0) return state;
  const band = reactorBandFor(0);
  if (state.tempK > band.hi - 10) return tuneReactor(state, 0.1, 0.1);
  if (state.tempK < band.lo + 10) return tuneReactor(state, -0.1, -0.1);
  return state;
}

describe('reactor (M2 two-dial balance)', () => {
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

  it('clamps console trims to 0-1 and ignores garbage', () => {
    const tuned = tuneReactor(hotTier0(), 5, -5);
    expect(tuned.rods).toBe(1);
    expect(tuned.coolant).toBe(0);
    expect(tuneReactor(tuned, Number.NaN, 0)).toBe(tuned);
  });

  it('drifts out of band unattended within a leg', () => {
    let current = hotTier0();
    let warnedAt = -1;
    for (let i = 0; i < Math.round(150 / DT); i += 1) {
      current = tickReactor(current, 0, DT, i);
      if (current.warned && warnedAt < 0) warnedAt = i * DT;
      if (current.scrammed) break;
    }
    expect(warnedAt).toBeGreaterThanOrEqual(0);
    expect(warnedAt).toBeLessThanOrEqual(150);
  });

  it('holds the band for a full leg under a simple policy', () => {
    let current = hotTier0();
    for (let i = 0; i < Math.round(300 / DT); i += 1) {
      current = balancePolicy(current, i);
      current = tickReactor(current, 0, DT, i);
      expect(current.scrammed).toBe(false);
    }
    const band = reactorBandFor(0);
    expect(current.tempK).toBeGreaterThan(band.lo - 60);
    expect(current.tempK).toBeLessThan(band.hi + 60);
  });

  it('scrams past the critical line and restarts clean', () => {
    let current = tuneReactor(hotTier0(), -1, -1);
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

  it('scrams on sustained overheat below the critical line', () => {
    const band = reactorBandFor(0);
    const simmering: ReactorState = { ...tuneReactor(hotTier0(), -1, 0), tempK: band.hi + 1 };
    const done = tickMany(simmering, 16);
    expect(done.scrammed).toBe(true);
  });

  it('ignores zero and invalid dt without NaN', () => {
    const state = hotTier0();
    expect(tickReactor(state, 0, 0, 0)).toBe(state);
    expect(tickReactor(state, 0, Number.NaN, 0)).toBe(state);
    const stepped = tickReactor(state, 0, DT, 0);
    expect(Number.isFinite(stepped.tempK)).toBe(true);
  });
});
