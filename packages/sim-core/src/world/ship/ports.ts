/**
 * Trade-hub ports (TRANSFORM M3). The solo loop sails between fixed hubs;
 * each hub names its station frame and dock link. Station frames are static
 * world geometry; the hull eases between dock mouths and far holding
 * (abstract transit, no flyable ship). Dependency-free on purpose: schedule,
 * dockStatus, and systems all read this table without import cycles.
 */

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

export const HUB_PORTS: Readonly<Record<string, HubPort>> = {
  [HUB_A]: { hubId: HUB_A, stationFrame: 'station', dockId: 'harbor' },
  [HUB_B]: { hubId: HUB_B, stationFrame: 'hub_b', dockId: 'hub_b_harbor' },
  [HUB_C]: { hubId: HUB_C, stationFrame: 'hub_c', dockId: 'hub_c_harbor' },
  [HUB_D]: { hubId: HUB_D, stationFrame: 'hub_d', dockId: 'hub_d_harbor' },
};

export function isHubId(value: unknown): value is string {
  return typeof value === 'string' && HUB_PORTS[value] !== undefined;
}

export interface StationOrigin {
  readonly x: number;
  readonly y: number;
}

/** Station-frame origins in world px; render tables bake these in. */
export const STATION_ORIGINS: Readonly<Record<string, StationOrigin>> = {
  station: { x: 0, y: 0 },
  hub_b: { x: 0, y: 4000 },
  hub_c: { x: 0, y: 8000 },
  hub_d: { x: 0, y: 12000 },
};

/** Origin for a station frame; unknown frames sit at the origin. */
export function stationOriginFor(frameId: string): StationOrigin {
  return STATION_ORIGINS[frameId] ?? { x: 0, y: 0 };
}

export interface ChartLane {
  readonly a: string;
  readonly b: string;
  /** Share of a standard hub-to-hub leg (direct lane = 1). */
  readonly fraction: number;
}

/**
 * Charted lanes between voyage nodes (hubs + drift POIs). Fractions scale
 * a standard leg so detours cost extra time. Uncharted pairs default to a
 * full leg at projection/execution time so free plotting stays flyable.
 */
export const CHART_LANES: readonly ChartLane[] = [
  { a: HUB_A, b: HUB_B, fraction: 1 },
  { a: HUB_A, b: HUB_C, fraction: 0.9 },
  { a: HUB_A, b: HUB_D, fraction: 1.1 },
  { a: HUB_B, b: HUB_C, fraction: 1.2 },
  { a: HUB_B, b: HUB_D, fraction: 0.9 },
  { a: HUB_C, b: HUB_D, fraction: 1 },
  { a: HUB_A, b: POI_KESTREL, fraction: 0.4 },
  { a: POI_KESTREL, b: HUB_B, fraction: 0.8 },
  { a: HUB_A, b: POI_VIGIL, fraction: 0.5 },
  { a: POI_VIGIL, b: HUB_B, fraction: 0.7 },
  { a: POI_KESTREL, b: POI_VIGIL, fraction: 0.3 },
  { a: HUB_C, b: POI_KESTREL, fraction: 0.3 },
  { a: HUB_D, b: POI_KESTREL, fraction: 0.6 },
  { a: HUB_C, b: POI_VIGIL, fraction: 0.8 },
  { a: HUB_D, b: POI_VIGIL, fraction: 0.6 },
  { a: HUB_C, b: POI_LUMEN, fraction: 0.9 },
  { a: HUB_D, b: POI_LUMEN, fraction: 0.5 },
  { a: HUB_B, b: POI_LUMEN, fraction: 0.4 },
  { a: HUB_D, b: POI_NADIR, fraction: 0.8 },
  { a: HUB_B, b: POI_NADIR, fraction: 1 },
  { a: POI_KESTREL, b: MOON_WISP, fraction: 0.15 },
  { a: POI_VIGIL, b: MOON_MOTH, fraction: 0.15 },
  { a: POI_LUMEN, b: MOON_RILL, fraction: 0.15 },
  { a: POI_NADIR, b: MOON_TARN, fraction: 0.15 },
  { a: HUB_A, b: MOON_WISP, fraction: 0.5 },
  { a: HUB_B, b: MOON_MOTH, fraction: 0.8 },
];

/** Lane fraction either direction; undefined when the pair is uncharted. */
export function chartLaneFraction(fromId: string, toId: string): number | undefined {
  const lane = CHART_LANES.find(
    (entry) => (entry.a === fromId && entry.b === toId) || (entry.a === toId && entry.b === fromId)
  );
  return lane?.fraction;
}

export function hubPortForStation(stationFrame: string): HubPort | undefined {
  for (const port of Object.values(HUB_PORTS)) {
    if (port.stationFrame === stationFrame) return port;
  }
  return undefined;
}
