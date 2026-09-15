import type {
  ChartStateBroadcast,
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import {
  CHART_NODES,
  chartNodeFor,
  type EngineTier,
  hubSellPrice,
  legDurationSeconds,
  planVoyage,
  speedFactor,
  TRADE_GOODS,
} from '@kybernetes/sim-core';

export type NavPanelPhase = 'docked' | 'spooling' | 'in_transit' | 'docking' | 'unknown';

/** Wallet shows whole cells, fractional burns show one decimal. */
export function formatFuelCells(cells: number): string {
  if (!Number.isFinite(cells)) return '0';
  if (Number.isInteger(cells)) return String(cells);
  return (Math.round(cells * 10) / 10).toFixed(1);
}

export interface NavViewModel {
  readonly phase: NavPanelPhase;
  readonly portLabel: string;
  readonly destLabel: string;
  readonly otherHubId: string;
  readonly otherHubLabel: string;
  readonly countdownS: number;
  readonly fuelCells: number;
  readonly fuelNeeded: number;
  /** Soft planning aid; null when sufficient or not plottable. Never blocks plot. */
  readonly fuelWarning: string | null;
  /** Soft planning aid for cold tunes; null when nominal or not plottable. */
  readonly heatWarning: string | null;
  /** Live hop target (stops[legIndex], else final dest). */
  readonly hopToId: string | undefined;
  readonly hopLabel: string;
  /** "n/total" while a multi-stop chain flies; null otherwise. */
  readonly hopProgress: string | null;
  /** Docked discovery hint (?? rumor) or survey count; null underway. */
  readonly chartRow: string | null;
  /** Docked best haul from here (sell spread); null underway. */
  readonly haulRow: string | null;
  /** Chain lane with ?? for unknown stops; null unless a chain flies. */
  readonly laneRow: string | null;
  readonly canHail: boolean;
  /** Rescue-drone countdown, ceiled; 0 when none outstanding. */
  readonly rescueS: number;
  readonly canPlot: boolean;
  readonly canCancel: boolean;
  readonly canDistress: boolean;
  readonly etaS: number;
  readonly flameout: boolean;
}

const HUB_LABELS: Readonly<Record<string, string>> = {
  hub_a: 'NEW ANCHORAGE',
  hub_b: 'KEPLER YARD',
};

export function hubLabel(hubId: string | undefined): string {
  if (hubId === undefined) return '—';
  return HUB_LABELS[hubId] ?? hubId.toUpperCase();
}

export function otherHub(portHubId: string): string {
  return portHubId === 'hub_b' ? 'hub_a' : 'hub_b';
}

/** Button id prefix for POI detours (mirrors the cargo `seal:`/`sell:` style). */
export const DETOUR_BUTTON_PREFIX = 'via:';
/** Button id prefix for direct hub plots from the chart map. */
export const PLOT_BUTTON_PREFIX = 'plot:';
export function plotButtonId(hubId: string): string {
  return `${PLOT_BUTTON_PREFIX}${hubId}`;
}

/** POI ids in chart order; each becomes a docked detour button. */
export function navDetourOptions(): readonly string[] {
  return CHART_NODES.filter((node) => node.kind === 'poi').map((node) => node.id);
}

export function detourButtonId(poiId: string): string {
  return `${DETOUR_BUTTON_PREFIX}${poiId}`;
}

export function detourLabel(poiId: string): string {
  const short = poiId.startsWith('poi_') ? poiId.slice('poi_'.length) : poiId;
  return `VIA ${short.toUpperCase()}`;
}

interface HopView {
  readonly hopToId: string | undefined;
  readonly hopLabel: string;
  readonly hopProgress: string | null;
}

interface ManifestView {
  readonly chartRow: string | null;
  readonly haulRow: string | null;
  readonly laneRow: string | null;
}

interface StrandedView {
  readonly canHail: boolean;
  readonly rescueS: number;
}

export function navViewModel(
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null,
  chart?: ChartStateBroadcast | null
): NavViewModel {
  const portHubId = nav?.portHubId ?? 'hub_a';
  const other = otherHub(portHubId);
  const fuelCells = status?.stores.fuelCells ?? 0;
  const voyage = projectSingleHop(portHubId, other, status, systems);
  return {
    phase: navPhase(nav),
    portLabel: hubLabel(portHubId),
    destLabel: nodeLabel(nav?.destHubId),
    ...hopViewModel(nav),
    otherHubId: other,
    otherHubLabel: hubLabel(other),
    countdownS: countdownFor(nav),
    fuelCells,
    fuelNeeded: voyage.fuelNeeded,
    fuelWarning: lowFuelWarning(nav, fuelCells, voyage.fuelNeeded),
    heatWarning: heatWarningFor(nav, voyage.heatRisk),
    ...manifestViewModel(nav, portHubId, other, chart ?? null),
    ...strandedViewModel(nav),
    canPlot: nav?.phase === 'docked',
    canCancel: nav?.phase === 'spooling',
    canDistress: nav?.phase === 'in_transit',
    etaS: estimateEta(status, systems),
    flameout: nav?.flameout ?? false,
  };
}

function hopViewModel(nav: NavStateBroadcast | null): HopView {
  const stops = nav?.stops ?? [];
  const legIndex = nav?.legIndex ?? 0;
  const hopToId = stops[legIndex] ?? nav?.destHubId;
  return {
    hopToId,
    hopLabel: nodeLabel(hopToId),
    hopProgress: hopProgressFor(stops, legIndex),
  };
}

function hopProgressFor(stops: readonly string[], legIndex: number): string | null {
  if (stops.length < 2) return null;
  return `${Math.min(legIndex + 1, stops.length)}/${stops.length}`;
}

function manifestViewModel(
  nav: NavStateBroadcast | null,
  portHubId: string,
  otherHubId: string,
  chart: ChartStateBroadcast | null
): ManifestView {
  return {
    chartRow: chartRowFor(nav, chart),
    haulRow: haulRowFor(nav, portHubId, otherHubId),
    laneRow: laneRowFor(nav, chart),
  };
}

function strandedViewModel(nav: NavStateBroadcast | null): StrandedView {
  return {
    canHail: nav?.phase === 'in_transit' && (nav?.flameout ?? false),
    rescueS: rescueSFor(nav),
  };
}

function rescueSFor(nav: NavStateBroadcast | null): number {
  if (nav === null) return 0;
  return Math.max(0, Math.ceil(nav.hailS));
}

function countdownFor(nav: NavStateBroadcast | null): number {
  if (nav === null) return 0;
  return Math.max(0, Math.ceil(nav.remainingS));
}

function navPhase(nav: NavStateBroadcast | null): NavPanelPhase {
  if (nav === null) return 'unknown';
  if (nav.phase === 'docked' || nav.phase === 'spooling') return nav.phase;
  if (nav.phase === 'in_transit' || nav.phase === 'docking') return nav.phase;
  return 'unknown';
}

function tierFor(status: ShipStatusBroadcast | null): EngineTier {
  if (status?.engineTier === 1) return 1;
  if (status?.engineTier === 2) return 2;
  return 0;
}

function projectSingleHop(
  fromId: string,
  toId: string,
  status: ShipStatusBroadcast | null,
  systems: ShipSystemsBroadcast | null
): { fuelNeeded: number; heatRisk: boolean } {
  const result = planVoyage({
    fromId,
    stops: [toId],
    tier: tierFor(status),
    tune: systems?.tune ?? 1,
    wear: systems?.wear ?? 0,
  });
  if (!('plan' in result)) return { fuelNeeded: 1, heatRisk: false };
  return { fuelNeeded: result.plan.fuelNeeded, heatRisk: result.plan.heatRisk };
}

function chartRowFor(
  nav: NavStateBroadcast | null,
  chart: ChartStateBroadcast | null
): string | null {
  if (nav?.phase !== 'docked' || chart === null) return null;
  const unknowns = chart.nodes.filter((node) => !node.known);
  const first = unknowns[0];
  if (first !== undefined) return `?? ${first.rumor ?? first.label}`;
  return `CHART ${chart.nodes.length}/${chart.nodes.length} KNOWN`;
}

function haulRowFor(
  nav: NavStateBroadcast | null,
  portHubId: string,
  otherHubId: string
): string | null {
  if (nav?.phase !== 'docked') return null;
  let best: { good: string; from: number; to: number } | undefined;
  for (const good of TRADE_GOODS) {
    const from = hubSellPrice(portHubId, good) ?? 0;
    const to = hubSellPrice(otherHubId, good) ?? 0;
    if (best === undefined || to - from > best.to - best.from) best = { good, from, to };
  }
  if (best === undefined) return null;
  return `HAUL ${best.good.toUpperCase()} ${best.from}>${best.to}`;
}

function laneRowFor(
  nav: NavStateBroadcast | null,
  chart: ChartStateBroadcast | null
): string | null {
  if (nav === null || (nav.phase !== 'spooling' && nav.phase !== 'in_transit')) return null;
  if (nav.stops.length < 2 || chart === null) return null;
  const ids = [nav.portHubId, ...nav.stops];
  return `LANE ${ids.map((id) => laneSegment(id, chart)).join('>')}`;
}

function laneSegment(id: string, chart: ChartStateBroadcast): string {
  const node = chart.nodes.find((entry) => entry.id === id);
  if (node === undefined) return '??';
  return node.known ? node.short : '??';
}

function nodeLabel(id: string | undefined): string {
  if (id === undefined) return '—';
  return chartNodeFor(id)?.label ?? hubLabel(id);
}

function heatWarningFor(nav: NavStateBroadcast | null, heatRisk: boolean): string | null {
  if (nav?.phase !== 'docked' || !heatRisk) return null;
  return 'HEAT RISK: TUNE LOW';
}

function lowFuelWarning(
  nav: NavStateBroadcast | null,
  fuelCells: number,
  fuelNeeded: number
): string | null {
  if (nav?.phase !== 'docked') return null;
  if (fuelCells >= fuelNeeded) return null;
  return `LOW FUEL: NEED ${formatFuelCells(fuelNeeded)} HOLD ${formatFuelCells(fuelCells)}`;
}

function estimateEta(
  status: ShipStatusBroadcast | null,
  systems: ShipSystemsBroadcast | null
): number {
  if (status === null || systems === null) return 0;
  const tier = status.engineTier === 1 ? 1 : status.engineTier === 2 ? 2 : 0;
  const factor = speedFactor({ tune: systems.tune, wear: systems.wear });
  if (!(factor > 0)) return 0;
  return Math.round(legDurationSeconds(tier) / factor);
}
