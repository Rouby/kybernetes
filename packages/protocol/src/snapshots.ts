/**
 * Protocol v2 server snapshots (ticked). Replaces broadcasts.ts god objects.
 * Channels: SNAPSHOT full 1Hz + SNAPSHOT_DELTA 10Hz, TELEMETRY 2Hz
 * (full every 5th, changed rooms otherwise), VITALS 5Hz per-player
 * (suppressed while unchanged), plus NOTICE / HIRE_OFFER event channels and
 * MANIFEST / WATCH event+heartbeat channels (rev-guarded, not ticked).
 * Delta/merge helpers live in sim-core channels and web renderState; the
 * merged SNAPSHOT shape below is unchanged so old consumers keep working.
 */

import type { PawnTrim, ThrusterTint } from './appearance.js';
import type { LegacyStartingRole, Role, WeaponType } from './content.js';

export type DeathCause =
  | 'combat'
  | 'hypoxia'
  | 'vacuum'
  | 'thermal'
  | 'starvation'
  | 'dehydration'
  | 'bleedout';

import type { ServerStatsBroadcast } from './debug.js';
import type { DockStatusBroadcast } from './docking.js';
import type { FixtureSnapshot, LivingRoomState } from './living.js';

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
  readonly dead?: boolean;
  readonly trim?: PawnTrim;
  readonly thruster?: ThrusterTint;
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

/**
 * Legacy door render shape (moved verbatim from deprecated `boarding.ts`).
 * Carried for the frozen renderer / audio / visibility consumers; the v2 wire
 * successor is {@link SnapshotPortal} above. Migrate readers to it, then delete.
 */
export interface DoorState {
  id: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isOpen: boolean;
  isSealed?: boolean; // True when locked by the docking cycle (e.g. gauntlet while undocked)
  isAirlock: boolean; // True if an exterior hull door opening to space vacuum
  roomA: string;
  roomB: string; // 'vacuum' if isAirlock
  health?: number; // For breakable/attackable doors
}

/**
 * Legacy spatial render shapes (moved verbatim from deprecated `spatial.ts`,
 * now deleted). Carried for the frozen renderer / deck adapter / HUD consumers;
 * v2 wire successors are `SnapshotPawn` / `SnapshotPortal` above. Migrate readers,
 * then delete.
 */
export interface PawnState {
  id: string;
  callsign: string;
  role: LegacyStartingRole;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number;
  currentDeck: string;
  isOperating: boolean;
  isResting: boolean;
  color: string;
  /** v2 cosmetic carry-through (appearance.ts trim preset). Absent on v1 pawns. */
  trim?: string;
  /** v2 cosmetic carry-through (appearance.ts thruster preset). Absent on v1 pawns. */
  thruster?: string;
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
  roleBonus?: LegacyStartingRole;
}

export interface DeckDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  walls: WallSegment[];
  stations: StationFixture[];
  spawnPoints: Record<LegacyStartingRole, { x: number; y: number }>;
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
  role: LegacyStartingRole;
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

export type CrateWhere = 'bayFloor' | 'carriedBy' | 'shipFloor';

export interface CrateItemState {
  readonly goodId: string;
  readonly qty: number;
}

export interface CrateSnapshot {
  readonly id: string;
  readonly items: readonly CrateItemState[];
  readonly where: CrateWhere;
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly carrierId?: string;
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
  /** Living fixtures (optional so pre-living clients keep working). */
  readonly fixtures?: readonly FixtureSnapshot[];
  /** Persistent scorch decals (server LRU, oldest first). Absent on pre-decal senders. */
  readonly decals?: readonly ScorchDecal[];
  /** Physical cargo crates (complete table, 10Hz). Absent on pre-cargo senders. */
  readonly crates?: readonly CrateSnapshot[];
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
  /** Complete fixture table when changed; clients replace on newer tick. */
  readonly fixtures?: readonly FixtureSnapshot[];
  /** Complete decal table when changed; clients replace on newer tick. */
  readonly decals?: readonly ScorchDecal[];
  /** Complete crate table (every delta; small N). Absent on pre-cargo senders. */
  readonly crates?: readonly CrateSnapshot[];
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
  /** Living room resources (power/heat/water/growth). Absent on pre-living senders. */
  readonly living?: readonly LivingRoomState[];
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
    /** Seconds of mess-table meal buff remaining (q0). Absent = 0. */
    readonly mealBuffS?: number;
    /** True once the server declares the pawn dead (hp <= 0). */
    readonly dead: boolean;
    /** Present with dead; authoritative cause for the death screen. */
    readonly deathCause?: DeathCause;
  };
  readonly credits: number;
  readonly clearance: number;
}

