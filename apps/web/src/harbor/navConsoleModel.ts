import type {
  ChartStateBroadcast,
  NavStateBroadcast,
  ShipStatusBroadcast,
  ShipSystemsBroadcast,
} from '@kybernetes/protocol';
import {
  chartNodeFor,
  type EngineTier,
  FUEL_PER_CELL,
  legDurationSeconds,
  planVoyage,
} from '@kybernetes/sim-core';

export type NavPanelPhase = 'docked' | 'in_transit' | 'docking' | 'unknown';

/** Bunker fuel-value display: integer units (1 cell = 1000 fuel). */
export function formatFuel(fuel: number): string {
  if (!Number.isFinite(fuel)) return '0';
  return String(Math.max(0, Math.floor(fuel)));
}

export interface NavViewModel {
  readonly phase: NavPanelPhase;
  readonly portLabel: string;
  readonly destLabel: string;
  readonly otherHubId: string;
  readonly otherHubLabel: string;
  readonly countdownS: number;
  /** Loose cells in hold (kept for compat; use fuel for flight readiness). */
  readonly fuelCells: number;
  /** Flyable fuel-value in the engine bunker. */
  readonly fuel: number;
  readonly fuelMax: number;
  readonly fuelNeeded: number;
  /** Soft planning aid; null when sufficient or not plottable. Never blocks plot. */
  readonly fuelWarning: string | null;
  /** Live hop target (stops[legIndex], else final dest). */
  readonly hopToId: string | undefined;
  readonly hopLabel: string;
  /** "n/total" while a multi-stop chain flies; null otherwise. */
  readonly hopProgress: string | null;
  /** Docked discovery hint (?? rumor) or survey count; null underway. */
  readonly chartRow: string | null;
  /** Chain lane with ?? for unknown stops; null unless a chain flies. */
  readonly laneRow: string | null;
  /** Reactor producing at least demand and not scrammed. */
  readonly reactorOnline: boolean;
  /** Flyable fuel-value in the engine bunker (mirrors fuel). */
  readonly bunkerFuel: number;
  /** Fuel-value needed for the single-hop plan (mirrors fuelNeeded). */
  readonly bunkerFuelNeeded: number;
  /** Loose cells in stores available to load (mirrors fuelCells). */
  readonly storesFuelCells: number;
  /** Docked with a loose cell and room for a full cell in the bunker. */
  readonly canLoadFuelFromBridge: boolean;
  readonly canHail: boolean;
  /** Rescue-drone countdown, ceiled; 0 when none outstanding. */
  readonly rescueS: number;
  readonly canPlot: boolean;
  readonly canDistress: boolean;
  readonly etaS: number;
  readonly flameout: boolean;
}

const HUB_LABELS: Readonly<Record<string, string>> = {
  hub_a: 'MERIDIAN GATE',
  hub_b: 'SOLACE YARDS',
  hub_c: 'CINDER DOCK',
  hub_d: 'VESPER PORT',
};

export function hubLabel(hubId: string | undefined): string {
  if (hubId === undefined) return '—';
  return HUB_LABELS[hubId] ?? hubId.toUpperCase();
}

export function otherHub(portHubId: string): string {
  return portHubId === 'hub_b' ? 'hub_a' : 'hub_b';
}

export {
  DETOUR_BUTTON_PREFIX,
  detourButtonId,
  detourLabel,
  navDetourOptions,
} from './navDetourModel';
/** Button id prefix for direct hub plots from the chart map. */
export const PLOT_BUTTON_PREFIX = 'plot:';
export function plotButtonId(hubId: string): string {
  return `${PLOT_BUTTON_PREFIX}${hubId}`;
}

interface HopView {
  readonly hopToId: string | undefined;
  readonly hopLabel: string;
  readonly hopProgress: string | null;
}

