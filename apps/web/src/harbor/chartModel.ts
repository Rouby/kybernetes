/**
 * Star-chart map model: pure screen layout for the nav-console chart screen.
 * Node ids come from sim-core chart data; map positions and orbits live here
 * (presentation). ChartScene (GL) and the nav overlay layout both consume
 * ChartMapView, so markers, hit rects, and labels always agree.
 * Deterministic per timeSec; no DOM/WebGL imports.
 */

import type {
  ChartStateBroadcast,
  NavStateBroadcast,
  ShipStatusBroadcast,
} from '@kybernetes/protocol';
import {
  bodyPosAt as astroPosAt,
  bodyVelAt as astroVelAt,
  bodyPeriodS,
  CHART_NODES,
  DOCKING_S,
  FIXED_DT,
  type FlightSolution,
  HAIL_WAIT_S,
  hopFrom,
  hopScaledS,
  hopTo,
  planTripLeg,
  planVoyage,
  solveFlight,
  systemBodyOrDefault,
  torchAccel,
} from '@kybernetes/sim-core';
import { type UiRect, uiTextWidth, uiVisorMargins } from '../webgl/ui/UiToolkit';
import { detourButtonId, plotButtonId } from './navConsoleModel';
import {
  type BodyOrbit,
  bodyPosAt,
  bodyVelAt,
  legPointAt,
  legVelAt,
  type SolvedLeg,
  solveLeg,
} from './trajectoryModel';

export type ChartNodeStatus = 'port' | 'dest' | 'hop' | 'unknown' | 'idle';

interface ChartMapOrbit {
  /** Fraction of the half-min map dimension. */
  readonly radius: number;
  readonly periodS: number;
  readonly phase: number;
  readonly markerR: number;
}

const CHART_MARKERS: Readonly<Record<string, number>> = {
  hub_a: 11,
  hub_b: 11,
  poi_kestrel: 8,
  poi_vigil: 8,
};

export type Rgb = readonly [number, number, number];

export interface ChartMapNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly known: boolean;
  readonly label: string;
  readonly short: string;
  readonly status: ChartNodeStatus;
  readonly chip: UiRect;
  readonly buttonId: string | null;
  readonly primary: boolean;
  readonly fill: Rgb;
  readonly ring: Rgb;
}

export interface ChartMapPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChartBurn {
  readonly x: number;
  readonly y: number;
  /** Travel direction at the burn, screen coords. */
  readonly angle: number;
  readonly kind: 'pro' | 'retro';
  readonly size: number;
}

export interface ChartTransfer {
  readonly label: string;
}

export interface FlightFoodCost {
  readonly rations: number;
  readonly water: number;
  readonly o2: number;
}

export interface ProjectedStores {
  readonly rations: number;
  readonly waterL: number;
  readonly o2Cells: number;
  readonly fuelCells: number;
}

export interface ChartPreview {
  readonly stops: readonly string[];
  readonly routeLabel: string;
  readonly totalS: number;
  readonly fuelNeeded: number;
  /** Bunker fuel-value available (renamed from cells; now fuel units). */
  readonly fuelCells: number;
  readonly heatRisk: boolean;
  readonly thrustPct: number;
  /** One ration/water/o2 per leg (settleLegFood). */
  readonly foodCost: FlightFoodCost;
  /** Ship stores after the trip (floored at zero; secured cargo excluded). */
  readonly projectedStores: ProjectedStores;
  /** Set when any provision reaches zero on arrival. */
  readonly lowStoresWarning: string | null;
}

/** Map a node button id to drafted stops (last = destination). Null when inert. */
export function previewStopsFor(buttonId: string, portHubId: string): readonly string[] | null {
  if (buttonId.startsWith('plot:')) {
    const hubId = buttonId.slice('plot:'.length);
    if (hubId.length === 0 || hubId === portHubId) return null;
    return [hubId];
  }
  if (buttonId.startsWith('via:')) {
    const poiId = buttonId.slice('via:'.length);
    if (poiId.length === 0 || poiId === portHubId) return null;
    return [poiId];
  }
  return null;
}

/** Append a clicked stop to the draft, ignoring repeats of the tail. */
export function appendDraft(
  current: readonly string[] | null,
  next: readonly string[]
): readonly string[] {
  const base = current ?? [];
  if (next.length === 0) return base;
  const tail = base[base.length - 1];
  const head = next[0];
  if (head === undefined) return base;
  if (tail !== undefined && tail === head) return base;
  return [...base, ...next];
}

/** Project a drafted course: times, fuel, and heat from the sim planner. */
export function previewCourse(
  selection: readonly string[] | null,
  nav: NavStateBroadcast | null,
  status: ShipStatusBroadcast | null,
  systems: { tune: number; wear: number } | null,
  chart: ChartStateBroadcast | null,
  thrust01 = 1,
  atSeconds = 0
): ChartPreview | null {
  if (selection === null || selection.length === 0 || nav?.phase !== 'docked') return null;
  const portHubId = nav.portHubId;
  const tier = status?.engineTier === 1 ? 1 : status?.engineTier === 2 ? 2 : 0;
  const planned = planVoyage({
    fromId: portHubId,
    stops: [...selection],
    tier,
    tune: systems?.tune ?? 1,
    wear: systems?.wear ?? 0,
    knownIds: [...knownIds(chart)],
    thrust01,
    atSeconds,
  });
  if (!('plan' in planned)) return null;
  const known = knownIds(chart);
  const labels = [...selection].map((id) => (known.has(id) ? nodeShort(id) : '??'));
  const foodCost = foodCostForLegs(selection.length);
  const projectedStores = projectedStoresFor(status, selection.length);
  return {
    stops: [...selection],
    routeLabel: labels.join('>'),
    totalS: planned.plan.totalS,
    fuelNeeded: planned.plan.fuelNeeded,
    fuelCells: status?.engineFuel ?? 0,
    heatRisk: planned.plan.heatRisk,
    thrustPct: Math.round(thrust01 * 100),
    foodCost,
    projectedStores,
    lowStoresWarning: lowStoresWarningFor(projectedStores),
  };
}

function foodCostForLegs(legs: number): FlightFoodCost {
  return { rations: legs, water: legs, o2: legs };
}

function projectedStoresFor(status: ShipStatusBroadcast | null, legs: number): ProjectedStores {
  const stores = status?.stores;
  if (stores === undefined) return { rations: 0, waterL: 0, o2Cells: 0, fuelCells: 0 };
  return {
    rations: Math.max(0, stores.rations - legs),
    waterL: Math.max(0, stores.waterL - legs),
    o2Cells: Math.max(0, stores.o2Cells - legs),
    fuelCells: stores.fuelCells,
  };
}

