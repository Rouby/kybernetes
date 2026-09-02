import type {
  DoorState,
  PawnState,
  StartingRole,
  StationFixture,
  WallSegment,
} from '@kybernetes/protocol';
import {
  findNearestStation,
  HESPERIA_SPAWNS,
  HESPERIA_STATIONS,
  HESPERIA_WALLS,
  resolvePawnMovement,
} from '@kybernetes/sim-core';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAWN_SPEED = 180;
const PAWN_RADIUS = 14;

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

// fallow-ignore-next-line complexity
function calculateNextPawnState(
  current: PawnState,
  keys: Set<string>,
  dt: number,
  doors?: DoorState[]
): PawnState {
  if (current.isOperating || current.isResting) {
    return current;
  }

  const dir = getMovementInput(keys);
  if (!dir) {
    return current.vx !== 0 ? { ...current, vx: 0, vy: 0 } : current;
  }

  const targetX = current.x + dir.dx * PAWN_SPEED * dt;
  const targetY = current.y + dir.dy * PAWN_SPEED * dt;

  const closedDoorWalls: WallSegment[] = (doors || [])
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

  const allWalls =
    closedDoorWalls.length > 0 ? [...HESPERIA_WALLS, ...closedDoorWalls] : HESPERIA_WALLS;

  const resolved = resolvePawnMovement(
    current.x,
    current.y,
    targetX,
    targetY,
    PAWN_RADIUS,
    allWalls
  );

  return {
    ...current,
    x: resolved.x,
    y: resolved.y,
    vx: dir.dx * PAWN_SPEED,
    vy: dir.dy * PAWN_SPEED,
    facingAngle: Math.atan2(dir.dy, dir.dx),
  };
}

export function usePawnMovement(
  initialRole: StartingRole,
  doors?: DoorState[],
  onInteractPrompt?: (station: StationFixture | null) => void
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
  const currentNearRef = useRef<string | null>(null);
  const doorsRef = useRef(doors);
  doorsRef.current = doors;

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

      const nextPawn = calculateNextPawnState(
        pawnRef.current,
        keysPressed.current,
        dt,
        doorsRef.current
      );
      if (nextPawn !== pawnRef.current) setPawn(nextPawn);

      const nearby = findNearestStation(nextPawn.x, nextPawn.y, HESPERIA_STATIONS, 54);
      const nextStation = nearby ? nearby.station : null;
      const nextId = nextStation ? nextStation.id : null;

      if (currentNearRef.current !== nextId) {
        currentNearRef.current = nextId;
        setNearestStation(nextStation);
        onInteractPrompt?.(nextStation);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [onInteractPrompt]);

  return { pawn, setPawn, nearestStation, resetToSpawn };
}
