/**
 * World kernel types (protocol v2 era). Pure data only; no DOM/Node imports.
 * World space is global. Stations are static frames; vessels are rigid frames.
 * Portal graph is the law: rooms are nodes, portals are edges.
 */

import type { WallSegment } from '@kybernetes/protocol';
import type { AirRoomView } from './airAuthority.js';
import type { BotSchedule } from './bots.js';
import type { CrewRecord, HireOfferRecord } from './crew.js';
import type { DockLink, TransitState } from './schedule.js';
import type { PawnVitals } from './survival.js';
import type { WatchState } from './watch.js';

export interface WorldImpact {
  readonly frameId: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'pawn' | 'door' | 'breach' | 'miss';
  readonly untilTick: number;
}

export type PortalKind = 'door' | 'hole' | 'open' | 'airlock' | 'window';

export type PortalState = 'open' | 'closed' | 'destroyed' | 'sealed';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface RoomNode {
  readonly id: string;
  readonly frameId: string;
  readonly rect: Rect;
  readonly volumeM3: number;
}

export interface PortalEdge {
  readonly id: string;
  readonly roomA: string;
  readonly roomB: string;
  readonly kind: PortalKind;
  readonly state: PortalState;
  readonly cooldownUntilTick: number;
  readonly areaM2: number;
  readonly segment: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
  readonly clearance: number;
  /** Door/wall health 0-100; at 0 the portal is a connecting hole. */
  readonly integrity: number;
}

export interface Fixture {
  readonly id: string;
  readonly roomId: string;
  readonly kind: string;
  readonly pos: Vec2;
  readonly radius: number;
  readonly prompt?: string;
}

export interface LimbHealth {
  readonly limb: string;
  readonly hp: number;
}

export interface OrganHealth {
  readonly organ: string;
  readonly hp: number;
}

export interface DamageEvent {
  readonly force: number;
  readonly materialK: number;
  readonly materialE: number;
  readonly point: Vec2;
  readonly limbHint?: string;
}

export interface HealthSummary {
  readonly hp: number;
  readonly maxHp: number;
  readonly suitSealed: boolean;
  readonly incapacitated: boolean;
  readonly limbs?: readonly LimbHealth[];
  readonly organs?: readonly OrganHealth[];
}

export interface PawnBody {
  readonly id: string;
  readonly owner: string;
  readonly frameId: string;
  readonly roomHint: string;
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly facing: number;
  readonly radius: number;
  readonly speed: number;
  readonly health: HealthSummary;
  readonly color: string;
  /** Tick before which dock transfer volumes ignore this pawn (anti-bounce). */
  readonly transferCooldownUntilTick: number;
  /** Spoken line cleared after sayUntilTick; empty means silent. */
  readonly say: string;
  readonly sayUntilTick: number;
}

export interface ProjectileBody {
  readonly id: string;
  readonly frameId: string;
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly damage: number;
  readonly fromPawnId: string;
  readonly weapon: string;
  readonly lifeTicks: number;
  readonly graceTicks: number;
}

export type VesselSchedulePhase = 'docked' | 'departing' | 'in_transit' | 'inbound';

export interface VesselFrame {
  readonly id: string;
  readonly name: string;
  readonly beacon: string;
  readonly origin: Vec2;
  readonly angle: number;
  readonly vel: Vec2;
  readonly angVel: number;
  readonly schedule: VesselSchedulePhase;
}

export interface StationFrame {
  readonly id: string;
  readonly origin: Vec2;
}

export interface World {
  readonly tick: number;
  readonly timeMs: number;
  readonly vessels: Readonly<Record<string, VesselFrame>>;
  readonly stations: Readonly<Record<string, StationFrame>>;
  readonly rooms: Readonly<Record<string, RoomNode>>;
  readonly portals: Readonly<Record<string, PortalEdge>>;
  readonly fixtures: Readonly<Record<string, Fixture>>;
  readonly pawns: Readonly<Record<string, PawnBody>>;
  readonly projectiles: Readonly<Record<string, ProjectileBody>>;
  /** Compiled wall segments per frame id; the collision and LOS source of truth. */
  readonly wallsByFrame: Readonly<Record<string, readonly WallSegment[]>>;
  /** Remembered fog-of-war: room ids ever visible per pawn id. */
  readonly memory: Readonly<Record<string, readonly string[]>>;
  /** Latest air readings per namespaced room id; refreshed when the host steps air. */
  readonly atmos: Readonly<Record<string, AirRoomView>>;
  /** Hired crew (plus captains) by pawn id; fresh pawns have no record until hired. */
  readonly crew: Readonly<Record<string, CrewRecord>>;
  /** One watch record per vessel id, replaced every leg. */
  readonly watches: Readonly<Record<string, WatchState>>;
  /** Transit timers and legs per vessel id; phase mirrors VesselFrame.schedule. */
  readonly transit: Readonly<Record<string, TransitState>>;
  /** Open hire offers by offer id; consumed by HIRE. */
  readonly offers: Readonly<Record<string, HireOfferRecord>>;
  /** Named spawn points by namespaced id. */
  readonly spawns: Readonly<Record<string, { frameId: string; x: number; y: number }>>;
  /** Station-to-vessel dock links by id. */
  readonly docks: Readonly<Record<string, DockLink>>;
  /** Survival vitals by pawn id; created on first tick. */
  readonly vitals: Readonly<Record<string, PawnVitals>>;
  /** Bot schedules by pawn id; only scheduled pawns move on their own. */
  readonly bots: Readonly<Record<string, BotSchedule>>;
  /** Aim bloom in radians by pawn id; grows per shot, decays when not firing. */
  readonly spread: Readonly<Record<string, number>>;
  /** Recent shot impacts with expiry ticks; pruned every tick. */
  readonly impacts: readonly WorldImpact[];
}

export const FIXED_DT = 1 / 20;

export function createEmptyWorld(timeMs = 0): World {
  return {
    tick: 0,
    timeMs,
    vessels: {},
    stations: {},
    rooms: {},
    portals: {},
    fixtures: {},
    pawns: {},
    projectiles: {},
    wallsByFrame: {},
    memory: {},
    atmos: {},
    crew: {},
    watches: {},
    transit: {},
    offers: {},
    spawns: {},
    docks: {},
    vitals: {},
    bots: {},
    spread: {},
    impacts: [],
  };
}
