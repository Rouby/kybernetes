/**
 * Protocol v2 server snapshots (ticked). Replaces broadcasts.ts god objects.
 * Channels: SNAPSHOT 10Hz, TELEMETRY 2Hz, VITALS 5Hz per-player, plus
 * NOTICE / HIRE_OFFER / MANIFEST / WATCH event channels.
 */

import type { Role } from './content.js';

export interface SnapshotPawn {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: number;
  readonly frameId: string;
  readonly roomHint: string;
  readonly color: string;
  readonly say?: string;
}

export interface SnapshotPortal {
  readonly id: string;
  readonly open: boolean;
  readonly state: 'open' | 'closed' | 'destroyed' | 'sealed';
}

export interface SnapshotProjectile {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface SnapshotFrame {
  readonly id: string;
  readonly originX: number;
  readonly originY: number;
  readonly angle: number;
}

export interface SnapshotBroadcast {
  readonly type: 'SNAPSHOT';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly pawns: readonly SnapshotPawn[];
  readonly portals: readonly SnapshotPortal[];
  readonly projectiles: readonly SnapshotProjectile[];
  readonly frames: readonly SnapshotFrame[];
}

export interface TelemetryBroadcast {
  readonly type: 'TELEMETRY';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly subsystems: Record<string, number>;
  readonly atmos: readonly {
    readonly roomId: string;
    readonly pressureKpa: number;
    readonly tempCelsius: number;
    readonly o2Percent: number;
    readonly co2Ppm: number;
    readonly repressurizing: boolean;
  }[];
}

export interface VitalsBroadcast {
  readonly type: 'VITALS';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly vitals: {
    readonly hunger: number;
    readonly thirst: number;
    readonly fatigue: number;
    readonly health: number;
    readonly hypoxia: number;
    readonly suitSealed: boolean;
    readonly heat: number;
  };
  readonly credits: number;
  readonly clearance: number;
}

export interface NoticeBroadcast {
  readonly type: 'NOTICE';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly title: string;
  readonly message: string;
}

export interface HireOfferBroadcast {
  readonly type: 'HIRE_OFFER';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly offerId: string;
  readonly jobs: readonly Role[];
}

export interface JoinedBroadcast {
  readonly type: 'JOINED';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly pawnId: string;
  readonly beacon: string;
}

export interface ManifestBroadcast {
  readonly type: 'MANIFEST';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly beacon: string;
  readonly shipName: string;
  readonly crew: readonly {
    readonly id: string;
    readonly callsign: string;
    readonly role: Role;
    readonly frameId: string;
  }[];
}

export interface WatchChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
}

export interface WatchBroadcast {
  readonly type: 'WATCH';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly watchNo: number;
  readonly section: 'alpha' | 'bravo';
  readonly phase: 'active_watch' | 'off_duty';
  readonly remainingS: number;
  readonly checklist: readonly WatchChecklistItem[];
  readonly grade: string;
}

export type ServerSnapshot =
  | SnapshotBroadcast
  | TelemetryBroadcast
  | VitalsBroadcast
  | NoticeBroadcast
  | HireOfferBroadcast
  | JoinedBroadcast
  | ManifestBroadcast
  | WatchBroadcast;

export type ServerSnapshotType = ServerSnapshot['type'];
