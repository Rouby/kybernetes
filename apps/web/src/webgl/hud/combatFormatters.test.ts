import { describe, expect, it } from 'vitest';
import {
  cartridgeLoadedStates,
  cartridgeSlotCell,
  combatPanelGeometry,
  DEFAULT_KINETIC_AMMO,
  formatKineticAmmo,
  formatLaserCharge,
  formatWelderStatus,
  isKineticWeapon,
} from './combatFormatters';

describe('isKineticWeapon', () => {
  it('treats carbines, railguns, and unequipped pawns as kinetic', () => {
    expect(isKineticWeapon('kinetic_carbine')).toBe(true);
    expect(isKineticWeapon('railgun_pistol')).toBe(true);
    expect(isKineticWeapon(undefined)).toBe(true);
  });

  it('treats energy tools as non-kinetic', () => {
    expect(isKineticWeapon('pulse_laser')).toBe(false);
    expect(isKineticWeapon('arc_welder')).toBe(false);
  });
});

describe('combatPanelGeometry', () => {
  it('sizes kinetic panels taller with room for the cartridge rack', () => {
    const plain = combatPanelGeometry(1600, 900, true, false);
    expect(plain).toMatchObject({ panelW: 375, panelH: 160 });
    expect(plain.x).toBe(1600 - 375 - plain.marginX);
  });

  it('grows panels while a station shift is active', () => {
    expect(combatPanelGeometry(1600, 900, true, true).panelH).toBe(220);
    expect(combatPanelGeometry(1600, 900, false, true).panelH).toBe(190);
    expect(combatPanelGeometry(1600, 900, false, false).panelH).toBe(130);
  });
});

describe('formatKineticAmmo', () => {
  it('reports a ready magazine with reload hint', () => {
    const fmt = formatKineticAmmo('kinetic_carbine', {
      ...DEFAULT_KINETIC_AMMO,
      current: 24,
      reserve: 90,
    });
    expect(fmt.weaponTitle).toBe('KINETIC CARBINE');
    expect(fmt.statusText).toBe('[R] RELOAD');
    expect(fmt.ammoCol).toBe('#00ff88');
    expect(fmt.magLine).toBe('MAG: 24/30  RES: 90  [R] RELOAD');
    expect(fmt.isLow).toBe(false);
  });

  it('warns on low ammo and names the railgun', () => {
    const fmt = formatKineticAmmo('railgun_pistol', { ...DEFAULT_KINETIC_AMMO, current: 5 });
    expect(fmt.weaponTitle).toBe('RAILGUN PISTOL');
    expect(fmt.statusText).toBe('[LOW AMMO - R TO RELOAD]');
    expect(fmt.ammoCol).toBe('#ff3344');
    expect(fmt.isLow).toBe(true);
  });

  it('reports reload progress while reloading', () => {
    const fmt = formatKineticAmmo('kinetic_carbine', {
      ...DEFAULT_KINETIC_AMMO,
      current: 0,
      isReloading: true,
      reloadProgress: 0.42,
    });
    expect(fmt.statusText).toBe('[RELOADING 42%]');
    expect(fmt.ammoCol).toBe('#00e5ff');
    expect(fmt.isLow).toBe(false);
  });
});

describe('cartridgeLoadedStates', () => {
  it('marks the first N slots loaded', () => {
    const states = cartridgeLoadedStates({ ...DEFAULT_KINETIC_AMMO, current: 3 });
    expect(states).toHaveLength(30);
    expect(states.filter(Boolean)).toHaveLength(3);
  });

  it('follows reload progress while reloading', () => {
    const states = cartridgeLoadedStates({
      ...DEFAULT_KINETIC_AMMO,
      current: 0,
      isReloading: true,
      reloadProgress: 0.5,
    });
    expect(states.filter(Boolean)).toHaveLength(15);
  });

  it('lays slots out as two rows of fifteen', () => {
    expect(cartridgeSlotCell(0)).toEqual({ row: 0, col: 0 });
    expect(cartridgeSlotCell(14)).toEqual({ row: 0, col: 14 });
    expect(cartridgeSlotCell(15)).toEqual({ row: 1, col: 0 });
    expect(cartridgeSlotCell(29)).toEqual({ row: 1, col: 14 });
  });
});

describe('formatLaserCharge', () => {
  it('reports standby, charging, and primed bands', () => {
    expect(formatLaserCharge(0)).toMatchObject({ pct: 0, statusText: '[STANDBY]' });
    expect(formatLaserCharge(0.4)).toMatchObject({ pct: 40, statusText: '[CHARGING]' });
    expect(formatLaserCharge(0.85)).toMatchObject({
      pct: 85,
      statusText: '[CAPACITOR PRIMED]',
      isPrimed: true,
    });
  });
});

describe('formatWelderStatus', () => {
  it('follows the live arc state', () => {
    expect(formatWelderStatus(true)).toBe('[DISCHARGING ARC]');
    expect(formatWelderStatus(false)).toBe('[STANDBY]');
  });
});
