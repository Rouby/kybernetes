import type {
  BoardingTacticsTelemetry,
  DoorState,
  IntruderState,
  PawnState,
  ProjectileState,
  WeaponType,
} from '@kybernetes/protocol';
import { applyWelderAoeDamage, createProjectile, type DockFrameOffset } from '@kybernetes/sim-core';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';

interface KineticAmmoState {
  current: number;
  max: number;
  reserve: number;
  isReloading: boolean;
  reloadProgress: number;
  reloadStart: number;
  reloadDuration: number;
}

interface UseCanvasWeaponsOptions {
  pawn: PawnState;
  mouseWorldRef: MutableRefObject<{ x: number; y: number }>;
  equippedWeapon: WeaponType;
  onFireWeapon?: (
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weaponType: WeaponType,
    chargeRatio?: number
  ) => void;
  onWelderAoe?: (
    originX: number,
    originY: number,
    facingAngle: number,
    damage: number,
    range?: number
  ) => void;
  onWeldingStateChange?: (isWelding: boolean) => void;
  onSpawnProjectile: (proj: ProjectileState) => void;
  onMuzzleFlash: (flash: { x: number; y: number; weaponType: WeaponType }) => void;
  onImpact: (x: number, y: number, type: 'kinetic' | 'laser' | 'welder') => void;
  addScreenShake: (impulse: number) => void;
}

interface StepWeaponsResult {
  laserChargeRatio: number;
  isWelderActive: boolean;
  aimAngle: number;
}

interface UseCanvasWeaponsReturn {
  isFiringRef: MutableRefObject<boolean>;
  kineticAmmoRef: MutableRefObject<KineticAmmoState>;
  welderHeatRef: MutableRefObject<number>;
  welderOverheatedRef: MutableRefObject<boolean>;
  startFiring: () => void;
  stopFiring: () => void;
  triggerReload: () => void;
  stepWeapons: (
    now: number,
    dt: number,
    doors: DoorState[],
    activeBoarding: BoardingTacticsTelemetry,
    offset?: DockFrameOffset
  ) => StepWeaponsResult;
}

function advanceKineticReload(ammo: KineticAmmoState, now: number): void {
  if (!ammo.isReloading) return;
  const elapsed = now - ammo.reloadStart;
  ammo.reloadProgress = Math.min(1.0, elapsed / ammo.reloadDuration);
  if (elapsed >= ammo.reloadDuration) {
    const needed = ammo.max - ammo.current;
    const toLoad = Math.min(needed, ammo.reserve);
    ammo.current += toLoad;
    ammo.reserve -= toLoad;
    ammo.isReloading = false;
    ammo.reloadProgress = 0;
  }
}

function updateWelderThermal(
  isTryingToWeld: boolean,
  currentHeat: number,
  isOverheated: boolean,
  dt: number
): { heat: number; overheated: boolean } {
  if (isTryingToWeld && !isOverheated) {
    const heat = Math.min(1.0, currentHeat + dt * 0.35);
    return { heat, overheated: heat >= 1.0 };
  }
  const heat = Math.max(0.0, currentHeat - dt * 0.45);
  return { heat, overheated: isOverheated && heat > 0.25 };
}

function computeLaserChargeRatio(chargeStart: number | null, now: number): number {
  if (chargeStart === null) return 0;
  const elapsed = (now - chargeStart) / 1000;
  return Math.max(0.1, Math.min(1.0, elapsed / 0.9));
}

// fallow-ignore-next-line complexity
function tickWelderAoe(
  intruders: IntruderState[],
  pawn: PawnState,
  aimAngle: number,
  doors: DoorState[],
  onWelderAoe?: (
    originX: number,
    originY: number,
    facingAngle: number,
    damage: number,
    range?: number
  ) => void,
  onImpact?: (x: number, y: number, type: 'kinetic' | 'laser' | 'welder') => void,
  offset: DockFrameOffset = { x: 0, y: 0 }
): void {
  ShipAudioEngine.getInstance().playWeaponFire(pawn.x, pawn.y, 'arc_welder', 1.0, true);
  const aoe = applyWelderAoeDamage(intruders, pawn.x, pawn.y, aimAngle, 10, 48, doors, offset);
  if (aoe.hitIntruders.length === 0) return;
  onWelderAoe?.(pawn.x, pawn.y, aimAngle, 10, 48);
  for (const hit of aoe.hitIntruders) {
    const intru = intruders.find((i) => i.id === hit.id);
    if (intru) {
      onImpact?.(intru.x, intru.y, 'welder');
    }
  }
}

