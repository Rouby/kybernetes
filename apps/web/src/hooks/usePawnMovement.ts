import type {
  DoorState,
  PawnState,
  StartingRole,
  StationFixture,
  WallSegment,
} from '@kybernetes/protocol';
import {
  createInitialDoors,
  findNearestDoor,
  findNearestStation,
  HESPERIA_SPAWNS,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  resolvePawnMovement,
} from '@kybernetes/sim-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ShipAudioEngine } from '../audio/ShipAudioEngine';
import type { DeckSurfaceType } from '../audio/synths/MetallicPlateSynth';

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

function getEffectiveWalls(doors?: DoorState[]): WallSegment[] {
  if (!doors || doors.length === 0) return HESPERIA_WALLS;
  const closedDoorWalls: WallSegment[] = doors
    .filter((d) => !d.isOpen)
    .map((d) => ({
      id: `door_wall_${d.id}`,
      x1: d.x1,
      y1: d.y1,
      x2: d.x2,
      y2: d.y2,
      isOpaque: true,
      isTraversable: false,
    }));
  return closedDoorWalls.length > 0 ? [...HESPERIA_WALLS, ...closedDoorWalls] : HESPERIA_WALLS;
}

// fallow-ignore-next-line complexity
function calculateNextPawnState(
  current: PawnState,
  keys: Set<string>,
  dt: number,
  doors?: DoorState[],
  facingAngle?: number
): PawnState {
  if (current.isOperating || current.isResting) {
    return current;
  }

  const dir = getMovementInput(keys);
  if (!dir) {
    return current.vx !== 0 || current.vy !== 0 ? { ...current, vx: 0, vy: 0 } : current;
  }

  const allWalls = getEffectiveWalls(doors);
  const resolved = resolvePawnMovement(
    current.x,
    current.y,
    current.x + dir.dx * PAWN_SPEED * dt,
    current.y + dir.dy * PAWN_SPEED * dt,
    PAWN_RADIUS,
    allWalls
  );

  return {
    ...current,
    x: resolved.x,
    y: resolved.y,
    vx: dir.dx * PAWN_SPEED,
    vy: dir.dy * PAWN_SPEED,
    facingAngle: facingAngle ?? Math.atan2(dir.dy, dir.dx),
  };
}

export function usePawnMovement(
  initialRole: StartingRole,
  doors?: DoorState[],
  onInteractPrompt?: (station: StationFixture | null) => void,
  facingAngleRef?: React.RefObject<number>
) {
  const [pawn, setPawn] = useState<PawnState>(() => {
    const spawn = HESPERIA_SPAWNS[initialRole];
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
  const facingAngleRefHolder = useRef(facingAngleRef);
  facingAngleRefHolder.current = facingAngleRef;
  const footstepDistRef = useRef(0);
  const defaultDoorsRef = useRef(createInitialDoors());

  const resetToSpawn = useCallback((role: StartingRole) => {
    const spawn = HESPERIA_SPAWNS[role];
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

      const effectiveFacing = facingAngleRefHolder.current?.current;

      const nextPawn = calculateNextPawnState(
        pawnRef.current,
        keysPressed.current,
        dt,
        activeDoors,
        effectiveFacing
      );
      if (nextPawn !== pawnRef.current) setPawn(nextPawn);

      const targetFacing = effectiveFacing ?? nextPawn.facingAngle;

      const nearby = findNearestStation(
        nextPawn.x,
        nextPawn.y,
        HESPERIA_STATIONS,
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

      const nearbyDoor = findNearestDoor(nextPawn.x, nextPawn.y, activeDoors, 42, targetFacing);
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
          const surface = getDeckSurface(nextPawn.x, nextPawn.y);
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