export interface DeathBroadcast {
  readonly type: 'DEATH';
  readonly v: 2;
  readonly tick: number;
  readonly serverTimeMs: number;
  readonly pawnId: string;
  readonly cause: DeathCause;
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

/**
 * Legacy v1 shapes (moved verbatim from deprecated `survival.ts`, now deleted).
 * Frozen render/adapter consumers import these from the package index;
 * semantic migration to the v2 channels above is future work.
 */
export interface SuitTelemetry {
  isSealed: boolean;
  o2RemainingSeconds: number; // 0 - 600s
  maxO2Seconds: number;
  integrityPercent: number; // 0 - 100%, punctures leak O2
  batteryPercent: number; // 0 - 100%, thermal regulator
}

export interface IncapacitatedState {
  isIncapacitated: boolean;
  cause: 'hypoxia' | 'decompression' | 'thermal' | 'combat';
  bleedoutSecondsRemaining: number; // 45s critical timer
}

export interface PlayerVitals {
  hunger: number; // 0 - 100 (100 = sated, 0 = starving)
  thirst: number; // 0 - 100 (100 = hydrated, 0 = dehydrated)
  fatigue: number; // 0 - 100 (0 = rested, 100 = exhausted)
  stamina: number; // 0 - 100
  maxStamina: number; // dynamically affected by hunger/thirst/fatigue
  health: number; // 0 - 100
  suit: SuitTelemetry;
  incapacitated: IncapacitatedState;
  bodyTempCelsius: number; // 37 nominal
  hypoxiaPercent: number; // 0 - 100%
}

export interface MacroCrewSupplies {
  rations: number;
  waterLitres: number;
  oxygenPercent: number;
  morale: number; // 0 - 100
  mutinyRisk: number; // 0 - 100
  biomassStock?: number;
  greywaterLitres?: number;
}

/**
 * Legacy v1 shapes (moved verbatim from deprecated `subsystems.ts`, now deleted).
 * Frozen render/adapter consumers import these from the package index;
 * semantic migration to the v2 channels above is future work.
 */
export type SubsystemStatus = 'nominal' | 'degraded' | 'critical';

export interface ReactorTelemetry {
  tempKelvin: number;
  maxTempKelvin: number;
  outputMw: number;
  coolantLevelPercent: number;
  status: SubsystemStatus;
}

export interface LifeSupportTelemetry {
  /** Ambient oxygen partial pressure normalized to nominal ship air (100 = healthy). */
  o2LevelPercent: number;
  /** Ambient carbon dioxide concentration in percent. */
  co2LevelPercent: number;
  /** Finite life-support gas reserve, separate from the cabin atmosphere. */
  oxygenReservePercent?: number;
  scrubberEfficiencyPercent: number;
  status: SubsystemStatus;
}

export interface HullTelemetry {
  integrityPercent: number;
  stressPercent: number;
  breaches: string[];
  status: SubsystemStatus;
}

export interface ShieldTelemetry {
  integrityPercent: number;
  chargeMw: number;
  status: SubsystemStatus;
}

export interface DefenseTelemetry {
  pdtAmmo: number;
  pdtReady: boolean;
  status: SubsystemStatus;
}

export type NavalDamageEventType = 'torpedo_run' | 'radiation_burst' | 'micrometeor_storm';
export type NavalDamageEventStatus = 'incoming' | 'impacting' | 'resolved' | 'mitigated';

export interface NavalDamageEvent {
  id: string;
  type: NavalDamageEventType;
  title: string;
  description: string;
  severity: 'minor' | 'moderate' | 'critical';
  timeToImpactSeconds: number;
  status: NavalDamageEventStatus;
  targetRoomId?: string;
}

export interface RoomAtmosphereSummary {
  roomId: string;
  pressureKpa: number;
  o2Percent: number;
  co2Ppm: number;
  tempCelsius: number;
  toxicSmokePercent: number;
  isVenting: boolean;
  isRepressurizing?: boolean;
  activeFires: number;
  activeBreaches: number;
  /** Authoritative room-center wind from the air solver, px/s in ship-local space. */
  windX?: number;
  windY?: number;
}

export type BreachKind = 'puncture' | 'breach' | 'door';

export interface BreachDescriptor {
  id: string;
  roomId: string;
  kind: BreachKind;
  areaM2: number;
  x?: number;
  y?: number;
}

export interface CompartmentAtmosphere {
  compartmentId: string;
  roomId: string;
  volumeM3: number;
  pressureKpa: number;
  tempCelsius: number;
  o2Percent: number;
  co2Ppm: number;
  isVenting: boolean;
  isRepressurizing: boolean;
}

/**
 * Legacy v1 shapes (moved verbatim from deprecated `boarding.ts`, now deleted).
 * Frozen render/adapter consumers import these from the package index;
 * semantic migration to the v2 channels above is future work.
 */
export type IntruderLifecycleState = 'breaching' | 'advancing' | 'sabotaging' | 'neutralized';

export type IntruderAiState =
  | 'fleeing_vacuum'
  | 'attacking_player'
  | 'attacking_door'
  | 'advancing'
  | 'sabotaging'
  | 'neutralized';

export interface PartitionHole {
  x: number;
  y: number;
  wallId: string;
}

export interface IntruderState {
  id: string;
  name: string;
  x: number;
  y: number;
  facingAngle: number;
  health: number; // 0..100
  maxHealth: number;
  currentRoomId: string;
  targetRoomId: string;
  state: IntruderLifecycleState;
  aiState?: IntruderAiState;
  sabotageSecondsRemaining: number; // Countdown from 20s when in targetRoomId
  targetDoorId?: string;
  lastShotTime?: number;
}

export interface BoardingPodState {
  id: string;
  roomId: string; // The compartment breached (e.g. 'cargo', 'quarters')
  x: number;
  y: number;
  hullBreached: boolean;
  breachProgress: number; // 0..1
}

export interface SentryGunState {
  id: string;
  roomId: string;
  x: number;
  y: number;
  facingAngle: number;
  ammo: number;
  maxAmmo: number;
  targetIntruderId: string | null;
  isFiring: boolean;
}

export interface ProjectileState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  fromPlayer: boolean;
  lifeSeconds: number;
  weaponType?: WeaponType | 'raider_plasma';
  maxLife?: number;
  chargeRatio?: number;
}

