import type { WeaponType } from '@kybernetes/protocol';

export interface KineticAmmoState {
  current: number;
  max: number;
  reserve?: number;
  isReloading: boolean;
  reloadProgress?: number;
}

export const DEFAULT_KINETIC_AMMO: KineticAmmoState = {
  current: 30,
  max: 30,
  reserve: 120,
  isReloading: false,
  reloadProgress: 0,
};

const CARTRIDGE_SLOTS = 30;
const CARTRIDGE_COLUMNS = 15;

export function isKineticWeapon(equipped?: WeaponType): boolean {
  return equipped === 'kinetic_carbine' || equipped === 'railgun_pistol' || equipped === undefined;
}

export interface CombatPanelGeometry {
  marginX: number;
  marginY: number;
  panelW: number;
  panelH: number;
  x: number;
  y: number;
}

export function combatPanelGeometry(
  width: number,
  height: number,
  isKinetic: boolean,
  hasInteraction: boolean
): CombatPanelGeometry {
  const marginX = Math.max(72, Math.round(width * 0.055));
  const marginY = Math.max(52, Math.round(height * 0.065));
  const panelW = 375;
  const panelH = isKinetic ? (hasInteraction ? 220 : 160) : hasInteraction ? 190 : 130;
  return {
    marginX,
    marginY,
    panelW,
    panelH,
    x: width - panelW - marginX,
    y: height - panelH - marginY,
  };
}

export interface FormattedKineticAmmo {
  ammo: KineticAmmoState;
  weaponTitle: string;
  statusText: string;
  ammoCol: string;
  magLine: string;
  isLow: boolean;
}

export function formatKineticAmmo(
  equipped: WeaponType | undefined,
  ammo: KineticAmmoState = DEFAULT_KINETIC_AMMO
): FormattedKineticAmmo {
  const reloadPct = Math.round((ammo.reloadProgress ?? 0) * 100);
  const statusText = ammo.isReloading
    ? `[RELOADING ${reloadPct}%]`
    : ammo.current < 8
      ? '[LOW AMMO - R TO RELOAD]'
      : '[R] RELOAD';
  const ammoCol = ammo.isReloading ? '#00e5ff' : ammo.current < 8 ? '#ff3344' : '#00ff88';
  const weaponTitle = equipped === 'railgun_pistol' ? 'RAILGUN PISTOL' : 'KINETIC CARBINE';
  const reserve = ammo.reserve !== undefined ? `  RES: ${ammo.reserve}` : '';
  return {
    ammo,
    weaponTitle,
    statusText,
    ammoCol,
    magLine: `MAG: ${ammo.current}/${ammo.max}${reserve}  ${statusText}`,
    isLow: ammo.current < 8 && !ammo.isReloading,
  };
}

/** Per-slot loaded flags for the double-stack magazine rack (2 rows of 15). */
export function cartridgeLoadedStates(
  ammo: KineticAmmoState,
  slots: number = CARTRIDGE_SLOTS
): boolean[] {
  const states: boolean[] = [];
  const reloadingCount = Math.floor((ammo.reloadProgress ?? 0) * ammo.max);
  for (let i = 0; i < slots; i++) {
    states.push(ammo.isReloading ? i < reloadingCount : i < ammo.current);
  }
  return states;
}

/** Grid cell for a rack slot: row 0/1, column 0-14. */
export function cartridgeSlotCell(index: number): { row: number; col: number } {
  return { row: index < CARTRIDGE_COLUMNS ? 0 : 1, col: index % CARTRIDGE_COLUMNS };
}

export interface FormattedLaserCharge {
  pct: number;
  statusText: string;
  isPrimed: boolean;
  barValue: number;
}

export function formatLaserCharge(ratio: number): FormattedLaserCharge {
  const pct = Math.round(ratio * 100);
  const isPrimed = ratio >= 0.8;
  const statusText = isPrimed ? '[CAPACITOR PRIMED]' : ratio > 0.05 ? '[CHARGING]' : '[STANDBY]';
  return { pct, statusText, isPrimed, barValue: Math.max(pct, 5) };
}

export function formatWelderStatus(isWelding: boolean): string {
  return isWelding ? '[DISCHARGING ARC]' : '[STANDBY]';
}
