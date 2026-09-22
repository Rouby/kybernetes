/**
 * Hull content schema: versioned HullJson validation plus the dock-spine
 * invariant. The east dock spine (korridor_ost, andock_a, andock_tube plus
 * its three portals) mates the station tube mouth (world x=1210) with the
 * vessel mouth, so every variant must keep it geometrically identical to
 * the classic harbor. The compiler enforces this (see hullCompiler.ts):
 * a variant that moves the dock mouth fails compile, not playtest.
 *
 * StationHub.hull.ts stays the validated TS source for the 20+ existing
 * importers; JSON content flows through validateHullJson/hullSpecFromJson
 * and lands on the same HullSpec shape.
 */

import type { HullSpec } from '../hullCompiler.js';

export const HULL_SCHEMA_VERSION = 1;

export const DOCK_SPINE_ROOM_IDS = ['korridor_ost', 'andock_a', 'andock_tube'] as const;

export type DockSpineRoomId = (typeof DOCK_SPINE_ROOM_IDS)[number];

export const DOCK_SPINE_PORTAL_IDS = [
  'korridor_ost_andock',
  'andock_a_tube',
  'andock_tube_mund',
] as const;

export type DockSpinePortalId = (typeof DOCK_SPINE_PORTAL_IDS)[number];

export interface HullJsonRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface HullJsonRoom {
  readonly id: string;
  readonly rect: HullJsonRect;
  readonly volumeM3: number;
}

export interface HullJsonSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface HullJsonPortal {
  readonly id: string;
  readonly roomA: string;
  readonly roomB: string;
  readonly kind: string;
  readonly segment: HullJsonSegment;
  readonly areaM2: number;
  readonly window?: boolean;
  readonly clearance?: number;
}

export interface HullJson {
  readonly version: number;
  readonly frameId: string;
  readonly rooms: readonly HullJsonRoom[];
  readonly portals: readonly HullJsonPortal[];
  readonly spawns?: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
}

/** Canonical dock-spine room rects copied from StationHub.hull.ts. */
export const DOCK_SPINE_ROOMS: Readonly<Record<DockSpineRoomId, HullJsonRect>> = {
  korridor_ost: { x: 920, y: 120, w: 100, h: 360 },
  andock_a: { x: 1020, y: 220, w: 120, h: 80 },
  andock_tube: { x: 1140, y: 220, w: 70, h: 80 },
};

/** Canonical dock-spine portal geometry copied from StationHub.hull.ts. */
export const DOCK_SPINE_PORTALS: Readonly<
  Record<
    DockSpinePortalId,
    {
      readonly roomA: string;
      readonly roomB: string;
      readonly kind: string;
      readonly segment: HullJsonSegment;
    }
  >
