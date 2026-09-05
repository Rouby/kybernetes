import type {
  BoardingPodState,
  BoardingTacticsTelemetry,
  DoorState,
  IntruderAiState,
  IntruderState,
  ProjectileState,
  SentryGunState,
  StartingRole,
  WeaponType,
} from '@kybernetes/protocol';
import { segmentsIntersect } from '../spatial/collision';
import type { DockFrameOffset } from '../spatial/deck';
import { createInitialDoors, toggleDoor } from '../spatial/doors';
import { findWaypointPath } from '../spatial/navigation';
import { applySuctionToPosition, createInitialRoomO2, tickAirVenting } from './airVenting';
import { createProjectile, tickProjectiles } from './projectiles';

export function createInitialBoardingState(): BoardingTacticsTelemetry {
  return {
    intruders: [],
    boardingPods: [],
    sentries: [],
    lockedBulkheads: [],
    ventedRooms: [],
    doors: createInitialDoors(),
    projectiles: [],
    roomO2: createInitialRoomO2(),
  };
}

const ROOM_CENTERS: Record<string, { x: number; y: number }> = {
  bridge: { x: 220, y: 170 },
  quarters: { x: 590, y: 170 },
  mess: { x: 970, y: 170 },
  corridor: { x: 590, y: 340 },
  armory: { x: 220, y: 570 },
  cargo: { x: 590, y: 570 },
  engineering: { x: 970, y: 570 },
};

export function spawnBoardingEvent(
  state: BoardingTacticsTelemetry,
  breachRoomId = 'cargo'
): BoardingTacticsTelemetry {
  const breach = ROOM_CENTERS[breachRoomId] || { x: 590, y: 570 };
  const podId = `pod-${Date.now()}`;

  const pod: BoardingPodState = {
    id: podId,
    roomId: breachRoomId,
    x: breach.x,
    y: breach.y,
    hullBreached: true,
    breachProgress: 1,
  };

  const raiderAlpha: IntruderState = {
    id: `intruder-${Date.now()}-1`,
    name: 'Marauder Breacher',
    x: breach.x - 20,
    y: breach.y,
    facingAngle: 0,
    health: 100,
    maxHealth: 100,
    currentRoomId: breachRoomId,
    targetRoomId: 'engineering',
    state: 'advancing',
    aiState: 'advancing',
    sabotageSecondsRemaining: 20,
    lastShotTime: 0,
  };

  const raiderBeta: IntruderState = {
    id: `intruder-${Date.now()}-2`,
    name: 'Marauder Infiltrator',
    x: breach.x + 20,
    y: breach.y,
    facingAngle: Math.PI,
    health: 80,
    maxHealth: 80,
    currentRoomId: breachRoomId,
    targetRoomId: 'bridge',
    state: 'advancing',
    aiState: 'advancing',
    sabotageSecondsRemaining: 20,
    lastShotTime: 0,
  };

  return {
    ...state,
    boardingPods: [...state.boardingPods, pod],
    intruders: [...state.intruders, raiderAlpha, raiderBeta],
  };
}

export function determineRoomFromCoords(x: number, y: number): string {
  if (y < 280) {
    if (x < 400) return 'bridge';
    if (x < 800) return 'quarters';
    return 'mess';
  }
  if (y <= 400) return 'corridor';
  if (x < 400) return 'armory';
  if (x < 800) return 'cargo';
  return 'engineering';
}

