import type {
  BoardingPodState,
  BoardingTacticsTelemetry,
  IntruderState,
  SentryGunState,
  StartingRole,
} from '@kybernetes/protocol';

export function createInitialBoardingState(): BoardingTacticsTelemetry {
  return {
    intruders: [],
    boardingPods: [],
    sentries: [],
    lockedBulkheads: [],
    ventedRooms: [],
  };
}

const ROOM_CENTERS: Record<string, { x: number; y: number }> = {
  bridge: { x: 220, y: 170 },
  quarters: { x: 590, y: 170 },
  mess: { x: 970, y: 170 },
  corridor: { x: 600, y: 340 },
  armory: { x: 220, y: 570 },
  cargo: { x: 590, y: 570 },
  engineering: { x: 970, y: 570 },
};

// fallow-ignore-next-line complexity
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
    sabotageSecondsRemaining: 20,
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
    sabotageSecondsRemaining: 20,
  };

  return {
    ...state,
    boardingPods: [...state.boardingPods, pod],
    intruders: [...state.intruders, raiderAlpha, raiderBeta],
  };
}

// fallow-ignore-next-line complexity
function updateIntruderMovement(
  intruder: IntruderState,
  target: { x: number; y: number },
  dtSeconds: number,
  isBlockedByLock: boolean
): { x: number; y: number; facingAngle: number; state: IntruderState['state'] } {
  if (isBlockedByLock) {
    return {
      x: intruder.x,
      y: intruder.y,
      facingAngle: intruder.facingAngle,
      state: 'advancing',
    };
  }

  const dx = target.x - intruder.x;
  const dy = target.y - intruder.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 15) {
    return {
      x: target.x,
      y: target.y,
      facingAngle: intruder.facingAngle,
      state: 'sabotaging',
    };
  }

  const speed = 40 * dtSeconds;
  const step = Math.min(speed, dist);
  const angle = Math.atan2(dy, dx);

  return {
    x: Number((intruder.x + Math.cos(angle) * step).toFixed(2)),
    y: Number((intruder.y + Math.sin(angle) * step).toFixed(2)),
    facingAngle: angle,
    state: 'advancing',
  };
}

// fallow-ignore-next-line complexity
function determineRoomFromCoords(x: number, y: number): string {
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

export interface BoardingCombatTickResult {
  nextState: BoardingTacticsTelemetry;
  sabotageDetonated: boolean;
  hullDamageInflicted: number;
}

// fallow-ignore-next-line complexity
export function tickBoardingCombat(
  state: BoardingTacticsTelemetry,
  dtSeconds: number
): BoardingCombatTickResult {
  let sabotageDetonated = false;
  let hullDamageInflicted = 0;

  // 1. Process Sentry Targeting & Firing
  const nextSentries = state.sentries.map((sentry) => {
    if (sentry.ammo <= 0) {
      return { ...sentry, isFiring: false, targetIntruderId: null };
    }

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

  // 2. Process Intruder AI & Hazard Degradation
  const nextIntruders = state.intruders.map((intruder) => {
    if (intruder.state === 'neutralized') return intruder;

    const currentRoom = determineRoomFromCoords(intruder.x, intruder.y);
    let health = intruder.health;

    // Atmospheric Venting Asphyxiation
    if (state.ventedRooms.includes(currentRoom)) {
      health = Math.max(0, health - 15 * dtSeconds);
    }

    // Sentry Gun Kinetic Damage
    const activeSentry = nextSentries.find((s) => s.isFiring && s.targetIntruderId === intruder.id);
    if (activeSentry) {
      health = Math.max(0, health - 25 * dtSeconds);
    }

    if (health <= 0) {
      return { ...intruder, health: 0, state: 'neutralized' as const };
    }

    // Check if path is blocked by locked bulkheads
    const isLocked = state.lockedBulkheads.includes(currentRoom);

    const targetPos = ROOM_CENTERS[intruder.targetRoomId] || { x: 970, y: 570 };
    const mov = updateIntruderMovement(intruder, targetPos, dtSeconds, isLocked);

    let sabotageTimer = intruder.sabotageSecondsRemaining;
    if (mov.state === 'sabotaging') {
      sabotageTimer = Math.max(0, sabotageTimer - dtSeconds);
      if (sabotageTimer <= 0) {
        sabotageDetonated = true;
        hullDamageInflicted += 35;
        return {
          ...intruder,
          health: 0,
          state: 'neutralized' as const,
          sabotageSecondsRemaining: 0,
        };
      }
    }

    return {
      ...intruder,
      x: mov.x,
      y: mov.y,
      facingAngle: mov.facingAngle,
      currentRoomId: currentRoom,
      state: mov.state,
      health: Number(health.toFixed(1)),
      sabotageSecondsRemaining: Number(sabotageTimer.toFixed(1)),
    };
  });

  return {
    nextState: {
      ...state,
      sentries: nextSentries,
      intruders: nextIntruders,
    },
    sabotageDetonated,
    hullDamageInflicted,
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
  weaponType: 'kinetic_rifle' | 'arc_welder' | 'shock_baton' = 'kinetic_rifle',
  role: StartingRole = 'wiper'
): IntruderEngagementResult {
  const baseDmg = weaponType === 'kinetic_rifle' ? 45 : weaponType === 'arc_welder' ? 35 : 25;
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
      return { ...i, health: 0, state: 'neutralized' as const };
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

  return { ...state, lockedBulkheads: nextLocks };
}

export function toggleRoomVenting(
  state: BoardingTacticsTelemetry,
  roomId: string,
  venting: boolean
): BoardingTacticsTelemetry {
  const nextVented = venting
    ? Array.from(new Set([...state.ventedRooms, roomId]))
    : state.ventedRooms.filter((id) => id !== roomId);

  return { ...state, ventedRooms: nextVented };
}
