/**
 * Pure ship-exhaust view-model: authoritative broadcasts in, renderer-ready
 * burn state out. Ship owner's thruster tint wins (per plan). No DOM, no GL.
 */

import type { NavStateBroadcast, ShipSystemsBroadcast, ThrusterTint } from '@kybernetes/protocol';
import { type ExhaustParams, exhaustParamsFor } from '@kybernetes/sim-core';
import { type AccentRgb, thrusterPlume } from '../webgl/pawnAccents.js';

export type ShipExhaustPhase = 'docked' | 'in_transit' | 'docking' | 'inbound' | 'departing';

export interface ShipExhaustView {
  readonly phase: ShipExhaustPhase;
  readonly thrust01: number;
  readonly flameout: boolean;
  /** True past the mid-leg flip: the brake burn leads instead of the boost. */
  readonly braking: boolean;
  readonly tintName: ThrusterTint;
  readonly tint: AccentRgb;
  readonly params: ExhaustParams;
  /** Unit world-space direction of hull motion; null while holding. */
  readonly thrustVec: { x: number; y: number } | null;
  /** Hull speed in px/s behind the vector. */
  readonly thrustSpeed: number;
  /** True while holding still (coasting visuals, no directed burn). */
  readonly coast: boolean;
}

/** Elapsed fraction of the live leg; null unless flying a timed leg. */
export function legProgressFor(nav: NavStateBroadcast | null | undefined): number | null {
  if (nav?.phase !== 'in_transit') return null;
  const total = nav.legTotalS ?? 0;
  if (!(total > 0)) return null;
  const elapsed = Math.min(total, Math.max(0, total - Math.max(0, nav.remainingS)));
  return elapsed / total;
}

/** Torch speed profile: ramps up to the flip, eases off through the brake. */
export function flightSpeed01(progress: number | null): number {
  if (progress === null || !(progress >= 0) || !(progress <= 1)) return 0;
  return Math.sin(Math.PI * progress);
}

/** World-space scroll rate px/s for the cruise starfield; null when parked. */
export function scrollVectorFor(
  nav: NavStateBroadcast | null | undefined,
  motion: { velX: number; velY: number } | null | undefined,
  maxPxS: number
): { x: number; y: number } | null {
  const speed01 = flightSpeed01(legProgressFor(nav));
  if (!(speed01 > 0) || motion === null || motion === undefined) return null;
  const mag = Math.hypot(motion.velX, motion.velY);
  if (!(mag > COAST_PX_S)) return null;
  const speed = maxPxS * speed01;
  return { x: (motion.velX / mag) * speed, y: (motion.velY / mag) * speed };
}

/** Advance the starfield scroll offset; null rate holds it in place. */
export function stepStarScroll(
  prev: { x: number; y: number },
  rate: { x: number; y: number } | null,
  dtMs: number
): { x: number; y: number } {
  if (rate === null || !(dtMs > 0)) return prev;
  const dtS = Math.min(dtMs, 100) / 1000;
  return { x: prev.x + rate.x * dtS, y: prev.y + rate.y * dtS };
}

/** Past the mid-leg flip the torch brakes: burn leads, drive end flips. */
export function brakingFor(nav: NavStateBroadcast | null | undefined): boolean {
  if (nav?.phase !== 'in_transit') return false;
  const total = nav.legTotalS ?? 0;
  if (!(total > 0)) return false;
  return nav.remainingS <= total / 2;
}

export interface NozzleDir {
  readonly dx: number;
  readonly dy: number;
}

/**
 * Nozzle whose exhaust best opposes motion (pushes the hull along it).
 * Returns -1 when holding still; the caller keeps its time-based lane.
 */
