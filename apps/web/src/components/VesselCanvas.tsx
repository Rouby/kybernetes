import type {
  BoardingTacticsTelemetry,
  DoorState,
  DualProtocolBroadcast,
  PawnState,
  PlayerVitals,
  ShiftChecklistState,
  ShiftEvaluationGrade,
  StationFixture,
  TelemetryDeltaBroadcast,
  WeaponType,
} from '@kybernetes/protocol';
import { createInitialDoors, interpolatePawn } from '@kybernetes/sim-core';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import { useCanvasWeapons } from '../hooks/useCanvasWeapons';
import {
  type PredictedProjectile,
  usePredictiveProjectiles,
} from '../hooks/usePredictiveProjectiles';
import { useTacticalCamera } from '../hooks/useTacticalCamera';
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
  shiftChecklist?: ShiftChecklistState;
  projectedGrade?: ShiftEvaluationGrade;
  shiftTimerFormatted?: string;
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
  onAudioClick?: () => void;
  onDisembarkClick?: () => void;
  onEquipWeapon?: (w: WeaponType) => void;
  onAbortInteraction?: () => void;
  onExecuteDualProtocol?: () => void;
  onJoinCollabShift?: () => void;
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
function interpolateRemotePawns(
  remotePawns: PawnState[],
  cache: Map<string, PawnState>
): PawnState[] {
  if (remotePawns.length === 0) {
    cache.clear();
    return [];
  }
  const currentIds = new Set(remotePawns.map((p) => p.id));
  for (const [id] of cache) {
    if (!currentIds.has(id)) cache.delete(id);
  }
  for (const rp of remotePawns) {
    const prev = cache.get(rp.id);
    if (!prev) {
      cache.set(rp.id, { ...rp });
    } else {
      cache.set(rp.id, interpolatePawn(prev, rp, 0.25));
    }
  }
  return Array.from(cache.values());
}

