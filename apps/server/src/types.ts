import type {
  PawnState,
  PlayerVitals,
  ShiftChecklistState,
  StartingRole,
} from '@kybernetes/protocol';
import type {
  BotState,
  CollabShiftState,
  DualProtocolState,
  GameLoop,
  PersistedCrewMember,
  VesselSimulationState,
} from '@kybernetes/sim-core';
import type { WebSocket } from 'ws';

export interface ClientSession {
  ws: WebSocket;
  id: string;
  userId?: string;
  callsign: string;
  role: StartingRole;
  pawn: PawnState;
  vitals: PlayerVitals;
  credits: number;
  clearanceLevel: number;
  clearanceXp: number;
  status: 'on_duty' | 'idle' | 'resting' | 'in_combat';
  watchSection: 'alpha' | 'bravo';
  shiftChecklist?: ShiftChecklistState;
  dutyName?: string;
  vesselCode: string;
}

export interface VesselSession {
  code: string;
  vesselState: VesselSimulationState;
  clients: Map<WebSocket, ClientSession>;
  persistedCrew: Map<string, PersistedCrewMember>;
  bots: Map<StartingRole, BotState>;
  dualProtocol: DualProtocolState;
  collabShift: CollabShiftState;
  loop: GameLoop;
  watchNumber: number;
  activeSection: 'alpha' | 'bravo';
  watchPhase: 'active_watch' | 'off_duty';
  timeRemainingSeconds: number;
  breachRepairProgress: Map<string, number>;
}
