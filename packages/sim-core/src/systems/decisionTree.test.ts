import { describe, expect, it } from 'vitest';
import { createInitialDoors, toggleDoor } from '../spatial/doors';
import { findWaypointPath } from '../spatial/navigation';
import { applySuctionToPosition, createInitialRoomO2, tickAirVenting } from './airVenting';
import {
  createInitialBoardingState,
  spawnBoardingEvent,
  tickBoardingCombat,
} from './boardingCombat';
import { createProjectile, tickProjectiles } from './projectiles';

describe('Milestone 4 Overhaul: DecisionTreeAI, Realistic Venting & Gun Combat', () => {
  it('generates collision-free waypoint path through corridors instead of walking through walls', () => {
    // Path from Cargo (590, 570) to Engineering (970, 570)
    const path = findWaypointPath(590, 570, 'engineering');

    expect(path.length).toBeGreaterThanOrEqual(3);
    // Must visit corridor waypoints, not jump across the x=780/800 dividing bulkhead
    const ids = path.map((p) => p.id);
    expect(ids).toContain('corridor_mid');
    expect(ids).toContain('corridor_east');
    expect(ids).toContain('eng_center');
  });

  it('depletes O2 and equalizes across open interior doors when exterior airlock is opened', () => {
    const doors = createInitialDoors();
    const initialO2 = createInitialRoomO2();

    // Open Cargo Vent Hatch
    const openDoors = toggleDoor(doors, 'airlock_cargo', true);
    const result1 = tickAirVenting(initialO2, openDoors, 1.0);

    expect(result1.ventedRooms).toContain('cargo');
    expect(result1.nextRoomO2.cargo).toBeLessThan(100);

    // Because Cargo door to corridor is also open, corridor also equalizes and vents!
    expect(result1.ventedRooms).toContain('corridor');
    expect(result1.nextRoomO2.corridor).toBeLessThan(100);
  });

  it('applies physical suction force pulling coordinates toward open airlock', () => {
    const doors = createInitialDoors();
    const openDoors = toggleDoor(doors, 'airlock_cargo', true);
    const ventingRes = tickAirVenting(createInitialRoomO2(), openDoors, 0.1);

    // Initial position inside cargo bay
    const initialX = 590;
    const initialY = 570;

    // Airlock cargo is at (590, 740)
    const sucked = applySuctionToPosition(
      initialX,
      initialY,
      ventingRes.activeSuctions,
      'cargo',
      1.0
    );

    expect(sucked.y).toBeGreaterThan(initialY); // Pulled southward toward airlock (y=740)
  });

  it('DecisionTreeAI: triggers fleeing_vacuum when room oxygen drops below 25%', () => {
    const state = createInitialBoardingState();
    const breached = spawnBoardingEvent(state, 'cargo');

    // Deplete cargo O2 to 0%
    breached.roomO2.cargo = 0;

    const { nextState } = tickBoardingCombat(breached, 0.1, { x: 100, y: 100 });
    const raider = nextState.intruders[0];

    expect(raider.aiState).toBe('fleeing_vacuum');
  });

  it('DecisionTreeAI: attacks player and fires retaliatory plasma bolts when player is in range', () => {
    const state = createInitialBoardingState();
    const breached = spawnBoardingEvent(state, 'cargo');

    // Place player right near the raider
    const playerPos = { x: breached.intruders[0].x + 40, y: breached.intruders[0].y };

    const { nextState } = tickBoardingCombat(breached, 0.1, playerPos);
    const raider = nextState.intruders[0];

    expect(raider.aiState).toBe('attacking_player');
    expect(nextState.projectiles.length).toBeGreaterThan(0);
    expect(nextState.projectiles[0].fromPlayer).toBe(false);
  });

  it('simulates player projectile flight and deals damage upon hitting raiders', () => {
    const state = createInitialBoardingState();
    const breached = spawnBoardingEvent(state, 'cargo');
    const raider = breached.intruders[0];

    // Fire kinetic carbine from player towards raider
    const proj = createProjectile(
      raider.x - 30,
      raider.y,
      raider.x,
      raider.y,
      'kinetic_carbine',
      true
    );
    const projRes = tickProjectiles([proj], 0.1, breached.doors, breached.intruders, {
      x: 100,
      y: 100,
    });

    expect(projRes.damagedIntruders.length).toBe(1);
    expect(projRes.damagedIntruders[0].id).toBe(raider.id);
  });
});
