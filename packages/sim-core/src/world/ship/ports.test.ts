import { describe, expect, it } from 'vitest';
import {
  CHART_LANES,
  chartLaneFraction,
  HUB_A,
  HUB_B,
  HUB_PORTS,
  hubPortForStation,
  isHubId,
} from './ports.js';

describe('hub ports (M3 destinations)', () => {
  it('names two hubs on distinct station frames and docks', () => {
    expect(HUB_A).toBe('hub_a');
    expect(HUB_B).toBe('hub_b');
    expect(HUB_PORTS[HUB_A]?.stationFrame).toBe('station');
    expect(HUB_PORTS[HUB_B]?.stationFrame).toBe('hub_b');
    expect(HUB_PORTS[HUB_A]?.dockId).not.toBe(HUB_PORTS[HUB_B]?.dockId);
  });

  it('scales detour lanes as fractions of a standard leg', () => {
    expect(chartLaneFraction('hub_a', 'hub_b')).toBe(1);
    expect(chartLaneFraction('hub_b', 'hub_a')).toBe(1);
    expect(chartLaneFraction('hub_a', 'poi_kestrel')).toBe(0.4);
    expect(chartLaneFraction('poi_kestrel', 'hub_b')).toBe(0.8);
    const fractions = CHART_LANES.map((lane) => lane.fraction);
    expect(Math.min(...fractions)).toBeGreaterThan(0);
    expect(chartLaneFraction('hub_a', 'nowhere')).toBeUndefined();
  });

  it('resolves hubs by id and station frame', () => {
    expect(isHubId('hub_a')).toBe(true);
    expect(isHubId('nowhere')).toBe(false);
    expect(hubPortForStation('hub_b')?.hubId).toBe(HUB_B);
    expect(hubPortForStation('void')).toBeUndefined();
  });
});
