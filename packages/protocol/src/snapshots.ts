/**
 * Protocol v2 server snapshots (ticked). Replaces broadcasts.ts god objects.
 * Channels: SNAPSHOT full 1Hz + SNAPSHOT_DELTA 10Hz, TELEMETRY 2Hz
 * (full every 5th, changed rooms otherwise), VITALS 5Hz per-player
 * (suppressed while unchanged), plus NOTICE / HIRE_OFFER event channels and
 * MANIFEST / WATCH event+heartbeat channels (rev-guarded, not ticked).
 * Delta/merge helpers live in sim-core channels and web renderState; the
 * merged SNAPSHOT shape below is unchanged so old consumers keep working.
 */

import type { Role } from './content.js';
import type { ServerStatsBroadcast } from './debug.js';
import type { DockStatusBroadcast } from './docking.js';

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
  /** Breach size in m2 (q2). Present only on destroyed hole portals. */
  readonly areaM2?: number;
  /** World tick the breach was cut (PortalEdge.cooldownUntilTick). */
  readonly bornTick?: number;
  /** Breach segment midpoint room on the A side (namespaced room id). */
  readonly roomA?: string;
  /** Breach segment in frame-local px (q1). Present with areaM2. */
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
}

export interface SnapshotProjectile {
  readonly id: string;
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly weapon: string;
}

export type ImpactSurface = 'wall' | 'door' | 'pawn' | 'hull' | 'shield';

export interface SnapshotImpact {
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'pawn' | 'door' | 'breach' | 'miss';
  /** Surface normal / shot direction in radians (q2). Orients decals + sparks. */
  readonly angle?: number;
  /** Weapon id that produced the hit (e.g. kinetic_carbine). */
  readonly weapon?: string;
  /** Normalized hit energy 0-1 (q2). Scales crater + scorch + sparks. */
  readonly energy?: number;
  /** Material surface struck; defaults from kind when absent. */
  readonly surface?: ImpactSurface;
  /** Live breach portal id when this hit cut or widened a breach. */
  readonly breachId?: string;
  /** Room pressure kPa at the hit (q1, vacuum≈0). Scales sparks/plumes. */
  readonly pressureKpa?: number;
}

export interface ScorchDecal {
  readonly id: string;
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  /** Decal orientation in radians (q2): crater major axis / wall tangent. */
  readonly angle: number;
  /** Crater radius in px (q1). */
  readonly radius: number;
  readonly weapon: string;
  readonly bornTick: number;
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
  readonly impacts: readonly SnapshotImpact[];
  readonly portals: readonly SnapshotPortal[];
  readonly projectiles: readonly SnapshotProjectile[];
  readonly frames: readonly SnapshotFrame[];
  /** Persistent scorch decals (server LRU, oldest first). Absent on pre-decal senders. */
  readonly decals?: readonly ScorchDecal[];
  /** True when portals/frames are complete. Absent on pre-delta senders. */
  readonly full?: boolean;
  /** FNV-1a digest of portal id+state; clients memoize colliders on it. */
  readonly portalRev?: number;
  /** FNV-1a digest of frame origins; clients memoize origins on it. */
  readonly frameRev?: number;
}

/**
 * SNAPSHOT_DELTA: pawns/projectiles/impacts are complete and quantized every
 * tick (they move); portals/frames carry changed entries only and
 * removedPortalIds carries deletions (breach table never shrinks today, but
 * the field keeps the merge total). Clients merge onto the last full
 * SNAPSHOT; full:true forces replace and resyncs baseTick.
 */
export interface SnapshotDeltaBroadcast {
  readonly type: 'SNAPSHOT_DELTA';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly baseTick: number;
  readonly full: boolean;
  readonly portalRev: number;
  readonly frameRev: number;
  readonly pawns: readonly SnapshotPawn[];
  readonly impacts: readonly SnapshotImpact[];
  readonly portals: readonly SnapshotPortal[];
  readonly removedPortalIds: readonly string[];
  readonly projectiles: readonly SnapshotProjectile[];
  readonly frames: readonly SnapshotFrame[];
  /** Complete decal table when changed; clients replace on newer tick. */
  readonly decals?: readonly ScorchDecal[];
}

export interface AirFlow {
  readonly portalId: string;
  /** Signed portal throat velocity in m/s (+ = roomA to roomB axis). */
  readonly velocityMps: number;
}

export interface TelemetryBroadcast {
  readonly type: 'TELEMETRY';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly subsystems: Record<string, number>;
  /** False when atmos carries changed rooms only; clients merge by roomId. */
  readonly full?: boolean;
  readonly atmos: readonly {
    readonly roomId: string;
    readonly pressureKpa: number;
    readonly tempCelsius: number;
    readonly o2Percent: number;
    readonly co2Ppm: number;
    readonly repressurizing: boolean;
  }[];
  /** Complete portal wind table (q1 m/s). Absent on pre-flow senders; clients keep last. */
  readonly flows?: readonly AirFlow[];
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
    readonly ammo: number;
    readonly reserve: number;
    readonly mags: readonly number[];
    readonly reloading: boolean;
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
  /** Content digest of crew id+callsign+role+frame; clients ignore stale revs. */
  readonly rev?: number;
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
  /** Content digest excluding remainingS; the 1s heartbeat carries countdowns. */
  readonly rev?: number;
}

export type ServerSnapshot =
  | SnapshotBroadcast
  | SnapshotDeltaBroadcast
  | TelemetryBroadcast
  | VitalsBroadcast
  | NoticeBroadcast
  | HireOfferBroadcast
  | JoinedBroadcast
  | ManifestBroadcast
  | WatchBroadcast
  | ServerStatsBroadcast
  | DockStatusBroadcast;

export type ServerSnapshotType = ServerSnapshot['type'];
