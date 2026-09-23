import { describe, expect, it } from 'vitest';
import { HESPERIA_WALLS } from '../../spatial/deck.js';
import { createInitialDoors } from '../../spatial/doors.js';
import { assembleWorld, universeFrameSpecs } from '../assemble.js';
import { buildSoloShipWorld, buildWorld, HARBOR_BEACON } from '../scenarios.js';
import { HesperiaV2Spec } from './HesperiaV2.hull.js';
import { compileHubGeometry, hubDoorSeeds } from './hubGeometry.js';
import { stationHullFor } from './StationVariants.hull.js';

describe('hub geometry shared compile path', () => {
  it('routes sim walls and render walls for every hub through one compile', () => {
    const specs = universeFrameSpecs(['hub_a', 'hub_b', 'hub_c', 'hub_d']);
    const world = assembleWorld([
      ...specs,
      {
        frameId: 'ship',
        hull: HesperiaV2Spec,
        vessel: { name: 'CSS Hesperia', beacon: HARBOR_BEACON },
      },
    ]);
    const hubs = compileHubGeometry();
    expect(hubs.map((entry) => entry.frame)).toEqual(['station', 'hub_b', 'hub_c', 'hub_d']);
    for (const entry of hubs) {
      const simWalls = world.wallsByFrame[entry.frame];
      expect(simWalls, 'sim walls for ' + entry.frame).toBeDefined();
      expect(simWalls).toEqual(entry.walls);
      for (const wall of entry.walls) {
        const renderId =
          wall.isWindow === true && entry.frame !== 'station'
            ? entry.frame + '.' + wall.id
            : wall.id;
        const render = HESPERIA_WALLS.find((candidate) => candidate.id === renderId);
        expect(render, 'render wall ' + renderId).toBeDefined();
        expect(render?.x1).toBe(wall.x1 + entry.originX);
        expect(render?.y1).toBe(wall.y1 + entry.originY);
        expect(render?.x2).toBe(wall.x2 + entry.originX);
        expect(render?.y2).toBe(wall.y2 + entry.originY);
      }
    }
  });

  it('seeds hub doors from the same compile with namespaced snapshot ids', () => {
    const seeds = hubDoorSeeds();
    const doors = createInitialDoors();
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(doors.some((door) => door.id === seed.id)).toBe(true);
    }
    const mouth = doors.find((door) => door.id === 'hub_d.andock_tube_mund');
    expect(mouth).toMatchObject({ roomA: 'hub_d.andock_tube', roomB: 'vacuum' });
  });

  it('keeps builder frames and docks unchanged across the pipeline', () => {
    const world = buildSoloShipWorld();
    expect(Object.keys(world.stations).sort()).toEqual(['hub_b', 'hub_c', 'hub_d', 'station']);
    for (const frame of ['station', 'hub_b', 'hub_c', 'hub_d']) {
      expect(world.rooms[frame + '.andock_tube']).toBeDefined();
      expect(world.portals[frame + '.andock_tube_mund']).toBeDefined();
      expect(world.portals[frame + '.korridor_ost_andock']).toBeDefined();
    }
    expect(world.docks.harbor?.mouthWorld).toEqual({ x1: 1210, y1: 240, x2: 1210, y2: 280 });
    expect(world.docks.hub_b_harbor?.mouthWorld).toEqual({ x1: 1210, y1: 240, x2: 1210, y2: 280 });
    const harbor = buildWorld({ hubs: ['hub_a'], withFixtures: true });
    expect(harbor.rooms['station.habitat']).toBeDefined();
    expect(harbor.docks.harbor?.stationPortal).toBe('station.korridor_ost_andock');
  });

  it('resolves universe frame specs from the same hulls render compiles', () => {
    const specs = universeFrameSpecs(['hub_a', 'hub_b', 'hub_c', 'hub_d']);
    expect(specs.map((spec) => spec.frameId)).toEqual(['station', 'hub_b', 'hub_c', 'hub_d']);
    expect(specs[0]?.hull.frameId).toBe('station');
    expect(specs[0]?.hull.rooms).toEqual(stationHullFor('hub_a').rooms);
    expect(specs[1]?.hull.frameId).toBe('hub_b');
    expect(specs[1]?.hull.rooms).toEqual(stationHullFor('hub_b').rooms);
    expect(specs[0]?.origin).toEqual({ x: 0, y: 0 });
    expect(specs[1]?.origin).toEqual({ x: 0, y: 0 });
  });
});
