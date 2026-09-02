import { describe, expect, it } from 'vitest';
import {
  createInitialBoardingState,
  deploySentryGun,
  engageIntruder,
  spawnBoardingEvent,
  tickBoardingCombat,
  toggleBulkheadLock,
  toggleRoomVenting,
} from './systems/boardingCombat';

describe('Milestone 4: Boarding Combat & Tactical Deck Systems', () => {
  it('creates an empty initial boarding state', () => {
    const state = createInitialBoardingState();
    expect(state.intruders).toHaveLength(0);
    expect(state.boardingPods).toHaveLength(0);
    expect(state.sentries).toHaveLength(0);
    expect(state.lockedBulkheads).toHaveLength(0);
    expect(state.ventedRooms).toHaveLength(0);
  });

  it('spawns a boarding event with pod breach and 2 raiders', () => {
    const initial = createInitialBoardingState();
    const breached = spawnBoardingEvent(initial, 'cargo');

    expect(breached.boardingPods).toHaveLength(1);
    expect(breached.boardingPods[0].roomId).toBe('cargo');
    expect(breached.boardingPods[0].hullBreached).toBe(true);

    expect(breached.intruders).toHaveLength(2);
    expect(breached.intruders[0].name).toBe('Marauder Breacher');
    expect(breached.intruders[0].targetRoomId).toBe('engineering');
    expect(breached.intruders[1].name).toBe('Marauder Infiltrator');
    expect(breached.intruders[1].targetRoomId).toBe('bridge');
  });

  it('advances intruders toward their target room across ticks', () => {
    const initial = createInitialBoardingState();
    const breached = spawnBoardingEvent(initial, 'cargo');
    const startX = breached.intruders[0].x;

    const { nextState } = tickBoardingCombat(breached, 1.0);
    expect(nextState.intruders[0].x).not.toBe(startX);
  });

  it('holds intruder in place when room is blocked by locked bulkheads', () => {
    const initial = createInitialBoardingState();
    const breached = spawnBoardingEvent(initial, 'cargo');
    const locked = toggleBulkheadLock(breached, 'cargo', true);

    const startX = locked.intruders[0].x;
    const startY = locked.intruders[0].y;

    const { nextState } = tickBoardingCombat(locked, 1.0);
    expect(nextState.intruders[0].x).toBe(startX);
    expect(nextState.intruders[0].y).toBe(startY);
  });

  it('inflicts atmospheric asphyxiation damage when room is vented', () => {
    const initial = createInitialBoardingState();
    const breached = spawnBoardingEvent(initial, 'cargo');
    const vented = toggleRoomVenting(breached, 'cargo', true);

    const initialHealth = vented.intruders[0].health;
    const { nextState } = tickBoardingCombat(vented, 1.0);

    expect(nextState.intruders[0].health).toBeLessThan(initialHealth);
    expect(nextState.intruders[0].health).toBeCloseTo(initialHealth - 15, 0);
  });

  it('allows sentry guns to target and fire on intruders in the same room', () => {
    const initial = createInitialBoardingState();
    const breached = spawnBoardingEvent(initial, 'cargo');
    const withSentry = deploySentryGun(breached, 'cargo', 590, 570);

    expect(withSentry.sentries).toHaveLength(1);
    expect(withSentry.sentries[0].ammo).toBe(100);

    const { nextState } = tickBoardingCombat(withSentry, 1.0);
    const sentry = nextState.sentries[0];
    expect(sentry.isFiring).toBe(true);
    expect(sentry.targetIntruderId).toBe(nextState.intruders[0].id);
    expect(sentry.ammo).toBeLessThan(100);
  });

  it('resolves close-quarters combat attacks and applies security role bonuses', () => {
    const initial = createInitialBoardingState();
    const breached = spawnBoardingEvent(initial, 'cargo');
    const targetId = breached.intruders[0].id;

    // Normal wiper attack with kinetic rifle (45 dmg)
    const resWiper = engageIntruder(breached, targetId, 'kinetic_rifle', 'wiper');
    expect(resWiper.damageDealt).toBe(45);
    expect(resWiper.neutralized).toBe(false);

    // Marine attack with +25% bonus (45 * 1.25 = 56 dmg)
    const resMarine = engageIntruder(
      resWiper.nextState,
      targetId,
      'kinetic_rifle',
      'security_private'
    );
    expect(resMarine.damageDealt).toBe(56);
    expect(resMarine.neutralized).toBe(true);
    expect(resMarine.creditsReward).toBe(50);
    expect(resMarine.xpReward).toBe(40);
  });

  it('detonates sabotage charges and damages hull when timer expires at target', () => {
    const initial = createInitialBoardingState();
    const breached = spawnBoardingEvent(initial, 'engineering');

    // Manually position intruder right at engineering target and set timer low
    breached.intruders[0].x = 970;
    breached.intruders[0].y = 570;
    breached.intruders[0].state = 'sabotaging';
    breached.intruders[0].sabotageSecondsRemaining = 0.5;

    const result = tickBoardingCombat(breached, 1.0);
    expect(result.sabotageDetonated).toBe(true);
    expect(result.hullDamageInflicted).toBe(35);
    expect(result.nextState.intruders[0].state).toBe('neutralized');
  });
});
