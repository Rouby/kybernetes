/**
 * Main-torch exhaust model (pure + deterministic).
 * Maps authoritative engine/nav state to renderer plume parameters.
 * No DOM, no randomness: the WebGL layer adds flicker/seed on top.
 */

export type ExhaustPhase =
  | 'docked'
  | 'spooling'
  | 'in_transit'
  | 'docking'
  | 'inbound'
  | 'departing';

export interface ExhaustInput {
  readonly thrust01?: number;
  readonly spool?: number;
  readonly tune?: number;
  readonly wear?: number;
  readonly flameout?: boolean;
  readonly brownout?: boolean;
  readonly phase?: string;
}

export interface ExhaustParams {
  /** 0-1 overall burn strength driving rate, length and glow. */
  readonly intensity01: number;
  /** Per-bell emission rate at full burn (particles/sec). */
  readonly ratePerSecPerBell: number;
  readonly speedMin: number;
  readonly speedMax: number;
  /** Plume body length in px at full life. */
  readonly lengthPx: number;
  readonly spreadRad: number;
  /** 0-1 fraction of white-hot core particles. */
  readonly coreMix: number;
  readonly alpha: number;
  /** Stern light + bell glow strength 0-~1.8. */
  readonly glow: number;
}

/** Expanse torch ceiling per bell; 3 bells peak near the 900-particle budget. */
export const EXHAUST_MAX_RATE_PER_BELL = 240;
/** Docked idle shimmer so bells never look dead. */
export const EXHAUST_IDLE_RATE_PER_BELL = 6;

export const TIER_LENGTH_BIAS: Readonly<Record<number, number>> = {
  0: 1.0,
  1: 1.15,
  2: 1.3,
};

function clamp01(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampThrust(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, value));
}

function effectiveTune(tune: number, wear: number): number {
  return Math.max(0, tune * (1 - wear * 0.5));
}

function lengthBiasForTier(tier: number | undefined): number {
  if (tier === undefined || !Number.isFinite(tier)) return 1;
  return TIER_LENGTH_BIAS[Math.trunc(tier)] ?? 1;
}

function idleParams(): ExhaustParams {
  return {
    intensity01: 0.04,
    ratePerSecPerBell: EXHAUST_IDLE_RATE_PER_BELL,
    speedMin: 90,
    speedMax: 150,
    lengthPx: 26,
    spreadRad: 0.22,
    coreMix: 0.1,
    alpha: 0.4,
    glow: 0.18,
  };
}

function deadParams(): ExhaustParams {
  return {
    intensity01: 0,
    ratePerSecPerBell: 0,
    speedMin: 0,
    speedMax: 0,
    lengthPx: 0,
    spreadRad: 0.2,
    coreMix: 0,
    alpha: 0,
    glow: 0,
  };
}

const MANEUVER_PHASES: ReadonlySet<string> = new Set([
  'docking',
  'spooling',
  'inbound',
  'departing',
]);

export function isManeuverPhase(phase: string | undefined): boolean {
  if (phase === undefined) return false;
  return MANEUVER_PHASES.has(phase);
}

/**
 * Pure burn mapping. Docking/spooling hold a maneuver burn at ~35% even
 * when the cruise throttle reads high; flameout always kills the plume.
 */
export function exhaustParamsFor(input: ExhaustInput, engineTier?: number): ExhaustParams {
  if (input.flameout === true) return deadParams();
  const phase = input.phase ?? 'docked';
  const spool = clamp01(input.spool, phase === 'docked' ? 0 : 1);
  if (spool <= 0.02 && phase === 'docked') return idleParams();

  const tune = clamp01(input.tune, 1);
  const wear = clamp01(input.wear, 0);
  const effTune = effectiveTune(tune, wear);
  const tuneFactor = 0.55 + 0.45 * effTune;
  const thrust = isManeuverPhase(phase) ? 0.35 : clampThrust(input.thrust01);
  const intensity = spool ** 1.15 * (0.35 + 0.65 * thrust) * tuneFactor;
  if (intensity <= 0.02) return idleParams();

  const brownoutScale = input.brownout === true ? 0.55 : 1;
  const rate = (EXHAUST_IDLE_RATE_PER_BELL + intensity * EXHAUST_MAX_RATE_PER_BELL) * brownoutScale;
  const speedMin = 220 + 170 * thrust;
  const length =
    (70 + 150 * thrust) * tuneFactor * (0.35 + 0.65 * spool) * lengthBiasForTier(engineTier);
  return {
    intensity01: Math.min(1, intensity),
    ratePerSecPerBell: Math.round(rate),
    speedMin,
    speedMax: speedMin + 150,
    lengthPx: Math.round(length),
    spreadRad: 0.17 - 0.08 * thrust,
    coreMix: Math.min(0.55, 0.14 + 0.38 * spool),
    alpha: 0.55 + 0.4 * Math.min(1, intensity),
    glow: 0.2 + 1.6 * Math.min(1, intensity),
  };
}

/** 0-1 RCS puff strength for a hull-rate in px/s (docking maneuvers). */
export function rcsStrengthFor(speedPxS: number): number {
  if (!Number.isFinite(speedPxS) || speedPxS <= 3) return 0;
  return Math.min(1, speedPxS / 120);
}
