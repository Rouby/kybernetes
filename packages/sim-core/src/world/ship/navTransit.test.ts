import { describe, expect, it } from 'vitest';
import { plotChartCourse } from './chart.js';
import { coldEngine, FUEL_PER_CELL, fuelCostForLeg, fuelRateForLeg } from './engine.js';
import {
  cancelLeg,
  clampThrust01,
  DOCKED_NAV,
  DOCKING_S,
  HAIL_WAIT_S,
  hailForRescue,
  heatBurnFuel,
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
const ONE_CELL = FUEL_PER_CELL;
const TWO_CELLS = 2 * FUEL_PER_CELL;
const POWERED = { hot: true, powered: true, engineFuel: ONE_CELL };

function tickMany(
  nav: NavState,
  seconds: number,
  engine: { spool: number; tune: number },
  fuel: number
) {
  let current = nav;
  let engineFuel = fuel;
  const full = { ...coldEngine(), spool: engine.spool, tune: engine.tune };
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i += 1) {
    const stepped = tickNavLeg(current, full, { hot: true, scrammed: false }, 0, engineFuel, DT);
    current = stepped.nav;
    engineFuel = stepped.engineFuel;
  }
  return { nav: current, engineFuel, fuelCells: engineFuel };
}

function plotted(): NavState {
  const result = plotCourse(DOCKED_NAV, 'hub_b', POWERED);
  if (!('nav' in result)) throw new Error('plot should succeed');
  return result.nav;
}

/** Fuel burned to finish hop 1 of a chain when flying with abundant fuel. */
function hopOneBurn(chain: NavState): number {
  let nav = chain;
  let fuel = TWO_CELLS;
  for (let i = 0; i < 200 && nav.legIndex === 0; i += 1) {
    const stepped = tickMany(nav, 1, { spool: 1, tune: 1 }, fuel);
    nav = stepped.nav;
    fuel = stepped.engineFuel;
  }
  if (nav.legIndex !== 1) throw new Error('chain should reach hop 2');
  return TWO_CELLS - fuel;
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

  it('scales leg clocks and fuel burns at half thrust', () => {
    expect(hopScaledS('hub_a', 'hub_b', 0, 0.5)).toBe(Math.round(150 / Math.SQRT1_2));
    expect(hopScaledS('hub_a', 'hub_b', 0, 1)).toBe(150);
    expect(fuelCostForLeg(0, 0.5, 212)).toBeLessThan(fuelCostForLeg(0, 1, 212));
    const plottedHalf = plotChartCourse(
      DOCKED_NAV,
      ['hub_b'],
      { hot: true, powered: true, engineFuel: TWO_CELLS },
      0.5
    );
    if (!('nav' in plottedHalf)) throw new Error('half-thrust plot should succeed');
    expect(plottedHalf.nav.thrust01).toBe(0.5);
    expect(
      plotChartCourse(DOCKED_NAV, ['hub_b'], { hot: true, powered: true, engineFuel: 100 }, 0.5)
    ).toEqual({ reject: 'no-fuel' });
    const first = tickNavLeg(
      plottedHalf.nav,
      { ...coldEngine(), spool: 1 },
      { hot: true, scrammed: false },
      0,
      TWO_CELLS,
      DT
    );
    expect(first.nav.phase).toBe('in_transit');
    expect(first.engineFuel).toBe(TWO_CELLS);
    const flown = tickMany(plottedHalf.nav, SPOOL_S + 2, { spool: 1, tune: 1 }, TWO_CELLS);
    expect(flown.nav.phase).toBe('in_transit');
    expect(flown.engineFuel).toBeCloseTo(TWO_CELLS - fuelRateForLeg(0, 0.5) * (2 - DT), 6);
    const longer = tickMany(plottedHalf.nav, SPOOL_S + 6, { spool: 1, tune: 1 }, TWO_CELLS);
    expect(longer.engineFuel).toBeLessThan(flown.engineFuel);
    expect(flown.nav.remainingS).toBeLessThanOrEqual(Math.round(150 / Math.SQRT1_2) + 40);
    expect(flown.nav.remainingS).toBeGreaterThan(20);
  });
});