function lowStoresWarningFor(projected: ProjectedStores): string | null {
  const empty: string[] = [];
  if (projected.rations <= 0) empty.push('RATIONS');
  if (projected.waterL <= 0) empty.push('WATER');
  if (projected.o2Cells <= 0) empty.push('O2');
  if (empty.length === 0) return null;
  return `LOW STORES: ${empty.join('/')} EMPTY`;
}

function nodeShort(id: string): string {
  return CHART_NODES.find((node) => node.id === id)?.short ?? id.toUpperCase();
}

export interface ChartMapView {
  readonly rect: UiRect;
  readonly legend: UiRect;
  readonly center: ChartMapPoint;
  readonly starR: number;
  /** Orbit radii in px, one per charted orbit. */
  readonly rings: readonly number[];
  readonly nodes: readonly ChartMapNode[];
  /** Sampled transfer arcs in stop order; empty while docked. */
  readonly route: readonly ChartMapPoint[];
  /** Drafted-course ghost arcs; empty without a preview. */
  readonly previewRoute: readonly ChartMapPoint[];
  /** Coast time-ticks along each leg. */
  readonly ticks: readonly ChartMapPoint[];
  /** Departure burn plus arrival retroburn for the chain. */
  readonly burns: readonly ChartBurn[];
  /** Torch plan for the live leg; null unless underway. */
  readonly transfer: ChartTransfer | null;
  /** Flip diamonds, one per leg. */
  readonly flips: readonly ChartMapPoint[];
  /** Route indices where braking phases start. */
  readonly flipIndices: readonly number[];
  /** Gravity wells that bend committed legs. */
  readonly wells: readonly GravityWell[];
  /** Fresh intercept while adrift; empty otherwise. */
  readonly intercept: readonly ChartMapPoint[];
  /** True while flamed-out adrift. */
  readonly adrift: boolean;
  readonly ship: ChartMapPoint;
  /** Departure snapshot for the live leg; null unless flying. */
  readonly liveLeg: FlightSnapshot | null;
  /** Smoothing state for broadcast clocks; null without clock input. */
  readonly clock: SmoothClock | null;
}

const LEGEND_W = 300;
const LEGEND_GAP = 16;
const CHIP_H = 30;
const CHIP_FONT = 14;

/** Map area plus right-side legend card, derived from visor margins. */
export function chartLayoutRects(w: number, h: number): { map: UiRect; legend: UiRect } {
  const m = uiVisorMargins(w, h);
  const top = m.topClearance;
  const height = Math.max(80, h - top - m.marginY);
  const legendW = Math.min(LEGEND_W, Math.max(200, Math.floor(w * 0.32)));
  const legend: UiRect = {
    x: Math.round(w - m.marginX - legendW),
    y: Math.round(top),
    w: Math.round(legendW),
    h: Math.round(height),
  };
  const map: UiRect = {
    x: Math.round(m.marginX),
    y: Math.round(top),
    w: Math.round(Math.max(80, legend.x - LEGEND_GAP - m.marginX)),
    h: Math.round(height),
  };
  return { map, legend };
}

export interface ClockInput {
  readonly prev: SmoothClock | null;
  readonly wallSec: number;
  readonly paused: boolean;
}

function resolveFrameClock(
  nav: NavStateBroadcast | null,
  timeSec: number,
  clockIn?: ClockInput | null
): { tSec: number; navEff: NavStateBroadcast | null; clock: SmoothClock | null } {
  if (clockIn === undefined || clockIn === null) return { tSec: timeSec, navEff: nav, clock: null };
  const smooth = advanceClock(nav, clockIn);
  if (nav === null) return { tSec: smooth.simSeconds, navEff: nav, clock: smooth.clock };
  return {
    tSec: smooth.simSeconds,
    navEff: { ...nav, remainingS: smooth.remainingSmooth },
    clock: smooth.clock,
  };
}

function advanceClock(
  nav: NavStateBroadcast | null,
  clockIn: ClockInput
): { simSeconds: number; remainingSmooth: number; clock: SmoothClock | null } {
  return smoothSimClock(
    clockIn.prev,
    nav?.tick,
    nav?.remainingS ?? 0,
    clockIn.wallSec,
    clockIn.paused,
    nav?.phase === 'in_transit' && (nav?.flameout ?? false)
  );
}

export function chartMapView(
  nav: NavStateBroadcast | null,
  chart: ChartStateBroadcast | null,
  status: ShipStatusBroadcast | null,
  w: number,
  h: number,
  timeSec: number,
  previewStops?: readonly string[] | null,
  draftThrust01 = 1,
  snapPrev?: FlightSnapshot | null,
  clockIn?: ClockInput | null
): ChartMapView {
  const frame = resolveFrameClock(nav, timeSec, clockIn);
  const tSec = frame.tSec;
  const navEff = frame.navEff;
  const { map, legend } = chartLayoutRects(w, h);
  const center = { x: map.x + map.w / 2, y: map.y + map.h / 2 };
  const halfMin = Math.max(40, Math.min(map.w, map.h) / 2);
  const known = knownIds(chart);
  const portHubId = nav?.portHubId ?? 'hub_a';
  const nodes = CHART_NODES.map((node) =>
    mapNode(node.id, node.short, known.has(node.id), navEff, portHubId, center, halfMin, tSec)
  );
  const positions = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const wells = gravityWells(center, halfMin, positions);
  const hopping = nav?.phase === 'spooling' || nav?.phase === 'in_transit';
  const stops = hopping ? (nav?.stops ?? []) : [];
  const hop = liveHop(nav, portHubId, positions);
  const starR = Math.max(10, Math.round(halfMin * 0.055));
  // Flip search steers around the physical star; the wider exclusion disc
  // is a soft margin that sane brachistochrones may skim, never the core.
  const star = { x: center.x, y: center.y, r: starR };
  const snap = resolveSnapshot(
    snapPrev ?? null,
    navEff,
    hop,
    status,
    center,
    halfMin,
    tSec,
    positions,
    star
  );
  const port = positions.get(portHubId) ?? { x: 0, y: 0 };
  const ship = shipFromSnapshot(navEff, hop, port, snap, driftFraction(navEff), center, halfMin);
  const display = solveDisplay(
    navEff,
    stops,
    portHubId,
    status,
    ship,
    center,
    halfMin,
    tSec,
    star,
    snap
  );
  const preview = previewStops ?? [];
  const ghost = solvePreview(
    preview,
    portHubId,
    status,
    center,
    halfMin,
    tSec,
    draftThrust01,
    star
  );
  const sampled = sampleTrajectories(display);
  const adrift = nav?.phase === 'in_transit' && (nav?.flameout ?? false);
  return {
    rect: map,
    legend,
    center,
    starR,
    rings: CHART_NODES.map((node) => orbitOf(node.id).radius * halfMin),
    nodes,
    route: sampled.route,
    previewRoute: sampleTrajectories(ghost).route,
    ticks: routeTicks(display),
    burns: routeBurns(display),
    transfer: transferInfo(navEff, status),
    flips: sampled.flips,
    flipIndices: sampled.flipIndices,
    wells,
    intercept: interceptPoints(navEff, ship.point, ship.vel, center, halfMin, tSec),
    adrift,
    ship: ship.point,
    liveLeg: snap,
    clock: frame.clock,
  };
}

