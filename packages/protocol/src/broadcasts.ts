import { PawnState, BulkheadState } from './spatial';
import { PlayerVitals, MacroCrewSupplies } from './survival';

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
  reactorTemp: number;       // Kelvin or %
  reactorMaxTemp: number;
  reactorOutputMw: number;
  oxygenLevelPercent: number;
  hullIntegrityPercent: number;
  shieldIntegrityPercent: number;
  alertLevel: 'nominal' | 'yellow' | 'red';
  supplies: MacroCrewSupplies;
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

export type ServerBroadcast =
  | SpatialSnapshotBroadcast
  | TelemetryDeltaBroadcast
  | VitalsDeltaBroadcast
  | CrewManifestBroadcast
  | ShipAlertBroadcast;
