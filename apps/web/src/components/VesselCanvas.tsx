import type {
  BoardingTacticsTelemetry,
  DoorState,
  PawnState,
  ProjectileState,
  StationFixture,
  WeaponType,
} from '@kybernetes/protocol';
import { createInitialDoors, createProjectile } from '@kybernetes/sim-core';
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
    weaponType: WeaponType
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

function integrateProjectiles(
  projectiles: PredictedProjectile[],
  dt: number
): PredictedProjectile[] {
  const result: PredictedProjectile[] = [];
  for (const p of projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.lifeSeconds -= dt;
    if (p.lifeSeconds > 0) result.push(p);
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
function handleCanvasClick(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  camera: { x: number; y: number },
  pawn: PawnState,
  equippedWeapon: WeaponType,
  doors: DoorState[] | undefined,
  nearestStation: StationFixture | null,
  onStationClick?: (station: StationFixture) => void,
  onToggleDoor?: (doorId: string, open: boolean) => void,
  onFire?: (
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    weaponType: WeaponType
  ) => void
) {
  if (!canvas) return;
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
    const distToStation = Math.hypot(nearestStation.x - worldX, nearestStation.y - worldY);
    if (distToStation < nearestStation.radius + 10) {
      onStationClick(nearestStation);
      return;
    }
  }

  if (onFire) {
    onFire(pawn.x, pawn.y, worldX, worldY, equippedWeapon);
  }
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
  onToggleDoor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGL2Renderer | null>(null);
  const cameraRef = useRef({ x: pawn.x, y: pawn.y });
  const mouseWorldRef = useRef({ x: pawn.x + 50, y: pawn.y });
  const defaultDoorsRef = useRef(createInitialDoors());

  const localProjectilesRef = useRef<PredictedProjectile[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());

  const handleInstantFire = useCallback(
    (
      originX: number,
      originY: number,
      targetX: number,
      targetY: number,
      weaponType: WeaponType
    ) => {
      const proj = createProjectile(originX, originY, targetX, targetY, weaponType, true);
      localProjectilesRef.current.push({ ...proj, spawnTime: performance.now() });
      onFireWeapon?.(originX, originY, targetX, targetY, weaponType);
    },
    [onFireWeapon]
  );

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
      if (e.code === 'Space') {
        e.preventDefault();
        handleInstantFire(
          pawn.x,
          pawn.y,
          mouseWorldRef.current.x,
          mouseWorldRef.current.y,
          equippedWeapon
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pawn.x, pawn.y, equippedWeapon, handleInstantFire]);

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

    const render = () => {
      if (canvas.width === 0 || canvas.height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      const now = performance.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;

      localProjectilesRef.current = integrateProjectiles(localProjectilesRef.current, dt);

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

      rendererRef.current?.render(
        {
          pawn: activePawn,
          nearestStation,
          boarding: activeBoarding,
          alertLevel,
          camera: cameraRef.current,
          mouseWorld: mouseWorldRef.current,
          timeMs: now,
        },
        canvas.width,
        canvas.height
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [pawn, nearestStation, alertLevel, boarding]);

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
        onClick={(e) =>
          handleCanvasClick(
            e,
            canvasRef.current,
            cameraRef.current,
            pawn,
            equippedWeapon,
            activeDoors,
            nearestStation,
            onStationClick,
            onToggleDoor,
            handleInstantFire
          )
        }
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