interface ManifestView {
  readonly chartRow: string | null;
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
  const fuel = systems?.fuel ?? status?.engineFuel ?? 0;
  const fuelMax = systems?.fuelMax ?? 0;
  const voyage = projectSingleHop(portHubId, other, status);
  return {
    phase: navPhase(nav),
    ...preflightViewModel(nav, systems, status, voyage.fuelNeeded),
    portLabel: hubLabel(portHubId),
    destLabel: nodeLabel(nav?.destHubId),
    ...hopViewModel(nav),
    otherHubId: other,
    otherHubLabel: hubLabel(other),
    countdownS: countdownFor(nav),
    fuelCells,
    fuel,
    fuelMax,
    fuelNeeded: voyage.fuelNeeded,
    fuelWarning: lowFuelWarning(nav, fuel, voyage.fuelNeeded),
    ...manifestViewModel(nav, chart ?? null),
    ...strandedViewModel(nav),
    canPlot: nav?.phase === 'docked',
    canDistress: nav?.phase === 'in_transit',
    etaS: estimateEta(status, systems),
    flameout: nav?.flameout ?? false,
  };
}

interface PreflightView {
  readonly reactorOnline: boolean;
  readonly bunkerFuel: number;
  readonly bunkerFuelNeeded: number;
  readonly storesFuelCells: number;
  readonly canLoadFuelFromBridge: boolean;
}

function preflightViewModel(
  nav: NavStateBroadcast | null,
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null,
  fuelNeeded: number
): PreflightView {
  const bunker = bunkerOf(systems, status);
  const storesFuelCells = status === null ? 0 : status.stores.fuelCells;
  const reactorOnline = isReactorOnline(systems);
  return {
    reactorOnline,
    bunkerFuel: bunker.fuel,
    bunkerFuelNeeded: fuelNeeded,
    storesFuelCells,
    canLoadFuelFromBridge: canLoadFromBridge(nav, storesFuelCells, bunker.fuel, bunker.max),
  };
}

function bunkerOf(
  systems: ShipSystemsBroadcast | null,
  status: ShipStatusBroadcast | null
): { fuel: number; max: number } {
  if (systems !== null) return { fuel: systems.fuel, max: systems.fuelMax };
  if (status !== null) return { fuel: status.engineFuel, max: 0 };
  return { fuel: 0, max: 0 };
}

function isReactorOnline(systems: ShipSystemsBroadcast | null): boolean {
  if (systems === null) return false;
  return !systems.scrammed && systems.tempK >= systems.bandLo;
}

function canLoadFromBridge(
  nav: NavStateBroadcast | null,
  storesCells: number,
  bunkerFuel: number,
  fuelMax: number
): boolean {
  if (nav?.phase !== 'docked') return false;
  if (!(storesCells >= 1)) return false;
  return bunkerFuel + FUEL_PER_CELL <= fuelMax;
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
  chart: ChartStateBroadcast | null
): ManifestView {
  return {
    chartRow: chartRowFor(nav, chart),
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
  if (nav.phase === 'docked' || nav.phase === 'in_transit' || nav.phase === 'docking') {
    return nav.phase;
  }
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
  status: ShipStatusBroadcast | null
): { fuelNeeded: number } {
  const result = planVoyage({ fromId, stops: [toId], tier: tierFor(status) });
  if (!('plan' in result)) return { fuelNeeded: 1000 };
  return { fuelNeeded: result.plan.fuelNeeded };
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

function laneRowFor(
  nav: NavStateBroadcast | null,
  chart: ChartStateBroadcast | null
): string | null {
  if (nav === null || nav.phase !== 'in_transit') return null;
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

function lowFuelWarning(
  nav: NavStateBroadcast | null,
  fuel: number,
  fuelNeeded: number
): string | null {
  if (nav?.phase !== 'docked') return null;
  if (fuel >= fuelNeeded) return null;
  return `LOW FUEL ${formatFuel(fuelNeeded)}/${formatFuel(fuel)} LOAD CELLS`;
}

function estimateEta(
  status: ShipStatusBroadcast | null,
  systems: ShipSystemsBroadcast | null
): number {
  if (status === null || systems === null) return 0;
  const tier = status.engineTier === 1 ? 1 : status.engineTier === 2 ? 2 : 0;
  return legDurationSeconds(tier);
}
