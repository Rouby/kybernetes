import type { BoardingTacticsTelemetry } from './boarding';
import type { BulkheadState, PawnState } from './spatial';
import type {
  DefenseTelemetry,
  HullTelemetry,
  LifeSupportTelemetry,
  NavalDamageEvent,
  ReactorTelemetry,
  RoomAtmosphereSummary,
  ShieldTelemetry,
} from './subsystems';
import type { MacroCrewSupplies, PlayerVitals } from './survival';

export interface SpatialSnapshotBroadcast {
  type: 'SPATIAL_SNAPSHOT';
  timestamp: number;
  pawns: PawnState[];
  bulkheads: BulkheadState[];
}

export interface TelemetryDeltaBroadcast {
  type: 'TELEMETRY_DELTA';
  timestamp: number;
  shipName: string;
  reactorTemp: number; // Kelvin or %
  reactorMaxTemp: number;
  reactorOutputMw: number;
  oxygenLevelPercent: number;
  hullIntegrityPercent: number;
  shieldIntegrityPercent: number;
  alertLevel: 'nominal' | 'yellow' | 'red';
  supplies: MacroCrewSupplies;
  reactor: ReactorTelemetry;
  lifeSupport: LifeSupportTelemetry;
  hull: HullTelemetry;
  shields: ShieldTelemetry;
  defense: DefenseTelemetry;
  activeEvents: NavalDamageEvent[];
  activeFires: string[];
  boarding?: BoardingTacticsTelemetry;
  roomAtmospheres?: Record<string, RoomAtmosphereSummary>;
  atmosDirtyCells?: Array<{ x: number; y: number; flags: number }>;
}

export interface VitalsDeltaBroadcast {
  type: 'VITALS_DELTA';
  playerId: string;
  vitals: PlayerVitals;
  credits: number;
  clearanceLevel: number;
}

export interface CrewManifestBroadcast {
  type: 'CREW_MANIFEST';
  crew: Array<{
    id: string;
    callsign: string;
    role: string;
    deckId: string;
    status: 'on_duty' | 'idle' | 'resting' | 'in_combat';
    dutyName?: string;
  }>;
}

export interface ShipAlertBroadcast {
  type: 'SHIP_ALERT';
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
}

export interface DutyCompletedBroadcast {
  type: 'DUTY_COMPLETED';
  dutyId: string;
  stationId: string;
  creditsEarned: number;
  xpEarned: number;
  timestamp: number;
}

export interface NavalDamageEventBroadcast {
  type: 'NAVAL_DAMAGE_EVENT';
  event: NavalDamageEvent;
}

export interface DamageTriageBroadcast {
  type: 'DAMAGE_TRIAGE_RESULT';
  eventId?: string;
  actionType: string;
  success: boolean;
  message: string;
  timestamp: number;
}

export interface DualProtocolBroadcast {
  type: 'DUAL_PROTOCOL_UPDATE';
  protocolId: string;
  stage: 'idle' | 'primed' | 'synchronized' | 'expired';
  initiatorCallsign?: string;
  initiatorStation?: string;
  targetStation?: string;
  remainingSeconds: number;
  title: string;
  message: string;
  timestamp: number;
}

export interface CollabShiftUpdateBroadcast {
  type: 'COLLAB_SHIFT_UPDATE';
  shiftId: string;
  stationId: string;
  title: string;
  progressPercent: number;
  participants: string[];
  isCompleted: boolean;
  timestamp: number;
}

export interface LobbyStateBroadcast {
  type: 'LOBBY_STATE';
  vesselCode: string;
  shipName: string;
  connectedCrew: number;
}

export interface WatchRotationBroadcast {
  type: 'WATCH_ROTATION_UPDATE';
  watchNumber: number;
  activeSection: 'alpha' | 'bravo';
  phase: 'active_watch' | 'off_duty';
  timeRemainingSeconds?: number;
  timestamp: number;
}

export type ServerBroadcast =
  | SpatialSnapshotBroadcast
  | TelemetryDeltaBroadcast
  | VitalsDeltaBroadcast
  | CrewManifestBroadcast
  | ShipAlertBroadcast
  | DutyCompletedBroadcast
  | NavalDamageEventBroadcast
  | DamageTriageBroadcast
  | DualProtocolBroadcast
  | CollabShiftUpdateBroadcast
  | LobbyStateBroadcast
  | WatchRotationBroadcast;
