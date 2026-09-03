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
});
