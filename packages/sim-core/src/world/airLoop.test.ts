import { describe, expect, it } from 'vitest';
import { type AirAuthorityState, createAirAuthority } from './airAuthority.js';
import { spawnPawn } from './assemble.js';
import { hireAboard, talkToCaptain } from './crew.js';
import { bindWorldAir, buildHarborWorld } from './scenarios.js';
import { tickWorld } from './tickWorld.js';
import type { World } from './types.js';

function drive(world: World, auth: AirAuthorityState, seconds: number): World {
  let current = world;
  const ticks = Math.round(seconds / 0.05);
  for (let i = 0; i < ticks; i += 1) current = tickWorld(current, 0.05, [], auth);
  return current;
}

describe('air loop', () => {
  it('walks aboard with air stepping and earns watch pay without venting', () => {
    const auth = createAirAuthority();
    let world = buildHarborWorld();
    bindWorldAir(auth, world);
    world = spawnPawn(world, {
      id: 'hero',
      owner: 'hero',
      frameId: 'station',
      roomId: 'station.bay',
      x: 800,
      y: 200,
      color: '#ffd166',
    });
    for (let i = 0; i < 400; i += 1) {
      if (world.pawns.hero?.frameId === 'ship') break;
      world = tickWorld(world, 0.05, [{ pawnId: 'hero', moveX: 1, moveY: 0, sprint: false }], auth);
    }
    expect(world.pawns.hero?.frameId).toBe('ship');
    const talked = talkToCaptain(world, 'captain:ship', () => 0.5);
    world = talked.world;
    if (talked.offer === undefined) throw new Error('no offer');
    const job = talked.offer.jobs[0] ?? 'engineer';
    const hired = hireAboard(world, 'ship', 'hero', job, talked.offer.offerId);
    expect(hired.hired).toBe(true);
    world = drive(hired.world, auth, 3.5 + 20.5);
    expect(world.watches.ship?.grade).toBe('S');
    expect(world.crew.hero?.credits).toBe(200);
    world = drive(world, auth, 5.5);
    expect(world.vessels.ship?.schedule).toBe('docked');
    expect(world.atmos['ship.corridor']?.pressureKpa ?? 0).toBeGreaterThan(90);
  });
});
