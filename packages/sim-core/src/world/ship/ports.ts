/**
 * Trade-hub ports (TRANSFORM M3). The solo loop sails between fixed hubs;
 * each hub names its station frame and dock link. Station frames are static
 * world geometry; the vessel teleports between dock mouths on arrival
 * (abstract transit, no flyable ship). Dependency-free on purpose: schedule,
 * dockStatus, and systems all read this table without import cycles.
 */

export const HUB_A = 'hub_a';
export const HUB_B = 'hub_b';
export const POI_KESTREL = 'poi_kestrel';
export const POI_VIGIL = 'poi_vigil';

export interface HubPort {
  readonly hubId: string;
  readonly stationFrame: string;
  readonly dockId: string;
}

export const HUB_PORTS: Readonly<Record<string, HubPort>> = {
  [HUB_A]: { hubId: HUB_A, stationFrame: 'station', dockId: 'harbor' },
  [HUB_B]: { hubId: HUB_B, stationFrame: 'hub_b', dockId: 'hub_b_harbor' },
};

export function isHubId(value: unknown): value is string {
  return typeof value === 'string' && HUB_PORTS[value] !== undefined;
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
  { a: HUB_A, b: POI_KESTREL, fraction: 0.4 },
  { a: POI_KESTREL, b: HUB_B, fraction: 0.8 },
  { a: HUB_A, b: POI_VIGIL, fraction: 0.5 },
  { a: POI_VIGIL, b: HUB_B, fraction: 0.7 },
  { a: POI_KESTREL, b: POI_VIGIL, fraction: 0.3 },
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
