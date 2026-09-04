import { describe, expect, it } from 'vitest';
import {
  createInitialPlayerVitals,
  patchSuitIntegrity,
  refillSuitO2,
  reviveCrew,
  toggleHelmet,
  updatePlayerVitals,
} from './survival';

describe('Player Survival Vitals & Suit Simulation', () => {
  it('initializes with nominal vitals, 600s suit O2, and unsealed visor', () => {
    const vitals = createInitialPlayerVitals();
    expect(vitals.hunger).toBe(100);
    expect(vitals.thirst).toBe(100);
    expect(vitals.health).toBe(100);
    expect(vitals.suit.isSealed).toBe(false);
    expect(vitals.suit.o2RemainingSeconds).toBe(600);
    expect(vitals.incapacitated.isIncapacitated).toBe(false);
  });

  it('toggles helmet visor state cleanly', () => {
    let vitals = createInitialPlayerVitals();
    expect(vitals.suit.isSealed).toBe(false);

    vitals = toggleHelmet(vitals);
    expect(vitals.suit.isSealed).toBe(true);

    vitals = toggleHelmet(vitals, false);
    expect(vitals.suit.isSealed).toBe(false);
  });

  it('suffers hypoxia and decompression damage when unsealed in vacuum', () => {
    let vitals = createInitialPlayerVitals();
    expect(vitals.suit.isSealed).toBe(false);

    const vacuumAtmos = {
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -270,
      toxicSmokePercent: 0,
      velX: 0,
      velY: 0,
      roomId: null,
    };

    // Tick for 5 seconds in vacuum without suit sealed
    for (let t = 0; t < 5; t++) {
      vitals = updatePlayerVitals(vitals, 1.0, false, false, vacuumAtmos);
    }

    expect(vitals.hypoxiaPercent).toBeGreaterThan(50);
    expect(vitals.health).toBeLessThan(100);
  });

  it('survives vacuum when visor is sealed, consuming suit O2 tank', () => {
    let vitals = createInitialPlayerVitals();
    vitals = toggleHelmet(vitals, true);
    expect(vitals.suit.isSealed).toBe(true);

    const vacuumAtmos = {
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -270,
      toxicSmokePercent: 0,
      velX: 0,
      velY: 0,
      roomId: null,
    };

    // Tick for 10 seconds in vacuum with suit sealed
    for (let t = 0; t < 10; t++) {
      vitals = updatePlayerVitals(vitals, 1.0, false, false, vacuumAtmos);
    }

    expect(vitals.health).toBe(100);
    expect(vitals.hypoxiaPercent).toBe(0);
    expect(vitals.suit.o2RemainingSeconds).toBeLessThan(600);
    expect(vitals.suit.o2RemainingSeconds).toBeGreaterThan(580);
  });

  it('knocks pawn into incapacitated bleedout when health reaches 0, and allows co-op revive', () => {
    let vitals = createInitialPlayerVitals();
    vitals.health = 5;

    const vacuumAtmos = {
      pressureKpa: 0,
      o2Percent: 0,
      co2Ppm: 0,
      tempCelsius: -270,
      toxicSmokePercent: 0,
      velX: 0,
      velY: 0,
      roomId: null,
    };

    // Drain remaining HP
    vitals = updatePlayerVitals(vitals, 2.0, false, false, vacuumAtmos);

    expect(vitals.incapacitated.isIncapacitated).toBe(true);
    expect(vitals.incapacitated.bleedoutSecondsRemaining).toBe(45);

    // Revive the downed crewmate
    vitals = reviveCrew(vitals);
    expect(vitals.incapacitated.isIncapacitated).toBe(false);
    expect(vitals.health).toBeGreaterThanOrEqual(25);
  });

  it('refills suit O2 and patches suit integrity', () => {
    let vitals = createInitialPlayerVitals();
    vitals.suit.o2RemainingSeconds = 120;
    vitals.suit.integrityPercent = 40;

    vitals = refillSuitO2(vitals, 600);
    expect(vitals.suit.o2RemainingSeconds).toBe(600);

    vitals = patchSuitIntegrity(vitals);
    expect(vitals.suit.integrityPercent).toBe(100);
  });
});
