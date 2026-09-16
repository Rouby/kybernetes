import { describe, expect, it } from 'vitest';
import {
  clampEngineFuel,
  FUEL_PER_CELL,
  fuelCostForLeg,
  fuelMaxForTier,
  fuelRateForLeg,
  loadFuelCell,
  unloadFuelCell,
} from './engine.js';

describe('engine fuel bunker (slotted cells -> fuel-value)', () => {
  it('gives the starter two slots of 1000 fuel each', () => {
    expect(fuelMaxForTier(0)).toBe(2 * FUEL_PER_CELL);
    expect(fuelMaxForTier(1)).toBe(3 * FUEL_PER_CELL);
    expect(fuelMaxForTier(2)).toBe(4 * FUEL_PER_CELL);
  });

  it('loads one cell into fuel-value and clamps at capacity', () => {
    expect(loadFuelCell(1, 0, 0)).toEqual({ looseCells: 0, engineFuel: 1000 });
    expect(loadFuelCell(2, 1000, 0)).toEqual({ looseCells: 1, engineFuel: 2000 });
    expect(loadFuelCell(1, 2000, 0)).toBeUndefined();
    expect(loadFuelCell(0, 0, 0)).toBeUndefined();
  });

  it('unloads full cells back to loose stores', () => {
    expect(unloadFuelCell(0, 1000, 0)).toEqual({ looseCells: 1, engineFuel: 0 });
    expect(unloadFuelCell(1, 500, 0)).toBeUndefined();
  });

  it('burns the hop cost continuously at the per-second rate', () => {
    expect(fuelRateForLeg(0, 1)).toBeCloseTo(6.5, 9);
    expect(fuelCostForLeg(0, 1, 33)).toBe(Math.round(fuelRateForLeg(0, 1) * 33));
  });

  it('scales burn cost with distance and thrust, not flat cells', () => {
    const short = fuelCostForLeg(0, 1, 30);
    const long = fuelCostForLeg(0, 1, 150);
    expect(long).toBeGreaterThan(short);
    expect(fuelCostForLeg(0, 0.5, 150)).toBeLessThan(long);
    expect(clampEngineFuel(99999, 0)).toBe(2000);
  });
});