// fallow-ignore-next-line complexity
export function useCanvasWeapons({
  pawn,
  mouseWorldRef,
  equippedWeapon,
  onFireWeapon,
  onWelderAoe,
  onWeldingStateChange,
  onSpawnProjectile,
  onMuzzleFlash,
  onImpact,
  addScreenShake,
}: UseCanvasWeaponsOptions): UseCanvasWeaponsReturn {
  const isFiringRef = useRef(false);
  const wasWeldingRef = useRef(false);
  const laserChargeStartRef = useRef<number | null>(null);
  const lastKineticFireRef = useRef<number>(0);
  const lastWelderTickRef = useRef<number>(0);

  const kineticAmmoRef = useRef<KineticAmmoState>({
    current: 30,
    max: 30,
    reserve: 120,
    isReloading: false,
    reloadProgress: 0,
    reloadStart: 0,
    reloadDuration: 1300,
  });

  const welderHeatRef = useRef(0);
  const welderOverheatedRef = useRef(false);

  const handleInstantFire = useCallback(
    (
      originX: number,
      originY: number,
      targetX: number,
      targetY: number,
      weaponType: WeaponType,
      chargeRatio = 1.0
    ) => {
      if (weaponType === 'arc_welder') return;

      const proj = createProjectile(
        originX,
        originY,
        targetX,
        targetY,
        weaponType,
        true,
        chargeRatio
      );
      onSpawnProjectile(proj);

      onMuzzleFlash({
        x: originX,
        y: originY,
        weaponType,
      });

      addScreenShake(
        weaponType === 'kinetic_carbine'
          ? 1.8
          : weaponType === 'railgun_pistol'
            ? 3.5
            : 3.6 * chargeRatio
      );
      ShipAudioEngine.getInstance().playWeaponFire(originX, originY, weaponType, chargeRatio, true);
      onFireWeapon?.(originX, originY, targetX, targetY, weaponType, chargeRatio);
    },
    [addScreenShake, onFireWeapon, onMuzzleFlash, onSpawnProjectile]
  );

  const triggerReload = useCallback(() => {
    const ammo = kineticAmmoRef.current;
    if (ammo.isReloading || ammo.current >= ammo.max || ammo.reserve <= 0) return;
    ammo.isReloading = true;
    ammo.reloadStart = performance.now();
    ammo.reloadProgress = 0;
  }, []);

  const fireKineticRound = useCallback(
    (wType: WeaponType = 'kinetic_carbine') => {
      const ammo = kineticAmmoRef.current;
      if (ammo.isReloading) return;
      if (ammo.current <= 0) {
        triggerReload();
        return;
      }

      ammo.current -= 1;
      const isRailgun = wType === 'railgun_pistol';
      const spreadAngle = isRailgun ? (Math.random() - 0.5) * 0.02 : (Math.random() - 0.5) * 0.1;
      const dx = mouseWorldRef.current.x - pawn.x;
      const dy = mouseWorldRef.current.y - pawn.y;
      const baseAngle = Math.atan2(dy, dx);
      const finalAngle = baseAngle + spreadAngle;
      const targetX = pawn.x + Math.cos(finalAngle) * 300;
      const targetY = pawn.y + Math.sin(finalAngle) * 300;

      handleInstantFire(pawn.x, pawn.y, targetX, targetY, wType);
      lastKineticFireRef.current = performance.now();

      if (ammo.current === 0) {
        triggerReload();
      }
    },
    [handleInstantFire, mouseWorldRef, pawn.x, pawn.y, triggerReload]
  );

  const startFiring = useCallback(() => {
    isFiringRef.current = true;
    const now = performance.now();
    if (equippedWeapon === 'kinetic_carbine' || equippedWeapon === 'railgun_pistol') {
      fireKineticRound(equippedWeapon);
    } else if (equippedWeapon === 'pulse_laser') {
      laserChargeStartRef.current = now;
    } else if (equippedWeapon === 'arc_welder') {
      lastWelderTickRef.current = now;
    }
  }, [equippedWeapon, fireKineticRound]);

  const stopFiring = useCallback(() => {
    if (!isFiringRef.current) return;
    const now = performance.now();
    if (equippedWeapon === 'pulse_laser' && laserChargeStartRef.current !== null) {
      const elapsed = (now - laserChargeStartRef.current) / 1000;
      const charge = Math.max(0.2, Math.min(1.0, elapsed / 0.9));
      handleInstantFire(
        pawn.x,
        pawn.y,
        mouseWorldRef.current.x,
        mouseWorldRef.current.y,
        'pulse_laser',
        charge
      );
      laserChargeStartRef.current = null;
    }
    isFiringRef.current = false;
  }, [equippedWeapon, handleInstantFire, mouseWorldRef, pawn.x, pawn.y]);

  useEffect(() => {
    // fallow-ignore-next-line complexity
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        startFiring();
      } else if (e.code === 'KeyR' && !e.repeat) {
        if (equippedWeapon === 'kinetic_carbine') {
          triggerReload();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        stopFiring();
      }
    };
    const handleWindowMouseUp = () => {
      stopFiring();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [equippedWeapon, startFiring, stopFiring, triggerReload]);

  // fallow-ignore-next-line complexity
  const stepWeapons = useCallback(
    // fallow-ignore-next-line complexity
    (
      now: number,
      dt: number,
      doors: DoorState[],
      activeBoarding: BoardingTacticsTelemetry,
      offset: DockFrameOffset = { x: 0, y: 0 }
    ): StepWeaponsResult => {
      advanceKineticReload(kineticAmmoRef.current, now);

      const isKinetic = equippedWeapon === 'kinetic_carbine' || equippedWeapon === 'railgun_pistol';
      const fireInterval = equippedWeapon === 'railgun_pistol' ? 450 : 105;

      if (isFiringRef.current && isKinetic && now - lastKineticFireRef.current >= fireInterval) {
        fireKineticRound(equippedWeapon);
      }

      const laserChargeRatio =
        isFiringRef.current && equippedWeapon === 'pulse_laser'
          ? computeLaserChargeRatio(laserChargeStartRef.current, now)
          : 0;

      const isTryingToWeld = isFiringRef.current && equippedWeapon === 'arc_welder';
      const thermal = updateWelderThermal(
        isTryingToWeld,
        welderHeatRef.current,
        welderOverheatedRef.current,
        dt
      );
      welderHeatRef.current = thermal.heat;
      welderOverheatedRef.current = thermal.overheated;

      const isWelderActive = isTryingToWeld && !thermal.overheated;
      if (wasWeldingRef.current !== isWelderActive) {
        wasWeldingRef.current = isWelderActive;
        onWeldingStateChange?.(isWelderActive);
      }

      const aimAngle = Math.atan2(
        mouseWorldRef.current.y - pawn.y,
        mouseWorldRef.current.x - pawn.x
      );

      if (isWelderActive && now - lastWelderTickRef.current >= 100) {
        lastWelderTickRef.current = now;
        tickWelderAoe(
          activeBoarding.intruders,
          pawn,
          aimAngle,
          doors,
          onWelderAoe,
          onImpact,
          offset
        );
      }

      return {
        laserChargeRatio,
        isWelderActive,
        aimAngle,
      };
    },
    [
      equippedWeapon,
      fireKineticRound,
      mouseWorldRef,
      onImpact,
      onWelderAoe,
      onWeldingStateChange,
      pawn,
    ]
  );

  return {
    isFiringRef,
    kineticAmmoRef,
    welderHeatRef,
    welderOverheatedRef,
    startFiring,
    stopFiring,
    triggerReload,
    stepWeapons,
  };
}
