/**
 * Universe catalog (Strike 1): the single source of truth for bodies, hubs,
 * lanes, chart nodes, and station origins.
 * astro/system.ts, world/ship/ports.ts, and world/ship/chart.ts used to own
 * independent copies of the same 12 bodies / 4 hubs. They now derive from
 * here. Add a hub by adding one body + one hub + lanes + chart row.
 * Pure data only; no DOM/Node imports.
 */

import type { BodyId, DockId, FrameId, HubId, HullId } from './ids.js';

export type UniverseBodyKind = 'hub' | 'poi' | 'moon';

export interface UniverseBody {
  readonly id: BodyId;
  readonly kind: UniverseBodyKind;
  /** Star-centered orbit for planets, planet-centered orbit for moons. */
  readonly radiusFrac: number;
  readonly phase0: number;
  /** Host body id for moons; undefined for planets. */
  readonly moonOf?: BodyId;
  /** Moon orbital period in seconds (planets use Kepler third law). */
  readonly moonPeriodS?: number;
}

export interface HubDesc {
  readonly hubId: HubId;
  readonly bodyId: BodyId;
  readonly stationFrame: FrameId;
  readonly dockId: DockId;
  readonly hullId: HullId;
  readonly origin: { readonly x: number; readonly y: number };
}

export type ChartNodeKind = 'hub' | 'poi';

export interface ChartNodeDef {
  readonly id: BodyId;
  readonly kind: ChartNodeKind;
  readonly label: string;
  /** Compact tag for the visor lane row. */
  readonly short: string;
  /** Flavor hint for unknown POIs; hubs leave this undefined. */
  readonly rumor?: string;
}

export interface ChartLaneDef {
  readonly a: BodyId;
  readonly b: BodyId;
  /** Share of a standard hub-to-hub leg (direct lane = 1). */
  readonly fraction: number;
}

function body(
  id: string,
  kind: UniverseBodyKind,
  radiusFrac: number,
  phase0: number,
  extra?: { readonly moonOf?: string; readonly moonPeriodS?: number }
): UniverseBody {
  return {
    id: id as BodyId,
    kind,
    radiusFrac,
    phase0,
    ...(extra?.moonOf === undefined ? {} : { moonOf: extra.moonOf as BodyId }),
    ...(extra?.moonPeriodS === undefined ? {} : { moonPeriodS: extra.moonPeriodS }),
  };
}

function hub(
  hubId: string,
  stationFrame: string,
  dockId: string,
  hullId: string,
  origin: { readonly x: number; readonly y: number }
): HubDesc {
  return {
    hubId: hubId as HubId,
    bodyId: hubId as unknown as BodyId,
    stationFrame: stationFrame as FrameId,
    dockId: dockId as DockId,
    hullId: hullId as HullId,
    origin,
  };
}

function node(
  id: string,
  kind: ChartNodeKind,
  label: string,
  short: string,
  rumor?: string
): ChartNodeDef {
  return {
    id: id as BodyId,
    kind,
    label,
    short,
    ...(rumor === undefined ? {} : { rumor }),
  };
}

function lane(a: string, b: string, fraction: number): ChartLaneDef {
  return { a: a as BodyId, b: b as BodyId, fraction };
}

/** Canonical bodies: 4 hub planets + 4 POIs + 4 moons. Order is stable. */
export const UNIVERSE_BODIES: readonly UniverseBody[] = [
  body('hub_a', 'hub', 0.42, 0.6),
  body('hub_b', 'hub', 0.62, 2.8),
  body('hub_c', 'hub', 0.34, 1.9),
  body('hub_d', 'hub', 0.52, 4.6),
  body('poi_kestrel', 'poi', 0.26, 4.2),
  body('poi_vigil', 'poi', 0.78, 1.5),
  body('poi_lumen', 'poi', 0.7, 0.2),
  body('poi_nadir', 'poi', 0.86, 2.6),
  body('moon_wisp', 'moon', 0.06, 1.1, { moonOf: 'poi_kestrel', moonPeriodS: 42 }),
  body('moon_moth', 'moon', 0.06, 3.3, { moonOf: 'poi_vigil', moonPeriodS: 55 }),
  body('moon_rill', 'moon', 0.055, 5.0, { moonOf: 'poi_lumen', moonPeriodS: 48 }),
  body('moon_tarn', 'moon', 0.065, 2.4, { moonOf: 'poi_nadir', moonPeriodS: 63 }),
];

/**
 * Canonical hubs. hub_a is the home hub: its station frame keeps the legacy
 * 'station' frame id (not 'hub_a') so existing saves/snapshots keep working.
 * Every other hub maps 1:1 hub id <-> station frame.
 */
