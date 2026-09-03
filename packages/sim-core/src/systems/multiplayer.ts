import type { PawnState, StartingRole } from '@kybernetes/protocol';

export interface PersistedCrewMember {
  userId: string;
  callsign: string;
  role: StartingRole;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number;
  currentDeck: string;
  lastSeen: number;
}

export function createPersistedCrewMember(
  userId: string,
  pawn: PawnState,
  now = Date.now()
): PersistedCrewMember {
  return {
    userId,
    callsign: pawn.callsign,
    role: pawn.role,
    color: pawn.color,
    x: pawn.x,
    y: pawn.y,
    vx: pawn.vx,
    vy: pawn.vy,
    facingAngle: pawn.facingAngle,
    currentDeck: pawn.currentDeck,
    lastSeen: now,
  };
}

export function restorePawnFromPersistence(
  pawnId: string,
  persisted: PersistedCrewMember
): PawnState {
  return {
    id: pawnId,
    callsign: persisted.callsign,
    role: persisted.role,
    color: persisted.color,
    x: persisted.x,
    y: persisted.y,
    vx: 0,
    vy: 0,
    facingAngle: persisted.facingAngle,
    currentDeck: persisted.currentDeck,
    isOperating: false,
    isResting: false,
    isWelding: false,
  };
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return Number((a + diff * t).toFixed(3));
}

export function interpolatePawn(current: PawnState, target: PawnState, alpha: number): PawnState {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return {
    ...target,
    x: Number((current.x + (target.x - current.x) * clampedAlpha).toFixed(2)),
    y: Number((current.y + (target.y - current.y) * clampedAlpha).toFixed(2)),
    vx: target.vx,
    vy: target.vy,
    facingAngle: lerpAngle(current.facingAngle, target.facingAngle, clampedAlpha),
    isOperating: target.isOperating,
    isResting: target.isResting,
  };
}

export interface DualProtocolState {
  protocolId: 'ftl_jump_alignment' | 'reactor_purge';
  title: string;
  stage: 'idle' | 'primed' | 'synchronized' | 'expired';
  initiatorCallsign?: string;
  initiatorStation: string;
  targetStation: string;
  remainingSeconds: number;
  syncWindowSeconds: number;
  creditReward: number;
  xpReward: number;
}

export function createDualProtocol(
  protocolId: 'ftl_jump_alignment' | 'reactor_purge' = 'ftl_jump_alignment'
): DualProtocolState {
  if (protocolId === 'reactor_purge') {
    return {
      protocolId,
      title: 'Emergency Coolant Purge',
      stage: 'idle',
      initiatorStation: 'reactor',
      targetStation: 'bridge',
      remainingSeconds: 0,
      syncWindowSeconds: 10,
      creditReward: 350,
      xpReward: 80,
    };
  }
  return {
    protocolId: 'ftl_jump_alignment',
    title: 'FTL Jump Drive Alignment',
    stage: 'idle',
    initiatorStation: 'reactor',
    targetStation: 'bridge',
    remainingSeconds: 0,
    syncWindowSeconds: 10,
    creditReward: 500,
    xpReward: 120,
  };
}

export function primeDualProtocol(
  state: DualProtocolState,
  initiatorCallsign: string
): DualProtocolState {
  return {
    ...state,
    stage: 'primed',
    initiatorCallsign,
    remainingSeconds: state.syncWindowSeconds,
  };
}

export function tickDualProtocol(
  state: DualProtocolState,
  dtSeconds: number
): { nextState: DualProtocolState; expired: boolean } {
  if (state.stage !== 'primed') {
    return { nextState: state, expired: false };
  }

  const remaining = Number((state.remainingSeconds - dtSeconds).toFixed(2));
  if (remaining <= 0) {
    return {
      nextState: {
        ...state,
        stage: 'expired',
        remainingSeconds: 0,
      },
      expired: true,
    };
  }

  return {
    nextState: {
      ...state,
      remainingSeconds: remaining,
    },
    expired: false,
  };
}

export function executeDualProtocol(
  state: DualProtocolState,
  stationId: string
): { nextState: DualProtocolState; success: boolean } {
  if (state.stage !== 'primed' || stationId !== state.targetStation) {
    return { nextState: state, success: false };
  }

  return {
    nextState: {
      ...state,
      stage: 'synchronized',
      remainingSeconds: 0,
    },
    success: true,
  };
}

export interface CollabShiftState {
  shiftId: string;
  stationId: string;
  title: string;
  progressPercent: number;
  durationSeconds: number;
  participants: string[];
  isCompleted: boolean;
  creditReward: number;
  xpReward: number;
}

export function createCollabShift(
  shiftId = 'thruster_overhaul',
  stationId = 'cargo',
  title = 'Main Thruster Overhaul',
  durationSeconds = 12
): CollabShiftState {
  return {
    shiftId,
    stationId,
    title,
    progressPercent: 0,
    durationSeconds,
    participants: [],
    isCompleted: false,
    creditReward: 250,
    xpReward: 60,
  };
}

export function calculateCollabLaborRate(participantCount: number, baseRate = 1.0): number {
  if (participantCount <= 0) return 0;
  if (participantCount === 1) return baseRate;
  // Teamwork bonus: 1.25x efficiency per co-operator
  return Number((participantCount * 1.25 * baseRate).toFixed(2));
}

export function joinCollabShift(state: CollabShiftState, participantId: string): CollabShiftState {
  if (state.participants.includes(participantId) || state.isCompleted) {
    return state;
  }
  return {
    ...state,
    participants: [...state.participants, participantId],
  };
}

export function leaveCollabShift(state: CollabShiftState, participantId: string): CollabShiftState {
  return {
    ...state,
    participants: state.participants.filter((p) => p !== participantId),
  };
}

export function tickCollabShift(
  state: CollabShiftState,
  dtSeconds: number
): { nextState: CollabShiftState; justCompleted: boolean } {
  if (state.isCompleted || state.participants.length === 0) {
    return { nextState: state, justCompleted: false };
  }

  const rate = calculateCollabLaborRate(state.participants.length, 1.0);
  const deltaPercent = (dtSeconds / state.durationSeconds) * 100 * rate;
  const nextProgress = Math.min(100, Number((state.progressPercent + deltaPercent).toFixed(1)));
  const completed = nextProgress >= 100;

  return {
    nextState: {
      ...state,
      progressPercent: nextProgress,
      isCompleted: completed,
    },
    justCompleted: completed,
  };
}

export function generateBeaconCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function isValidBeaconCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/i.test(code);
}