> = {
  korridor_ost_andock: {
    roomA: 'korridor_ost',
    roomB: 'andock_a',
    kind: 'airlock',
    segment: { x1: 1020, y1: 220, x2: 1020, y2: 280 },
  },
  andock_a_tube: {
    roomA: 'andock_a',
    roomB: 'andock_tube',
    kind: 'open',
    segment: { x1: 1140, y1: 240, x2: 1140, y2: 280 },
  },
  andock_tube_mund: {
    roomA: 'andock_tube',
    roomB: 'space',
    kind: 'airlock',
    segment: { x1: 1210, y1: 240, x2: 1210, y2: 280 },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function rectEquals(a: HullJsonRect, b: HullJsonRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function segmentEquals(a: HullJsonSegment, b: HullJsonSegment): boolean {
  return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
}

/**
 * Single-spec dock-spine check against the canonical harbor. Ship hulls
 * (no spine rooms) pass through with zero errors; station hulls must
 * carry the spine rooms and portals geometrically identical.
 */
export function validateDockSpine(spec: Pick<HullSpec, 'rooms' | 'portals'>): string[] {
  if (!isStationHull(spec)) return [];
  const errors: string[] = [];
  errors.push(...checkSpineRooms(spec));
  errors.push(...checkSpinePortals(spec));
  return errors;
}

/** Ship hulls carry no dock spine; station hulls keep korridor_mitte or spine ids. */
function isStationHull(spec: Pick<HullSpec, 'rooms' | 'portals'>): boolean {
  if (spec.rooms.some((room) => room.id === 'korridor_mitte')) return true;
  if (spec.rooms.some((room) => (DOCK_SPINE_ROOM_IDS as readonly string[]).includes(room.id))) {
    return true;
  }
  return spec.portals.some((portal) =>
    (DOCK_SPINE_PORTAL_IDS as readonly string[]).includes(portal.id)
  );
}

function checkSpineRooms(spec: Pick<HullSpec, 'rooms'>): string[] {
  const byId = new Map(spec.rooms.map((room) => [room.id, room] as const));
  const errors: string[] = [];
  for (const id of DOCK_SPINE_ROOM_IDS) {
    const room = byId.get(id);
    if (room === undefined) {
      errors.push('dock spine room "' + id + '" is missing');
      continue;
    }
    const canonical = DOCK_SPINE_ROOMS[id];
    if (!rectEquals(room.rect, canonical)) {
      errors.push('dock spine room "' + id + '" differs from canonical geometry');
    }
  }
  return errors;
}

function checkSpinePortals(spec: Pick<HullSpec, 'portals'>): string[] {
  const byId = new Map(spec.portals.map((portal) => [portal.id, portal] as const));
  const errors: string[] = [];
  for (const id of DOCK_SPINE_PORTAL_IDS) {
    const portal = byId.get(id);
    if (portal === undefined) {
      errors.push('dock spine portal "' + id + '" is missing');
      continue;
    }
    errors.push(...checkSpinePortalShape(id, portal));
  }
  return errors;
}

function checkSpinePortalShape(
  id: DockSpinePortalId,
  portal: {
    readonly roomA: string;
    readonly roomB: string;
    readonly kind: string;
    readonly segment: HullJsonSegment;
  }
): string[] {
  const canonical = DOCK_SPINE_PORTALS[id];
  if (
    portal.roomA !== canonical.roomA ||
    portal.roomB !== canonical.roomB ||
    portal.kind !== canonical.kind
  ) {
    return [
      'dock spine portal "' +
        id +
        '" is rewired (expected ' +
        canonical.roomA +
        '->' +
        canonical.roomB +
        ' ' +
        canonical.kind +
        ')',
    ];
  }
  if (!segmentEquals(portal.segment, canonical.segment)) {
    return ['dock spine portal "' + id + '" segment differs from canonical dock mouth'];
  }
  return [];
}

/**
 * Cross-variant dock-spine check: every spine room rect and spine portal
 * segment must match the base exactly. The compiler routes variant
 * validation through here; hullCompiler.checkHull covers the canonical
 * single-spec case via validateDockSpine.
 */
export function validateVariant(
  base: Pick<HullSpec, 'rooms' | 'portals'>,
  variant: Pick<HullSpec, 'rooms' | 'portals'>
): string[] {
  const errors: string[] = [];
  errors.push(...diffSpineRooms(base, variant));
  errors.push(...diffSpineSegments(base, variant));
  return errors;
}

function diffSpineRooms(base: Pick<HullSpec, 'rooms'>, variant: Pick<HullSpec, 'rooms'>): string[] {
  const baseById = new Map(base.rooms.map((room) => [room.id, room] as const));
  const variantById = new Map(variant.rooms.map((room) => [room.id, room] as const));
  const errors: string[] = [];
  for (const id of DOCK_SPINE_ROOM_IDS) {
    const a = baseById.get(id);
    const b = variantById.get(id);
    if (a === undefined || b === undefined) {
      errors.push('dock spine room "' + id + '" is missing from base or variant');
    } else if (!rectEquals(a.rect, b.rect)) {
      errors.push('dock spine room "' + id + '" moved between base and variant');
    }
  }
  return errors;
}

function diffSpineSegments(
  base: Pick<HullSpec, 'portals'>,
  variant: Pick<HullSpec, 'portals'>
): string[] {
  const baseById = new Map(base.portals.map((portal) => [portal.id, portal] as const));
  const variantById = new Map(variant.portals.map((portal) => [portal.id, portal] as const));
  const errors: string[] = [];
  for (const id of DOCK_SPINE_PORTAL_IDS) {
    const a = baseById.get(id);
    const b = variantById.get(id);
    if (a === undefined || b === undefined) {
      errors.push('dock spine portal "' + id + '" is missing from base or variant');
    } else if (!segmentEquals(a.segment, b.segment)) {
      errors.push('dock spine portal "' + id + '" moved between base and variant');
    }
  }
  return errors;
}

/** Versioned HullJson validation: shape, version, ids, numbers, spine. */
export function validateHullJson(doc: unknown): string[] {
  if (!isRecord(doc)) return ['hull json must be an object'];
  const errors: string[] = [];
  errors.push(...checkHullVersion(doc));
  errors.push(...checkHullFrameId(doc));
  errors.push(...checkHullRooms(doc));
  errors.push(...checkHullPortals(doc));
  errors.push(...checkHullSpawns(doc));
  if (errors.length > 0) return errors;
  errors.push(...validateDockSpine(roomsAndPortals(doc)));
  return errors;
}

function roomsAndPortals(doc: Record<string, unknown>): Pick<HullSpec, 'rooms' | 'portals'> {
  return {
    rooms: doc.rooms as HullSpec['rooms'],
    portals: doc.portals as HullSpec['portals'],
  };
}

function checkHullVersion(doc: Record<string, unknown>): string[] {
  if (doc.version !== HULL_SCHEMA_VERSION) {
    return [
      'unsupported hull version ' + String(doc.version) + ' (expected ' + HULL_SCHEMA_VERSION + ')',
    ];
  }
  return [];
}

function checkHullFrameId(doc: Record<string, unknown>): string[] {
  if (typeof doc.frameId !== 'string' || doc.frameId.length === 0) {
    return ['hull frameId must be a non-empty string'];
  }
  return [];
}

function checkHullRooms(doc: Record<string, unknown>): string[] {
  if (!Array.isArray(doc.rooms)) return ['hull rooms must be an array'];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const room of doc.rooms) {
    errors.push(...checkHullRoom(room, seen));
  }
  return errors;
}

function checkHullRoom(room: unknown, seen: Set<string>): string[] {
  if (!isRecord(room)) return ['hull room must be an object'];
  const identity = checkRoomIdentity(room, seen);
  if (identity !== undefined) return [identity];
  const id = room.id as string;
  return [...checkRoomRect(room, id), ...checkRoomVolume(room, id)];
}

function checkRoomIdentity(room: Record<string, unknown>, seen: Set<string>): string | undefined {
  if (typeof room.id !== 'string' || room.id.length === 0) {
    return 'hull room id must be a non-empty string';
  }
  if (seen.has(room.id)) return 'duplicate hull room id "' + room.id + '"';
  seen.add(room.id);
  return undefined;
}

function checkRoomRect(room: Record<string, unknown>, id: string): string[] {
  if (!isRecord(room.rect)) return ['hull room "' + id + '" rect must be an object'];
  const { x, y, w, h } = room.rect as Record<string, unknown>;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
    return ['hull room "' + id + '" rect must hold finite x/y/w/h numbers'];
  }
  if ((w as number) <= 0 || (h as number) <= 0) {
    return ['hull room "' + id + '" rect must have positive size'];
  }
  return [];
}

function checkRoomVolume(room: Record<string, unknown>, id: string): string[] {
  if (!isFiniteNumber(room.volumeM3) || (room.volumeM3 as number) < 0) {
    return ['hull room "' + id + '" volumeM3 must be a non-negative number'];
  }
  return [];
}

function checkHullPortals(doc: Record<string, unknown>): string[] {
  if (!Array.isArray(doc.portals)) return ['hull portals must be an array'];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const portal of doc.portals) {
    errors.push(...checkHullPortal(portal, seen));
  }
  return errors;
}