// fallow-ignore-next-line complexity
function moveAlongWaypoints(
  intruder: IntruderState,
  targetRoomId: string,
  dtSeconds: number,
  doors: DoorState[],
  isLocked: boolean
): { x: number; y: number; facingAngle: number; atTarget: boolean; blockedDoorId?: string } {
  if (isLocked) {
    return { x: intruder.x, y: intruder.y, facingAngle: intruder.facingAngle, atTarget: false };
  }

  const path = findWaypointPath(intruder.x, intruder.y, targetRoomId);
  if (path.length === 0) {
    return { x: intruder.x, y: intruder.y, facingAngle: intruder.facingAngle, atTarget: true };
  }

  // Next waypoint to head towards
  const nextNode = path[0];
  const dist = Math.hypot(nextNode.x - intruder.x, nextNode.y - intruder.y);

  if (dist < 12 && path.length === 1) {
    return { x: nextNode.x, y: nextNode.y, facingAngle: intruder.facingAngle, atTarget: true };
  }

  const targetNode = dist < 12 && path.length > 1 ? path[1] : nextNode;

  // Check if any door between intruder and targetNode (or nextNode) is closed
  const pIntruder = { x: intruder.x, y: intruder.y };
  const pTarget = { x: targetNode.x, y: targetNode.y };
  const pNext = { x: nextNode.x, y: nextNode.y };

  const blockedDoor = doors.find(
    (d) =>
      !d.isOpen &&
      (Math.hypot((d.x1 + d.x2) / 2 - nextNode.x, (d.y1 + d.y2) / 2 - nextNode.y) < 35 ||
        segmentsIntersect(pIntruder, pTarget, { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }) ||
        segmentsIntersect(pIntruder, pNext, { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }))
  );

  if (blockedDoor) {
    return {
      x: intruder.x,
      y: intruder.y,
      facingAngle: intruder.facingAngle,
      atTarget: false,
      blockedDoorId: blockedDoor.id,
    };
  }

  const dx = targetNode.x - intruder.x;
  const dy = targetNode.y - intruder.y;
  const angle = Math.atan2(dy, dx);
  const speed = 45 * dtSeconds;
  const step = Math.min(speed, Math.hypot(dx, dy));

  return {
    x: Number((intruder.x + Math.cos(angle) * step).toFixed(2)),
    y: Number((intruder.y + Math.sin(angle) * step).toFixed(2)),
    facingAngle: angle,
    atTarget: false,
  };
}

// fallow-ignore-next-line complexity
function updateSingleIntruderAI(
  intruder: IntruderState,
  state: BoardingTacticsTelemetry,
  roomO2: Record<string, number>,
  ventingRes: ReturnType<typeof tickAirVenting>,
  nextSentries: SentryGunState[],
  doors: DoorState[],
  playerPos: { x: number; y: number },
  dtSeconds: number,
  spawnedProjectiles: ProjectileState[],
  shipVelocity?: { vx: number; vy: number }
): {
  nextObj: IntruderState;
  sabotageDetonated: boolean;
  hullDamage: number;
} {
  if (intruder.state === 'neutralized') {
    return { nextObj: intruder, sabotageDetonated: false, hullDamage: 0 };
  }

  const currentRoom = determineRoomFromCoords(intruder.x, intruder.y);
  let health = intruder.health;
  const currentO2 = roomO2[currentRoom] ?? 100;
  const isVented =
    state.ventedRooms.includes(currentRoom) || ventingRes.ventedRooms.includes(currentRoom);

  if (isVented || currentO2 < 25) {
    health = Math.max(0, health - 15 * dtSeconds);
  }

  const sentry = nextSentries.find((s) => s.isFiring && s.targetIntruderId === intruder.id);
  if (sentry) {
    health = Math.max(0, health - 25 * dtSeconds);
  }

  if (health <= 0) {
    return {
      nextObj: { ...intruder, health: 0, state: 'neutralized', aiState: 'neutralized' },
      sabotageDetonated: false,
      hullDamage: 0,
    };
  }

  const suckedPos = applySuctionToPosition(
    intruder.x,
    intruder.y,
    ventingRes.activeSuctions,
    currentRoom,
    dtSeconds
  );

  let aiState: IntruderAiState = intruder.state === 'sabotaging' ? 'sabotaging' : 'advancing';
  let targetRoom = intruder.targetRoomId;

  if (currentO2 < 25 || isVented) {
    aiState = 'fleeing_vacuum';
    const safeRoom =
      Object.entries(roomO2).find(([r, o2]) => o2 > 60 && r !== currentRoom)?.[0] || 'corridor';
    targetRoom = safeRoom;
  } else if (Math.hypot(playerPos.x - suckedPos.x, playerPos.y - suckedPos.y) < 220) {
    aiState = 'attacking_player';
    const angle = Math.atan2(playerPos.y - suckedPos.y, playerPos.x - suckedPos.x);

    const now = Date.now();
    const lastShot = intruder.lastShotTime || 0;
    if (now - lastShot > 1200) {
      spawnedProjectiles.push(
        createProjectile(
          suckedPos.x,
          suckedPos.y,
          playerPos.x,
          playerPos.y,
          'raider_plasma',
          false,
          1.0,
          shipVelocity
        )
      );
      intruder.lastShotTime = now;
    }

    return {
      nextObj: {
        ...intruder,
        x: suckedPos.x,
        y: suckedPos.y,
        facingAngle: angle,
        health: Number(health.toFixed(1)),
        currentRoomId: currentRoom,
        aiState,
      },
      sabotageDetonated: false,
      hullDamage: 0,
    };
  }

  const isLocked = state.lockedBulkheads.includes(currentRoom);
  const moveRes = moveAlongWaypoints(intruder, targetRoom, dtSeconds, doors, isLocked);

  if (moveRes.blockedDoorId) {
    aiState = 'attacking_door';
  } else if (moveRes.atTarget && targetRoom === intruder.targetRoomId) {
    aiState = 'sabotaging';
  }

  let sabotageTimer = intruder.sabotageSecondsRemaining;
  let sabotageDetonated = false;
  let hullDamage = 0;

  if (aiState === 'sabotaging') {
    sabotageTimer = Math.max(0, sabotageTimer - dtSeconds);
    if (sabotageTimer <= 0) {
      sabotageDetonated = true;
      hullDamage = 35;
      return {
        nextObj: {
          ...intruder,
          health: 0,
          state: 'neutralized',
          aiState: 'neutralized',
          sabotageSecondsRemaining: 0,
        },
        sabotageDetonated,
        hullDamage,
      };
    }
  }

  return {
    nextObj: {
      ...intruder,
      x: moveRes.x,
      y: moveRes.y,
      facingAngle: moveRes.facingAngle,
      currentRoomId: currentRoom,
      state: (aiState === 'sabotaging' ? 'sabotaging' : 'advancing') as IntruderState['state'],
      aiState,
      health: Number(health.toFixed(1)),
      sabotageSecondsRemaining: Number(sabotageTimer.toFixed(1)),
      targetDoorId: moveRes.blockedDoorId,
    },
    sabotageDetonated,
    hullDamage,
  };
}

