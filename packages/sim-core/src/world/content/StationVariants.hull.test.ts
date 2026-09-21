import { describe, expect, it } from 'vitest';
import { compileHull } from '../hullCompiler.js';
import { stationHullFor } from './StationVariants.hull.js';

const HUBS = ['hub_a', 'hub_b', 'hub_c', 'hub_d'];
const SPINE_ROOMS = ['korridor_ost', 'andock_a', 'andock_tube'];
const SPINE_PORTALS = ['korridor_ost_andock', 'andock_a_tube', 'andock_tube_mund'];
const SPAWNS = [
  'fresh_spawn',
  'habitat_spawn',
  'medizin_spawn',
  'fracht_spawn',
  'reaktor_spawn',
  'andock_spawn',
  'kommando_spawn',
  'sued_spawn',
];

describe('station hull variants', () => {
  it('routes a distinct signature room per younger station', () => {
    expect(stationHullFor('hub_a').rooms.some((room) => room.id === 'hangar')).toBe(false);
    expect(stationHullFor('hub_b').rooms.some((room) => room.id === 'hangar')).toBe(true);
    expect(stationHullFor('hub_c').rooms.some((room) => room.id === 'labor')).toBe(true);
    expect(stationHullFor('hub_d').rooms.some((room) => room.id === 'observatorium')).toBe(true);
  });

  it('compiles every hub hull with the shared dock spine', () => {
    for (const hub of HUBS) {
      const compiled = compileHull({ ...stationHullFor(hub), frameId: hub });
      expect(compiled.errors).toEqual([]);
      for (const room of SPINE_ROOMS) {
        expect(compiled.rooms.some((entry) => entry.id === room)).toBe(true);
      }
      for (const portal of SPINE_PORTALS) {
        expect(compiled.portals.some((entry) => entry.id === portal)).toBe(true);
      }
      for (const spawn of SPAWNS) {
        expect(compiled.spawns[spawn]).toBeDefined();
      }
    }
  });
});
