/**
 * Voyage chart (Drift Captain slices 1a-3). Fixed-node route graph: two
 * trade hubs plus drift POIs (derelict, beacon) with rumor hints for the
 * fogged chart. planVoyage projects ETA/fuel over hops, plotChartCourse
 * commits stop chains for the multi-hop leg machine, and
 * chartSnapshotNodes feeds the CHART_STATE broadcast. Pure +
 * deterministic; no DOM/Node imports.
 */

import type { ChartNodeState } from '@kybernetes/protocol';
import { planTripLeg, torchAccel } from '../../astro/guidance.js';
import { fuelCostForLeg } from './engine.js';
import {
  checksEngineFuel,
  clampThrust01,
  DOCKED_NAV,
  hopScaledS,
  legDurationSeconds,
  legWindowS,
  type NavState,
  type PlotChecks,
  type PlotReject,
  thrustTimeFactor,
} from './navTransit.js';
import { chartLaneFraction, POI_KESTREL, POI_VIGIL } from './ports.js';
import type { EngineTier } from './shipRecord.js';

export type ChartNodeKind = 'hub' | 'poi';

export interface ChartNode {
  readonly id: string;
  readonly kind: ChartNodeKind;
  readonly label: string;
  /** Compact tag for the visor lane row. */
  readonly short: string;
  /** Flavor hint shown for unknown POIs; hubs leave this undefined. */
  readonly rumor?: string;
}

export const CHART_NODES: readonly ChartNode[] = [
  { id: 'hub_a', kind: 'hub', label: 'MERIDIAN GATE', short: 'MERIDIAN' },
  { id: 'hub_b', kind: 'hub', label: 'SOLACE YARDS', short: 'SOLACE' },
  { id: 'hub_c', kind: 'hub', label: 'CINDER DOCK', short: 'CINDER' },
  { id: 'hub_d', kind: 'hub', label: 'VESPER PORT', short: 'VESPER' },
  {
    id: POI_KESTREL,
    kind: 'poi',
    label: 'DERELICT "TERN"',
    short: 'TERN',
    rumor: 'Distress echo near the Tern hulk.',
  },
  {
    id: POI_VIGIL,
    kind: 'poi',
    label: 'BEACON "HALCYON"',
    short: 'HALCYON',
    rumor: 'Survey cache pings from Halcyon beacon.',
  },
  {
    id: 'poi_lumen',
    kind: 'poi',
    label: 'CRYSTAL "LUMEN"',
    short: 'LUMEN',
    rumor: 'Lightfall refraction over the Lumen spires.',
  },
  {
    id: 'poi_nadir',
    kind: 'poi',
    label: 'SILENT "NADIR"',
    short: 'NADIR',
    rumor: 'No transponder answers from Nadir deep.',
  },
  {
    id: 'moon_wisp',
    kind: 'poi',
    label: 'WISP (TERN MOON)',
    short: 'WISP',
    rumor: 'Ice glint tracks Wisp around Tern.',
  },
  {
    id: 'moon_moth',
    kind: 'poi',
    label: 'MOTH (HALCYON MOON)',
    short: 'MOTH',
    rumor: 'Moth shadows the Halcyon beacon.',
  },
  {
    id: 'moon_rill',
    kind: 'poi',
    label: 'RILL (LUMEN MOON)',
    short: 'RILL',
    rumor: 'Rill runoff feeds the Lumen spires.',
  },
  {
    id: 'moon_tarn',
    kind: 'poi',
    label: 'TARN (NADIR MOON)',
    short: 'TARN',
    rumor: 'Tarn holds station over Nadir deep.',
  },
];

export function chartNodeFor(id: string): ChartNode | undefined {
  return CHART_NODES.find((node) => node.id === id);
}

export function isChartNodeId(value: unknown): value is string {
  return typeof value === 'string' && chartNodeFor(value) !== undefined;
}

/** Hub ids double as the default-known set for voyage projection. */
export function hubNodeIds(): readonly string[] {
  return CHART_NODES.filter((node) => node.kind === 'hub').map((node) => node.id);
}

/** Snapshot nodes with known flags (hubs always known, POIs when surveyed). */
export function chartSnapshotNodes(surveyed: readonly string[]): ChartNodeState[] {
  const seen = new Set(surveyed);
  return CHART_NODES.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    short: node.short,
    ...(node.rumor === undefined ? {} : { rumor: node.rumor }),
    known: node.kind === 'hub' || seen.has(node.id),
  }));
}

export interface VoyageRequest {
  readonly fromId: string;
  readonly stops: readonly string[];
  readonly tier: EngineTier;
  /** Node ids already surveyed; omit for hub-only math (hubs known). */
  readonly knownIds?: readonly string[];
  /** Throttle 0.1-1.0 of the 1g band; omit for full thrust. */
  readonly thrust01?: number;
  /** Absolute sim seconds for target prediction; omit for epoch 0. */
  readonly atSeconds?: number;
}

