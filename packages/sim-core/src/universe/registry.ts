/**
 * Universe registry (Strike 1): throwing lookups over the catalog.
 * Silent fallbacks ('{0,0}' origins, dummy bodies, classic-hull default)
 * hid typos and let hubs drift. These throw UnknownUniverseError instead;
 * the 'try*' variants are for the rare callers that probe unknown ids
 * (legacy door offsets, UI filters) and must branch explicitly.
 * Pure + deterministic; no DOM/Node imports.
 */

import type { HubDesc, UniverseBody } from './catalog.js';
import { UNIVERSE_BODIES, UNIVERSE_CHART, UNIVERSE_HUBS, UNIVERSE_LANES } from './catalog.js';

export class UnknownUniverseError extends Error {
  readonly id: string;
  constructor(kind: string, id: string) {
    super(`unknown universe ${kind}: ${id}`);
    this.name = 'UnknownUniverseError';
    this.id = id;
  }
}

/** Throwing body lookup; replaces the dummy-body fallback. */
export function requireBody(id: string): UniverseBody {
  const found = UNIVERSE_BODIES.find((entry) => entry.id === id);
  if (found === undefined) throw new UnknownUniverseError('body', id);
  return found;
}

/** Optional body lookup for probes that must branch on unknown ids. */
export function tryBody(id: string): UniverseBody | undefined {
  return UNIVERSE_BODIES.find((entry) => entry.id === id);
}

/** True when the id names a catalog body. */
export function isBodyId(value: unknown): value is string {
  return typeof value === 'string' && tryBody(value) !== undefined;
}

/** Throwing hub lookup. */
export function requireHub(hubId: string): HubDesc {
  const found = UNIVERSE_HUBS[hubId];
  if (found === undefined) throw new UnknownUniverseError('hub', hubId);
  return found;
}

/** Optional hub lookup. */
export function tryHub(hubId: string): HubDesc | undefined {
  return UNIVERSE_HUBS[hubId];
}

/** True when the id names a hub (not a POI/moon). */
export function isUniverseHubId(value: unknown): value is string {
  return typeof value === 'string' && tryHub(value) !== undefined;
}

/** Hub owning a station frame; undefined when the frame is not a hub dock. */
export function hubForStation(stationFrame: string): HubDesc | undefined {
  for (const hub of Object.values(UNIVERSE_HUBS)) {
    if (hub.stationFrame === stationFrame) return hub;
  }
  return undefined;
}

/** Throwing station-frame origin; unknown frames throw instead of (0,0). */
export function requireStationOrigin(frameId: string): { readonly x: number; readonly y: number } {
  const hub = hubForStation(frameId);
  if (hub === undefined) throw new UnknownUniverseError('station-frame', frameId);
  return hub.origin;
}

/** Optional station-frame origin for legacy probes (bare ids, ship frames). */
export function tryStationOrigin(
  frameId: string
): { readonly x: number; readonly y: number } | undefined {
  return hubForStation(frameId)?.origin;
}

/** Lane fraction either direction; undefined when the pair is uncharted. */
export function laneFraction(fromId: string, toId: string): number | undefined {
  const found = UNIVERSE_LANES.find(
    (entry) => (entry.a === fromId && entry.b === toId) || (entry.a === toId && entry.b === fromId)
  );
  return found?.fraction;
}

/** True when the id names a chart node (hub or POI). */
export function isUniverseChartNodeId(value: unknown): value is string {
  return typeof value === 'string' && UNIVERSE_CHART.some((entry) => entry.id === value);
}

/**
 * Catalog consistency check: every hub body exists, every lane endpoint is
 * charted, every chart hub has a hub entry, origins are distinct.
 * Returns error strings; empty means consistent.
 */
export function validateUniverse(): string[] {
  const errors: string[] = [];
  const bodyIds = new Set<string>(UNIVERSE_BODIES.map((entry) => entry.id as string));
  const chartIds = new Set<string>(UNIVERSE_CHART.map((entry) => entry.id as string));
  for (const hub of Object.values(UNIVERSE_HUBS)) {
    if (!bodyIds.has(hub.bodyId as string)) errors.push(`hub ${hub.hubId} body missing`);
    if (!chartIds.has(hub.hubId as string)) errors.push(`hub ${hub.hubId} missing from chart`);
  }
  for (const lane of UNIVERSE_LANES) {
    if (!chartIds.has(lane.a as string)) errors.push(`lane unknown endpoint ${lane.a}`);
    if (!chartIds.has(lane.b as string)) errors.push(`lane unknown endpoint ${lane.b}`);
    if (!(lane.fraction > 0)) errors.push(`lane non-positive fraction ${lane.a}`);
  }
  const origins = Object.values(UNIVERSE_HUBS).map((hub) => `${hub.origin.x},${hub.origin.y}`);
  if (new Set(origins).size !== origins.length) errors.push('hub origins overlap');
  return errors;
}