export interface BoardingTacticsTelemetry {
  intruders: IntruderState[];
  boardingPods: BoardingPodState[];
  sentries: SentryGunState[];
  lockedBulkheads: string[]; // List of doorway/wall IDs sealed shut
  ventedRooms: string[]; // List of compartment IDs actively decompressed
  doors: DoorState[];
  projectiles: ProjectileState[];
  roomO2: Record<string, number>; // 0..100% per room
  partitionHoles?: PartitionHole[];
}

/**
 * Legacy v1 shapes (moved verbatim from deprecated `intro.ts`, now deleted).
 * Frozen render/adapter consumers import these from the package index;
 * semantic migration to the v2 channels above is future work.
 */
/**
 * Intro gameplay wire contract: station spawn -> ship docking -> captain hire -> transit.
 *
 * v1 scope (thin end-to-end):
 * - One map, simulated fly-in/out observable from the station window.
 * - Captain NPC aboard the docked ship (helm / officer mess).
 * - Proximity E-talk opens a 2-random-job offer; accepting triggers departure.
 * - Solo player + NPC crew fill-ins for unchosen jobs; stay-aboard loop.
 */

export type HireableJob = 'engineer' | 'cook' | 'deckhand';

export type DockingPhase = 'inbound' | 'docked' | 'departing' | 'in_transit' | 'arrived';

export interface JobOffer {
  job: HireableJob;
  title: string;
  department: string;
  description: string;
  badge: string;
  color: string;
}

export const HIREABLE_JOBS: readonly HireableJob[] = ['engineer', 'cook', 'deckhand'] as const;

export const JOB_OFFER_CATALOG: Record<HireableJob, JobOffer> = {
  engineer: {
    job: 'engineer',
    title: 'Engineer',
    department: 'Engineering',
    description: 'Maintain reactor and propulsion stability while in transit.',
    badge: 'ENG-3',
    color: '#ffb000',
  },
  cook: {
    job: 'cook',
    title: 'Cook',
    department: 'Sustenance & Logistics',
    description: 'Prepare meals the crew can eat to restore vitals.',
    badge: 'LOG-3',
    color: '#00e5ff',
  },
  deckhand: {
    job: 'deckhand',
    title: 'Deckhand',
    department: 'Hold Logistics & Salvage',
    description: 'Clean compartments and haul cargo to the cargo grid.',
    badge: 'HLD-3',
    color: '#ffaa33',
  },
};

export interface TalkToCaptainAction {
  type: 'TALK_TO_CAPTAIN';
  captainId: string;
}

export interface AcceptJobOfferAction {
  type: 'ACCEPT_JOB_OFFER';
  offerId: string;
  job: HireableJob;
}

export interface VesselKinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flightMode: DockingPhase;
}

export interface ShipDockingUpdateBroadcast {
  type: 'SHIP_DOCKING_UPDATE';
  phase: DockingPhase;
  shipName: string;
  destination: string;
  etaSeconds: number;
  legIndex: number;
  timestamp: number;
  kinematics?: VesselKinematics;
}

export interface CaptainJobOfferBroadcast {
  type: 'CAPTAIN_JOB_OFFER';
  offerId: string;
  captainId: string;
  captainName: string;
  jobs: [JobOffer, JobOffer];
  timestamp: number;
}

export interface JobAssignedBroadcast {
  type: 'JOB_ASSIGNED';
  playerId: string;
  job: HireableJob;
  title: string;
  timestamp: number;
}

export interface TransitUpdateBroadcast {
  type: 'TRANSIT_UPDATE';
  destination: string;
  progressPercent: number;
  legIndex: number;
  timestamp: number;
}

/**
 * Legacy v1 shapes (moved verbatim from deprecated `broadcasts.ts`, now deleted).
 * Frozen render/adapter consumers import these from the package index;
 * semantic migration to the v2 channels above is future work.
 */
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
  | WatchRotationBroadcast
  | ShipDockingUpdateBroadcast
  | CaptainJobOfferBroadcast
  | JobAssignedBroadcast
  | TransitUpdateBroadcast;
