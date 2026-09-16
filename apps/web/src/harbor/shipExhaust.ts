/**
 * Pure ship-exhaust view-model: authoritative broadcasts in, renderer-ready
 * burn state out. Ship owner's thruster tint wins (per plan). No DOM, no GL.
 */

import type { NavStateBroadcast, ShipSystemsBroadcast, ThrusterTint } from '@kybernetes/protocol';
import { type ExhaustParams, exhaustParamsFor } from '@kybernetes/sim-core';
import { type AccentRgb, thrusterPlume } from '../webgl/pawnAccents.js';

export type ShipExhaustPhase =
  | 'docked'
  | 'spooling'
  | 'in_transit'
  | 'docking'
  | 'inbound'
  | 'departing';

export interface ShipExhaustView {
  readonly phase: ShipExhaustPhase;
  readonly thrust01: number;
  readonly spool: number;
  readonly flameout: boolean;
  readonly brownout: boolean;
  readonly tintName: ThrusterTint;
  readonly tint: AccentRgb;
  readonly params: ExhaustParams;
}

/** RCS pulse train: crisp 100ms puffs on a 600ms period. */
export const RCS_PULSE_PERIOD_S = 0.6;
export const RCS_PULSE_WIDTH_S = 0.1;

const PHASE_TABLE: Readonly<Record<string, ShipExhaustPhase>> = {
  spooling: 'spooling',
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

function resolveSpool(spool: unknown, phase: ShipExhaustPhase): number {
  if (typeof spool === 'number' && Number.isFinite(spool)) return spool;
  return phase === 'docked' ? 0 : 1;
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
  readonly spool: number;
  readonly tune: number;
  readonly wear: number;
  readonly flameout: boolean;
  readonly brownout: boolean;
}

function collectInput(
  nav: NavStateBroadcast | null | undefined,
  systems: ShipSystemsBroadcast | null | undefined,
  harborPhase: unknown
): ExhaustSource {
  const phase = resolvePhase(nav?.phase, harborPhase);
  return {
    phase,
    thrust01: pickNumber(nav?.thrust01, 1),
    spool: resolveSpool(systems?.spool, phase),
    tune: pickNumber(systems?.tune, 1),
    wear: pickNumber(systems?.wear, 0),
    flameout: pickFlag(nav?.flameout),
    brownout: pickFlag(systems?.brownout),
  };
}

function buildView(
  input: ExhaustSource,
  nav: NavStateBroadcast | null | undefined,
  systems: ShipSystemsBroadcast | null | undefined,
  tintName: ThrusterTint,
  engineTier?: number
): ShipExhaustView {
  return {
    phase: input.phase,
    thrust01: pickNumber(nav?.thrust01, 1),
    spool: pickNumber(systems?.spool, 0),
    flameout: pickFlag(nav?.flameout),
    brownout: pickFlag(systems?.brownout),
    tintName,
    tint: thrusterPlume(tintName),
    params: exhaustParamsFor(input, engineTier),
  };
}

/**
 * Build the per-frame exhaust view. Missing broadcasts read as a cold
 * docked ship so the viewport never burns without server authority.
 */
export function mapShipExhaust(
  nav: NavStateBroadcast | null | undefined,
  systems: ShipSystemsBroadcast | null | undefined,
  ownerThruster: unknown,
  engineTier?: number,
  harborPhase?: unknown
): ShipExhaustView {
  const input = collectInput(nav, systems, harborPhase);
  return buildView(input, nav, systems, normalizeTint(ownerThruster), engineTier);
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
