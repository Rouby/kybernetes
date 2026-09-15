import { describe, expect, it } from 'vitest';
import { chartNodeFor, hubNodeIds, isChartNodeId, planVoyage, plotChartCourse } from './chart.js';
import { DOCKED_NAV, SPOOL_S } from './navTransit.js';

function req(over: Record<string, unknown> = {}) {
  return {
    fromId: 'hub_a',
    stops: ['hub_b'],
    tier: 0 as const,
    tune: 1,
    wear: 0,
    ...over,
  };
}

describe('voyage chart (slice 1a projection)', () => {
  it('names hubs and POIs with rumor hints on unknowns', () => {
    expect(chartNodeFor('hub_a')?.label).toBe('NEW ANCHORAGE');
    expect(chartNodeFor('hub_b')?.label).toBe('KEPLER YARD');
    expect(chartNodeFor('poi_kestrel')?.rumor).toContain('Kestrel');
    expect(chartNodeFor('nowhere')).toBeUndefined();
    expect(isChartNodeId('poi_vigil')).toBe(true);
    expect(isChartNodeId('nowhere')).toBe(false);
    expect(isChartNodeId(42)).toBe(false);
    expect(hubNodeIds()).toEqual(['hub_a', 'hub_b']);
  });

  it('projects a direct leg identically to the leg machine', () => {
    const result = planVoyage(req());
    if (!('plan' in result)) throw new Error('direct plan should succeed');
    expect(result.plan.hops).toHaveLength(1);
    expect(result.plan.hops[0]).toMatchObject({ fromId: 'hub_a', toId: 'hub_b', known: true });
    expect(result.plan.hops[0]?.legS).toBe(33);
    expect(result.plan.totalS).toBe(33);
    expect(result.plan.fuelNeeded).toBe(1);
    expect(result.plan.unknowns).toEqual([]);
    expect(result.plan.heatRisk).toBe(false);
    expect(result.plan.destId).toBe('hub_b');
  });

  it('sums detour segments and flags unknown POIs', () => {
    const result = planVoyage(req({ stops: ['poi_kestrel', 'hub_b'] }));
    if (!('plan' in result)) throw new Error('detour plan should succeed');
    expect(result.plan.hops).toHaveLength(2);
    expect(result.plan.totalS).toBe(53);
    expect(result.plan.fuelNeeded).toBe(2);
    expect(result.plan.unknowns).toEqual(['poi_kestrel']);
    expect(result.plan.destId).toBe('hub_b');
  });

  it('clears unknowns once surveyed and scales with tier', () => {
    const surveyed = planVoyage(
      req({ stops: ['poi_kestrel', 'hub_b'], knownIds: ['hub_a', 'hub_b', 'poi_kestrel'] })
    );
    if (!('plan' in surveyed)) throw new Error('surveyed plan should succeed');
    expect(surveyed.plan.unknowns).toEqual([]);
    const fast = planVoyage(req({ tier: 2 as const }));
    if (!('plan' in fast)) throw new Error('t2 plan should succeed');
    expect(fast.plan.totalS).toBe(17);
  });

  it('adds one reserve cell and heat risk for cold tunes', () => {
    const cold = planVoyage(req({ tune: 0.1 }));
    if (!('plan' in cold)) throw new Error('cold plan should succeed');
    expect(cold.plan.heatRisk).toBe(true);
    expect(cold.plan.fuelNeeded).toBe(2);
  });

  it('commits a POI detour chain to a final hub', () => {
    const result = plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'hub_b'], {
      hot: true,
      powered: true,
      fuelCells: 2,
    });
    if (!('nav' in result)) throw new Error('chain should commit');
    expect(result.nav.phase).toBe('spooling');
    expect(result.nav.destHubId).toBe('hub_b');
    expect(result.nav.stops).toEqual(['poi_kestrel', 'hub_b']);
    expect(result.nav.legIndex).toBe(0);
    expect(result.nav.remainingS).toBe(SPOOL_S);
  });

  it('rejects uncharted, looping, and dockless chains by name', () => {
    const checks = { hot: true, powered: true, fuelCells: 2 };
    expect(plotChartCourse(DOCKED_NAV, [], checks)).toEqual({ reject: 'empty-voyage' });
    expect(plotChartCourse(DOCKED_NAV, ['nowhere', 'hub_b'], checks)).toEqual({
      reject: 'unknown-node',
    });
    expect(plotChartCourse(DOCKED_NAV, ['hub_a', 'hub_b'], checks)).toEqual({
      reject: 'same-stop',
    });
    expect(plotChartCourse(DOCKED_NAV, ['poi_kestrel', 'poi_kestrel'], checks)).toEqual({
      reject: 'same-stop',
    });
    expect(plotChartCourse(DOCKED_NAV, ['poi_kestrel'], checks)).toMatchObject({
      nav: { destHubId: 'poi_kestrel', stops: ['poi_kestrel'] },
    });
    expect(plotChartCourse(DOCKED_NAV, ['hub_b', 'hub_a'], checks)).toMatchObject({
      nav: { destHubId: 'hub_a' },
    });
  });

  it('keeps power, fuel, and underway gates on chains', () => {
    expect(
      plotChartCourse(DOCKED_NAV, ['hub_b'], { hot: false, powered: true, fuelCells: 1 })
    ).toEqual({ reject: 'no-power' });
    expect(
      plotChartCourse(DOCKED_NAV, ['hub_b'], { hot: true, powered: true, fuelCells: 0 })
    ).toEqual({ reject: 'no-fuel' });
    const underway = { ...DOCKED_NAV, phase: 'in_transit' as const };
    expect(
      plotChartCourse(underway, ['hub_b'], { hot: true, powered: true, fuelCells: 1 })
    ).toEqual({ reject: 'already-underway' });
  });

  it('rejects empty, looping, and unknown voyages by name', () => {
    expect(planVoyage(req({ stops: [] }))).toEqual({ reject: 'empty-voyage' });
    expect(planVoyage(req({ stops: ['hub_a'] }))).toEqual({ reject: 'same-origin' });
    expect(planVoyage(req({ stops: ['nowhere'] }))).toEqual({ reject: 'unknown-node' });
    expect(planVoyage(req({ fromId: 'nowhere', stops: ['hub_b'] }))).toEqual({
      reject: 'unknown-node',
    });
  });
});
