/**
 * Trade-hub ports (TRANSFORM M3). The solo loop sails between fixed hubs;
 * each hub names its station frame and dock link. Station frames are static
 * world geometry; the hull eases between dock mouths and far holding
 * (abstract transit, no flyable ship). Dependency-free on purpose: schedule,
 * dockStatus, and systems all read this table without import cycles.
 *
 * Strike 1: values are derived from the universe catalog
 * (universe/catalog.ts). Do not extend here: add a hub/lane to UNIVERSE
 * instead so astro, ports, chart, and guidance stay in agreement.
 * Lookups throw on unknown ids; use the try* variants for probes.
 */

import { UNIVERSE_HUBS, UNIVERSE_LANES } from '../../universe/catalog.js';
import {
  isUniverseHubId,
  hubForStation as registryHubForStation,
  laneFraction as registryLaneFraction,
  requireStationOrigin,
  tryStationOrigin,
} from '../../universe/registry.js';

export const HUB_A = 'hub_a';
export const HUB_B = 'hub_b';
export const HUB_C = 'hub_c';
export const HUB_D = 'hub_d';
export const POI_KESTREL = 'poi_kestrel';
export const POI_VIGIL = 'poi_vigil';
export const POI_LUMEN = 'poi_lumen';
export const POI_NADIR = 'poi_nadir';
export const MOON_WISP = 'moon_wisp';
export const MOON_MOTH = 'moon_moth';
export const MOON_RILL = 'moon_rill';
export const MOON_TARN = 'moon_tarn';

export interface HubPort {
  readonly hubId: string;
  readonly stationFrame: string;
  readonly dockId: string;
}

/** Derived view over UNIVERSE_HUBS. Add hubs to the catalog, not here. */
export const HUB_PORTS: Readonly<Record<string, HubPort>> = Object.fromEntries(
  Object.values(UNIVERSE_HUBS).map((hub) => [
    hub.hubId as string,
    {
      hubId: hub.hubId as string,
      stationFrame: hub.stationFrame as string,
      dockId: hub.dockId as string,
    },
  ])
) as Readonly<Record<string, HubPort>>;

export function isHubId(value: unknown): value is string {
  return isUniverseHubId(value);
}

export interface StationOrigin {
  readonly x: number;
  readonly y: number;
}

/** Derived view over UNIVERSE_HUBS origins; render tables bake these in. */
export const STATION_ORIGINS: Readonly<Record<string, StationOrigin>> = Object.fromEntries(
  Object.values(UNIVERSE_HUBS).map((hub) => [hub.stationFrame as string, { ...hub.origin }])
) as Readonly<Record<string, StationOrigin>>;

/**
 * Origin for a station frame; unknown frames throw (was: silent {0,0}).
 * Use tryStationOriginFor when probing bare/ship ids is expected.
 */
export function stationOriginFor(frameId: string): StationOrigin {
  return requireStationOrigin(frameId);
}

/** Optional origin for legacy probes (bare ids, ship frames, empty ids). */
export function tryStationOriginFor(frameId: string): StationOrigin | undefined {
  return tryStationOrigin(frameId);
}

export interface ChartLane {
  readonly a: string;
  readonly b: string;
  /** Share of a standard hub-to-hub leg (direct lane = 1). */
  readonly fraction: number;
}

/**
 * Derived view over UNIVERSE_LANES. Fractions scale a standard leg so
 * detours cost extra time. Uncharted pairs stay undefined so callers
 * fall back explicitly instead of silently flying a full leg.
 */
export const CHART_LANES: readonly ChartLane[] = UNIVERSE_LANES.map((lane) => ({
  a: lane.a as string,
  b: lane.b as string,
  fraction: lane.fraction,
}));

/** Lane fraction either direction; undefined when the pair is uncharted. */
export function chartLaneFraction(fromId: string, toId: string): number | undefined {
  return registryLaneFraction(fromId, toId);
}

export function hubPortForStation(stationFrame: string): HubPort | undefined {
  const hub = registryHubForStation(stationFrame);
  if (hub === undefined) return undefined;
  return {
    hubId: hub.hubId as string,
    stationFrame: hub.stationFrame as string,
    dockId: hub.dockId as string,
  };
}
