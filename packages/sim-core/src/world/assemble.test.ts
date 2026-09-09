import { describe, expect, it } from 'vitest';
import { assembleWorld, spawnPawn } from './assemble.js';
import { HesperiaV2Spec } from './content/HesperiaV2.hull.js';
import { StationHubSpec } from './content/StationHub.hull.js';

describe('world assemble', () => {
  it('namespaces rooms and portals per frame', () => {
    const world = assembleWorld([
      { frameId: 'station', hull: StationHubSpec },
      { frameId: 'ship', hull: HesperiaV2Spec, vessel: { name: 'Hesperia', beacon: 'HESP' } },
    ]);
    expect(Object.keys(world.rooms)).toHaveLength(16);
    expect(world.rooms['ship.bruecke']?.frameId).toBe('ship');
    expect(world.rooms['station.habitat']?.frameId).toBe('station');
    expect(world.portals['ship.bruecke_korridor']?.roomA).toBe('ship.bruecke');
    expect(world.portals['station.habitat_korridor']?.roomB).toBe('station.korridor_mitte');
    expect(world.vessels.ship?.beacon).toBe('HESP');
    expect(world.stations.station?.id).toBe('station');
    expect(world.vessels.station).toBeUndefined();
  });

  it('binds compiled walls per frame for collision', () => {
    const world = assembleWorld([{ frameId: 'station', hull: StationHubSpec }]);
    expect((world.wallsByFrame.station ?? []).length).toBeGreaterThan(0);
    expect(world.memory).toEqual({});
  });

  it('spawns pawns with full health summaries', () => {
    const world = spawnPawn(assembleWorld([{ frameId: 'station', hull: StationHubSpec }]), {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.habitat',
      x: 160,
      y: 100,
      color: '#00e5ff',
    });
    expect(world.pawns.p1?.health.hp).toBe(100);
    expect(world.pawns.p1?.roomHint).toBe('station.habitat');
  });
});
