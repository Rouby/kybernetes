import { describe, expect, it } from 'vitest';
import { coldEngine } from './engine.js';
import {
  cancelLeg,
  DOCKED_NAV,
  DOCKING_S,
  isUnderway,
  legDurationSeconds,
  type NavState,
  plotCourse,
  resetLegTo,
  SPOOL_S,
  tickNavLeg,
} from './navTransit.js';

const DT = 0.05;
const POWERED = { hot: true, powered: true, fuelCells: 1 };

function tickMany(
  nav: NavState,
  seconds: number,
  engine: { spool: number; tune: number },
  fuel: number
) {
  let current = nav;
  let fuelCells = fuel;
  const full = { ...coldEngine(), spool: engine.spool, tune: engine.tune };
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i += 1) {
    const stepped = tickNavLeg(current, full, { hot: true, scrammed: false }, 0, fuelCells, DT);
    current = stepped.nav;
    fuelCells = stepped.fuelCells;
  }
  return { nav: current, fuelCells };
}

function plotted(): NavState {
  const result = plotCourse(DOCKED_NAV, 'hub_b', POWERED);
  if (!('nav' in result)) throw new Error('plot should succeed');
  return result.nav;
}

describe('nav legs (M3 plot to dock)', () => {
  it('rejects bad plots with named reasons', () => {
    expect(plotCourse(DOCKED_NAV, 'hub_b', POWERED)).toMatchObject({ nav: { phase: 'spooling' } });
    expect(plotCourse(plotted(), 'hub_b', POWERED)).toEqual({ reject: 'already-underway' });
    expect(plotCourse(DOCKED_NAV, 'nowhere', POWERED)).toEqual({ reject: 'unknown-hub' });
    expect(plotCourse(DOCKED_NAV, 'hub_a', POWERED)).toEqual({ reject: 'same-hub' });
    expect(plotCourse(DOCKED_NAV, 'hub_b', { hot: false, powered: true, fuelCells: 1 })).toEqual({
      reject: 'no-power',
    });
    expect(plotCourse(DOCKED_NAV, 'hub_b', { hot: true, powered: true, fuelCells: 0 })).toEqual({
      reject: 'no-fuel',
    });
    const first = plotted();
    const second = plotCourse({ ...DOCKED_NAV, legId: first.legId }, 'hub_b', POWERED);
    if (!('nav' in second)) throw new Error('replot should succeed');
    expect(second.nav.legId).toBe(first.legId + 1);
  });

  it('holds spooling without power and burns fuel on departure', () => {
    const scored = tickNavLeg(
      plotted(),
      { ...coldEngine(), spool: 1 },
      { hot: false, scrammed: false },
      0,
      1,
      DT
    );
    expect(scored.nav.phase).toBe('spooling');
    const departed = tickMany(plotted(), SPOOL_S + 1, { spool: 1, tune: 1 }, 1);
    expect(departed.nav.phase).toBe('in_transit');
    expect(departed.nav.remainingS).toBeLessThanOrEqual(legDurationSeconds(0));
    expect(departed.fuelCells).toBe(0);
  });

  it('waits for spool before departing', () => {
    const waiting = tickMany(plotted(), SPOOL_S + 5, { spool: 0.2, tune: 1 }, 1);
    expect(waiting.nav.phase).toBe('spooling');
    expect(waiting.nav.remainingS).toBe(0);
  });

  it('freezes the clock on scram and flameout', () => {
    const underway = tickMany(plotted(), SPOOL_S + 1, { spool: 1, tune: 1 }, 1).nav;
    const frozen = tickNavLeg(
      underway,
      { ...coldEngine(), spool: 1 },
      { hot: true, scrammed: true },
      0,
      0,
      DT
    );
    expect(frozen.nav.remainingS).toBe(underway.remainingS);
    const flamed = tickNavLeg(
      { ...underway, flameout: true },
      { ...coldEngine(), spool: 1 },
      { hot: true, scrammed: false },
      0,
      0,
      DT
    );
    expect(flamed.nav.remainingS).toBe(underway.remainingS);
  });

  it('burns extra fuel for detuned engines and flames out dry', () => {
    const leg = plotted();
    const half = SPOOL_S + 1 + legDurationSeconds(0) * 0.9;
    const toHalf = tickMany(leg, half, { spool: 1, tune: 0.1 }, 2);
    expect(toHalf.nav.extraBurned).toBe(true);
    expect(toHalf.fuelCells).toBe(0);
    const dry = tickMany(leg, half, { spool: 1, tune: 0.1 }, 1);
    expect(dry.nav.flameout).toBe(true);
    expect(isUnderway(dry.nav)).toBe(true);
  });

  it('docks at the destination hub with a fresh leg state', () => {
    const arrived = tickMany(
      plotted(),
      SPOOL_S + 1 + legDurationSeconds(0) + DOCKING_S + 2,
      { spool: 1, tune: 1 },
      1
    );
    expect(arrived.nav.phase).toBe('docked');
    expect(arrived.nav.portHubId).toBe('hub_b');
    expect(arrived.nav.destHubId).toBeUndefined();
    expect(arrived.nav.flameout).toBe(false);
    expect(isUnderway(arrived.nav)).toBe(false);
  });

  it('cancels only while spooling and resets tows home', () => {
    expect(cancelLeg(plotted()).phase).toBe('docked');
    const underway = tickMany(plotted(), SPOOL_S + 1, { spool: 1, tune: 1 }, 1).nav;
    expect(cancelLeg(underway)).toBe(underway);
    const towed = resetLegTo({ ...underway, flameout: true }, 'hub_a');
    expect(towed.phase).toBe('docked');
    expect(towed.portHubId).toBe('hub_a');
    expect(resetLegTo(underway, 'nowhere')).toBe(underway);
  });

  it('ignores invalid ticks', () => {
    const nav = plotted();
    const idle = { ...coldEngine(), spool: 1 };
    const power = { hot: true, scrammed: false };
    expect(tickNavLeg(nav, idle, power, 0, 1, 0).nav).toBe(nav);
    expect(tickNavLeg(nav, idle, power, 0, 1, Number.NaN).nav).toBe(nav);
  });
});
