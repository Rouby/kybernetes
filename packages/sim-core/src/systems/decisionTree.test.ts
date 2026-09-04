import { describe, expect, it } from 'vitest';
import { resolvePawnMovement } from '../spatial/collision';
import { createInitialDoors, toggleDoor } from '../spatial/doors';
import { findWaypointPath } from '../spatial/navigation';
import { applySuctionToPosition, createInitialRoomO2, tickAirVenting } from './airVenting';
import {
  createInitialBoardingState,
  spawnBoardingEvent,
  tickBoardingCombat,
  toggleBulkheadLock,
} from './boardingCombat';
import { createProjectile, tickProjectiles } from './projectiles';

describe('Milestone 4 Overhaul: DecisionTreeAI, Realistic Venting & Gun Combat', () => {
  it('generates collision-free waypoint path through corridors instead of walking through walls', () => {
    // Path from Cargo (600, 510) to Engineering (890, 510)
    const path = findWaypointPath(600, 510, 'engineering');

    expect(path.length).toBeGreaterThanOrEqual(3);
    // Must visit catwalk spine waypoints, not jump across dividing bulkheads
    const ids = path.map((p) => p.id);
    expect(ids).toContain('corridor_cargo');
    expect(ids).toContain('corridor_eng');
    expect(ids).toContain('eng_center');
  });

  it('depletes O2 and equalizes across open interior doors when exterior airlock is opened', () => {
    const doors = createInitialDoors();
    const initialO2 = createInitialRoomO2();

    // Open Engineering Emergency Purge Vent
    const openDoors = toggleDoor(doors, 'airlock_eng', true);
    const result1 = tickAirVenting(initialO2, openDoors, 1.0);

    expect(result1.ventedRooms).toContain('engineering');
    expect(result1.nextRoomO2.engineering).toBeLessThan(100);

    // Because Engineering door to corridor is also open, corridor also equalizes and vents!
    expect(result1.ventedRooms).toContain('corridor');
    expect(result1.nextRoomO2.corridor).toBeLessThan(100);
  });

  it('applies physical suction force pulling coordinates toward open airlock', () => {
    const doors = createInitialDoors();
    const openDoors = toggleDoor(doors, 'airlock_eng', true);
    const ventingRes = tickAirVenting(createInitialRoomO2(), openDoors, 0.1);

    // Initial position inside engineering
    const initialX = 890;
    const initialY = 500;

    // Airlock eng is at (1020, 500)
    const sucked = applySuctionToPosition(
      initialX,
      initialY,
      ventingRes.activeSuctions,
      'engineering',
      1.0
    );

    expect(sucked.x).toBeGreaterThan(initialX); // Pulled eastward toward airlock (x=1020)
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

  it('stops and absorbs projectiles when colliding with solid walls or closed doors, but allows shots through open doorways', () => {
    const doors = createInitialDoors();
    // door_cargo at y=432, x1: 580, x2: 620. Initially isOpen: true

    // 1. Fire across a solid wall (part_port_cargo at x=440, y: 432..680)
    const shotAtWall = createProjectile(420, 500, 460, 500, 'kinetic_carbine', true);
    const wallRes = tickProjectiles([shotAtWall], 0.1, doors, [], { x: 0, y: 0 });
    expect(wallRes.nextProjectiles.length).toBe(0); // Hit wall, absorbed!

    // 2. Fire across door_cargo when it is closed
    const closedDoors = toggleDoor(doors, 'door_cargo', false);
    const shotAtClosedDoor = createProjectile(600, 460, 600, 400, 'kinetic_carbine', true);
    const closedRes = tickProjectiles([shotAtClosedDoor], 0.1, closedDoors, [], { x: 0, y: 0 });
    expect(closedRes.nextProjectiles.length).toBe(0); // Hit closed door, absorbed!

    // 3. Fire across door_cargo when it is OPEN
    const openDoors = toggleDoor(doors, 'door_cargo', true);
    const shotThroughOpenDoor = createProjectile(600, 450, 600, 400, 'kinetic_carbine', true);
    const openRes = tickProjectiles([shotThroughOpenDoor], 0.04, openDoors, [], { x: 0, y: 0 });
    expect(openRes.nextProjectiles.length).toBe(1); // Passes through open door into corridor!
  });

  it('locks bulkheads and closes doors, preventing pawn locomotion through the doorway', () => {
    const state = createInitialBoardingState();
    const lockedState = toggleBulkheadLock(state, 'cargo', true);

    const cargoDoor = lockedState.doors.find((d) => d.id === 'door_cargo');
    expect(cargoDoor?.isOpen).toBe(false);

    // Convert closed doors into collision walls
    const closedDoorWalls = lockedState.doors
      .filter((d) => !d.isOpen)
      .map((d) => ({
        id: `door_wall_${d.id}`,
        x1: d.x1,
        y1: d.y1,
        x2: d.x2,
        y2: d.y2,
        isOpaque: true,
        isTraversable: false,
      }));

    // Pawn attempting to walk from Cargo (600, 450) through door_cargo (y=432) to Corridor (600, 410)
    const moveRes = resolvePawnMovement(600, 450, 600, 410, 14, closedDoorWalls);
    expect(moveRes.collided).toBe(true);
    expect(moveRes.y).toBeGreaterThanOrEqual(432); // Physically stopped from crossing door line!
  });
});
