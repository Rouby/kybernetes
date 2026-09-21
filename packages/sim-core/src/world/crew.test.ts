import { describe, expect, it } from 'vitest';
import { spawnPawn } from './assemble.js';
import { captainIdFor, hireAboard, talkToCaptain } from './crew.js';
import { buildHarborWorld } from './scenarios.js';
import type { World } from './types.js';

const RIGGED_RNG = () => 0.1;

function withStationPawn(world: World): World {
  return spawnPawn(world, {
    id: 'p1',
    owner: 'u1',
    frameId: 'station',
    roomId: 'station.andock_a',
    x: 1060,
    y: 260,
    color: '#fff',
  });
}

function withAboardPawn(world: World, id = 'p1'): World {
  return spawnPawn(world, {
    id,
    owner: 'u1',
    frameId: 'ship',
    roomId: 'ship.korridor_schiff',
    x: 30,
    y: 350,
    color: '#fff',
  });
}

function talk(world: World) {
  const talked = talkToCaptain(world, captainIdFor('ship'), RIGGED_RNG);
  if (talked.offer === undefined) throw new Error('no offer');
  return talked;
}

describe('hire boarding discipline', () => {
  it('holds station-side hires until the pawn boards', () => {
    const staged = withStationPawn(buildHarborWorld());
    const talked = talk(staged);
    const held = hireAboard(talked.world, 'ship', 'p1', 'engineer', talked.offer.offerId);
    expect(held.hired).toBe(false);
    expect(held.hold).toBe('aboard-first');
    expect(held.world.offers[talked.offer.offerId]).toBeDefined();
    expect(held.world.vessels.ship?.schedule).toBe('docked');
  });

  it('holds departure while a crewmate lingers in the tube', () => {
    let world = withAboardPawn(buildHarborWorld());
    world = spawnPawn(world, {
      id: 'p2',
      owner: 'u2',
      frameId: 'station',
      roomId: 'station.andock_tube',
      x: 1175,
      y: 260,
      color: '#fff',
    });
    const talked = talk(world);
    const held = hireAboard(talked.world, 'ship', 'p1', 'engineer', talked.offer.offerId);
    expect(held.hired).toBe(false);
    expect(held.hold).toBe('tube-busy');
    expect(held.world.offers[talked.offer.offerId]).toBeDefined();
    expect(held.world.vessels.ship?.schedule).toBe('docked');
  });

  it('hires aboard a clear tube and departs', () => {
    const staged = withAboardPawn(buildHarborWorld());
    const talked = talk(staged);
    const hired = hireAboard(talked.world, 'ship', 'p1', 'engineer', talked.offer.offerId);
    expect(hired.hired).toBe(true);
    expect(hired.hold).toBeUndefined();
    expect(hired.world.offers[talked.offer.offerId]).toBeUndefined();
    expect(hired.world.vessels.ship?.schedule).toBe('departing');
  });
});
