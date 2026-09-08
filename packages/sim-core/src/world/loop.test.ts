import { describe, expect, it } from 'vitest';
import { spawnPawn } from './assemble.js';
import { captainIdFor, hireAboard, talkToCaptain } from './crew.js';
import { buildHarborWorld, HARBOR_BEACON } from './scenarios.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

const RIGGED_RNG = () => 0.1;

function drive(world: World, seconds: number): World {
  let current = world;
  const ticks = Math.round(seconds / 0.05);
  for (let i = 0; i < ticks; i += 1) current = tickWorld(current, 0.05, []);
  return current;
}

function driveEast(world: World, pawnId: string, seconds: number): World {
  let current = world;
  const ticks = Math.round(seconds / 0.05);
  for (let i = 0; i < ticks; i += 1) {
    current = tickWorld(current, 0.05, [{ pawnId, moveX: 1, moveY: 0, sprint: false }]);
  }
  return current;
}

function eastUntilFrame(world: World, pawnId: string, frameId: string, maxTicks: number): World {
  let current = world;
  for (let i = 0; i < maxTicks; i += 1) {
    if (current.pawns[pawnId]?.frameId === frameId) break;
    current = tickWorld(current, 0.05, [{ pawnId, moveX: 1, moveY: 0, sprint: false }]);
  }
  return current;
}

describe('harbor loop', () => {
  it('stages a docked ship with a captain and a schedule', () => {
    const world = buildHarborWorld();
    expect(world.vessels.ship?.schedule).toBe('docked');
    expect(world.vessels.ship?.beacon).toBe(HARBOR_BEACON);
    expect(world.pawns[captainIdFor('ship')]?.frameId).toBe('ship');
    expect(world.crew[captainIdFor('ship')]?.role).toBe('captain');
    expect(world.transit.ship?.destination).toBe('New Anchorage');
    expect(world.docks.harbor?.vesselFrame).toBe('ship');
  });

  it('walks aboard through the dock transfer while docked', () => {
    const staged = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.bay',
      x: 800,
      y: 200,
      color: '#fff',
    });
    const aboard = eastUntilFrame(staged, 'p1', 'ship', 200);
    expect(aboard.pawns.p1?.frameId).toBe('ship');
    expect(aboard.pawns.p1?.roomHint).toBe('ship.corridor');
  });

  it('ignores return transfers until the gauntlet cycle ends', () => {
    const staged = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'station',
      roomId: 'station.bay',
      x: 800,
      y: 200,
      color: '#fff',
    });
    const aboard = eastUntilFrame(staged, 'p1', 'ship', 200);
    expect(aboard.pawns.p1?.frameId).toBe('ship');
    const held = driveEast(aboard, 'p1', 1);
    expect(held.pawns.p1?.frameId).toBe('ship');
    const cycled = drive(held, 3);
    expect(cycled.pawns.p1?.frameId).toBe('station');
  });

  it('runs station to hire to grade to redock', () => {
    let world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.corridor',
      x: 480,
      y: 360,
      color: '#fff',
    });
    const talked = talkToCaptain(world, captainIdFor('ship'), RIGGED_RNG);
    world = talked.world;
    expect(talked.offer?.jobs).toEqual(['engineer', 'deckhand']);
    if (talked.offer === undefined) throw new Error('no offer');

    const hired = hireAboard(world, 'ship', 'p1', 'engineer', talked.offer.offerId);
    world = hired.world;
    expect(hired.hired).toBe(true);
    expect(world.crew.p1?.role).toBe('engineer');
    expect(world.pawns['npc:ship:cook']?.frameId).toBe('ship');
    expect(world.vessels.ship?.schedule).toBe('departing');
    expect(world.portals['station.bay_gauntlet']?.state).toBe('sealed');

    world = drive(world, 3.5);
    expect(world.vessels.ship?.schedule).toBe('in_transit');
    expect(world.watches.ship?.watchNo).toBe(1);
    expect(world.watches.ship?.tasks).toHaveLength(4);

    world = drive(world, 20.5);
    expect(world.watches.ship?.grade).toBe('S');
    expect(world.crew.p1?.credits).toBe(200);
    expect(world.crew.p1?.clearance).toBe(2);

    world = drive(world, 5.5);
    expect(world.vessels.ship?.schedule).toBe('docked');
    expect(world.transit.ship?.legIndex).toBe(1);
    expect(world.transit.ship?.destination).toBe('Kepler Yard');
    expect(world.portals['station.bay_gauntlet']?.state).toBe('closed');
  });

  it('starts a second watch on the next leg for the stay-aboard crew', () => {
    let world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.corridor',
      x: 480,
      y: 360,
      color: '#fff',
    });
    const talked = talkToCaptain(world, captainIdFor('ship'), RIGGED_RNG);
    world = talked.world;
    if (talked.offer === undefined) throw new Error('no offer');
    world = hireAboard(world, 'ship', 'p1', 'engineer', talked.offer.offerId).world;
    world = drive(world, 3 + 20 + 5);
    expect(world.watches.ship?.watchNo).toBe(1);
    world = drive(world, 30.5 + 3.5);
    expect(world.vessels.ship?.schedule).toBe('in_transit');
    expect(world.watches.ship?.watchNo).toBe(2);
    expect(world.watches.ship?.section).toBe('bravo');
  });

  it('refuses hire with stale offers and wrong jobs', () => {
    const world = spawnPawn(buildHarborWorld(), {
      id: 'p1',
      owner: 'u1',
      frameId: 'ship',
      roomId: 'ship.corridor',
      x: 480,
      y: 360,
      color: '#fff',
    });
    expect(hireAboard(world, 'ship', 'p1', 'engineer', 'offer_bogus').hired).toBe(false);
    const talked = talkToCaptain(world, captainIdFor('ship'), RIGGED_RNG);
    if (talked.offer === undefined) throw new Error('no offer');
    expect(hireAboard(talked.world, 'ship', 'p1', 'security', talked.offer.offerId).hired).toBe(
      false
    );
    expect(talkToCaptain(world, 'p1', RIGGED_RNG).offer).toBeUndefined();
  });
});