export interface ChartHop {
  readonly fromId: string;
  readonly toId: string;
  readonly legS: number;
  readonly fuel: number;
  readonly known: boolean;
}

export interface VoyagePlan {
  readonly hops: readonly ChartHop[];
  readonly totalS: number;
  readonly fuelNeeded: number;
  readonly unknowns: readonly string[];
  readonly destId: string;
}

export type VoyageReject = 'unknown-node' | 'empty-voyage' | 'same-origin';

export function planVoyage(req: VoyageRequest): { plan: VoyagePlan } | { reject: VoyageReject } {
  if (req.stops.length === 0) return { reject: 'empty-voyage' };
  const known = new Set(req.knownIds ?? hubNodeIds());
  const hops: ChartHop[] = [];
  let from = req.fromId;
  for (const to of req.stops) {
    const hop = planHop(from, to, req, known);
    if (!('hop' in hop)) return hop;
    hops.push(hop.hop);
    from = to;
  }
  return { plan: summarizeVoyage(hops, req) };
}

function planHop(
  fromId: string,
  toId: string,
  req: VoyageRequest,
  known: ReadonlySet<string>
): { hop: ChartHop } | { reject: VoyageReject } {
  if (fromId === toId) return { reject: 'same-origin' };
  if (chartNodeFor(fromId) === undefined || chartNodeFor(toId) === undefined) {
    return { reject: 'unknown-node' };
  }
  // Uncharted pairs default to a full leg so free plotting stays projectable.
  const fraction = chartLaneFraction(fromId, toId) ?? 1;
  const thrust = clampThrust01(req.thrust01 ?? 1);
  const planned = planTripLeg(fromId, toId, torchAccel(req.tier, thrust), req.atSeconds ?? 0);
  const legS =
    planned?.totalS ??
    Math.max(1, Math.round(hopLegS(fraction, req.tier) * thrustTimeFactor(thrust)));
  return {
    hop: {
      fromId,
      toId,
      legS,
      fuel: fuelCostForLeg(req.tier, thrust, legS),
      known: known.has(toId),
    },
  };
}

function summarizeVoyage(hops: readonly ChartHop[], req: VoyageRequest): VoyagePlan {
  let totalS = 0;
  let fuelNeeded = 0;
  const unknowns: string[] = [];
  for (const hop of hops) {
    totalS += hop.legS;
    fuelNeeded += hop.fuel;
    if (!hop.known && !unknowns.includes(hop.toId)) unknowns.push(hop.toId);
  }
  const last = hops[hops.length - 1];
  return {
    hops,
    totalS,
    fuelNeeded,
    unknowns,
    destId: last === undefined ? req.fromId : last.toId,
  };
}

function hopLegS(fraction: number, tier: EngineTier): number {
  return Math.max(1, Math.round(fraction * legDurationSeconds(tier)));
}

/**
 * Commit a multi-stop voyage. Every stop must be charted and repeats are
 * rejected; the final stop may be a POI holding point or a hub dock mouth.
 * Single-hop behavior matches plotCourse except POI-adjacent rejects use
 * chart names (see systems.plotVoyage).
 */
export function plotChartCourse(
  nav: NavState,
  stops: readonly string[],
  checks: PlotChecks,
  thrust01 = 1,
  engineTier = 0 as import('./shipRecord.js').EngineTier,
  nowS?: number
): { nav: NavState } | { reject: PlotReject } {
  if (nav.phase !== 'docked') return { reject: 'already-underway' };
  if (stops.length === 0) return { reject: 'empty-voyage' };
  for (const stop of stops) {
    if (!isChartNodeId(stop)) return { reject: 'unknown-node' };
  }
  if (chainRepeats(nav.portHubId, stops)) return { reject: 'same-stop' };
  const last = stops[stops.length - 1];
  if (last === undefined) return { reject: 'empty-voyage' };
  const first = stops[0] ?? last;
  const thrust = clampThrust01(thrust01);
  if (!checks.hot || !checks.powered) return { reject: 'no-power' };
  const fuel = checksEngineFuel(checks);
  const need = fuelCostForLeg(
    engineTier,
    thrust,
    hopScaledS(nav.portHubId, first, engineTier, thrust)
  );
  if (!Number.isFinite(fuel) || fuel < need) return { reject: 'no-fuel' };
  const legS = legWindowS(nav.portHubId, first, engineTier, thrust, nowS);
  return {
    nav: {
      ...DOCKED_NAV,
      phase: 'in_transit',
      destHubId: last,
      stops: [...stops],
      legIndex: 0,
      remainingS: legS,
      legId: nav.legId + 1,
      portHubId: nav.portHubId,
      thrust01: thrust,
      legTotalS: legS,
    },
  };
}

function chainRepeats(portHubId: string, stops: readonly string[]): boolean {
  let prev = portHubId;
  for (const stop of stops) {
    if (stop === prev) return true;
    prev = stop;
  }
  return false;
}
