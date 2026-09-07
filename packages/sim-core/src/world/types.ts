/**
 * World kernel types (protocol v2 era). Pure data only; no DOM/Node imports.
 * World space is global. Stations are static frames; vessels are rigid frames.
 * Portal graph is the law: rooms are nodes, portals are edges.
 */

import type { WallSegment } from '@kybernetes/protocol';

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
}

export interface ProjectileBody {
  readonly id: string;
  readonly frameId: string;
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly damage: number;
  readonly fromPawnId: string;
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
  };
}