export interface BoardingCombatTickResult {
  nextState: BoardingTacticsTelemetry;
  sabotageDetonated: boolean;
  hullDamageInflicted: number;
  playerDamageTaken: number;
  newBreaches?: string[];
}

// fallow-ignore-next-line complexity
export function tickBoardingCombat(
  state: BoardingTacticsTelemetry,
  dtSeconds: number,
  playerPos: { x: number; y: number } = { x: 100, y: 100 },
  offset: DockFrameOffset = { x: 0, y: 0 },
  shipVelocity?: { vx: number; vy: number }
): BoardingCombatTickResult {
  let sabotageDetonated = false;
  let hullDamageInflicted = 0;

  // 1. Tick Air Venting & Suction Physics
  const doors = state.doors || createInitialDoors();
  const ventingRes = tickAirVenting(state.roomO2 || createInitialRoomO2(), doors, dtSeconds);
  const roomO2 = ventingRes.nextRoomO2;

  // 2. Process Sentry Targeting & Firing
  const nextSentries = state.sentries.map((sentry) => {
    if (sentry.ammo <= 0) return { ...sentry, isFiring: false, targetIntruderId: null };
    const target = state.intruders.find(
      (i) => i.state !== 'neutralized' && determineRoomFromCoords(i.x, i.y) === sentry.roomId
    );
    if (target) {
      const angle = Math.atan2(target.y - sentry.y, target.x - sentry.x);
      return {
        ...sentry,
        facingAngle: angle,
        targetIntruderId: target.id,
        isFiring: true,
        ammo: Math.max(0, sentry.ammo - Math.round(dtSeconds * 2)),
      };
    }
    return { ...sentry, isFiring: false, targetIntruderId: null };
  });

  const spawnedProjectiles: ProjectileState[] = [];

  // 3. Process Raider DecisionTreeAI
  const nextIntruders: IntruderState[] = [];
  for (const intruder of state.intruders) {
    const res = updateSingleIntruderAI(
      intruder,
      state,
      roomO2,
      ventingRes,
      nextSentries,
      doors,
      playerPos,
      dtSeconds,
      spawnedProjectiles,
      shipVelocity
    );
    nextIntruders.push(res.nextObj);
    if (res.sabotageDetonated) sabotageDetonated = true;
    hullDamageInflicted += res.hullDamage;
  }

  // 4. Tick Projectiles & Check Collisions
  const allProjectiles = [...(state.projectiles || []), ...spawnedProjectiles];
  const projRes = tickProjectiles(
    allProjectiles,
    dtSeconds,
    doors,
    nextIntruders,
    playerPos,
    undefined,
    offset
  );

  // Apply projectile damage to intruders
  for (const hit of projRes.damagedIntruders) {
    const match = nextIntruders.find((i) => i.id === hit.id);
    if (match && match.state !== 'neutralized') {
      match.health = Math.max(0, match.health - hit.damage);
      if (match.health <= 0) {
        match.state = 'neutralized';
        match.aiState = 'neutralized';
      }
    }
  }

  hullDamageInflicted += projRes.hullDamageTaken || 0;

  let nextPartitionHoles = state.partitionHoles || [];
  if (projRes.partitionHits && projRes.partitionHits.length > 0) {
    nextPartitionHoles = [...nextPartitionHoles, ...projRes.partitionHits].slice(-40);
  }

  return {
    nextState: {
      ...state,
      doors,
      roomO2,
      ventedRooms: ventingRes.ventedRooms,
      sentries: nextSentries,
      intruders: nextIntruders,
      projectiles: projRes.nextProjectiles,
      partitionHoles: nextPartitionHoles,
    },
    sabotageDetonated,
    hullDamageInflicted: Number(hullDamageInflicted.toFixed(2)),
    playerDamageTaken: projRes.playerDamageTaken,
    newBreaches: projRes.newBreaches,
  };
}