/** Committed legs solved from the ship state on the sim clock. */
function solveDisplay(
  nav: NavStateBroadcast | null,
  stops: readonly string[],
  portHubId: string,
  status: ShipStatusBroadcast | null,
  ship: { point: ChartMapPoint; vel: ChartMapPoint },
  center: ChartMapPoint,
  halfMin: number,
  timeSec: number,
  star: { x: number; y: number; r: number } | null,
  snap: FlightSnapshot | null
): SolvedFlightLeg[] {
  if (stops.length === 0 || nav?.phase === 'docking') return [];
  const start = displayStart(nav, portHubId, ship, center, halfMin, timeSec);
  const live = liveLegWindow(nav) ?? { idx: -1, remainingS: null };
  const raw = nav?.phase === 'in_transit' ? Math.max(0, nav.remainingS) : null;
  return displaySolved({
    stops,
    portHubId,
    status,
    startR: start.r,
    startV: start.v,
    liveIdx: live.idx,
    liveRemainingS: live.remainingS,
    liveRemainingRaw: raw,
    snap,
    star,
    center,
    halfMin,
    timeSec,
    thrust01: nav?.thrust01 ?? 1,
  });
}

function displayStart(
  nav: NavStateBroadcast | null,
  portHubId: string,
  ship: { point: ChartMapPoint; vel: ChartMapPoint },
  center: ChartMapPoint,
  halfMin: number,
  timeSec: number
): { r: ChartMapPoint; v: ChartMapPoint } {
  if (nav?.phase === 'in_transit') return { r: ship.point, v: ship.vel };
  const orbit = bodyOrbitOf(portHubId, halfMin);
  return { r: bodyPosAt(orbit, center, timeSec), v: bodyVelAt(orbit, timeSec) };
}

function liveLegWindow(nav: NavStateBroadcast | null): { idx: number; remainingS: number } | null {
  if (nav?.phase !== 'in_transit') return null;
  return { idx: nav.legIndex, remainingS: Math.max(5, nav.remainingS) };
}

/** Draft preview solved from the port at draft throttle. */
function solvePreview(
  preview: readonly string[],
  portHubId: string,
  status: ShipStatusBroadcast | null,
  center: ChartMapPoint,
  halfMin: number,
  timeSec: number,
  draftThrust01: number,
  star: { x: number; y: number; r: number } | null
): SolvedFlightLeg[] {
  if (preview.length === 0) return [];
  const port = bodyOrbitOf(portHubId, halfMin);
  return displaySolved({
    stops: preview,
    portHubId,
    status,
    startR: bodyPosAt(port, center, timeSec),
    startV: bodyVelAt(port, timeSec),
    liveIdx: -1,
    liveRemainingS: null,
    liveRemainingRaw: null,
    snap: null,
    star,
    center,
    halfMin,
    timeSec,
    thrust01: draftThrust01,
  });
}

function orbitOf(id: string): ChartMapOrbit {
  const body = systemBodyOrDefault(id);
  return {
    radius: body.radiusFrac,
    periodS: bodyPeriodS(body),
    phase: body.phase0,
    markerR: CHART_MARKERS[id] ?? 8,
  };
}

function knownIds(chart: ChartStateBroadcast | null): ReadonlySet<string> {
  if (chart === null) return new Set(['hub_a', 'hub_b']);
  return new Set(chart.nodes.filter((node) => node.known).map((node) => node.id));
}

function nodeAngle(orbit: ChartMapOrbit, timeSec: number): number {
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  return orbit.phase + (Math.PI * 2 * t) / Math.max(1, orbit.periodS);
}

function mapNode(
  id: string,
  short: string,
  known: boolean,
  nav: NavStateBroadcast | null,
  portHubId: string,
  center: ChartMapPoint,
  halfMin: number,
  timeSec: number
): ChartMapNode {
  const orbit = orbitOf(id);
  const angle = nodeAngle(orbit, timeSec);
  const x = center.x + Math.cos(angle) * orbit.radius * halfMin;
  const y = center.y + Math.sin(angle) * orbit.radius * halfMin;
  const status = nodeStatus(id, known, nav, portHubId);
  const label = known ? short : '??';
  const chipW = Math.round(uiTextWidth(label, CHIP_FONT) + 20);
  const chip: UiRect = {
    x: Math.round(x - chipW / 2),
    y: Math.round(y + orbit.markerR + 6),
    w: chipW,
    h: CHIP_H,
  };
  return {
    id,
    x,
    y,
    r: orbit.markerR,
    known,
    label,
    short,
    status,
    chip,
    buttonId: nodeButtonId(id, known, nav, portHubId),
    primary: status === 'dest',
    fill: fillFor(id, known),
    ring: ringFor(status),
  };
}

function nodeStatus(
  id: string,
  known: boolean,
  nav: NavStateBroadcast | null,
  portHubId: string
): ChartNodeStatus {
  if (id === portHubId) return 'port';
  if (nav !== null && nav.phase === 'in_transit' && nav.stops[nav.legIndex] === id) return 'hop';
  if (nav?.destHubId === id) return 'dest';
  if (!known) return 'unknown';
  return 'idle';
}

function nodeButtonId(
  id: string,
  known: boolean,
  nav: NavStateBroadcast | null,
  portHubId: string
): string | null {
  if (nav?.phase !== 'docked' || id === portHubId) return null;
  if (id.startsWith('poi_')) return detourButtonId(id);
  if (!known) return null;
  return plotButtonId(id);
}

function fillFor(id: string, known: boolean): Rgb {
  if (!known) return [0.16, 0.18, 0.22];
  if (id.startsWith('poi_')) return [0.45, 0.3, 0.1];
  return [0.1, 0.3, 0.5];
}

function ringFor(status: ChartNodeStatus): Rgb {
  if (status === 'dest') return [0.49, 0.91, 0.53];
  if (status === 'port' || status === 'hop') return [0, 0.9, 1];
  if (status === 'unknown') return [0.4, 0.44, 0.5];
  return [0.25, 0.35, 0.45];
}

