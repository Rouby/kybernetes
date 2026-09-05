import type { StartingRole } from './actions';

export interface PawnState {
  id: string;
  callsign: string;
  role: StartingRole;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number;
  currentDeck: string;
  isOperating: boolean;
  isResting: boolean;
  color: string;
  isWelding?: boolean;
  isBot?: boolean;
  speechBubble?: {
    text: string;
    expiresAt: number;
  };
}

export interface BulkheadState {
  id: string;
  deckId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isLocked: boolean;
  isSealed: boolean;
  isTransparent: boolean;
}

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isOpaque?: boolean;
  isTraversable?: boolean;
  isWindow?: boolean;
}

export interface StationFixture {
  id: string;
  deckId: string;
  name: string;
  stationType:
    | 'reactor'
    | 'mess'
    | 'armory'
    | 'hydroponics'
    | 'cargo'
    | 'bunk'
    | 'bridge'
    | 'avionics'
    | 'airlock'
    | 'job_board'
    | 'viewport_window';
  x: number;
  y: number;
  radius: number;
  prompt?: string;
}

export interface DutyDefinition {
  id: string;
  stationType: StationFixture['stationType'];
  name: string;
  description: string;
  durationSeconds: number;
  staminaCostPerSecond: number;
  creditReward: number;
  clearanceXp: number;
  roleBonus?: StartingRole;
}

export interface DeckDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  walls: WallSegment[];
  stations: StationFixture[];
  spawnPoints: Record<StartingRole, { x: number; y: number }>;
}

export type ShiftEvaluationGrade = 'S' | 'A' | 'B' | 'C';

export interface ShiftTask {
  id: string;
  dutyId: string;
  stationType: StationFixture['stationType'];
  name: string;
  description: string;
  targetStationId: string;
  completed: boolean;
}

export interface ShiftEvaluation {
  shiftNumber: number;
  grade: ShiftEvaluationGrade;
  elapsedSeconds: number;
  vitalsAverage: number;
  baseCredits: number;
  bonusCredits: number;
  baseXp: number;
  bonusXp: number;
  evaluationText: string;
  promoted?: boolean;
  newClearanceLevel?: number;
  rankTitle?: string;
  rankBadge?: string;
}

export interface ShiftChecklistState {
  shiftNumber: number;
  role: StartingRole;
  tasks: ShiftTask[];
  currentTaskIndex: number;
  startedAt: number;
  isCompleted: boolean;
  phase?: 'active_watch' | 'off_duty';
  watchSection?: 'alpha' | 'bravo';
  rankTitle?: string;
  rankBadge?: string;
  evaluation?: ShiftEvaluation;
}
