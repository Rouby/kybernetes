import type {
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  ProjectileState,
  StationFixture,
  WeaponType,
} from '@kybernetes/protocol';
import {
  applyWelderAoeDamage,
  createInitialDoors,
  createProjectile,
  HESPERIA_WALLS,
  segmentsIntersect,
} from '@kybernetes/sim-core';
import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { ActiveInteraction } from '../types';
import { WebGL2Renderer } from '../webgl';

interface VesselCanvasProps {
  pawn: PawnState;
  nearestStation: StationFixture | null;
  activeInteraction?: ActiveInteraction | null;
  promptActionName?: string;
  alertLevel?: 'nominal' | 'yellow' | 'red';
  activeFires?: string[];
  breaches?: string[];
  boarding?: BoardingTacticsTelemetry;
  equippedWeapon?: WeaponType;
  onStationClick?: (station: StationFixture) => void;
  onEngageIntruder?: (intruderId: string) => void;
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
    const hitDoor = doors.some(
      (d) => !d.isOpen && segmentsIntersect(p1, p2, { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 })
    );

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
  camera: { x: number; y: number },
  doors: DoorState[] | undefined,
  nearestStation: StationFixture | null,
  onStationClick?: (station: StationFixture) => void,
  onToggleDoor?: (doorId: string, open: boolean) => void,
  startFiring?: () => void
) {
  if (e.button !== 0 || !canvas) return;
  const rect = canvas.getBoundingClientRect();
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
  nearestStation,
  promptActionName,
  alertLevel = 'nominal',
  boarding,
  equippedWeapon = 'kinetic_carbine',
  onStationClick,
  onFireWeapon,
  onWelderAoe,
  onToggleDoor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGL2Renderer | null>(null);
  const cameraRef = useRef({ x: pawn.x, y: pawn.y });
  const mouseWorldRef = useRef({ x: pawn.x + 50, y: pawn.y });
  const defaultDoorsRef = useRef(createInitialDoors());

  const localProjectilesRef = useRef<PredictedProjectile[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const queuedImpactsRef = useRef<
    Array<{ x: number; y: number; type: 'kinetic' | 'laser' | 'welder' }>
  >([]);

  const isFiringRef = useRef(false);
  const laserChargeStartRef = useRef<number | null>(null);
  const lastKineticFireRef = useRef<number>(0);
  const lastWelderTickRef = useRef<number>(0);

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

  const startFiring = useCallback(() => {
    isFiringRef.current = true;
    const now = performance.now();
    if (equippedWeapon === 'kinetic_carbine') {
      handleInstantFire(
        pawn.x,
        pawn.y,
        mouseWorldRef.current.x,
        mouseWorldRef.current.y,
        'kinetic_carbine'
      );
      lastKineticFireRef.current = now;
    } else if (equippedWeapon === 'pulse_laser') {
      laserChargeStartRef.current = now;
    } else if (equippedWeapon === 'arc_welder') {
      lastWelderTickRef.current = now;
    }
  }, [equippedWeapon, pawn.x, pawn.y, handleInstantFire]);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        startFiring();
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
  }, [startFiring, stopFiring]);

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

      // 1. Continuous Kinetic Carbine firing
      if (isFiringRef.current && equippedWeapon === 'kinetic_carbine') {
        if (now - lastKineticFireRef.current >= 105) {
          handleInstantFire(
            pawn.x,
            pawn.y,
            mouseWorldRef.current.x,
            mouseWorldRef.current.y,
            'kinetic_carbine'
          );
          lastKineticFireRef.current = now;
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

      // 3. Continuous Arc Welder AOE Cone
      const isWelderActive = isFiringRef.current && equippedWeapon === 'arc_welder';
      if (isWelderActive && now - lastWelderTickRef.current >= 100) {
        lastWelderTickRef.current = now;
        const aoe = applyWelderAoeDamage(
          activeBoarding.intruders,
          pawn.x,
          pawn.y,
          aimAngle,
          10,
          135
        );
        if (aoe.hitIntruders.length > 0) {
          onWelderAoe?.(pawn.x, pawn.y, aimAngle, 10, 135);
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

      rendererRef.current?.render(
        {
          pawn: activePawn,
          nearestStation,
          boarding: activeBoarding,
          alertLevel,
          camera: cameraRef.current,
          mouseWorld: mouseWorldRef.current,
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
            range: 135,
          },
        },
        canvas.width,
        canvas.height
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [pawn, nearestStation, alertLevel, boarding, equippedWeapon, handleInstantFire, onWelderAoe]);

  const activeDoors = boarding?.doors || defaultDoorsRef.current;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
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

      {nearestStation && (
        <div
          data-testid="station-prompt"
          style={{
            position: 'absolute',
            left: `${Math.round((canvasRef.current ? canvasRef.current.clientWidth / 2 : 500) + (nearestStation.x - cameraRef.current.x))}px`,
            top: `${Math.round((canvasRef.current ? canvasRef.current.clientHeight / 2 : 400) + (nearestStation.y - cameraRef.current.y - nearestStation.radius - 24))}px`,
            transform: 'translateX(-50%)',
            background: 'rgba(10, 15, 23, 0.92)',
            border: '1px solid #00e5ff',
            color: '#00e5ff',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            borderRadius: '4px',
            boxShadow: '0 0 10px rgba(0, 229, 255, 0.5)',
            zIndex: 10,
          }}
        >
          [E] {promptActionName || nearestStation.name}
        </div>
      )}
    </div>
  );
};