export function nozzleForVector(
  vec: { x: number; y: number } | null,
  nozzles: readonly NozzleDir[]
): number {
  if (vec === null) return -1;
  const mag = Math.hypot(vec.x, vec.y);
  if (!(mag > 0)) return -1;
  const nx = vec.x / mag;
  const ny = vec.y / mag;
  let best = -1;
  let bestDot = Infinity;
  for (let i = 0; i < nozzles.length; i += 1) {
    const nozzle = nozzles[i];
    if (nozzle === undefined) continue;
    const dot = nozzle.dx * nx + nozzle.dy * ny;
    if (dot < bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

/** Below this hull speed the burn reads as station-keeping, not translation. */
export const COAST_PX_S = 8;

/** RCS pulse train: crisp 100ms puffs on a 600ms period. */
export const RCS_PULSE_PERIOD_S = 0.6;
export const RCS_PULSE_WIDTH_S = 0.1;

const PHASE_TABLE: Readonly<Record<string, ShipExhaustPhase>> = {
  in_transit: 'in_transit',
  docking: 'docking',
  inbound: 'inbound',
  departing: 'departing',
};

const TINT_TABLE: Readonly<Record<string, ThrusterTint>> = {
  cyan: 'cyan',
  amber: 'amber',
  violet: 'violet',
  white: 'white',
};

export function normalizeExhaustPhase(phase: unknown): ShipExhaustPhase {
  if (typeof phase !== 'string') return 'docked';
  return PHASE_TABLE[phase] ?? 'docked';
}

function normalizeTint(tint: unknown): ThrusterTint {
  if (typeof tint !== 'string') return 'cyan';
  return TINT_TABLE[tint] ?? 'cyan';
}

/** Nav phase wins; the harbor dock phase covers inbound/departing vessels. */
function resolvePhase(navPhase: unknown, harborPhase: unknown): ShipExhaustPhase {
  const nav = normalizeExhaustPhase(navPhase);
  if (nav !== 'docked') return nav;
  return normalizeExhaustPhase(harborPhase);
}

function pickNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function pickFlag(value: unknown): boolean {
  return value === true;
}

interface ExhaustSource {
  readonly phase: ShipExhaustPhase;
  readonly thrust01: number;
  readonly flameout: boolean;
}

function collectInput(
  nav: NavStateBroadcast | null | undefined,
  harborPhase: unknown
): ExhaustSource {
  const phase = resolvePhase(nav?.phase, harborPhase);
  return {
    phase,
    thrust01: pickNumber(nav?.thrust01, 1),
    flameout: pickFlag(nav?.flameout),
  };
}

function buildView(
  input: ExhaustSource,
  nav: NavStateBroadcast | null | undefined,
  tintName: ThrusterTint,
  engineTier?: number
): ShipExhaustView {
  return {
    phase: input.phase,
    thrust01: pickNumber(nav?.thrust01, 1),
    flameout: pickFlag(nav?.flameout),
    braking: brakingFor(nav),
    tintName,
    tint: thrusterPlume(tintName),
    params: exhaustParamsFor(input, engineTier),
    thrustVec: null,
    thrustSpeed: 0,
    coast: true,
  };
}

/**
 * Direct the exhaust view along measured hull motion (render-rate,
 * smoothed). Null motion reads as a cold hold; the sim magnitude model
 * is untouched — this only adds direction.
 */
export function directExhaustFor<T extends ShipExhaustView | null | undefined>(
  view: T,
  motion: { velX: number; velY: number } | null | undefined
): T {
  if (view === null || view === undefined) return view;
  if (motion === null || motion === undefined) {
    if (view.coast) return view;
    return { ...view, thrustVec: null, thrustSpeed: 0, coast: true };
  }
  const speed = Math.hypot(motion.velX, motion.velY);
  if (!(speed > COAST_PX_S)) {
    if (view.coast) return view;
    return { ...view, thrustVec: null, thrustSpeed: 0, coast: true };
  }
  return {
    ...view,
    thrustVec: { x: motion.velX / speed, y: motion.velY / speed },
    thrustSpeed: speed,
    coast: false,
  };
}

/**
 * Build the per-frame exhaust view. Missing broadcasts read as a cold
 * docked ship so the viewport never burns without server authority.
 */
export function mapShipExhaust(
  nav: NavStateBroadcast | null | undefined,
  _systems: ShipSystemsBroadcast | null | undefined,
  ownerThruster: unknown,
  engineTier?: number,
  harborPhase?: unknown
): ShipExhaustView {
  const input = collectInput(nav, harborPhase);
  return buildView(input, nav, normalizeTint(ownerThruster), engineTier);
}

/** True inside a pulse window: nozzles fire crisply instead of streaming. */
export function rcsPulseOn(timeSec: number, offsetS: number): boolean {
  if (!Number.isFinite(timeSec) || !Number.isFinite(offsetS)) return false;
  const shifted = (timeSec + offsetS) % RCS_PULSE_PERIOD_S;
  const wrapped = shifted < 0 ? shifted + RCS_PULSE_PERIOD_S : shifted;
  return wrapped < RCS_PULSE_WIDTH_S;
}

/** Which lateral nozzle fires on this pulse window. */
export function rcsLane(timeSec: number, lanes: number): number {
  if (!Number.isFinite(timeSec) || lanes <= 0) return 0;
  return Math.floor(timeSec / RCS_PULSE_PERIOD_S) % lanes;
}

/** Phases with active docking-maneuver RCS. */
export function isRcsPhase(phase: ShipExhaustPhase): boolean {
  return phase === 'docking' || phase === 'inbound' || phase === 'departing';
}
