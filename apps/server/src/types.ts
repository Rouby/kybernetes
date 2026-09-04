import type { PawnState, PlayerVitals, StartingRole } from '@kybernetes/protocol';
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
  status: 'on_duty' | 'idle' | 'resting' | 'in_combat';
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
}
