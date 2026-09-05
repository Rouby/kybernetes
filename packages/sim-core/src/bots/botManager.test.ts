import { describe, expect, it } from 'vitest';
import { createInitialDoors } from '../spatial/doors';
import {
  BOT_HULL_BOUNDS,
  BOT_PERSONAS,
  createBotSession,
  roomRestSpot,
  tickBot,
} from './botManager';

describe('Bot Crewmate Manager', () => {
  it('has distinct personas and voicelines defined for all 5 roles', () => {
    const roles = [
      'wiper',
      'galley_hand',
      'security_private',
      'hydro_tender',
      'stevedore',
    ] as const;
    for (const r of roles) {
      const persona = BOT_PERSONAS[r];
      expect(persona).toBeDefined();
      expect(persona.callsign).toBeTruthy();
      expect(persona.badge).toBeTruthy();
      expect(persona.walkSpeed).toBeGreaterThan(0);
      expect(persona.voicelines.working.length).toBeGreaterThan(0);
      expect(persona.voicelines.walking.length).toBeGreaterThan(0);
      expect(persona.voicelines.resting.length).toBeGreaterThan(0);
    }
  });

  it('creates bot session with correct role, spawn, and isBot flag', () => {
    const wiperBot = createBotSession('wiper');
    expect(wiperBot.role).toBe('wiper');
    expect(wiperBot.pawn.isBot).toBe(true);
    expect(wiperBot.pawn.callsign).toBe('Stoker Vane [ENG-3]');
    expect(wiperBot.pawn.color).toBe('#ffb000');
    expect(wiperBot.state).toBe('working_station');
    expect(wiperBot.openedDoors).toEqual([]);
    expect(wiperBot.pauseTimer).toBe(0);
  });

  it('provides functional assistance during chore operations', () => {
    const doors = createInitialDoors();
    const wiperBot = createBotSession('wiper');
    wiperBot.state = 'working_station';

    const { assistance } = tickBot(wiperBot, 1.0, doors);
    expect(assistance.reactorTempDelta).toBeLessThan(0); // Wiper cools reactor

    const hydroBot = createBotSession('hydro_tender');
    hydroBot.state = 'working_station';
    const hydroRes = tickBot(hydroBot, 1.0, doors);
    expect(hydroRes.assistance.o2Delta).toBeGreaterThan(0); // Hydro produces O2
  });

  it('triggers speech bubbles upon speech cooldown expiry and clears when expired', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('galley_hand');
    bot.speechCooldown = 0.5; // Trigger soon

    const now = 500000;
    // Tick 1s -> triggers speech bubble
    const step1 = tickBot(bot, 1.0, doors, now);
    expect(step1.nextBot.pawn.speechBubble).toBeDefined();
    expect(step1.nextBot.pawn.speechBubble?.text).toBeTruthy();
    expect(step1.nextBot.pawn.speechBubble?.expiresAt).toBe(now + 3500);

    // Tick past expiration
    const step2 = tickBot(step1.nextBot, 1.0, doors, now + 4000);
    expect(step2.nextBot.pawn.speechBubble).toBeUndefined();
  });

  it('generates multi-room navigation path and progresses without oscillating', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('wiper');
    // Force transition to walking to rest (mess hall)
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    bot.pauseTimer = 0;

    const startX = bot.pawn.x;
    const startY = bot.pawn.y;

    let current = bot;
    // Disable random pauses for a deterministic progress check.
    for (let i = 0; i < 20; i++) {
      current.pauseTimer = 0;
      const res = tickBot(current, 0.2, doors);
      current = res.nextBot;
      current.pauseTimer = 0;
    }

    // Wiper should have moved away from engineering spawn towards corridor/mess
    expect(current.pawn.x).not.toBe(startX);
    expect(current.pawn.y).not.toBe(startY);
    expect(current.pawn.y).toBeLessThan(startY); // Moving up towards corridor/mess
    expect(current.path).toBeDefined();
    expect(current.pathIndex).toBeGreaterThanOrEqual(0);
  });

  it('publishes velocity while walking so pawns animate', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    bot.pauseTimer = 0;

    let sawMotion = false;
    let current = bot;
    for (let i = 0; i < 30; i++) {
      current.pauseTimer = 0;
      const res = tickBot(current, 0.15, doors);
      current = res.nextBot;
      current.pauseTimer = 0;
      if (Math.hypot(current.pawn.vx, current.pawn.vy) > 1) sawMotion = true;
      if (res.nextBot.state === 'resting') break;
    }
    expect(sawMotion).toBe(true);
  });

  it('does not request a door open from across the room', () => {
    const doors = createInitialDoors();
    const engDoor = doors.find((d) => d.id === 'door_eng');
    if (engDoor) engDoor.isOpen = false;

    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    // Park the bot far from the engineering hatch (deep inside engineering).
    bot.pawn.x = 980;
    bot.pawn.y = 540;
    bot.path = undefined;
    bot.pathIndex = 0;
    bot.pauseTimer = 0;

    const res = tickBot(bot, 0.1, doors);
    expect(res.doorToOpen).toBeUndefined();
    expect(res.doorToToggle).toBeUndefined();
  });

  it('waits at the hatch instead of phasing through a closed door', () => {
    const doors = createInitialDoors();
    const engDoor = doors.find((d) => d.id === 'door_eng');
    if (engDoor) engDoor.isOpen = false;

    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    // Stand just outside the engineering hatch.
    bot.pawn.x = 890;
    bot.pawn.y = 480;
    bot.path = undefined;
    bot.pathIndex = 0;
    bot.pauseTimer = 0;

    const res = tickBot(bot, 0.1, doors);
    expect(res.doorToOpen ?? res.doorToToggle).toBe('door_eng');
    // Holding position for the door cycle: no drift through the hatch.
    expect(res.nextBot.pawn.x).toBe(890);
    expect(res.nextBot.pawn.y).toBe(480);
    expect(res.nextBot.pawn.vx).toBe(0);
    expect(res.nextBot.openedDoors).toContain('door_eng');
  });

  it('requests closed door toggle when advancing along path', () => {
    const doors = createInitialDoors();
    // Close engineering door
    const engDoor = doors.find((d) => d.id === 'door_eng');
    if (engDoor) engDoor.isOpen = false;

    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';

    let current = bot;
    let doorOpened = false;

    // Simulate walking until it approaches door_eng
    for (let i = 0; i < 120; i++) {
      const res = tickBot(current, 0.1, doors);
      current = res.nextBot;
      if (res.doorToOpen === 'door_eng' || res.doorToToggle === 'door_eng') {
        doorOpened = true;
        // Re-open door in sim
        if (engDoor) engDoor.isOpen = true;
      }
    }

    expect(doorOpened).toBe(true);
  });

  it('requests toggle for closed hallway spine doors when walking across corridor', () => {
    const doors = createInitialDoors();
    // Close hallway forward spine door
    const spineFwd = doors.find((d) => d.id === 'door_spine_fwd');
    if (spineFwd) spineFwd.isOpen = false;

    // Wiper at bridge center (220, 290) walks to mess (840, 290), which must cross door_spine_fwd
    const bot = createBotSession('wiper');
    bot.pawn.x = 220;
    bot.pawn.y = 400; // in forward corridor
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';

    let current = bot;
    let spineOpened = false;

    for (let i = 0; i < 120; i++) {
      const res = tickBot(current, 0.1, doors);
      current = res.nextBot;
      if (res.doorToOpen === 'door_spine_fwd' || res.doorToToggle === 'door_spine_fwd') {
        spineOpened = true;
        if (spineFwd) spineFwd.isOpen = true;
      }
    }

    expect(spineOpened).toBe(true);
  });

  it('closes doors behind itself once clear', () => {
    const doors = createInitialDoors();
    const engDoor = doors.find((d) => d.id === 'door_eng');
    if (engDoor) engDoor.isOpen = true; // bot already opened it

    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    bot.openedDoors = ['door_eng'];
    // Bot has walked well clear into the corridor.
    bot.pawn.x = 600;
    bot.pawn.y = 400;
    bot.path = undefined;
    bot.pauseTimer = 0;

    const res = tickBot(bot, 0.1, doors);
    expect(res.doorsToClose).toContain('door_eng');
    expect(res.nextBot.openedDoors).not.toContain('door_eng');
  });

  it('does not close a door it opened while still standing in it', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    bot.openedDoors = ['door_eng'];
    bot.pawn.x = 890;
    bot.pawn.y = 432;
    bot.path = undefined;
    bot.pauseTimer = 0;

    const res = tickBot(bot, 0.1, doors);
    expect(res.doorsToClose).not.toContain('door_eng');
  });

  it('completes path to rest and switches to resting state', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('galley_hand');
    // Galley hand is already in mess. Put it right near the mess rest spot.
    const spot = roomRestSpot('mess');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    bot.pawn.x = spot.x;
    bot.pawn.y = spot.y + 10;

    const res = tickBot(bot, 0.5, doors);
    expect(res.nextBot.state).toBe('resting');
    expect(res.nextBot.pawn.isResting).toBe(true);
  });

  it('keeps rest spots inside the hull', () => {
    for (const roomId of ['mess', 'quarters']) {
      const spot = roomRestSpot(roomId);
      expect(spot.x).toBeGreaterThanOrEqual(BOT_HULL_BOUNDS.minX);
      expect(spot.x).toBeLessThanOrEqual(BOT_HULL_BOUNDS.maxX);
      expect(spot.y).toBeGreaterThanOrEqual(BOT_HULL_BOUNDS.minY);
      expect(spot.y).toBeLessThanOrEqual(BOT_HULL_BOUNDS.maxY);
      // Below the top hull line (y=228): inside the room, not in vacuum.
      expect(spot.y).toBeGreaterThan(228);
    }
  });

  it('never leaves the hull walking to rest in the mess hall', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    bot.path = undefined;
    bot.pauseTimer = 0;

    let current = bot;
    for (let i = 0; i < 400; i++) {
      current.pauseTimer = 0;
      const res = tickBot(current, 0.15, doors, 1000000 + i * 150);
      current = res.nextBot;
      current.pauseTimer = 0;
      expect(current.pawn.y).toBeGreaterThanOrEqual(BOT_HULL_BOUNDS.minY);
      expect(current.pawn.y).toBeLessThanOrEqual(BOT_HULL_BOUNDS.maxY);
      expect(current.pawn.x).toBeGreaterThanOrEqual(BOT_HULL_BOUNDS.minX);
      expect(current.pawn.x).toBeLessThanOrEqual(BOT_HULL_BOUNDS.maxX);
      if (current.state === 'resting') break;
    }
    expect(current.state).toBe('resting');
  });

  it('clamps movement even when pushed toward vacuum', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('wiper');
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    // Pinned against the top hull inside the mess hall, dragged toward vacuum.
    bot.pawn.x = 840;
    bot.pawn.y = 242;
    bot.speechCooldown = 999;

    let current = bot;
    for (let i = 0; i < 20; i++) {
      current.pauseTimer = 0;
      // Forced waypoint above the hull line every tick.
      current.path = [{ x: 840, y: 100 }];
      current.pathIndex = 0;
      const res = tickBot(current, 0.15, doors, 2000000 + i * 150);
      current = res.nextBot;
      expect(current.pawn.y).toBeGreaterThanOrEqual(BOT_HULL_BOUNDS.minY);
      expect(current.pawn.x).toBeGreaterThanOrEqual(BOT_HULL_BOUNDS.minX);
      expect(current.pawn.x).toBeLessThanOrEqual(BOT_HULL_BOUNDS.maxX);
    }
  });
});
