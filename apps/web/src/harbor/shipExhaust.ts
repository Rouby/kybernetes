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
  readonly tintName: ThrusterTint;
  readonly tint: AccentRgb;
  readonly params: ExhaustParams;
}

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
