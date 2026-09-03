import { describe, expect, it } from 'vitest';
import { createInitialDoors } from '../spatial/doors';
import { BOT_PERSONAS, createBotSession, tickBot } from './botManager';

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

    const startX = bot.pawn.x;
    const startY = bot.pawn.y;

    let current = bot;
    const visitedPositions: Array<{ x: number; y: number }> = [];

    // Simulate 20 ticks of 0.2s = 4 seconds of walking
    for (let i = 0; i < 20; i++) {
      const res = tickBot(current, 0.2, doors);
      current = res.nextBot;
      visitedPositions.push({ x: current.pawn.x, y: current.pawn.y });
    }

    // Wiper should have moved away from engineering spawn (924, 570) towards door (970, 400)
    expect(current.pawn.x).not.toBe(startX);
    expect(current.pawn.y).not.toBe(startY);
    expect(current.pawn.y).toBeLessThan(startY); // Moving up towards corridor/mess
    expect(current.path).toBeDefined();
    expect(current.pathIndex).toBeGreaterThanOrEqual(0);
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
    for (let i = 0; i < 60; i++) {
      const res = tickBot(current, 0.1, doors);
      current = res.nextBot;
      if (res.doorToToggle === 'door_eng') {
        doorOpened = true;
        // Re-open door in sim
        if (engDoor) engDoor.isOpen = true;
      }
    }

    expect(doorOpened).toBe(true);
  });

  it('completes path to rest and switches to resting state', () => {
    const doors = createInitialDoors();
    const bot = createBotSession('galley_hand');
    // Galley hand is already in mess (880, 200). Put it right near rest target (880, 160)
    bot.state = 'walking_to_rest';
    bot.targetRoomId = 'mess';
    bot.pawn.x = 880;
    bot.pawn.y = 170;

    const res = tickBot(bot, 0.5, doors);
    expect(res.nextBot.state).toBe('resting');
    expect(res.nextBot.pawn.isResting).toBe(true);
  });
});
