import type {
  DockingPhase,
  DoorState,
  PawnState,
  PlayerVitals,
  RoomAtmosphereSummary,
  StartingRole,
  StationFixture,
} from '@kybernetes/protocol';
import {
  createInitialDoors,
  findNearestDoor,
  findNearestStation,
  getAirflowDragVector,
  getWorldDoors,
  getWorldStations,
  isAboardShip,
  resolveFramedMovement,
  STATION_BAY_SPAWN,
} from '@kybernetes/sim-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import type { DeckSurfaceType } from '../audio/synths/MetallicPlateSynth';
import { liveEtaSeconds, resolveClientShipOffset } from '../webgl/StationHub';

const PAWN_SPEED = 180;
const PAWN_RADIUS = 14;

// fallow-ignore-next-line complexity
function getDeckSurface(x: number, y: number): DeckSurfaceType {
  if (y >= 368 && y <= 432) return 'grate'; // Central catwalk subfloor grating
  if (x >= 760 && y > 432) return 'grate'; // Deck D engineering diamond plate
  if (x <= 320 && y < 368) return 'linoleum'; // Deck A bridge linoleum
  return 'steel';
}

const KEY_DELTAS: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

function getMovementInput(keys: Set<string>): { dx: number; dy: number } | null {
  let dx = 0;
  let dy = 0;
  for (const k of keys) {
    const d = KEY_DELTAS[k];
    if (d) {
      dx += d.x;
      dy += d.y;
    }
  }

  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  return { dx: dx / len, dy: dy / len };
}

export interface DockingView {
  phase: DockingPhase;
  etaSeconds: number;
  legIndex: number;
  receivedAt: number;
}

// fallow-ignore-next-line complexity
function calculateNextPawnState(
  current: PawnState,
  keys: Set<string>,
  dt: number,
  doors?: DoorState[],
  facingAngle?: number,
  vitals?: PlayerVitals,
  dragVector?: { u: number; v: number },
  offset: { x: number; y: number } = { x: 0, y: 0 }
): PawnState {
  if (current.isOperating || current.isResting) {
    return current;
  }

  const speedMult = vitals?.incapacitated?.isIncapacitated ? 0.25 : 1.0;
  const speed = PAWN_SPEED * speedMult;
  const dir = getMovementInput(keys);
  const dragU = dragVector?.u ?? 0;
  const dragV = dragVector?.v ?? 0;
  const hasDrag = Math.hypot(dragU, dragV) > 1.0;

  if (!dir && !hasDrag) {
    return current.vx !== 0 || current.vy !== 0 ? { ...current, vx: 0, vy: 0 } : current;
  }

  const inputVx = dir ? dir.dx * speed : 0;
  const inputVy = dir ? dir.dy * speed : 0;
  const totalVx = inputVx + dragU;
  const totalVy = inputVy + dragV;

  const resolved = resolveFramedMovement(
    current.x,
    current.y,
    current.x + totalVx * dt,
    current.y + totalVy * dt,
    PAWN_RADIUS,
    doors ?? [],
    offset
  );

  return {
    ...current,
    x: resolved.x,
    y: resolved.y,
    vx: totalVx,
    vy: totalVy,
    facingAngle: facingAngle ?? (dir ? Math.atan2(dir.dy, dir.dx) : current.facingAngle),
  };
}