/**
 * Canonical hubs. Every hub shares one abstract berth at the origin:
 * transit is not flyable space (the hull holds off the dock while the
 * chart owns the trip), so departure and arrival use the same
 * coordinates and each leg swaps which station frame is loaded.
 * Straight hold-to-mate lines across spread-out stations used to cut
 * through plates; a shared berth leaves no path left to clip.
 */
export const UNIVERSE_HUBS: Readonly<Record<string, HubDesc>> = {
  hub_a: hub('hub_a', 'station', 'harbor', 'station-hub', { x: 0, y: 0 }),
  hub_b: hub('hub_b', 'hub_b', 'hub_b_harbor', 'solace', { x: 0, y: 0 }),
  hub_c: hub('hub_c', 'hub_c', 'hub_c_harbor', 'cinder', { x: 0, y: 0 }),
  hub_d: hub('hub_d', 'hub_d', 'hub_d_harbor', 'vesper', { x: 0, y: 0 }),
};

/** Canonical chart nodes: 4 hubs + 8 POIs/moons. */
export const UNIVERSE_CHART: readonly ChartNodeDef[] = [
  node('hub_a', 'hub', 'MERIDIAN GATE', 'MERIDIAN'),
  node('hub_b', 'hub', 'SOLACE YARDS', 'SOLACE'),
  node('hub_c', 'hub', 'CINDER DOCK', 'CINDER'),
  node('hub_d', 'hub', 'VESPER PORT', 'VESPER'),
  node('poi_kestrel', 'poi', 'DERELICT "TERN"', 'TERN', 'Distress echo near the Tern hulk.'),
  node(
    'poi_vigil',
    'poi',
    'BEACON "HALCYON"',
    'HALCYON',
    'Survey cache pings from Halcyon beacon.'
  ),
  node(
    'poi_lumen',
    'poi',
    'CRYSTAL "LUMEN"',
    'LUMEN',
    'Lightfall refraction over the Lumen spires.'
  ),
  node('poi_nadir', 'poi', 'SILENT "NADIR"', 'NADIR', 'No transponder answers from Nadir deep.'),
  node('moon_wisp', 'poi', 'WISP (TERN MOON)', 'WISP', 'Ice glint tracks Wisp around Tern.'),
  node('moon_moth', 'poi', 'MOTH (HALCYON MOON)', 'MOTH', 'Moth shadows the Halcyon beacon.'),
  node('moon_rill', 'poi', 'RILL (LUMEN MOON)', 'RILL', 'Rill runoff feeds the Lumen spires.'),
  node('moon_tarn', 'poi', 'TARN (NADIR MOON)', 'TARN', 'Tarn holds station over Nadir deep.'),
];

/** Canonical lanes between voyage nodes. */
export const UNIVERSE_LANES: readonly ChartLaneDef[] = [
  lane('hub_a', 'hub_b', 1),
  lane('hub_a', 'hub_c', 0.9),
  lane('hub_a', 'hub_d', 1.1),
  lane('hub_b', 'hub_c', 1.2),
  lane('hub_b', 'hub_d', 0.9),
  lane('hub_c', 'hub_d', 1),
  lane('hub_a', 'poi_kestrel', 0.4),
  lane('poi_kestrel', 'hub_b', 0.8),
  lane('hub_a', 'poi_vigil', 0.5),
  lane('poi_vigil', 'hub_b', 0.7),
  lane('poi_kestrel', 'poi_vigil', 0.3),
  lane('hub_c', 'poi_kestrel', 0.3),
  lane('hub_d', 'poi_kestrel', 0.6),
  lane('hub_c', 'poi_vigil', 0.8),
  lane('hub_d', 'poi_vigil', 0.6),
  lane('hub_c', 'poi_lumen', 0.9),
  lane('hub_d', 'poi_lumen', 0.5),
  lane('hub_b', 'poi_lumen', 0.4),
  lane('hub_d', 'poi_nadir', 0.8),
  lane('hub_b', 'poi_nadir', 1),
  lane('poi_kestrel', 'moon_wisp', 0.15),
  lane('poi_vigil', 'moon_moth', 0.15),
  lane('poi_lumen', 'moon_rill', 0.15),
  lane('poi_nadir', 'moon_tarn', 0.15),
  lane('hub_a', 'moon_wisp', 0.5),
  lane('hub_b', 'moon_moth', 0.8),
];

export interface Universe {
  readonly bodies: readonly UniverseBody[];
  readonly hubs: Readonly<Record<string, HubDesc>>;
  readonly chart: readonly ChartNodeDef[];
  readonly lanes: readonly ChartLaneDef[];
}

export const UNIVERSE: Universe = {
  bodies: UNIVERSE_BODIES,
  hubs: UNIVERSE_HUBS,
  chart: UNIVERSE_CHART,
  lanes: UNIVERSE_LANES,
};
