/**
 * Hub geometry: the single compile path for every trade-hub station.
 * Sim assembly (assemble.ts/scenarios.ts) and render (spatial/deck.ts,
 * spatial/doors.ts) both funnel through compileHubGeometry, so sim walls
 * and render walls for every hub come from one compile. Hulls resolve
 * from the universe catalog (hullForHub/frameSpecForHub) and every
 * compiled variant carries the dock-spine invariant from the compiler.
 *
 * ID conventions: compiled rooms/portals use BARE ids; world assembly
 * namespaces them per frame ('hub_c.habitat', 'hub_c.habitat_korridor')
 * and render offsets hub geometry by its station origin. Door seeds keep
 * namespaced ids so live snapshot portals join directly.
 */

import type { WallSegment } from '@kybernetes/protocol';
import { requireHub } from '../../universe/registry.js';
import type { FrameSpec } from '../assemble.js';
import { type CompiledHull, compileHull, type HullSpec, toLegacyWalls } from '../hullCompiler.js';
import { HUB_PORTS, stationOriginFor } from '../ship/ports.js';
import type { World } from '../types.js';
import { StationHubSpec } from './StationHub.hull.js';
import { stationHullFor } from './StationVariants.hull.js';

export interface HubCompiledFrame {
  readonly frame: string;
  readonly hubId: string;
  readonly originX: number;
  readonly originY: number;
  readonly rooms: readonly {
    readonly id: string;
    readonly rect: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    };
  }[];
  readonly walls: readonly WallSegment[];
  readonly compiled: CompiledHull;
}

export interface HubDoorSeed {
  readonly id: string;
  readonly roomA: string;
  readonly roomB: string;
  readonly kind: string;
  readonly segment: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
  readonly frame: string;
}

/** Validated hull for a hub id; Meridian keeps the classic harbor. */
export function hullForHub(hubId: string): HullSpec {
  if (hubId === 'station') return StationHubSpec;
  return stationHullFor(hubId);
}

/**
 * Station FrameSpec for a hub id, resolved from the universe catalog.
 * The hull frameId is overridden to the station frame so compiled wall
 * ids match render (legacy buildWorld hulls keep 'station_hub' ids;
 * Strike 4 migrates it onto this helper).
 */
export function frameSpecForHub(hubId: string): FrameSpec {
  const hub = requireHub(hubId);
  const frameId = hub.stationFrame as string;
  const origin = hub.origin as { readonly x: number; readonly y: number };
  const hull = hullForHub(hub.hubId as string);
  return { frameId, hull: { ...hull, frameId }, origin: { ...origin } };
}

/** Station FrameSpecs for every hub id in order. */
export function frameSpecsForHubs(hubIds: readonly string[]): FrameSpec[] {
  return hubIds.map((hubId) => frameSpecForHub(hubId));
}

function compileOneHub(hubId: string, frame: string): HubCompiledFrame {
  const hull = hullForHub(hubId);
  const origin = stationOriginFor(frame);
  const compiled = compileHull({ ...hull, frameId: frame });
  return {
    frame,
    hubId,
    originX: origin.x,
    originY: origin.y,
    rooms: compiled.rooms.map((room) => ({ id: room.id, rect: { ...room.rect } })),
    walls: toLegacyWalls(compiled),
    compiled,
  };
}

function buildHubGeometry(): HubCompiledFrame[] {
  const frames: HubCompiledFrame[] = [];
  for (const port of Object.values(HUB_PORTS)) {
    frames.push(compileOneHub(port.hubId, port.stationFrame));
  }
  return frames;
}

let cachedHubGeometry: readonly HubCompiledFrame[] | undefined;

/**
 * Single compile path for all hub stations (home 'station' first, then
 * hub_b/c/d in catalog order). Memoized: sim and render share one
 * compile, and the shared-path test asserts wall parity against it.
 */
export function compileHubGeometry(): readonly HubCompiledFrame[] {
  if (cachedHubGeometry === undefined) cachedHubGeometry = buildHubGeometry();
  return cachedHubGeometry;
}

/** Compiled hub geometry for a station frame, if it is a hub frame. */
export function compiledHubForFrame(frameId: string): HubCompiledFrame | undefined {
  return compileHubGeometry().find((entry) => entry.frame === frameId);
}

/** Namespaced door seeds for every hub frame (ship doors live in doors.ts). */
export function hubDoorSeeds(): HubDoorSeed[] {
  const seeds: HubDoorSeed[] = [];
  for (const entry of compileHubGeometry()) {
    collectHubDoorSeeds(entry, seeds);
  }
  return seeds;
}

function collectHubDoorSeeds(entry: HubCompiledFrame, seeds: HubDoorSeed[]): void {
  for (const portal of entry.compiled.portals) {
    if (portal.kind !== 'door' && portal.kind !== 'airlock') continue;
    seeds.push({
      id: entry.frame + '.' + portal.id,
      roomA: entry.frame + '.' + portal.roomA,
      roomB: frameRoomId(entry.frame, portal.roomB),
      kind: portal.kind,
      segment: { ...portal.segment },
      frame: entry.frame,
    });
  }
}

function frameRoomId(frame: string, room: string): string {
  if (room === 'space' || room === 'vacuum') return 'vacuum';
  return frame + '.' + room;
}

/**
 * Mirror home-station fixtures onto one hub frame when the target room
 * exists. Shared with scenarios.ts so sim and render funnel through one
 * mirroring implementation instead of two.
 */
export function mirrorFixturesToFrame(world: World, frame: string): World {
  let next = world;
  for (const fix of Object.values(world.fixtures)) {
    next = mirrorOneFixture(next, fix, frame);
  }
  return next;
}

function mirrorOneFixture(world: World, fix: World['fixtures'][string], frame: string): World {
  if (!fix.id.startsWith('station.')) return world;
  const twinId = frame + '.' + fix.id.slice('station.'.length);
  if (world.fixtures[twinId] !== undefined) return world;
  const roomId = fix.roomId.startsWith('station.')
    ? frame + '.' + fix.roomId.slice('station.'.length)
    : fix.roomId;
  if (world.rooms[roomId] === undefined) return world;
  return {
    ...world,
    fixtures: {
      ...world.fixtures,
      [twinId]: { ...fix, id: twinId, roomId, claimedBy: undefined },
    },
  };
}
