import { describe, expect, it } from 'vitest';
import { UNIVERSE_BODIES, UNIVERSE_CHART, UNIVERSE_HUBS, UNIVERSE_LANES } from './catalog.js';
import {
  hubForStation,
  isBodyId,
  laneFraction,
  requireBody,
  requireHub,
  requireStationOrigin,
  tryStationOrigin,
  UnknownUniverseError,
  validateUniverse,
} from './registry.js';

describe('universe catalog (Strike 1 single source)', () => {
  it('holds twelve bodies, four hubs, twelve chart nodes', () => {
    expect(UNIVERSE_BODIES).toHaveLength(12);
    expect(Object.keys(UNIVERSE_HUBS)).toHaveLength(4);
    expect(UNIVERSE_CHART).toHaveLength(12);
    expect(UNIVERSE_LANES.length).toBeGreaterThan(20);
  });

  it('is internally consistent', () => {
    expect(validateUniverse()).toEqual([]);
  });

  it('keeps the home hub on the legacy station frame', () => {
    expect(UNIVERSE_HUBS.hub_a?.stationFrame).toBe('station');
    expect(UNIVERSE_HUBS.hub_b?.stationFrame).toBe('hub_b');
    expect(hubForStation('station')?.hubId).toBe('hub_a');
    expect(hubForStation('void')).toBeUndefined();
  });

  it('throws on unknown bodies, hubs, and frames instead of defaulting', () => {
    expect(() => requireBody('nowhere')).toThrow(UnknownUniverseError);
    expect(() => requireHub('nowhere')).toThrow(UnknownUniverseError);
    expect(() => requireStationOrigin('void')).toThrow(UnknownUniverseError);
    expect(tryStationOrigin('void')).toBeUndefined();
    expect(tryStationOrigin('station')).toMatchObject({ x: 0, y: 0 });
    expect(isBodyId('hub_a')).toBe(true);
    expect(isBodyId('nowhere')).toBe(false);
  });

  it('resolves lane fractions symmetrically', () => {
    expect(laneFraction('hub_a', 'hub_b')).toBe(1);
    expect(laneFraction('hub_b', 'hub_a')).toBe(1);
    expect(laneFraction('hub_a', 'nowhere')).toBeUndefined();
  });
});