export interface GravityWell {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * Departure snapshot for the live leg: state vectors at commit time.
 * The ship integrates forward from here on the sim clock, so recomputed
 * geometry never moves the marker. Velocities are retained, never reset.
 */
export interface FlightSnapshot {
  readonly legId: number;
  readonly legIndex: number;
  readonly r0: ChartMapPoint;
  readonly v0: ChartMapPoint;
  readonly totalS: number;
  readonly tSnap: number;
  readonly flipFrac: number;
}

interface SolvedFlightLeg {
  readonly fromId: string;
  readonly toId: string;
  readonly totalS: number;
  /** Sixteen resampled display points in px. */
  readonly samples: readonly ChartMapPoint[];
  readonly u0: ChartMapPoint;
  readonly uT: ChartMapPoint;
  /** Flip position as a fraction of samples; null keeps the midpoint. */
  readonly flipAt: number | null;
  /** True once the flip is behind the displayed window: the ship is braking. */
  readonly flipPassed: boolean;
}

/** Star-centered fractions (viewport-independent solver space). */
function toFrac(p: ChartMapPoint, center: ChartMapPoint, halfMin: number): ChartMapPoint {
  return { x: (p.x - center.x) / halfMin, y: (p.y - center.y) / halfMin };
}

function toPx(f: ChartMapPoint, center: ChartMapPoint, halfMin: number): ChartMapPoint {
  return { x: center.x + f.x * halfMin, y: center.y + f.y * halfMin };
}

function pathLength(points: readonly ChartMapPoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

/** Resample dense points to display samples, denser on long detours. */
function resamplePath(points: readonly ChartMapPoint[]): ChartMapPoint[] {
  if (points.length === 0) return [];
  const n = Math.min(64, Math.max(16, Math.ceil(pathLength(points) / 28)));
  const out: ChartMapPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const at = n === 1 ? 0 : (i / (n - 1)) * (points.length - 1);
    const lo = Math.floor(at);
    const hi = Math.min(points.length - 1, lo + 1);
    const f = at - lo;
    const a = points[lo] ?? points[0];
    const b = points[hi] ?? a;
    if (a === undefined || b === undefined) continue;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

function liveLegCursor(nav: NavStateBroadcast | null): { legId: number; legIndex: number } | null {
  if (nav === null) return null;
  if (nav.phase !== 'in_transit' && nav.phase !== 'docking') return null;
  return { legId: nav.legId, legIndex: nav.legIndex };
}

function bodyOrbitOf(id: string, halfMin: number): BodyOrbit {
  const orbit = orbitOf(id);
  return { radius: orbit.radius * halfMin, periodS: orbit.periodS, phase: orbit.phase };
}

function bodyVelNow(id: string, halfMin: number, timeSec: number): ChartMapPoint {
  const vel = bodyVelAt(bodyOrbitOf(id, halfMin), timeSec);
  return { x: vel.x, y: vel.y };
}

/** Departure snapshot for the live leg: state is retained, never reset. */
function resolveSnapshot(
  snapPrev: FlightSnapshot | null,
  nav: NavStateBroadcast | null,
  hop: { fromId: string; toId: string } | null,
  status: ShipStatusBroadcast | null,
  center: ChartMapPoint,
  halfMin: number,
  timeSec: number,
  positions: ReadonlyMap<string, ChartMapPoint>,
  star: { x: number; y: number; r: number } | null
): FlightSnapshot | null {
  const cursor = liveLegCursor(nav);
  if (cursor === null || hop === null) return null;
  if (matchesSnap(snapPrev, cursor)) return snapPrev;
  const totalS = snapshotNominal(hop, status, nav);
  const handed = tryHandoff(snapPrev, cursor, hop, center, halfMin, totalS, timeSec, star);
  if (handed !== null) return handed;
  return freshSnapshot(cursor, hop, totalS, center, halfMin, timeSec, positions, nav, star);
}

function matchesSnap(
  snapPrev: FlightSnapshot | null,
  cursor: { legId: number; legIndex: number }
): snapPrev is FlightSnapshot {
  return (
    snapPrev !== null && snapPrev.legId === cursor.legId && snapPrev.legIndex === cursor.legIndex
  );
}

function freshSnapshot(
  cursor: { legId: number; legIndex: number },
  hop: { fromId: string; toId: string },
  totalS: number,
  center: ChartMapPoint,
  halfMin: number,
  timeSec: number,
  positions: ReadonlyMap<string, ChartMapPoint>,
  nav: NavStateBroadcast | null,
  star: { x: number; y: number; r: number } | null
): FlightSnapshot | null {
  const at = positions.get(hop.fromId) ?? positions.get(nav?.portHubId ?? '');
  if (at === undefined) return null;
  const r0 = { x: at.x, y: at.y };
  const v0 = bodyVelNow(hop.fromId, halfMin, timeSec);
  const searched = searchFlipFrac(r0, v0, hop.toId, center, halfMin, timeSec, totalS, star);
  if (searched === null) return null;
  return {
    legId: cursor.legId,
    legIndex: cursor.legIndex,
    r0,
    v0,
    totalS,
    tSnap: timeSec,
    flipFrac: searched.flipFrac,
  };
}

function snapshotNominal(
  hop: { fromId: string; toId: string },
  status: ShipStatusBroadcast | null,
  nav: NavStateBroadcast | null
): number {
  if (nav?.legTotalS !== undefined && nav.legTotalS > 0) return nav.legTotalS;
  return hopScaledS(hop.fromId, hop.toId, tierOf(status), nav?.thrust01 ?? 1);
}

function tryHandoff(
  snapPrev: FlightSnapshot | null,
  cursor: { legId: number; legIndex: number },
  hop: { fromId: string; toId: string },
  center: ChartMapPoint,
  halfMin: number,
  totalS: number,
  timeSec: number,
  star: { x: number; y: number; r: number } | null
): FlightSnapshot | null {
  if (snapPrev === null) return null;
  if (snapPrev.legId !== cursor.legId || cursor.legIndex !== snapPrev.legIndex + 1) return null;
  return handoffSnapshot(snapPrev, cursor, hop, center, halfMin, totalS, timeSec, star);
}

/** Hop handoff: the next leg starts exactly where the previous solve arrives. */
function handoffSnapshot(
  prev: FlightSnapshot,
  cursor: { legId: number; legIndex: number },
  hop: { fromId: string; toId: string },
  center: ChartMapPoint,
  halfMin: number,
  totalS: number,
  timeSec: number,
  star: { x: number; y: number; r: number } | null
): FlightSnapshot | null {
  const traj = solveLeg(
    prev.r0,
    prev.v0,
    bodyOrbitOf(hop.fromId, halfMin),
    center,
    prev.tSnap,
    prev.totalS,
    prev.flipFrac
  );
  if (traj === null) return null;
  const r0 = legPointAt(traj, prev.r0, prev.v0, prev.totalS);
  const v0 = legVelAt(traj, prev.v0, prev.totalS);
  const searched = searchFlipFrac(r0, v0, hop.toId, center, halfMin, timeSec, totalS, star);
  if (searched === null) return null;
  return {
    legId: cursor.legId,
    legIndex: cursor.legIndex,
    r0: { x: r0.x, y: r0.y },
    v0: { x: v0.x, y: v0.y },
    totalS,
    tSnap: timeSec,
    flipFrac: searched.flipFrac,
  };
}

function trajectoryFor(
  snap: FlightSnapshot,
  toId: string,
  center: ChartMapPoint,
  halfMin: number
): SolvedLeg | null {
  return solveLeg(
    snap.r0,
    snap.v0,
    bodyOrbitOf(toId, halfMin),
    center,
    snap.tSnap,
    snap.totalS,
    snap.flipFrac
  );
}

/** Star exclusion plus hub gravity wells; POIs are too light to matter. */
function gravityWells(
  center: ChartMapPoint,
  halfMin: number,
  positions: ReadonlyMap<string, ChartMapPoint>
): GravityWell[] {
  const wells: GravityWell[] = [{ id: 'star', x: center.x, y: center.y, r: halfMin * 0.13 }];
  for (const [id, at] of positions) {
    if (id === 'hub_a' || id === 'hub_b') wells.push({ id, x: at.x, y: at.y, r: 26 });
  }
  return wells;
}

interface SolveChainOpts {
  readonly stops: readonly string[];
  readonly portHubId: string;
  readonly status: ShipStatusBroadcast | null;
  readonly startR: ChartMapPoint;
  readonly startV: ChartMapPoint;
  readonly liveIdx: number;
  readonly liveRemainingS: number | null;
  readonly liveRemainingRaw: number | null;
  readonly snap: FlightSnapshot | null;
  readonly star: { x: number; y: number; r: number } | null;
  readonly center: ChartMapPoint;
  readonly halfMin: number;
  readonly timeSec: number;
  readonly thrust01: number;
}

/** Chain fixed-time rendezvous legs from a start state on the sim clock. */
function displaySolved(opts: SolveChainOpts): SolvedFlightLeg[] {
  if (opts.stops.length === 0) return [];
  const tier = tierOf(opts.status);
  const ids = [opts.portHubId, ...opts.stops];
  const legs: SolvedFlightLeg[] = [];
  let r = opts.startR;
  let v = opts.startV;
  let tAbs = opts.timeSec;
  for (let k = 0; k < opts.stops.length; k += 1) {
    const fromId = ids[k] ?? '';
    const toId = ids[k + 1] ?? '';
    if (fromId === '' || toId === '') continue;
    const isLive = opts.liveRemainingS !== null && k === opts.liveIdx;
    const next = isLive
      ? appendLiveLeg(
          legs,
          { r, v, tAbs },
          { fromId, toId },
          chainLegWindow(opts, tier, k, fromId, toId, tAbs),
          opts,
          k
        )
      : appendPlannedLeg(
          legs,
          { r, v, tAbs },
          { fromId, toId },
          torchAccel(tier, opts.thrust01),
          opts
        );
    r = next.r;
    v = next.v;
    tAbs = next.tAbs;
  }
  return legs;
}

function chainLegWindow(
  opts: SolveChainOpts,
  tier: 0 | 1 | 2,
  k: number,
  fromId: string,
  toId: string,
  tAbs: number
): number {
  if (opts.liveRemainingS !== null && k === opts.liveIdx) return Math.max(5, opts.liveRemainingS);
  const planned = planTripLeg(fromId, toId, torchAccel(tier, opts.thrust01), tAbs);
  if (planned !== null) return planned.totalS;
  return hopScaledS(fromId, toId, tier, opts.thrust01);
}

function appendChainLeg(
  legs: SolvedFlightLeg[],
  state: { r: ChartMapPoint; v: ChartMapPoint; tAbs: number },
  ids: { fromId: string; toId: string },
  totalS: number,
  opts: SolveChainOpts
): { r: ChartMapPoint; v: ChartMapPoint; tAbs: number } {
  const solved = searchFlipFrac(
    state.r,
    state.v,
    ids.toId,
    opts.center,
    opts.halfMin,
    state.tAbs,
    totalS,
    opts.star
  );
  if (solved === null) return state;
  const samples: ChartMapPoint[] = [];
  for (let i = 0; i < 16; i += 1) {
    samples.push(legPointAt(solved.leg, state.r, state.v, (i / 15) * totalS));
  }
  const flipT = solved.flipFrac * totalS;
  const flipPoint = legPointAt(solved.leg, state.r, state.v, flipT);
  legs.push({
    fromId: ids.fromId,
    toId: ids.toId,
    totalS,
    samples,
    u0: { x: solved.leg.u1.x, y: solved.leg.u1.y },
    uT: { x: solved.leg.u2.x, y: solved.leg.u2.y },
    flipAt: pinFlipPoint(samples, flipPoint, solved.flipFrac),
    flipPassed: false,
  });
  return {
    r: legPointAt(solved.leg, state.r, state.v, totalS),
    v: legVelAt(solved.leg, state.v, totalS),
    tAbs: state.tAbs + totalS,
  };
}

/** Live leg: render the frozen departure snapshot, never a fresh replan. */
function appendLiveLeg(
  legs: SolvedFlightLeg[],
  state: { r: ChartMapPoint; v: ChartMapPoint; tAbs: number },
  ids: { fromId: string; toId: string },
  totalS: number,
  opts: SolveChainOpts,
  legIndex: number
): { r: ChartMapPoint; v: ChartMapPoint; tAbs: number } {
  const frozen = frozenLiveLeg(legs, ids, opts, legIndex);
  if (frozen !== null) return frozen;
  return appendChainLeg(legs, state, ids, totalS, opts);
}

/** Remaining slice of the frozen snap trajectory; endpoints never wander. */
function frozenLiveLeg(
  legs: SolvedFlightLeg[],
  ids: { fromId: string; toId: string },
  opts: SolveChainOpts,
  legIndex: number
): { r: ChartMapPoint; v: ChartMapPoint; tAbs: number } | null {
  const snap = opts.snap;
  const raw = opts.liveRemainingRaw;
  if (snap === null || raw === null || snap.legIndex !== legIndex) return null;
  const traj = trajectoryFor(snap, ids.toId, opts.center, opts.halfMin);
  if (traj === null) return null;
  const elapsed = Math.min(Math.max(0, snap.totalS - raw), snap.totalS);
  const remaining = Math.max(0, snap.totalS - elapsed);
  const samples = sampleFrozenLeg(traj, snap, elapsed, remaining);
  const flipT = snap.flipFrac * snap.totalS;
  legs.push({
    fromId: ids.fromId,
    toId: ids.toId,
    totalS: snap.totalS,
    samples,
    u0: { x: traj.u1.x, y: traj.u1.y },
    uT: { x: traj.u2.x, y: traj.u2.y },
    flipAt: frozenFlipAt(traj, snap, samples, elapsed, remaining),
    flipPassed: remaining > 0 && flipT <= elapsed,
  });
  return {
    r: legPointAt(traj, snap.r0, snap.v0, snap.totalS),
    v: legVelAt(traj, snap.v0, snap.totalS),
    tAbs: snap.tSnap + snap.totalS,
  };
}

function sampleFrozenLeg(
  traj: SolvedLeg,
  snap: FlightSnapshot,
  elapsed: number,
  remaining: number
): ChartMapPoint[] {
  const samples: ChartMapPoint[] = [];
  for (let i = 0; i < LIVE_SAMPLES; i += 1) {
    const at = remaining <= 0 ? snap.totalS : elapsed + (i / (LIVE_SAMPLES - 1)) * remaining;
    samples.push(legPointAt(traj, snap.r0, snap.v0, at));
  }
  return samples;
}

function frozenFlipAt(
  traj: SolvedLeg,
  snap: FlightSnapshot,
  samples: ChartMapPoint[],
  elapsed: number,
  remaining: number
): number | null {
  if (remaining <= 0) return null;
  const flipT = snap.flipFrac * snap.totalS;
  if (flipT <= elapsed) return 1 / (LIVE_SAMPLES - 1);
  const flipPoint = legPointAt(traj, snap.r0, snap.v0, flipT);
  return pinFlipPoint(samples, flipPoint, (flipT - elapsed) / remaining);
}

/** Seat the flip diamond on the exact flip point, not the nearest sample. */
function pinFlipPoint(samples: ChartMapPoint[], flipPoint: ChartMapPoint, frac: number): number {
  const last = samples.length - 1;
  if (last <= 2) return frac;
  const star = Math.min(Math.max(Math.round(frac * last), 1), last - 1);
  samples[star] = { x: flipPoint.x, y: flipPoint.y };
  return star / last;
}

/** Planned future leg: guidance integration with slingshot gates, resampled. */
function appendPlannedLeg(
  legs: SolvedFlightLeg[],
  state: { r: ChartMapPoint; v: ChartMapPoint; tAbs: number },
  ids: { fromId: string; toId: string },
  accel: number,
  opts: SolveChainOpts
): { r: ChartMapPoint; v: ChartMapPoint; tAbs: number } {
  const rF = toFrac(state.r, opts.center, opts.halfMin);
  const vF = { x: state.v.x / opts.halfMin, y: state.v.y / opts.halfMin };
  const solved = solveFlight(
    rF,
    vF,
    (t) => {
      const body = systemBodyOrDefault(ids.toId);
      return { pos: astroPosAt(body, state.tAbs + t), vel: astroVelAt(body, state.tAbs + t) };
    },
    { kp: 2.0, kd: 3.0, accelMax: Math.max(1e-6, accel) },
    800
  );
  if (solved === null) {
    const totalS = hopScaledS(ids.fromId, ids.toId, tierOf(opts.status), opts.thrust01);
    return appendChainLeg(legs, state, ids, totalS, opts);
  }
  legs.push(buildPlannedLeg(ids, solved, opts));
  return chainArrival(solved, rF, vF, state, opts);
}

function buildPlannedLeg(
  ids: { fromId: string; toId: string },
  solved: FlightSolution,
  opts: SolveChainOpts
): SolvedFlightLeg {
  const pts: ChartMapPoint[] = [];
  const burns: ChartMapPoint[] = [];
  for (const leg of solved.legs) {
    for (const p of leg.points) pts.push(toPx(p, opts.center, opts.halfMin));
    for (const u of leg.burns) burns.push(u);
  }
  const first = burns[0] ?? { x: 0, y: 0 };
  const lastB = burns[burns.length - 1] ?? first;
  return {
    fromId: ids.fromId,
    toId: ids.toId,
    totalS: solved.totalS,
    samples: resamplePath(pts),
    u0: { x: first.x, y: first.y },
    uT: { x: lastB.x, y: lastB.y },
    flipAt: null,
    flipPassed: false,
  };
}

function chainArrival(
  solved: FlightSolution,
  rF: ChartMapPoint,
  vF: ChartMapPoint,
  state: { r: ChartMapPoint; v: ChartMapPoint; tAbs: number },
  opts: SolveChainOpts
): { r: ChartMapPoint; v: ChartMapPoint; tAbs: number } {
  const last = solved.legs[solved.legs.length - 1];
  const endP = last?.points[(last?.points.length ?? 1) - 1] ?? rF;
  const endV = last?.vels[(last?.vels.length ?? 1) - 1] ?? vF;
  return {
    r: toPx(endP, opts.center, opts.halfMin),
    v: { x: endV.x * opts.halfMin, y: endV.y * opts.halfMin },
    tAbs: state.tAbs + solved.totalS,
  };
}

function sampleTrajectories(display: readonly SolvedFlightLeg[]): {
  route: ChartMapPoint[];
  flips: ChartMapPoint[];
  flipIndices: number[];
} {
  const route: ChartMapPoint[] = [];
  const flips: ChartMapPoint[] = [];
  const flipIndices: number[] = [];
  for (const leg of display) {
    const legPoints = [...leg.samples];
    if (legPoints.length === 0) continue;
    if (route.length > 0) legPoints.shift();
    const base = route.length;
    route.push(...legPoints);
    const mid = flipSampleIndex(leg.flipAt, leg.samples.length, legPoints.length, base);
    const flip = route[mid];
    if (flip !== undefined) {
      flips.push(flip);
      flipIndices.push(mid);
    }
  }
  return { route, flips, flipIndices };
}

function flipSampleIndex(
  flipAt: number | null,
  sampleCount: number,
  pushedCount: number,
  base: number
): number {
  if (flipAt === null) return base + Math.floor(pushedCount / 2);
  const raw = Math.round(flipAt * (sampleCount - 1));
  const shifted = sampleCount - pushedCount;
  const idx = base + raw - shifted;
  return Math.min(Math.max(idx, base), base + pushedCount - 1);
}

/** Flip candidates: mid-leg first, then asymmetric steers around the star. */
const FLIP_CANDIDATES = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];

/** Display samples per leg; frozen live legs resample the same count. */
const LIVE_SAMPLES = 16;

interface FlipScore {
  readonly leg: SolvedLeg;
  readonly flipFrac: number;
  readonly clear: boolean;
  readonly worst: number;
  readonly minD: number;
}

/** Closest stellar approach over route-density samples. */
function flipClearance(
  r0: ChartMapPoint,
  v0: ChartMapPoint,
  leg: SolvedLeg,
  totalS: number,
  star: { x: number; y: number; r: number } | null
): number {
  if (star === null) return Number.POSITIVE_INFINITY;
  let minD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 16; i += 1) {
    const p = legPointAt(leg, r0, v0, (i / 15) * totalS);
    minD = Math.min(minD, Math.hypot(p.x - star.x, p.y - star.y));
  }
  return minD;
}

/**
 * Core-clear beats anything; among clear legs prefer the smallest worst
 * burn (Epstein constant-thrust profile: no parking spikes, no sprints),
 * with a central-flip tie-break for per-frame stability; among unclear
 * legs prefer deeper clearance.
 */
function betterFlip(a: FlipScore, b: FlipScore): boolean {
  if (a.clear !== b.clear) return a.clear;
  if (a.clear) {
    const biggest = Math.max(a.worst, b.worst);
    if (biggest > 0 && Math.abs(a.worst - b.worst) > 0.05 * biggest) return a.worst < b.worst;
    return Math.abs(a.flipFrac - 0.5) < Math.abs(b.flipFrac - 0.5);
  }
  return a.minD > b.minD;
}

function searchFlipFrac(
  r0: ChartMapPoint,
  v0: ChartMapPoint,
  toId: string,
  center: ChartMapPoint,
  halfMin: number,
  tAbs: number,
  totalS: number,
  star: { x: number; y: number; r: number } | null
): { leg: SolvedLeg; flipFrac: number } | null {
  const margin = star === null ? 0 : star.r + 8;
  let best: FlipScore | null = null;
  for (const flipFrac of FLIP_CANDIDATES) {
    const leg = solveLeg(r0, v0, bodyOrbitOf(toId, halfMin), center, tAbs, totalS, flipFrac);
    if (leg === null) continue;
    const minD = flipClearance(r0, v0, leg, totalS, star);
    const worst = Math.max(Math.hypot(leg.u1.x, leg.u1.y), Math.hypot(leg.u2.x, leg.u2.y));
    const scored: FlipScore = { leg, flipFrac, clear: minD > margin, worst, minD };
    if (best === null || betterFlip(scored, best)) best = scored;
  }
  if (best === null) return null;
  return { leg: best.leg, flipFrac: best.flipFrac };
}

function routeTicks(display: readonly SolvedFlightLeg[]): ChartMapPoint[] {
  const ticks: ChartMapPoint[] = [];
  for (const leg of display) {
    const n = leg.samples.length;
    if (n === 0) continue;
    for (const f of [0.25, 0.5, 0.75]) {
      const tick = leg.samples[Math.round(f * (n - 1))];
      if (tick !== undefined) ticks.push(tick);
    }
  }
  return ticks;
}

/** Live thrust vectors: boost burn at the chain start, brake burn at its end. */
/** Lead chevron tracks the live burn phase: boost before the flip, brake after. */
function routeBurns(display: readonly SolvedFlightLeg[]): ChartBurn[] {
  const first = display[0];
  const last = display[display.length - 1];
  if (first === undefined || last === undefined) return [];
  const lead = first.flipPassed ? first.uT : first.u0;
  const burn = unitOf(lead);
  const brake = unitOf(last.uT);
  const start = first.samples[0] ?? { x: 0, y: 0 };
  const end = last.samples[last.samples.length - 1] ?? start;
  return [
    {
      x: start.x,
      y: start.y,
      angle: Math.atan2(burn.y, burn.x),
      kind: first.flipPassed ? 'retro' : 'pro',
      size: 9,
    },
    { x: end.x, y: end.y, angle: Math.atan2(brake.y, brake.x), kind: 'retro', size: 9 },
  ];
}

function unitOf(v: { x: number; y: number }): { x: number; y: number } {
  const len = Math.max(1e-9, Math.hypot(v.x, v.y));
  return { x: v.x / len, y: v.y / len };
}

/** Torch-drive plan for the live hop: boost half, flip, brake half. */
function transferInfo(
  nav: NavStateBroadcast | null,
  status: ShipStatusBroadcast | null
): ChartTransfer | null {
  const hop = liveTransferHop(nav);
  if (hop === null) return null;
  const total = Math.max(
    1,
    nav?.legTotalS ?? hopScaledS(hop.fromId, hop.toId, tierOf(status), hop.thrust01)
  );
  const elapsed =
    nav?.phase === 'in_transit'
      ? Math.min(total, Math.max(0, total - Math.max(0, nav.remainingS)))
      : nav?.phase === 'docking'
        ? total
        : 0;
  const burn = Math.max(0, Math.round(total / 2 - elapsed));
  const brake =
    elapsed < total / 2 ? Math.round(total / 2) : Math.max(0, Math.round(total - elapsed));
  return { label: `BURN ${burn}S RETRO ${brake}S` };
}

function liveTransferHop(
  nav: NavStateBroadcast | null
): { fromId: string; toId: string; thrust01: number } | null {
  if (nav === null || !isTransferPhase(nav.phase)) return null;
  if (nav.stops.length === 0) return null;
  return {
    fromId: hopFrom(nav),
    toId: hopTo(nav),
    thrust01: nav.thrust01 ?? 1,
  };
}

function isTransferPhase(phase: NavStateBroadcast['phase']): boolean {
  return phase === 'spooling' || phase === 'in_transit' || phase === 'docking';
}

function tierOf(status: ShipStatusBroadcast | null): 0 | 1 | 2 {
  if (status?.engineTier === 1) return 1;
  if (status?.engineTier === 2) return 2;
  return 0;
}

/** Ship state from the departure snapshot on the sim clock. */
function shipFromSnapshot(
  nav: NavStateBroadcast | null,
  hop: { toId: string; to: ChartMapPoint; docking: boolean } | null,
  port: ChartMapPoint,
  snap: FlightSnapshot | null,
  driftFrac: number,
  center: ChartMapPoint,
  halfMin: number
): { point: ChartMapPoint; vel: ChartMapPoint } {
  const still = { point: port, vel: { x: 0, y: 0 } };
  if (hop === null || snap === null) return still;
  const traj = trajectoryFor(snap, hop.toId, center, halfMin);
  if (traj === null) return still;
  if (hop.docking) {
    const end = legPointAt(traj, snap.r0, snap.v0, snap.totalS);
    return { point: dockingPoint(hop.to, end, nav?.remainingS ?? 0), vel: { x: 0, y: 0 } };
  }
  const elapsed = Math.min(
    Math.max(0, snap.totalS - (nav?.remainingS ?? snap.totalS)),
    snap.totalS
  );
  return snapshotPoint(traj, snap, elapsed, driftFrac);
}

function snapshotPoint(
  traj: SolvedLeg,
  snap: FlightSnapshot,
  elapsed: number,
  driftFrac: number
): { point: ChartMapPoint; vel: ChartMapPoint } {
  const point = legPointAt(traj, snap.r0, snap.v0, elapsed);
  const vel = legVelAt(traj, snap.v0, elapsed);
  if (driftFrac <= 0) return { point, vel };
  const end = legPointAt(traj, snap.r0, snap.v0, snap.totalS);
  const span = Math.hypot(end.x - snap.r0.x, end.y - snap.r0.y);
  const speed = Math.hypot(vel.x, vel.y);
  if (speed < 1e-9 || span < 1e-9) return { point, vel };
  const k = (driftFrac * span) / speed;
  return { point: { x: point.x + (vel.x / speed) * k, y: point.y + (vel.y / speed) * k }, vel };
}

/** Blend from the frozen arrival onto the live dock mouth over docking. */
function dockingPoint(
  to: ChartMapPoint,
  end: ChartMapPoint | null,
  remainingS: number
): ChartMapPoint {
  if (end === null) return to;
  if (!(DOCKING_S > 0)) return to;
  const f = Math.min(1, Math.max(0, 1 - remainingS / DOCKING_S));
  return { x: end.x + (to.x - end.x) * f, y: end.y + (to.y - end.y) * f };
}

/** Session-owned smoothing state for broadcast-derived clocks. */
export interface SmoothClock {
  readonly tick: number;
  /** Last wallSec integrated (frame-delta anchor). */
  readonly atSec: number;
  /** Last smoothed simSeconds (accumulates wall deltas while unpaused). */
  readonly simSec: number;
  /** Last smoothed remainingS (accumulates wall deltas while thrusting). */
  readonly remainingS: number;
}

/**
 * Advance broadcast clocks smoothly between ~10Hz snapshots for 60fps
 * renders. Resyncs on every new tick; freezes sim time while paused and
 * the leg clock while paused or flamed out. Falls back to wall time
 * without a tick (pre-join/error states).
 */
export function smoothSimClock(
  prev: SmoothClock | null,
  tick: number | undefined,
  remainingS: number,
  wallSec: number,
  paused: boolean,
  flameout: boolean
): { clock: SmoothClock | null; simSeconds: number; remainingSmooth: number } {
  if (tick === undefined) return { clock: null, simSeconds: wallSec, remainingSmooth: remainingS };
  if (prev === null) {
    const simSeconds = tick * FIXED_DT;
    const clock: SmoothClock = { tick, atSec: wallSec, simSec: simSeconds, remainingS };
    return { clock, simSeconds, remainingSmooth: remainingS };
  }
  if (paused) {
    const clock: SmoothClock = {
      tick,
      atSec: wallSec,
      simSec: prev.simSec,
      remainingS: prev.remainingS,
    };
    return { clock, simSeconds: prev.simSec, remainingSmooth: prev.remainingS };
  }
  if (prev.tick !== tick) {
    if (flameout) {
      const simSeconds = tick * FIXED_DT;
      const clock: SmoothClock = {
        tick,
        atSec: wallSec,
        simSec: simSeconds,
        remainingS: prev.remainingS,
      };
      return { clock, simSeconds, remainingSmooth: prev.remainingS };
    }
    const simSeconds = tick * FIXED_DT;
    const clock: SmoothClock = { tick, atSec: wallSec, simSec: simSeconds, remainingS };
    return { clock, simSeconds, remainingSmooth: remainingS };
  }
  const dt = clampFrameDt(wallSec - prev.atSec);
  const simSeconds = clampSimDrift(prev.simSec + dt, tick);
  const remainingSmooth = flameout ? prev.remainingS : Math.max(0, prev.remainingS - dt);
  const clock: SmoothClock = {
    tick,
    atSec: wallSec,
    simSec: simSeconds,
    remainingS: remainingSmooth,
  };
  return { clock, simSeconds, remainingSmooth };
}

function clampFrameDt(rawDt: number): number {
  if (!Number.isFinite(rawDt) || rawDt <= 0) return 0;
  return Math.min(rawDt, 0.5);
}

function clampSimDrift(simSeconds: number, tick: number): number {
  const authoritative = tick * FIXED_DT;
  if (simSeconds < authoritative) return authoritative;
  return Math.min(simSeconds, authoritative + 1);
}

/** Residual creep while awaiting rescue, as a fraction of the live hop. */
function driftFraction(nav: NavStateBroadcast | null): number {
  if (nav?.phase !== 'in_transit' || !nav.flameout || nav.hailS <= 0) return 0;
  return 0.15 * (1 - nav.hailS / HAIL_WAIT_S);
}

/** Fresh intercept burn from the drift state if thrust resumed now. */
function interceptPoints(
  nav: NavStateBroadcast | null,
  ship: ChartMapPoint,
  shipVel: ChartMapPoint,
  center: ChartMapPoint,
  halfMin: number,
  timeSec: number
): ChartMapPoint[] {
  if (nav?.phase !== 'in_transit' || !nav.flameout) return [];
  if (nav.stops.length === 0) return [];
  const toId = nav.stops[nav.legIndex] ?? nav.destHubId;
  if (toId === undefined) return [];
  const totalS = Math.max(5, nav.remainingS);
  const leg = solveLeg(ship, shipVel, bodyOrbitOf(toId, halfMin), center, timeSec, totalS);
  if (leg === null) return [];
  const points: ChartMapPoint[] = [];
  for (let i = 0; i < 12; i += 1) {
    points.push(legPointAt(leg, ship, shipVel, (i / 11) * totalS));
  }
  return points;
}

function isFlying(
  nav: NavStateBroadcast | null
): nav is NavStateBroadcast & { phase: 'in_transit' | 'docking' } {
  return nav?.phase === 'in_transit' || nav?.phase === 'docking';
}

function liveHop(
  nav: NavStateBroadcast | null,
  portHubId: string,
  positions: ReadonlyMap<string, ChartMapPoint>
): {
  from: ChartMapPoint;
  to: ChartMapPoint;
  fromId: string;
  toId: string;
  docking: boolean;
  index: number;
} | null {
  if (!isFlying(nav)) return null;
  const port = positions.get(portHubId) ?? { x: 0, y: 0 };
  const fromId = hopFrom(nav);
  const toId = hopTo(nav);
  return {
    from: positions.get(fromId) ?? port,
    to: positions.get(toId) ?? port,
    fromId,
    toId,
    docking: nav.phase === 'docking',
    index: nav.legIndex,
  };
}