function checkHullPortal(portal: unknown, seen: Set<string>): string[] {
  if (!isRecord(portal)) return ['hull portal must be an object'];
  const identity = checkPortalIdentity(portal, seen);
  if (identity !== undefined) return [identity];
  const id = portal.id as string;
  return [
    ...checkPortalEndpoints(portal, id),
    ...checkPortalSegment(portal, id),
    ...checkPortalArea(portal, id),
  ];
}

function checkPortalIdentity(
  portal: Record<string, unknown>,
  seen: Set<string>
): string | undefined {
  if (typeof portal.id !== 'string' || portal.id.length === 0) {
    return 'hull portal id must be a non-empty string';
  }
  if (seen.has(portal.id)) return 'duplicate hull portal id "' + portal.id + '"';
  seen.add(portal.id);
  return undefined;
}

function checkPortalEndpoints(portal: Record<string, unknown>, id: string): string[] {
  if (typeof portal.roomA !== 'string' || typeof portal.roomB !== 'string') {
    return ['hull portal "' + id + '" must name roomA/roomB strings'];
  }
  if (typeof portal.kind !== 'string' || portal.kind.length === 0) {
    return ['hull portal "' + id + '" kind must be a non-empty string'];
  }
  return [];
}

function checkPortalSegment(portal: Record<string, unknown>, id: string): string[] {
  if (!isRecord(portal.segment)) return ['hull portal "' + id + '" segment must be an object'];
  const seg = portal.segment as Record<string, unknown>;
  const finite =
    isFiniteNumber(seg.x1) &&
    isFiniteNumber(seg.y1) &&
    isFiniteNumber(seg.x2) &&
    isFiniteNumber(seg.y2);
  return finite ? [] : ['hull portal "' + id + '" segment must hold finite numbers'];
}

