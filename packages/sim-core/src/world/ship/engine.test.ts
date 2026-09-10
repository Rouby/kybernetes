import { describe, expect, it } from 'vitest';
import {
  coldEngine,
  effectiveTune,
  engineDemandMw,
  serviceEngine,
  speedFactor,
  tickEngine,
  wearEngine,
} from './engine.js';

const DT = 0.05;
const IDLE = { spoolCmd: 0 as const };
const SPOOL = { spoolCmd: 1 as const };

function tickMany(seconds: number, outputMW: number, underway: boolean, spoolCmd: 0 | 1) {
  let current = coldEngine();
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i += 1) {
    current = tickEngine(current, outputMW, underway, DT, { spoolCmd });
  }
  return current;
}

describe('engine (M2 spool and tune)', () => {
  it('refuses to spool without reactor power and flags brownout', () => {
    const stalled = tickMany(10, 0, false, 1);
    expect(stalled.spool).toBe(0);
    expect(stalled.brownout).toBe(true);
  });

  it('spools to full on T0 power within the spool-up window', () => {
    const hot = tickMany(10, 40, false, 1);
    expect(hot.spool).toBeCloseTo(1, 2);
    expect(hot.brownout).toBe(false);
  });

  it('brownouts when load outgrows output and unwinds the spool', () => {
    const full = tickMany(10, 40, false, 1);
    const starved = tickEngine(full, engineDemandMw(1) - 1, false, DT, SPOOL);
    expect(starved.brownout).toBe(true);
    expect(starved.spool).toBeLessThan(full.spool);
  });

  it('decays tune underway but holds it docked', () => {
    expect(tickMany(60, 40, true, 0).tune).toBeCloseTo(0.76, 2);
    expect(tickMany(60, 40, false, 0).tune).toBe(1);
  });

  it('clamps absolute tune sets and drops invalid ticks', () => {
    const set = tickEngine(coldEngine(), 40, false, DT, { spoolCmd: 0, tuneSet: 5 });
    expect(set.tune).toBe(1);
    const low = tickEngine(coldEngine(), 40, false, DT, { spoolCmd: 0, tuneSet: -2 });
    expect(low.tune).toBe(0);
    expect(tickEngine(coldEngine(), 40, false, 0, IDLE)).toEqual(coldEngine());
  });

  it('caps effective tune by wear until dockside service', () => {
    const worn = wearEngine(wearEngine(coldEngine(), 4), 3);
    expect(worn.wear).toBeCloseTo(1, 6);
    expect(effectiveTune(worn)).toBeCloseTo(0.5, 6);
    expect(serviceEngine(worn).wear).toBe(0);
    expect(speedFactor(coldEngine())).toBe(1);
    expect(speedFactor({ tune: 0, wear: 0 })).toBeCloseTo(0.55, 6);
  });
});
