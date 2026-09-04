import type {
  AtmosOverlayMode,
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
import { createInitialDoors, interpolatePawn, isImpactVisible } from '@kybernetes/sim-core';
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
  nearestDoor?: DoorState | null;
  facingAngleRef?: React.RefObject<number>;
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
  onToggleHelmet?: () => void;
  onRefillSuit?: () => void;
  currentRoomId?: string;
  overlayMode?: AtmosOverlayMode;
  onCycleOverlay?: () => void;
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

function screenToWorld(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
  camX: number,
  camY: number,
  zoom: number
): { x: number; y: number } {
  return {
    x: (screenX - width / 2) / zoom + camX,
    y: (screenY - height / 2) / zoom + camY,
  };
}

// fallow-ignore-next-line complexity
function handleCanvasMouseDown(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  renderer: WebGL2Renderer | null,
  camera: { x: number; y: number },
  nearestStation: StationFixture | null,
  zoom = 1.35,
  mouseScreenRef?: React.MutableRefObject<{ x: number; y: number }>,
  mouseWorldRef?: React.MutableRefObject<{ x: number; y: number }>,
  hasMouseMovedRef?: React.MutableRefObject<boolean>,
  onStationClick?: (station: StationFixture) => void,
  startFiring?: () => void
) {
  if (e.button !== 0 || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const canvasPixelX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const canvasPixelY = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (mouseScreenRef) mouseScreenRef.current = { x: canvasPixelX, y: canvasPixelY };
  if (hasMouseMovedRef) hasMouseMovedRef.current = true;

  if (
    renderer?.getHitTester().handleClick(canvasPixelX, canvasPixelY, canvas.width, canvas.height)
  ) {
    return;
  }

  if (renderer?.getHitTester().hitTest(canvasPixelX, canvasPixelY, canvas.width, canvas.height)) {
    return;
  }

  const world = screenToWorld(
    canvasPixelX,
    canvasPixelY,
    canvas.width,
    canvas.height,
    camera.x,
    camera.y,
    zoom
  );
  if (mouseWorldRef) mouseWorldRef.current = world;

  if (nearestStation && onStationClick) {
    const dist = Math.hypot(nearestStation.x - world.x, nearestStation.y - world.y);
    if (dist < nearestStation.radius + 10) {
      onStationClick(nearestStation);
      return;
    }
  }

  startFiring?.();
}

// fallow-ignore-next-line complexity
function handleCanvasMouseMove(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  renderer: WebGL2Renderer | null,
  camera: { x: number; y: number },
  zoom: number,
  pawn: { x: number; y: number },
  mouseScreenRef: React.MutableRefObject<{ x: number; y: number }>,
  mouseWorldRef: React.MutableRefObject<{ x: number; y: number }>,
  hasMouseMovedRef: React.MutableRefObject<boolean>,
  facingAngleRef?: React.RefObject<number>
): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const canvasPixelX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const canvasPixelY = (e.clientY - rect.top) * (canvas.height / rect.height);
  mouseScreenRef.current = { x: canvasPixelX, y: canvasPixelY };
  hasMouseMovedRef.current = true;

  const hitTester = renderer?.getHitTester();
  if (hitTester) {
    const isHit = hitTester.hitTest(canvasPixelX, canvasPixelY, canvas.width, canvas.height);
    canvas.style.cursor = isHit ? 'pointer' : 'crosshair';
  }

  mouseWorldRef.current = screenToWorld(
    canvasPixelX,
    canvasPixelY,
    canvas.width,
    canvas.height,
    camera.x,
    camera.y,
    zoom
  );
  if (facingAngleRef) {
    facingAngleRef.current = Math.atan2(
      mouseWorldRef.current.y - pawn.y,
      mouseWorldRef.current.x - pawn.x
    );
  }
}

// fallow-ignore-next-line complexity
export const VesselCanvas: React.FC<VesselCanvasProps> = ({
  pawn,
  remotePawns = [],
  vitals,
  telemetry,
  nearestStation,
  nearestDoor,
  facingAngleRef,
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
  onToggleHelmet,
  onRefillSuit,
  currentRoomId,
  overlayMode = 'off',
  onCycleOverlay,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGL2Renderer | null>(null);
  const mouseWorldRef = useRef({ x: pawn.x + 50, y: pawn.y });
  const mouseScreenRef = useRef({ x: 0, y: 0 });
  const hasMouseMovedRef = useRef(false);
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
        if (isImpactVisible({ x: pawn.x, y: pawn.y }, { x: hitX, y: hitY }, doors)) {
          queuedImpactsRef.current.push({ x: hitX, y: hitY, type });
          addScreenShake(1.4);
          ShipAudioEngine.getInstance().playImpact(hitX, hitY, type);
        }
      });

      const renderCam = updateCamera(
        pawn.x,
        pawn.y,
        mouseWorldRef.current.x,
        mouseWorldRef.current.y,
        dt
      );

      const zoom = zoomRef.current;
      if (hasMouseMovedRef.current) {
        mouseWorldRef.current = screenToWorld(
          mouseScreenRef.current.x,
          mouseScreenRef.current.y,
          canvas.width,
          canvas.height,
          renderCam.x,
          renderCam.y,
          zoom
        );
      } else {
        mouseWorldRef.current = {
          x: pawn.x + 50,
          y: pawn.y,
        };
      }

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
      if (facingAngleRef) {
        facingAngleRef.current = aimAngle;
      }
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
          nearestDoorId: nearestDoor?.id,
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
          onToggleHelmet,
          onRefillSuit,
          currentRoomId,
          overlayMode,
          onCycleOverlay,
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
    currentRoomId,
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
    onCycleOverlay,
    onDisembarkClick,
    onEquipWeapon,
    onExecuteDualProtocol,
    onJoinCollabShift,
    onManifestClick,
    onRefillSuit,
    onRoleClick,
    onToggleHelmet,
    overlayMode,
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
    nearestDoor?.id,
    facingAngleRef,
  ]);

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
        onMouseMove={(e) =>
          handleCanvasMouseMove(
            e,
            canvasRef.current,
            rendererRef.current,
            cameraRef.current,
            zoomRef.current,
            pawn,
            mouseScreenRef,
            mouseWorldRef,
            hasMouseMovedRef,
            facingAngleRef
          )
        }
        onMouseDown={(e) =>
          handleCanvasMouseDown(
            e,
            canvasRef.current,
            rendererRef.current,
            cameraRef.current,
            nearestStation,
            zoomRef.current,
            mouseScreenRef,
            mouseWorldRef,
            hasMouseMovedRef,
            onStationClick,
            startFiring
          )
        }
        onMouseUp={stopFiring}
      />
    </div>
  );
};