export interface IntruderEngagementResult {
  nextState: BoardingTacticsTelemetry;
  neutralized: boolean;
  damageDealt: number;
  creditsReward: number;
  xpReward: number;
}

// fallow-ignore-next-line complexity
export function engageIntruder(
  state: BoardingTacticsTelemetry,
  intruderId: string,
  weaponType: WeaponType | string = 'kinetic_carbine',
  role: StartingRole = 'wiper'
): IntruderEngagementResult {
  const baseDmg = weaponType === 'pulse_laser' ? 40 : weaponType === 'arc_welder' ? 65 : 45; // kinetic_carbine or kinetic_rifle
  const roleMultiplier = role === 'security_private' ? 1.25 : 1.0;
  const damageDealt = Math.round(baseDmg * roleMultiplier);

  let neutralized = false;
  let creditsReward = 0;
  let xpReward = 0;

  const nextIntruders = state.intruders.map((i) => {
    if (i.id !== intruderId || i.state === 'neutralized') return i;
    const nextHealth = Math.max(0, i.health - damageDealt);
    if (nextHealth <= 0) {
      neutralized = true;
      creditsReward = 50;
      xpReward = 40;
      return { ...i, health: 0, state: 'neutralized' as const, aiState: 'neutralized' as const };
    }
    return { ...i, health: nextHealth };
  });

  return {
    nextState: { ...state, intruders: nextIntruders },
    neutralized,
    damageDealt,
    creditsReward,
    xpReward,
  };
}

export function deploySentryGun(
  state: BoardingTacticsTelemetry,
  roomId: string,
  x?: number,
  y?: number
): BoardingTacticsTelemetry {
  const pos = x && y ? { x, y } : ROOM_CENTERS[roomId] || { x: 220, y: 570 };
  const newSentry: SentryGunState = {
    id: `sentry-${Date.now()}`,
    roomId,
    x: pos.x,
    y: pos.y,
    facingAngle: 0,
    ammo: 100,
    maxAmmo: 100,
    targetIntruderId: null,
    isFiring: false,
  };

  return {
    ...state,
    sentries: [...state.sentries, newSentry],
  };
}

export function toggleBulkheadLock(
  state: BoardingTacticsTelemetry,
  roomId: string,
  locked: boolean
): BoardingTacticsTelemetry {
  const nextLocks = locked
    ? Array.from(new Set([...state.lockedBulkheads, roomId]))
    : state.lockedBulkheads.filter((id) => id !== roomId);

  let doors = state.doors || createInitialDoors();
  const targetDoorId = `door_${roomId === 'engineering' ? 'eng' : roomId}`;
  doors = toggleDoor(doors, targetDoorId, !locked);

  return { ...state, lockedBulkheads: nextLocks, doors };
}

export function toggleRoomVenting(
  state: BoardingTacticsTelemetry,
  roomId: string,
  venting: boolean
): BoardingTacticsTelemetry {
  const doors = state.doors || createInitialDoors();
  // Find matching airlock for this room
  const airlock = doors.find((d) => d.isAirlock && d.roomA === roomId);
  const nextDoors = airlock ? toggleDoor(doors, airlock.id, venting) : doors;

  const nextVented = venting
    ? Array.from(new Set([...state.ventedRooms, roomId]))
    : state.ventedRooms.filter((id) => id !== roomId);

  return { ...state, doors: nextDoors, ventedRooms: nextVented };
}
