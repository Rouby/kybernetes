import type {
  BoardingTacticsTelemetry,
  DoorState,
  DualProtocolBroadcast,
  PawnState,
  PlayerVitals,
  ProjectileState,
  StationFixture,
  TelemetryDeltaBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import {
  applyWelderAoeDamage,
  createInitialDoors,
  createProjectile,
  HESPERIA_WALLS,
  interpolatePawn,
  isSegmentBlockedByDoors,
  segmentsIntersect,
} from '@kybernetes/sim-core';
import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { ActiveInteraction } from '../types';
import { WebGL2Renderer } from '../webgl';

interface VesselCanvasProps {
  pawn: PawnState;
  remotePawns?: PawnState[];
  vitals?: PlayerVitals;
  telemetry?: TelemetryDeltaBroadcast;
  nearestStation: StationFixture | null;
  activeInteraction?: ActiveInteraction | null;
  promptActionName?: string;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  boarding?: BoardingTacticsTelemetry;
  beaconCode?: string;
  crewCount?: number;
  clearanceLevel?: number;
  clearanceXp?: number;
  credits?: number;
  equippedWeapon?: WeaponType;
  triageNotice?: string | null;
  inGameNotice?: string | null;
  dualProtocol?: DualProtocolBroadcast | null;
  collabShift?: {
    shiftId: string;
    title: string;
    progressPercent: number;
    participants: string[];
    isCompleted: boolean;
  } | null;
  onStationClick?: (station: StationFixture) => void;
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
  onToggleDoor?: (doorId: string, open: boolean) => void;
  onWeldingStateChange?: (isWelding: boolean) => void;
  onBeaconClick?: () => void;
  onManifestClick?: () => void;
  onRoleClick?: () => void;
  onDisembarkClick?: () => void;
  onEquipWeapon?: (w: WeaponType) => void;
  onAbortInteraction?: () => void;
  onExecuteDualProtocol?: () => void;
  onJoinCollabShift?: () => void;
}

interface PredictedProjectile extends ProjectileState {
  spawnTime: number;
}

// fallow-ignore-next-line complexity
function reconcileProjectiles(
  current: PredictedProjectile[],
  incoming: ProjectileState[],
  now: number
): PredictedProjectile[] {
  const serverMap = new Map(incoming.map((p) => [p.id, p]));
  const preserved = current.filter(
    (p) => (p.fromPlayer && now - p.spawnTime < 350) || serverMap.has(p.id)
  );

  for (const sp of incoming) {
    const existing = preserved.find((lp) => lp.id === sp.id);
    if (!existing) {
      preserved.push({ ...sp, spawnTime: now });
    } else if (Math.hypot(existing.x - sp.x, existing.y - sp.y) > 25) {
      existing.x = sp.x;
      existing.y = sp.y;
    }
  }
  return preserved;
}

// fallow-ignore-next-line complexity
function integrateProjectiles(
  projectiles: PredictedProjectile[],
  dt: number,
  doors: DoorState[],
  onImpact?: (x: number, y: number, type: 'kinetic' | 'laser' | 'welder') => void
): PredictedProjectile[] {
  const result: PredictedProjectile[] = [];
  for (const p of projectiles) {
    const nextX = p.x + p.vx * dt;
    const nextY = p.y + p.vy * dt;
    const nextLife = p.lifeSeconds - dt;

    if (nextLife <= 0) {
      if (p.weaponType === 'arc_welder') {
        onImpact?.(nextX, nextY, 'welder');
      }
      continue;
    }

    const p1 = { x: p.x, y: p.y };
    const p2 = { x: nextX, y: nextY };

    // Line-segment collision with ship bulkheads
    const hitWall = HESPERIA_WALLS.some(
      (w) =>
        !w.isTraversable && segmentsIntersect(p1, p2, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })
    );

    // Line-segment collision with closed blast doors
    const hitDoor = isSegmentBlockedByDoors(p1, p2, doors);

    if (hitWall || hitDoor) {
      const type =
        p.weaponType === 'pulse_laser'
          ? 'laser'
          : p.weaponType === 'arc_welder'
            ? 'welder'
            : 'kinetic';
      onImpact?.(nextX, nextY, type);
      continue;
    }

    p.x = nextX;
    p.y = nextY;
    p.lifeSeconds = nextLife;
    result.push(p);
  }
  return result;
}

function getActiveBoarding(
  boarding: BoardingTacticsTelemetry | undefined,
  defaultDoors: DoorState[],
  projectiles: PredictedProjectile[]
): BoardingTacticsTelemetry {
  if (boarding) return { ...boarding, projectiles };
  return {
    intruders: [],
    boardingPods: [],
    sentries: [],
    lockedBulkheads: [],
    ventedRooms: [],
    doors: defaultDoors,
    projectiles,
    roomO2: {},
  };
}

