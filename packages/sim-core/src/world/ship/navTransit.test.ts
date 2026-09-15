import { describe, expect, it } from 'vitest';
import { plotChartCourse } from './chart.js';
import { coldEngine } from './engine.js';
import {
  cancelLeg,
  clampThrust01,
  DOCKED_NAV,
  DOCKING_S,
  HAIL_WAIT_S,
  hailForRescue,
  hopBaseS,
  hopFrom,
  hopScaledS,
  hopTo,
  isUnderway,
  legDurationSeconds,
  type NavState,
  plotCourse,
  resetLegTo,
  SPOOL_S,
  thrustBurnCells,
  thrustTimeFactor,
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

describe('thrust throttle', () => {
  it('clamps raw throttle into the flyable band', () => {
    expect(clampThrust01(1)).toBe(1);
    expect(clampThrust01(0.5)).toBe(0.5);
    expect(clampThrust01(0)).toBe(0.1);
    expect(clampThrust01(5)).toBe(1);
    expect(clampThrust01(Number.NaN)).toBe(1);
    expect(thrustTimeFactor(1)).toBe(1);
    expect(thrustTimeFactor(0.25)).toBe(2);
    expect(thrustBurnCells(0, 1)).toBe(1);
    expect(thrustBurnCells(0, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('scales leg clocks and fractional burns at half thrust', () => {
    expect(hopScaledS('hub_a', 'hub_b', 0, 0.5)).toBe(Math.round(150 / Math.SQRT1_2));
    expect(hopScaledS('hub_a', 'hub_b', 0, 1)).toBe(150);
    const plotted = plotChartCourse(DOCKED_NAV, ['hub_b'], POWERED, 0.5);
    if (!('nav' in plotted)) throw new Error('half-thrust plot should succeed');
    expect(plotted.nav.thrust01).toBe(0.5);
    expect(
      plotChartCourse(DOCKED_NAV, ['hub_b'], { hot: true, powered: true, fuelCells: 0.4 }, 0.5)
    ).toEqual({ reject: 'no-fuel' });
    const flown = tickMany(plotted.nav, SPOOL_S + 2, { spool: 1, tune: 1 }, 2);
    expect(flown.nav.phase).toBe('in_transit');
    expect(flown.fuelCells).toBe(1.5);
    expect(flown.nav.remainingS).toBeLessThanOrEqual(Math.round(150 / Math.SQRT1_2));
    expect(flown.nav.remainingS).toBeGreaterThan(200);
  });
});

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

  it('names hop endpoints across a stop chain', () => {
    const result = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], POWERED);
    if (!('nav' in result)) throw new Error('chain plot should succeed');
    expect(hopFrom(result.nav)).toBe('hub_a');
    expect(hopTo(result.nav)).toBe('poi_kestrel');
    expect(hopBaseS('hub_a', 'poi_kestrel', 0)).toBe(60);
    expect(hopBaseS('poi_kestrel', 'hub_b', 0)).toBe(120);
    expect(hopBaseS('hub_a', 'hub_b', 2)).toBe(80);
  });

  it('flies hop by hop, burning one cell per hop', () => {
    const plotted = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], POWERED);
    if (!('nav' in plotted)) throw new Error('chain plot should succeed');
    const departed = tickMany(plotted.nav, SPOOL_S + 1, { spool: 1, tune: 1 }, 2);
    expect(departed.nav.phase).toBe('in_transit');
    expect(departed.nav.legIndex).toBe(0);
    expect(departed.nav.remainingS).toBeLessThanOrEqual(60);
    expect(departed.fuelCells).toBe(1);
    const advanced = tickMany(plotted.nav, SPOOL_S + 1 + 70, { spool: 1, tune: 1 }, 2);
    expect(advanced.nav.legIndex).toBe(1);
    expect(advanced.nav.remainingS).toBeLessThanOrEqual(120);
    expect(advanced.fuelCells).toBe(0);
    expect(hopFrom(advanced.nav)).toBe('poi_kestrel');
    expect(hopTo(advanced.nav)).toBe('hub_b');
  });

  it('docks at the final hub with cleared stops', () => {
    const plotted = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], POWERED);
    if (!('nav' in plotted)) throw new Error('chain plot should succeed');
    const arrived = tickMany(
      plotted.nav,
      SPOOL_S + 2 + 60 + 120 + DOCKING_S + 2,
      { spool: 1, tune: 1 },
      2
    );
    expect(arrived.nav.phase).toBe('docked');
    expect(arrived.nav.portHubId).toBe('hub_b');
    expect(arrived.nav.stops).toEqual([]);
    expect(arrived.nav.legIndex).toBe(0);
  });

  it('holds at a POI terminus with a POI port', () => {
    const plotted = plotChartCourse(DOCKED_NAV, ['poi_kestrel'], POWERED);
    if (!('nav' in plotted)) throw new Error('visit plot should succeed');
    const arrived = tickMany(
      plotted.nav,
      SPOOL_S + 2 + 60 + DOCKING_S + 2,
      { spool: 1, tune: 1 },
      1
    );
    expect(arrived.nav.phase).toBe('docked');
    expect(arrived.nav.portHubId).toBe('poi_kestrel');
    expect(arrived.nav.destHubId).toBeUndefined();
    expect(arrived.nav.stops).toEqual([]);
  });

  it('flames out between stops when the next hop runs dry', () => {
    const plotted = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], POWERED);
    if (!('nav' in plotted)) throw new Error('chain plot should succeed');
    const dry = tickMany(plotted.nav, SPOOL_S + 1 + 70, { spool: 1, tune: 1 }, 1);
    expect(dry.nav.legIndex).toBe(1);
    expect(dry.nav.flameout).toBe(true);
    expect(dry.fuelCells).toBe(0);
  });

  it('hails a rescue drone once per stranding', () => {
    const plotted = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], POWERED);
    if (!('nav' in plotted)) throw new Error('chain plot should succeed');
    const dry = tickMany(plotted.nav, SPOOL_S + 1 + 70, { spool: 1, tune: 1 }, 1);
    expect(dry.nav.flameout).toBe(true);
    const hailed = hailForRescue(dry.nav);
    expect(hailed.hailS).toBe(HAIL_WAIT_S);
    expect(hailForRescue(hailed)).toBe(hailed);
    expect(hailForRescue(DOCKED_NAV)).toBe(DOCKED_NAV);
  });

  it('clears flameout when the hailed drone arrives', () => {
    const plotted = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], POWERED);
    if (!('nav' in plotted)) throw new Error('chain plot should succeed');
    const dry = tickMany(plotted.nav, SPOOL_S + 1 + 70, { spool: 1, tune: 1 }, 1);
    const hailed = hailForRescue(dry.nav);
    const rescued = tickMany(hailed, HAIL_WAIT_S + 1, { spool: 1, tune: 1 }, 0);
    expect(rescued.nav.flameout).toBe(false);
    expect(rescued.nav.hailS).toBe(0);
    expect(rescued.nav.phase).toBe('in_transit');
    expect(rescued.fuelCells).toBe(0);
  });

  it('burns a restored cell to resume immediately', () => {
    const plotted = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], POWERED);
    if (!('nav' in plotted)) throw new Error('chain plot should succeed');
    const dry = tickMany(plotted.nav, SPOOL_S + 1 + 70, { spool: 1, tune: 1 }, 1);
    const engine = { ...coldEngine(), spool: 1, tune: 1 };
    const hot = { hot: true, scrammed: false };
    const resumed = tickNavLeg(dry.nav, engine, hot, 0, 1, DT);
    expect(resumed.nav.flameout).toBe(false);
    expect(resumed.fuelCells).toBe(0);
    const cold = tickNavLeg(dry.nav, engine, { hot: false, scrammed: false }, 0, 1, DT);
    expect(cold.nav.flameout).toBe(true);
    expect(cold.fuelCells).toBe(1);
  });

  it('ignores invalid ticks', () => {
    const nav = plotted();
    const idle = { ...coldEngine(), spool: 1 };
    const power = { hot: true, scrammed: false };
    expect(tickNavLeg(nav, idle, power, 0, 1, 0).nav).toBe(nav);
    expect(tickNavLeg(nav, idle, power, 0, 1, Number.NaN).nav).toBe(nav);
  });
});