export function usePawnMovement(
  initialRole: StartingRole,
  doors?: DoorState[],
  onInteractPrompt?: (station: StationFixture | null) => void,
  facingAngleRef?: React.RefObject<number>,
  vitals?: PlayerVitals,
  roomAtmospheres?: Record<string, RoomAtmosphereSummary>,
  breaches?: string[],
  docking?: DockingView
) {
  const dockingRef = useRef(docking);
  dockingRef.current = docking;
  const lastOffsetRef = useRef({ x: 0, y: 0 });
  const [pawn, setPawn] = useState<PawnState>(() => {
    const spawn = STATION_BAY_SPAWN;
    return {
      id: 'local_player',
      callsign: 'RECRUIT-01',
      role: initialRole,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facingAngle: 0,
      currentDeck: 'deck_main',
      isOperating: false,
      isResting: false,
      color: '#ffb000',
    };
  });

  const keysPressed = useRef<Set<string>>(new Set());
  const pawnRef = useRef(pawn);
  pawnRef.current = pawn;

  const [nearestStation, setNearestStation] = useState<StationFixture | null>(null);
  const [nearestDoor, setNearestDoor] = useState<DoorState | null>(null);
  const currentNearRef = useRef<string | null>(null);
  const currentNearDoorRef = useRef<string | null>(null);
  const currentNearDoorIsOpenRef = useRef<boolean | undefined>(undefined);
  const doorsRef = useRef(doors);
  doorsRef.current = doors;
  const breachesRef = useRef(breaches);
  breachesRef.current = breaches;
  const facingAngleRefHolder = useRef(facingAngleRef);
  facingAngleRefHolder.current = facingAngleRef;
  const vitalsRef = useRef(vitals);
  vitalsRef.current = vitals;
  const roomAtmospheresRef = useRef(roomAtmospheres);
  roomAtmospheresRef.current = roomAtmospheres;
  const footstepDistRef = useRef(0);
  const defaultDoorsRef = useRef(createInitialDoors());

  const resetToSpawn = useCallback((role: StartingRole) => {
    const spawn = STATION_BAY_SPAWN;
    setPawn((prev) => ({
      ...prev,
      role,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facingAngle: 0,
      isOperating: false,
      isResting: false,
    }));
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (KEY_DELTAS[e.code]) keysPressed.current.add(e.code);
    };
    const onUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    // fallow-ignore-next-line complexity
    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const activeDoors =
        doorsRef.current && doorsRef.current.length > 0
          ? doorsRef.current
          : defaultDoorsRef.current;

      const dock = dockingRef.current;
      const liveEta = dock ? liveEtaSeconds(dock.etaSeconds, dock.receivedAt, time) : 20;
      const offset = dock
        ? resolveClientShipOffset(dock.phase, liveEta, dock.legIndex)
        : { x: 0, y: 0 };
      const last = lastOffsetRef.current;
      if (
        (offset.x !== last.x || offset.y !== last.y) &&
        isAboardShip(pawnRef.current.x, pawnRef.current.y, last)
      ) {
        const carried = {
          ...pawnRef.current,
          x: pawnRef.current.x + (offset.x - last.x),
          y: pawnRef.current.y + (offset.y - last.y),
        };
        pawnRef.current = carried;
        setPawn(carried);
      }
      lastOffsetRef.current = offset;

      const effectiveFacing = facingAngleRefHolder.current?.current;

      const dragAboard = isAboardShip(pawnRef.current.x, pawnRef.current.y, offset);
      const dragVector = getAirflowDragVector(
        dragAboard ? pawnRef.current.x - offset.x : pawnRef.current.x,
        dragAboard ? pawnRef.current.y - offset.y : pawnRef.current.y,
        activeDoors,
        breachesRef.current,
        roomAtmospheresRef.current
      );

      const nextPawn = calculateNextPawnState(
        pawnRef.current,
        keysPressed.current,
        dt,
        activeDoors,
        effectiveFacing,
        vitalsRef.current,
        dragVector,
        offset
      );
      if (nextPawn !== pawnRef.current) setPawn(nextPawn);

      const targetFacing = effectiveFacing ?? nextPawn.facingAngle;

      const nearby = findNearestStation(
        nextPawn.x,
        nextPawn.y,
        getWorldStations(offset),
        54,
        targetFacing
      );
      const nextStation = nearby ? nearby.station : null;
      const nextId = nextStation ? nextStation.id : null;

      if (currentNearRef.current !== nextId) {
        currentNearRef.current = nextId;
        setNearestStation(nextStation);
        onInteractPrompt?.(nextStation);
        if (nextStation) {
          ShipAudioEngine.getInstance().playStationInteract();
        }
      }

      const nearbyDoor = findNearestDoor(
        nextPawn.x,
        nextPawn.y,
        getWorldDoors(activeDoors, offset).filter((d) => !d.isSealed),
        42,
        targetFacing
      );
      const nextDoor = nearbyDoor ? nearbyDoor.door : null;
      const nextDoorId = nextDoor ? nextDoor.id : null;
      const nextDoorIsOpen = nextDoor ? nextDoor.isOpen : undefined;

      if (
        currentNearDoorRef.current !== nextDoorId ||
        currentNearDoorIsOpenRef.current !== nextDoorIsOpen
      ) {
        const isNewDoor = currentNearDoorRef.current !== nextDoorId && nextDoorId !== null;
        currentNearDoorRef.current = nextDoorId;
        currentNearDoorIsOpenRef.current = nextDoorIsOpen;
        setNearestDoor(nextDoor);
        if (isNewDoor) {
          ShipAudioEngine.getInstance().playStationInteract();
        }
      }

      if (nextPawn.vx !== 0 || nextPawn.vy !== 0) {
        footstepDistRef.current += Math.hypot(nextPawn.vx, nextPawn.vy) * dt;
        if (footstepDistRef.current >= 56) {
          footstepDistRef.current = 0;
          const surfaceAboard = isAboardShip(nextPawn.x, nextPawn.y, offset);
          const surface = getDeckSurface(
            surfaceAboard ? nextPawn.x - offset.x : nextPawn.x,
            surfaceAboard ? nextPawn.y - offset.y : nextPawn.y
          );
          ShipAudioEngine.getInstance().playLocalFootstep(surface);
        }
      } else {
        footstepDistRef.current = 0;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [onInteractPrompt]);

  return { pawn, setPawn, nearestStation, nearestDoor, resetToSpawn };
}
