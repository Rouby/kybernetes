import { describe, it, expect } from 'vitest';
import { createInitialVesselState, tickVesselState } from './state';
import { createInitialPlayerVitals, updatePlayerVitals } from './survival';

describe('Vessel Simulation Core', () => {
  it('initializes vessel state with nominal parameters', () => {
    const vessel = createInitialVesselState();
    expect(vessel.shipName).toBe('CSS Hesperia');
    expect(vessel.reactorTemp).toBe(320);
    expect(vessel.oxygenLevelPercent).toBeGreaterThan(95);
    expect(vessel.alertLevel).toBe('nominal');
  });

  it('updates reactor cooling and life support during simulation tick', () => {
    const vessel = createInitialVesselState();
    vessel.reactorTemp = 500;
    const updated = tickVesselState(vessel, 10);
    expect(updated.reactorTemp).toBeLessThan(500);
    expect(updated.reactorTemp).toBeGreaterThan(300);
    expect(updated.oxygenLevelPercent).toBeLessThan(vessel.oxygenLevelPercent);
  });
});

describe('Player Survival Vitals', () => {
  it('drains hunger and thirst over time when awake', () => {
    const vitals = createInitialPlayerVitals();
    const updated = updatePlayerVitals(vitals, 10, false, false);
    expect(updated.hunger).toBeLessThan(100);
    expect(updated.thirst).toBeLessThan(100);
    expect(updated.fatigue).toBeGreaterThan(0);
  });

  it('recovers fatigue and stamina when sleeping in bunk', () => {
    const vitals = createInitialPlayerVitals();
    vitals.fatigue = 80;
    vitals.stamina = 20;
    const updated = updatePlayerVitals(vitals, 5, true, false);
    expect(updated.fatigue).toBeLessThan(80);
    expect(updated.stamina).toBeGreaterThan(20);
  });
});