function checkPortalArea(portal: Record<string, unknown>, id: string): string[] {
  if (!isFiniteNumber(portal.areaM2) || (portal.areaM2 as number) < 0) {
    return ['hull portal "' + id + '" areaM2 must be a non-negative number'];
  }
  return [];
}

function checkHullSpawns(doc: Record<string, unknown>): string[] {
  if (doc.spawns === undefined) return [];
  if (!isRecord(doc.spawns)) return ['hull spawns must be a record'];
  const errors: string[] = [];
  for (const [id, point] of Object.entries(doc.spawns)) {
    if (!isRecord(point)) {
      errors.push('hull spawn "' + id + '" must be an object');
      continue;
    }
    if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
      errors.push('hull spawn "' + id + '" must hold finite x/y numbers');
    }
  }
  return errors;
}

/** Strip the version envelope after validateHullJson passes. */
export function hullSpecFromJson(json: HullJson): HullSpec {
  return {
    frameId: json.frameId,
    rooms: json.rooms.map((room) => ({
      id: room.id,
      rect: { ...room.rect },
      volumeM3: room.volumeM3,
    })),
    portals: json.portals.map((portal) => ({
      id: portal.id,
      roomA: portal.roomA,
      roomB: portal.roomB,
      kind: portal.kind as HullSpec['portals'][number]['kind'],
      segment: { ...portal.segment },
      areaM2: portal.areaM2,
      ...(portal.window === undefined ? {} : { window: portal.window }),
      ...(portal.clearance === undefined ? {} : { clearance: portal.clearance }),
    })),
    ...(json.spawns === undefined ? {} : { spawns: { ...json.spawns } }),
  };
}

/** Wrap a HullSpec as versioned JSON for content pipelines. */
export function hullSpecToJson(spec: HullSpec): HullJson {
  return {
    version: HULL_SCHEMA_VERSION,
    frameId: spec.frameId,
    rooms: spec.rooms.map((room) => ({
      id: room.id,
      rect: { ...room.rect },
      volumeM3: room.volumeM3,
    })),
    portals: spec.portals.map((portal) => ({
      id: portal.id,
      roomA: portal.roomA,
      roomB: portal.roomB,
      kind: portal.kind,
      segment: { ...portal.segment },
      areaM2: portal.areaM2,
      ...(portal.window === undefined ? {} : { window: portal.window }),
      ...(portal.clearance === undefined ? {} : { clearance: portal.clearance }),
    })),
    ...(spec.spawns === undefined ? {} : { spawns: { ...spec.spawns } }),
  };
}