// fallow-ignore-next-line complexity
function handleCanvasMouseDown(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  renderer: WebGL2Renderer | null,
  camera: { x: number; y: number },
  doors: DoorState[] | undefined,
  nearestStation: StationFixture | null,
  onStationClick?: (station: StationFixture) => void,
  onToggleDoor?: (doorId: string, open: boolean) => void,
  startFiring?: () => void
) {
  if (e.button !== 0 || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const screenPixelX = e.clientX - rect.left;
  const screenPixelY = e.clientY - rect.top;

  // 1. Check if an interactive WebGL2 HUD button or badge was clicked
  if (renderer?.getHitTester().handleClick(screenPixelX, screenPixelY)) {
    return;
  }

  if (renderer?.getHitTester().hitTest(screenPixelX, screenPixelY)) {
    return;
  }

  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const worldX = clickX - canvas.width / 2 + camera.x;
  const worldY = clickY - canvas.height / 2 + camera.y;

  if (doors && onToggleDoor) {
    const clickedDoor = doors.find((d) => {
      const mx = (d.x1 + d.x2) / 2;
      const my = (d.y1 + d.y2) / 2;
      return Math.hypot(mx - worldX, my - worldY) < 32;
    });
    if (clickedDoor) {
      onToggleDoor(clickedDoor.id, !clickedDoor.isOpen);
      return;
    }
  }

  if (nearestStation && onStationClick) {
    const dist = Math.hypot(nearestStation.x - worldX, nearestStation.y - worldY);
    if (dist < nearestStation.radius + 10) {
      onStationClick(nearestStation);
      return;
    }
  }

  startFiring?.();
}

// fallow-ignore-next-line complexity
export const VesselCanvas: React.FC<VesselCanvasProps> = ({
  pawn,
  remotePawns = [],
  vitals,
  telemetry,
  nearestStation,
  activeInteraction,
  promptActionName,
  alertLevel = 'nominal',
  boarding,
  beaconCode,
  crewCount,
  clearanceLevel,
  clearanceXp,
  credits,
  equippedWeapon = 'kinetic_carbine',
  triageNotice,
  inGameNotice,
  dualProtocol,
  collabShift,
  onStationClick,
  onFireWeapon,
  onWelderAoe,
  onToggleDoor,
  onWeldingStateChange,
  onBeaconClick,
  onManifestClick,
  onRoleClick,
  onDisembarkClick,
  onEquipWeapon,
  onAbortInteraction,
  onExecuteDualProtocol,
  onJoinCollabShift,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGL2Renderer | null>(null);
  const cameraRef = useRef({ x: pawn.x, y: pawn.y });
  const mouseWorldRef = useRef({ x: pawn.x + 50, y: pawn.y });
  const mouseScreenRef = useRef({ x: 0, y: 0 });
  const defaultDoorsRef = useRef(createInitialDoors());
  const remoteInterpolatedRef = useRef<Map<string, PawnState>>(new Map());

  const localProjectilesRef = useRef<PredictedProjectile[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const queuedImpactsRef = useRef<
    Array<{ x: number; y: number; type: 'kinetic' | 'laser' | 'welder' }>
  >([]);

  const isFiringRef = useRef(false);
  const wasWeldingRef = useRef(false);
  const laserChargeStartRef = useRef<number | null>(null);
  const lastKineticFireRef = useRef<number>(0);
  const lastWelderTickRef = useRef<number>(0);
  const kineticAmmoRef = useRef({
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
      // Welder uses continuous frontal AOE cone, not projectiles
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
      localProjectilesRef.current.push({ ...proj, spawnTime: performance.now() });
      onFireWeapon?.(originX, originY, targetX, targetY, weaponType, chargeRatio);
    },
    [onFireWeapon]
  );

  // fallow-ignore-next-line complexity
  const triggerReload = useCallback(() => {
    const ammo = kineticAmmoRef.current;
    if (ammo.isReloading) return;
    if (ammo.current >= ammo.max) return;
    if (ammo.reserve <= 0) return;
    ammo.isReloading = true;
    ammo.reloadStart = performance.now();
    ammo.reloadProgress = 0;
  }, []);

  // fallow-ignore-next-line complexity
  const fireKineticRound = useCallback(() => {
    const ammo = kineticAmmoRef.current;
    if (ammo.isReloading) return;
    if (ammo.current <= 0) {
      triggerReload();
      return;
    }
    ammo.current -= 1;
    const spreadAngle = (Math.random() - 0.5) * 0.1;
    const dx = mouseWorldRef.current.x - pawn.x;
    const dy = mouseWorldRef.current.y - pawn.y;
    const baseAngle = Math.atan2(dy, dx);
    const finalAngle = baseAngle + spreadAngle;
    const targetX = pawn.x + Math.cos(finalAngle) * 300;
    const targetY = pawn.y + Math.sin(finalAngle) * 300;
    handleInstantFire(pawn.x, pawn.y, targetX, targetY, 'kinetic_carbine');
    lastKineticFireRef.current = performance.now();

    if (ammo.current === 0) {
      triggerReload();
    }
  }, [pawn.x, pawn.y, handleInstantFire, triggerReload]);

  const startFiring = useCallback(() => {
    isFiringRef.current = true;
    const now = performance.now();
    if (equippedWeapon === 'kinetic_carbine') {
      fireKineticRound();
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
  }, [equippedWeapon, pawn.x, pawn.y, handleInstantFire]);

  useEffect(() => {
    if (!boarding?.projectiles) return;
    localProjectilesRef.current = reconcileProjectiles(
      localProjectilesRef.current,
      boarding.projectiles,
      performance.now()
    );
  }, [boarding?.projectiles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
    });

    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!rendererRef.current) {
      try {
        rendererRef.current = new WebGL2Renderer(canvas);
      } catch (err) {
        console.error('Failed to initialize pure WebGL 2 renderer:', err);
        return;
      }
    }

    let animId: number;

    // fallow-ignore-next-line complexity
    const render = () => {
      if (canvas.width === 0 || canvas.height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      const now = performance.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;

      const doors = boarding?.doors || defaultDoorsRef.current;
      localProjectilesRef.current = integrateProjectiles(
        localProjectilesRef.current,
        dt,
        doors,
        (hitX, hitY, type) => queuedImpactsRef.current.push({ x: hitX, y: hitY, type })
      );

      cameraRef.current.x += (pawn.x - cameraRef.current.x) * 0.12;
      cameraRef.current.y += (pawn.y - cameraRef.current.y) * 0.12;

      const aimAngle = Math.atan2(
        mouseWorldRef.current.y - pawn.y,
        mouseWorldRef.current.x - pawn.x
      );
      const activePawn = { ...pawn, facingAngle: aimAngle };
      const activeBoarding = getActiveBoarding(
        boarding,
        defaultDoorsRef.current,
        localProjectilesRef.current
      );

      // Update kinetic reloading progress
      const ammo = kineticAmmoRef.current;
      if (ammo.isReloading) {
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

      // 1. Continuous Kinetic Carbine firing
      if (isFiringRef.current && equippedWeapon === 'kinetic_carbine') {
        if (now - lastKineticFireRef.current >= 105) {
          fireKineticRound();
        }
      }

      // 2. Pulse Laser charge ratio
      let laserChargeRatio = 0;
      if (
        isFiringRef.current &&
        equippedWeapon === 'pulse_laser' &&
        laserChargeStartRef.current !== null
      ) {
        const elapsed = (now - laserChargeStartRef.current) / 1000;
        laserChargeRatio = Math.max(0.1, Math.min(1.0, elapsed / 0.9));
      }

      // 3. Continuous Arc Welder AOE Cone with Overheat Lockout
      const isTryingToWeld = isFiringRef.current && equippedWeapon === 'arc_welder';
      if (isTryingToWeld && !welderOverheatedRef.current) {
        welderHeatRef.current = Math.min(1.0, welderHeatRef.current + dt * 0.35);
        if (welderHeatRef.current >= 1.0) {
          welderOverheatedRef.current = true;
        }
      } else {
        welderHeatRef.current = Math.max(0.0, welderHeatRef.current - dt * 0.45);
        if (welderOverheatedRef.current && welderHeatRef.current <= 0.25) {
          welderOverheatedRef.current = false;
        }
      }

      const isWelderActive = isTryingToWeld && !welderOverheatedRef.current;
      if (wasWeldingRef.current !== isWelderActive) {
        wasWeldingRef.current = isWelderActive;
        onWeldingStateChange?.(isWelderActive);
      }

      if (isWelderActive && now - lastWelderTickRef.current >= 100) {
        lastWelderTickRef.current = now;
        const aoe = applyWelderAoeDamage(
          activeBoarding.intruders,
          pawn.x,
          pawn.y,
          aimAngle,
          10,
          48,
          doors
        );
        if (aoe.hitIntruders.length > 0) {
          onWelderAoe?.(pawn.x, pawn.y, aimAngle, 10, 48);
          for (const hit of aoe.hitIntruders) {
            const intru = activeBoarding.intruders.find((i) => i.id === hit.id);
            if (intru) {
              queuedImpactsRef.current.push({ x: intru.x, y: intru.y, type: 'welder' });
            }
          }
        }
      }

      const impacts = queuedImpactsRef.current;
      queuedImpactsRef.current = [];

      if (remotePawns.length > 0) {
        const currentIds = new Set(remotePawns.map((p) => p.id));
        for (const [id] of remoteInterpolatedRef.current) {
          if (!currentIds.has(id)) remoteInterpolatedRef.current.delete(id);
        }
        for (const rp of remotePawns) {
          const prev = remoteInterpolatedRef.current.get(rp.id);
          if (!prev) {
            remoteInterpolatedRef.current.set(rp.id, { ...rp });
          } else {
            remoteInterpolatedRef.current.set(rp.id, interpolatePawn(prev, rp, 0.25));
          }
        }
      } else {
        remoteInterpolatedRef.current.clear();
      }
      const interpolatedRemotes = Array.from(remoteInterpolatedRef.current.values());

      const activeWelders: Array<{
        active: boolean;
        originX: number;
        originY: number;
        facingAngle: number;
        range: number;
      }> = [];

      if (isWelderActive) {
        activeWelders.push({
          active: true,
          originX: pawn.x,
          originY: pawn.y,
          facingAngle: aimAngle,
          range: 48,
        });
      }

      for (const rp of interpolatedRemotes) {
        if (rp.isWelding) {
          activeWelders.push({
            active: true,
            originX: rp.x,
            originY: rp.y,
            facingAngle: rp.facingAngle,
            range: 48,
          });
        }
      }

      rendererRef.current?.render(
        {
          pawn: activePawn,
          remotePawns: interpolatedRemotes,
          vitals,
          telemetry,
          nearestStation,
          activeInteraction,
          promptActionName,
          alertLevel,
          boarding: activeBoarding,
          beaconCode,
          crewCount,
          clearanceLevel,
          clearanceXp,
          credits,
          equippedWeapon,
          triageNotice,
          inGameNotice,
          dualProtocol,
          collabShift,
          camera: cameraRef.current,
          mouseWorld: mouseWorldRef.current,
          mouseScreen: mouseScreenRef.current,
          timeMs: now,
          impacts,
          chargingState: {
            active: isFiringRef.current && equippedWeapon === 'pulse_laser',
            ratio: laserChargeRatio,
            weaponType: equippedWeapon,
          },
          welderState: {
            active: isWelderActive,
            originX: pawn.x,
            originY: pawn.y,
            facingAngle: aimAngle,
            range: 48,
          },
          kineticAmmo: { ...kineticAmmoRef.current },
          welderThermal: {
            heat: welderHeatRef.current,
            isOverheated: welderOverheatedRef.current,
          },
          onBeaconClick,
          onManifestClick,
          onRoleClick,
          onDisembarkClick,
          onEquipWeapon,
          onAbortInteraction,
          onExecuteDualProtocol,
          onJoinCollabShift,
          screenWidth: canvas.clientWidth,
          screenHeight: canvas.clientHeight,
        },

        canvas.width,
        canvas.height
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    pawn,
    remotePawns,
    vitals,
    telemetry,
    nearestStation,
    activeInteraction,
    promptActionName,
    alertLevel,
    boarding,
    beaconCode,
    crewCount,
    clearanceLevel,
    clearanceXp,
    credits,
    equippedWeapon,
    triageNotice,
    inGameNotice,
    dualProtocol,
    collabShift,
    fireKineticRound,
    onWelderAoe,
    onWeldingStateChange,
    onBeaconClick,
    onManifestClick,
    onRoleClick,
    onDisembarkClick,
    onEquipWeapon,
    onAbortInteraction,
    onExecuteDualProtocol,
    onJoinCollabShift,
  ]);

  const activeDoors = boarding?.doors || defaultDoorsRef.current;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        data-testid="vessel-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'crosshair',
        }}
        onMouseMove={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const screenPixelX = e.clientX - rect.left;
          const screenPixelY = e.clientY - rect.top;
          mouseScreenRef.current = { x: screenPixelX, y: screenPixelY };

          const hitTester = rendererRef.current?.getHitTester();

          if (hitTester) {
            const isHit = hitTester.hitTest(screenPixelX, screenPixelY);
            canvas.style.cursor = isHit ? 'pointer' : 'crosshair';
          }

          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          mouseWorldRef.current = {
            x: clickX - canvas.width / 2 + cameraRef.current.x,
            y: clickY - canvas.height / 2 + cameraRef.current.y,
          };
        }}
        onMouseDown={(e) =>
          handleCanvasMouseDown(
            e,
            canvasRef.current,
            rendererRef.current,
            cameraRef.current,
            activeDoors,
            nearestStation,
            onStationClick,
            onToggleDoor,
            startFiring
          )
        }
        onMouseUp={stopFiring}
      />
    </div>
  );
};