describe('nav legs (M3 plot to dock)', () => {
  it('rejects bad plots with named reasons', () => {
    expect(plotCourse(DOCKED_NAV, 'hub_b', POWERED)).toMatchObject({ nav: { phase: 'spooling' } });
    expect(plotCourse(plotted(), 'hub_b', POWERED)).toEqual({ reject: 'already-underway' });
    expect(plotCourse(DOCKED_NAV, 'nowhere', POWERED)).toEqual({ reject: 'unknown-hub' });
    expect(plotCourse(DOCKED_NAV, 'hub_a', POWERED)).toEqual({ reject: 'same-hub' });
    expect(
      plotCourse(DOCKED_NAV, 'hub_b', { hot: false, powered: true, engineFuel: ONE_CELL })
    ).toEqual({
      reject: 'no-power',
    });
    expect(plotCourse(DOCKED_NAV, 'hub_b', { hot: true, powered: true, engineFuel: 0 })).toEqual({
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
      ONE_CELL,
      DT
    );
    expect(scored.nav.phase).toBe('spooling');
    const departed = tickMany(plotted(), SPOOL_S + 1, { spool: 1, tune: 1 }, ONE_CELL);
    expect(departed.nav.phase).toBe('in_transit');
    expect(departed.nav.remainingS).toBeLessThanOrEqual(legDurationSeconds(0));
    expect(departed.engineFuel).toBeLessThan(ONE_CELL);
    expect(departed.engineFuel).toBeGreaterThan(ONE_CELL - fuelRateForLeg(0, 1) * 2);
  });

  it('waits for spool before departing', () => {
    const waiting = tickMany(plotted(), SPOOL_S + 5, { spool: 0.2, tune: 1 }, ONE_CELL);
    expect(waiting.nav.phase).toBe('spooling');
    expect(waiting.nav.remainingS).toBe(0);
  });

  it('freezes the clock on scram and flameout', () => {
    const underway = tickMany(plotted(), SPOOL_S + 1, { spool: 1, tune: 1 }, ONE_CELL).nav;
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
    const toHalf = tickMany(leg, half, { spool: 1, tune: 0.1 }, TWO_CELLS);
    expect(toHalf.nav.extraBurned).toBe(true);
    expect(toHalf.engineFuel).toBeLessThan(TWO_CELLS);
    const dry = tickMany(leg, half, { spool: 1, tune: 0.1 }, 1000);
    expect(dry.nav.flameout).toBe(true);
    expect(isUnderway(dry.nav)).toBe(true);
  });

  it('docks at the destination hub with a fresh leg state', () => {
    const arrived = tickMany(
      plotted(),
      SPOOL_S + 1 + legDurationSeconds(0) + DOCKING_S + 2,
      { spool: 1, tune: 1 },
      ONE_CELL
    );
    expect(arrived.nav.phase).toBe('docked');
    expect(arrived.nav.portHubId).toBe('hub_b');
    expect(arrived.nav.destHubId).toBeUndefined();
    expect(arrived.nav.flameout).toBe(false);
    expect(isUnderway(arrived.nav)).toBe(false);
  });

  it('cancels only while spooling and resets tows home', () => {
    expect(cancelLeg(plotted()).phase).toBe('docked');
    const underway = tickMany(plotted(), SPOOL_S + 1, { spool: 1, tune: 1 }, ONE_CELL).nav;
    expect(cancelLeg(underway)).toBe(underway);
    const towed = resetLegTo({ ...underway, flameout: true }, 'hub_a');
    expect(towed.phase).toBe('docked');
    expect(towed.portHubId).toBe('hub_a');
    expect(resetLegTo(underway, 'nowhere')).toBe(underway);
  });

  it('names hop endpoints across a stop chain', () => {
    const result = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: TWO_CELLS,
    });
    if (!('nav' in result)) throw new Error('chain plot should succeed');
    expect(hopFrom(result.nav)).toBe('hub_a');
    expect(hopTo(result.nav)).toBe('poi_kestrel');
    expect(hopBaseS('hub_a', 'poi_kestrel', 0)).toBe(60);
    expect(hopBaseS('poi_kestrel', 'hub_b', 0)).toBe(120);
    expect(hopBaseS('hub_a', 'hub_b', 2)).toBe(80);
  });

  it('flies hop by hop, burning realistic fuel per hop', () => {
    const chain = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: TWO_CELLS,
    });
    if (!('nav' in chain)) throw new Error('chain plot should succeed');
    const departed = tickMany(chain.nav, SPOOL_S + 1, { spool: 1, tune: 1 }, TWO_CELLS);
    expect(departed.nav.phase).toBe('in_transit');
    expect(departed.nav.legIndex).toBe(0);
    expect(departed.nav.remainingS).toBeLessThanOrEqual(60 + 40);
    expect(departed.engineFuel).toBeLessThan(TWO_CELLS);
    expect(departed.engineFuel).toBeGreaterThan(TWO_CELLS - fuelRateForLeg(0, 1) * 2);
    const advanced = tickMany(chain.nav, SPOOL_S + 1 + 70, { spool: 1, tune: 1 }, TWO_CELLS);
    expect(advanced.nav.legIndex).toBe(1);
    expect(advanced.nav.remainingS).toBeLessThanOrEqual(120 + 40);
    expect(advanced.engineFuel).toBeLessThan(departed.engineFuel);
    expect(hopFrom(advanced.nav)).toBe('poi_kestrel');
    expect(hopTo(advanced.nav)).toBe('hub_b');
  });

  it('docks at the final hub with cleared stops', () => {
    const chain = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: TWO_CELLS,
    });
    if (!('nav' in chain)) throw new Error('chain plot should succeed');
    const arrived = tickMany(
      chain.nav,
      SPOOL_S + 2 + 60 + 120 + DOCKING_S + 2,
      { spool: 1, tune: 1 },
      TWO_CELLS
    );
    expect(arrived.nav.phase).toBe('docked');
    expect(arrived.nav.portHubId).toBe('hub_b');
    expect(arrived.nav.stops).toEqual([]);
    expect(arrived.nav.legIndex).toBe(0);
  });

  it('holds at a POI terminus with a POI port', () => {
    const visit = plotChartCourse(DOCKED_NAV, ['poi_kestrel'], {
      hot: true,
      powered: true,
      engineFuel: ONE_CELL,
    });
    if (!('nav' in visit)) throw new Error('visit plot should succeed');
    const arrived = tickMany(
      visit.nav,
      SPOOL_S + 2 + 60 + DOCKING_S + 2,
      { spool: 1, tune: 1 },
      ONE_CELL
    );
    expect(arrived.nav.phase).toBe('docked');
    expect(arrived.nav.portHubId).toBe('poi_kestrel');
    expect(arrived.nav.destHubId).toBeUndefined();
    expect(arrived.nav.stops).toEqual([]);
  });

  it('flames out between stops when the next hop runs dry', () => {
    const full = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: TWO_CELLS,
    });
    if (!('nav' in full)) throw new Error('chain plot should succeed');
    const oneHopFuel = hopOneBurn(full.nav);
    const dry = tickMany(
      full.nav,
      SPOOL_S + 1 + 70,
      { spool: 1, tune: 1 },
      oneHopFuel + fuelRateForLeg(0, 1) * 5
    );
    expect(dry.nav.legIndex).toBe(1);
    expect(dry.nav.flameout).toBe(true);
    expect(dry.engineFuel).toBe(0);
  });

  it('hails a rescue drone once per stranding', () => {
    const full = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: TWO_CELLS,
    });
    if (!('nav' in full)) throw new Error('chain plot should succeed');
    const oneHopFuel = hopOneBurn(full.nav);
    const dry = tickMany(
      full.nav,
      SPOOL_S + 1 + 70,
      { spool: 1, tune: 1 },
      oneHopFuel + fuelRateForLeg(0, 1) * 5
    );
    expect(dry.nav.flameout).toBe(true);
    const hailed = hailForRescue(dry.nav);
    expect(hailed.hailS).toBe(HAIL_WAIT_S);
    expect(hailForRescue(hailed)).toBe(hailed);
    expect(hailForRescue(DOCKED_NAV)).toBe(DOCKED_NAV);
  });

  it('clears flameout when the hailed drone arrives', () => {
    const full = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: TWO_CELLS,
    });
    if (!('nav' in full)) throw new Error('chain plot should succeed');
    const oneHopFuel = hopOneBurn(full.nav);
    const dry = tickMany(
      full.nav,
      SPOOL_S + 1 + 70,
      { spool: 1, tune: 1 },
      oneHopFuel + fuelRateForLeg(0, 1) * 5
    );
    const hailed = hailForRescue(dry.nav);
    const rescued = tickMany(hailed, HAIL_WAIT_S + 1, { spool: 1, tune: 1 }, 0);
    expect(rescued.nav.flameout).toBe(false);
    expect(rescued.nav.hailS).toBe(0);
    expect(rescued.nav.phase).toBe('in_transit');
    expect(rescued.engineFuel).toBeGreaterThan(0);
  });

  it('resumes the burn on restored fuel with no up-front charge', () => {
    const full = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      engineFuel: TWO_CELLS,
    });
    if (!('nav' in full)) throw new Error('chain plot should succeed');
    const oneHopFuel = hopOneBurn(full.nav);
    const dry = tickMany(
      full.nav,
      SPOOL_S + 1 + 70,
      { spool: 1, tune: 1 },
      oneHopFuel + fuelRateForLeg(0, 1) * 5
    );
    const engine = { ...coldEngine(), spool: 1, tune: 1 };
    const hot = { hot: true, scrammed: false };
    const resumed = tickNavLeg(dry.nav, engine, hot, 0, 50, DT);
    expect(resumed.nav.flameout).toBe(false);
    expect(resumed.engineFuel).toBe(50);
    const cold = tickNavLeg(dry.nav, engine, { hot: false, scrammed: false }, 0, 50, DT);
    expect(cold.nav.flameout).toBe(true);
    expect(cold.engineFuel).toBe(50);
  });

  it('heat penalty scales in fuel-value, not cells', () => {
    expect(heatBurnFuel(1)).toBe(300);
    expect(heatBurnFuel(0.5)).toBe(150);
  });

  it('ignores invalid ticks', () => {
    const nav = plotted();
    const idle = { ...coldEngine(), spool: 1 };
    const power = { hot: true, scrammed: false };
    expect(tickNavLeg(nav, idle, power, 0, ONE_CELL, 0).nav).toBe(nav);
    expect(tickNavLeg(nav, idle, power, 0, ONE_CELL, Number.NaN).nav).toBe(nav);
  });
});