// fallow-ignore-next-line complexity
function handleCanvasMouseDown(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  renderer: WebGL2Renderer | null,
  camera: { x: number; y: number },
  doors: DoorState[] | undefined,
  nearestStation: StationFixture | null,
  zoom = 1.0,
  onStationClick?: (station: StationFixture) => void,
  onToggleDoor?: (doorId: string, open: boolean) => void,
  startFiring?: () => void
) {
  if (e.button !== 0 || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const screenPixelX = e.clientX - rect.left;
  const screenPixelY = e.clientY - rect.top;

  if (renderer?.getHitTester().handleClick(screenPixelX, screenPixelY)) {
    return;
  }

  if (renderer?.getHitTester().hitTest(screenPixelX, screenPixelY)) {
    return;
  }

  const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);
  const worldX = (clickX - canvas.width / 2) / zoom + camera.x;
  const worldY = (clickY - canvas.height / 2) / zoom + camera.y;

  if (doors && onToggleDoor) {
    const clickedDoor = doors.find((d) => {
      const mx = (d.x1 + d.x2) / 2;
      const my = (d.y1 + d.y2) / 2;
      return Math.hypot(mx - worldX, my - worldY) < 32;
    });
    if (clickedDoor) {
      onToggleDoor(clickedDoor.id, !clickedDoor.isOpen);
      ShipAudioEngine.getInstance().playDoorToggle(
        (clickedDoor.x1 + clickedDoor.x2) / 2,
        (clickedDoor.y1 + clickedDoor.y2) / 2,
        !clickedDoor.isOpen
      );
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
  shiftChecklist,
  projectedGrade,
  shiftTimerFormatted,
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
  onAudioClick,
  onDisembarkClick,
  onEquipWeapon,
  onAbortInteraction,
  onExecuteDualProtocol,
  onJoinCollabShift,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGL2Renderer | null>(null);
  const mouseWorldRef = useRef({ x: pawn.x + 50, y: pawn.y });
  const mouseScreenRef = useRef({ x: 0, y: 0 });
  const defaultDoorsRef = useRef(createInitialDoors());
  const remoteInterpolatedRef = useRef<Map<string, PawnState>>(new Map());

  const lastFrameTimeRef = useRef<number>(performance.now());
  const queuedImpactsRef = useRef<
    Array<{ x: number; y: number; type: 'kinetic' | 'laser' | 'welder' }>
  >([]);
  const queuedMuzzleFlashesRef = useRef<Array<{ x: number; y: number; weaponType: WeaponType }>>(
    []
  );

  const { cameraRef, zoomRef, addScreenShake, updateCamera } = useTacticalCamera({
    initialX: pawn.x,
    initialY: pawn.y,
    canvasRef,
  });

  const { localProjectilesRef, addPredictedProjectile, stepProjectiles } = usePredictiveProjectiles(
    boarding?.projectiles
  );

  const {
    isFiringRef,
    kineticAmmoRef,
    welderHeatRef,
    welderOverheatedRef,
    startFiring,
    stopFiring,
    stepWeapons,
  } = useCanvasWeapons({
    pawn,
    mouseWorldRef,
    equippedWeapon,
    onFireWeapon,
    onWelderAoe,
    onWeldingStateChange,
    onSpawnProjectile: addPredictedProjectile,
    onMuzzleFlash: (flash) => queuedMuzzleFlashesRef.current.push(flash),
    onImpact: (x, y, type) => {
      queuedImpactsRef.current.push({ x, y, type });
      addScreenShake(1.4);
      ShipAudioEngine.getInstance().playImpact(x, y, type);
    },
    addScreenShake,
  });

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
      ShipAudioEngine.getInstance().updateListener(pawn.x, pawn.y, doors);

      stepProjectiles(dt, doors, (hitX, hitY, type) => {
        queuedImpactsRef.current.push({ x: hitX, y: hitY, type });
        addScreenShake(1.4);
        ShipAudioEngine.getInstance().playImpact(hitX, hitY, type);
      });

      const renderCam = updateCamera(
        pawn.x,
        pawn.y,
        mouseWorldRef.current.x,
        mouseWorldRef.current.y,
        dt
      );

      const activeBoarding = getActiveBoarding(
        boarding,
        defaultDoorsRef.current,
        localProjectilesRef.current
      );

      const { laserChargeRatio, isWelderActive, aimAngle } = stepWeapons(
        now,
        dt,
        doors,
        activeBoarding
      );

      const activePawn = { ...pawn, facingAngle: aimAngle };
      const interpolatedRemotes = interpolateRemotePawns(
        remotePawns,
        remoteInterpolatedRef.current
      );

      const impacts = queuedImpactsRef.current;
      queuedImpactsRef.current = [];
      const muzzleFlashes = queuedMuzzleFlashesRef.current;
      queuedMuzzleFlashesRef.current = [];

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
          shiftChecklist,
          projectedGrade,
          shiftTimerFormatted,
          camera: renderCam,
          zoom: zoomRef.current,
          mouseWorld: mouseWorldRef.current,
          mouseScreen: mouseScreenRef.current,
          timeMs: now,
          impacts,
          muzzleFlashes,
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
          onAudioClick,
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
    activeInteraction,
    addScreenShake,
    alertLevel,
    beaconCode,
    boarding,
    clearanceLevel,
    clearanceXp,
    collabShift,
    credits,
    crewCount,
    dualProtocol,
    equippedWeapon,
    inGameNotice,
    isFiringRef,
    kineticAmmoRef,
    localProjectilesRef,
    nearestStation,
    onAbortInteraction,
    onAudioClick,
    onBeaconClick,
    onDisembarkClick,
    onEquipWeapon,
    onExecuteDualProtocol,
    onJoinCollabShift,
    onManifestClick,
    onRoleClick,
    pawn,
    projectedGrade,
    promptActionName,
    remotePawns,
    shiftChecklist,
    shiftTimerFormatted,
    stepProjectiles,
    stepWeapons,
    telemetry,
    triageNotice,
    updateCamera,
    vitals,
    welderHeatRef,
    welderOverheatedRef,
    zoomRef,
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

          const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
          const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);
          mouseWorldRef.current = {
            x: (clickX - canvas.width / 2) / zoomRef.current + cameraRef.current.x,
            y: (clickY - canvas.height / 2) / zoomRef.current + cameraRef.current.y,
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
            zoomRef.current,
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
