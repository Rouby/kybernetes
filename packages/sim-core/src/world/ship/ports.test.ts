import { describe, expect, it } from 'vitest';
import {
  CHART_LANES,
  chartLaneFraction,
  HUB_A,
  HUB_B,
  HUB_C,
  HUB_D,
  HUB_PORTS,
  hubPortForStation,
  isHubId,
} from './ports.js';

describe('hub ports (M3 destinations)', () => {
  it('names four hubs on distinct station frames and docks', () => {
    expect(HUB_A).toBe('hub_a');
    expect(HUB_B).toBe('hub_b');
    expect(HUB_C).toBe('hub_c');
    expect(HUB_D).toBe('hub_d');
    expect(HUB_PORTS[HUB_A]?.stationFrame).toBe('station');
    expect(HUB_PORTS[HUB_B]?.stationFrame).toBe('hub_b');
    expect(HUB_PORTS[HUB_C]?.stationFrame).toBe('hub_c');
    expect(HUB_PORTS[HUB_D]?.stationFrame).toBe('hub_d');
    const docks = new Set(Object.values(HUB_PORTS).map((port) => port.dockId));
    expect(docks.size).toBe(4);
  });

  it('scales detour lanes as fractions of a standard leg', () => {
    expect(chartLaneFraction('hub_a', 'hub_b')).toBe(1);
    expect(chartLaneFraction('hub_b', 'hub_a')).toBe(1);
    expect(chartLaneFraction('hub_a', 'poi_kestrel')).toBe(0.4);
    expect(chartLaneFraction('poi_kestrel', 'hub_b')).toBe(0.8);
    expect(chartLaneFraction('hub_c', 'hub_d')).toBe(1);
    expect(chartLaneFraction('poi_kestrel', 'moon_wisp')).toBe(0.15);
    expect(chartLaneFraction('hub_a', 'moon_tarn')).toBeUndefined();
    const fractions = CHART_LANES.map((lane) => lane.fraction);
    expect(Math.min(...fractions)).toBeGreaterThan(0);
    expect(chartLaneFraction('hub_a', 'nowhere')).toBeUndefined();
  });

  it('resolves hubs by id and station frame', () => {
    expect(isHubId('hub_a')).toBe(true);
    expect(isHubId('hub_c')).toBe(true);
    expect(isHubId('poi_lumen')).toBe(false);
    expect(isHubId('nowhere')).toBe(false);
    expect(hubPortForStation('hub_b')?.hubId).toBe(HUB_B);
    expect(hubPortForStation('hub_c')?.hubId).toBe(HUB_C);
    expect(hubPortForStation('void')).toBeUndefined();
  });
});
